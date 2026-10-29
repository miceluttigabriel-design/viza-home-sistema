import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  COSTO_EDIT_KEYS,
  marcarCostosEditados,
  leerColKeysProducto,
} from "@/lib/costo-editado";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { getTasasCambio, TASAS_DEFAULT, TasasCambio } from "@/lib/tasas-cambio";
import { calcularValorMayorista } from "@/lib/margen-mayorista";
import { guardarCapacidad } from "@/lib/producto-capacidad";

// Recalcula los campos derivados según las fórmulas del Excel.
// Task 87: las tasas ya NO están fijas acá — vienen de la TasaCambio
// activa de la base (src/lib/tasas-cambio.ts). Si nada se configuró
// todavía, son las de siempre (1100 / 6000): mismo resultado que antes.
function recalculate(p: any, tasas: TasasCambio = TASAS_DEFAULT): any {
  const cambioRS = tasas.cambioRS; // $C$1 del Excel (editable desde la Base)
  const cambioUS = tasas.cambioUS; // $G$1 del Excel (editable desde la Base)

  // D = C * cambioRS (si hay costo en R$)
  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  // F = E * cambioUS (si hay costo en US$)
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  // H = IF(D>0, D, F) (R$ NO US$)
  p.rsNoUS = d && d > 0 ? d : f;
  // I = IF(H>0, H, G) (US$ NO GS - costo final)
  const calcCost = p.rsNoUS && p.rsNoUS > 0 ? p.rsNoUS : (p.costGs ?? 0);
  p.usNoGs = calcCost;
  // J = I (sub-costo)
  p.subCost = calcCost;
  p.rsToGs = d;
  p.usToGs = f;

  // L = J - J*K (MENOS DESC. %)
  p.minusDisc = calcCost - (calcCost * (p.discountPct || 0));

  // N = L + L*M (MAIS % ADD)
  p.plusAdd = (p.minusDisc ?? 0) + ((p.minusDisc ?? 0) * (p.addPct || 0));

  // P = N + N*O (MAIS % ADD 2)
  p.plusAdd2 = (p.plusAdd ?? 0) + ((p.plusAdd ?? 0) * (p.admPct || 0));

  // R = P - Q (MENOS DESC. V)
  p.minusDescV = (p.plusAdd2 ?? 0) - (p.valorDesc ?? 0);

  // T = ROUND((R + S) / 1000, 0) * 1000 (Costo Prod.)
  const baseCosto = (p.minusDescV ?? 0) + (p.valorAdd ?? 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;

  // Recalcular márgenes 1..30 desde bases Y/Z/AA + Contado
  const y = p.pct1A6 || 0;
  const z = p.pct7A13 || 0;
  const aa = p.pct14A30 || 0;
  const mContado = p.marginContado || 0;

  let lastMargin = mContado;
  for (let i = 1; i <= 30; i++) {
    let base: number;
    if (i <= 6) base = y;
    else if (i <= 13) base = z;
    else base = aa;
    lastMargin = lastMargin + base;
    p[`marginC${i}`] = lastMargin;
  }

  // Precios finales
  const t = p.costProd ?? 0;
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  for (let i = 1; i <= 30; i++) {
    const margin = p[`marginC${i}`];
    p[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }

  // Compatibilidad catálogo
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;

  return p;
}

// PUT /api/products/[id] - actualiza un producto (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el administrador puede modificar productos" },
        { status: 403 }
      );
    }

    // Task 79 + 82: usuarios de consulta (viza.compras@, filipe.campos@ —
    // lista en src/lib/usuarios-consulta.ts) son SOLO LECTURA de la base
    // (independiente del rol que tengan): jamás pueden editar celdas.
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede editar la base" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // Construir objeto con TODOS los campos actualizables
    // REGLA DE ORO: etiquetaColor NO se incluye aquí. Se persiste vía endpoint
    // dedicado PATCH /api/products/[id]/label. Así, editar cualquier celda
    // (precio, stock, etc.) no borra la etiqueta de color del producto.
    // Tampoco se incluye ultimaEdicionAt/ultimaEdicionPor aquí abajo - se setean
    // al final del update para registrar esta edición manual del admin.
    const data: any = {};

    // Campos string
    const stringFields = [
      "name", "description", "obs", "referencia", "codViza", "codShow",
      "safra", "productName", "fabricante", "subGrupo", "categoria",
      "division", "tipo", "marca", "modelo", "coluna1", "coluna2",
      "brand", "category", "subcategory", "model", "imageUrl",
    ];
    stringFields.forEach((k) => {
      if (body[k] !== undefined) data[k] = body[k] === "" ? null : body[k];
    });

    // Campos numéricos: costos, porcentajes, márgenes, precios, stock
    const numFields = [
      "costBR", "costUS", "costGs",
      "discountPct", "addPct", "admPct", "valorDesc", "valorAdd",
      "pct1A6", "pct7A13", "pct14A30", "marginContado",
      "valorTecnico", "margenTecnico", "costSistema",
      // Márgenes (permitimos override manual)
      ...Array.from({ length: 30 }, (_, i) => `marginC${i + 1}`),
      // Precios (permitimos override manual)
      "priceContado",
      ...Array.from({ length: 30 }, (_, i) => `price${i + 1}`),
      "costProd",
      "stock",
    ];
    numFields.forEach((k) => {
      if (body[k] !== undefined) {
        data[k] = body[k] === "" || body[k] === null ? null : Number(body[k]);
      }
    });

    // Recalcular si se modificó algún input de costo o porcentaje base o margen contado
    const recalcInputs = [
      "costBR", "costUS", "costGs",
      "discountPct", "addPct", "admPct", "valorDesc", "valorAdd",
      "pct1A6", "pct7A13", "pct14A30", "marginContado",
    ];
    const shouldRecalc = recalcInputs.some((k) => body[k] !== undefined);

    // Producto actual (se usa para el recálculo y para el % MAYORISTA
    // automático de la Task 97; una sola lectura para ambas cosas).
    let current: Awaited<ReturnType<typeof db.product.findUnique>> = null;
    if (shouldRecalc) {
      // Task 87: tasas activas de la base (con fallback blando a 1100/6000).
      const tasas = await getTasasCambio();
      current = await db.product.findUnique({ where: { id } });
      if (!current) {
        return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      }
      const merged = { ...current, ...data } as any;
      // Productos importados antes solo con Costo Prod. (sin costBR/costUS/costGs):
      // usar ese costo como base, para que editar un margen NO ponga costo y
      // precios en 0. Solo si el admin no está tocando los costos de entrada.
      const sinCostoEntrada =
        !(merged.costBR > 0) && !(merged.costUS > 0) && !(merged.costGs > 0);
      const tocaCosto = ["costBR", "costUS", "costGs"].some((k) => body[k] !== undefined);
      if (sinCostoEntrada && !tocaCosto && (current.costProd ?? 0) > 0) {
        merged.costGs = current.costProd;
        data.costGs = current.costProd;
      }
      recalculate(merged, tasas);
      // Sobrescribir data con valores recalculados
      [
        "rsNoUS", "usNoGs", "rsToGs", "usToGs", "subCost",
        "minusDisc", "plusAdd", "plusAdd2", "minusDescV", "costProd",
        "priceContado", "price", "cost",
        ...Array.from({ length: 30 }, (_, i) => `marginC${i + 1}`),
        ...Array.from({ length: 30 }, (_, i) => `price${i + 1}`),
      ].forEach((k) => {
        data[k] = merged[k];
      });
    }

    // ─── % MAYORISTA AUTOMÁTICO → VALOR MAYORISTA (Task 97, pedido del dueño) ───
    // "% AUTOMATICA NO MAYORISTA PARA REFLETIR EN VALOR DE MAYORISTA ...
    //  % PARA AIRES SERIA EMCIMA DE (COSTO GS) Y % PARA DEMAS PRODUCTOS
    //  EM CIMA DE (COSTO PROD.) ambos ao agregar en MARGEN MAYORISTA ya
    //  nos traria automaticamente el VALOR MAYORISTA".
    // Se recalcula cuando el admin toca el % (margenTecnico) o cualquier
    // costo que afecta la base. MISMA fórmula de la planilla LISTA VIZA
    // HOME (columna CV):  VALOR = CostoBase * (1 + %)
    //   · AIRES → base COSTO GS  · DEMÁS productos → base COSTO PROD.
    // Si el body trae valorTecnico explícito, se RESPETA tal cual (valor a
    // mano del admin, regla de la casa). Sin margen cargada (o margen 0)
    // el VALOR no se toca: queda el que ya tenía.
    const tocaMargenMayorista = body.margenTecnico !== undefined;
    if (body.valorTecnico === undefined && (tocaMargenMayorista || shouldRecalc)) {
      const cur = current ?? (await db.product.findUnique({ where: { id } }));
      if (cur) {
        const mergedTecnico = { ...cur, ...data } as any;
        const valorAuto = calcularValorMayorista(
          mergedTecnico,
          mergedTecnico.margenTecnico
        );
        if (valorAuto !== null) data.valorTecnico = valorAuto;
      }
    }

    // ─── CAPACIDAD (Task 97, columna nueva de la Base) ───
    // Vive en tabla APARTE (ProductCapacidad, mismo patrón que #HASHTAG —
    // lección de la casa: columnas nuevas en Product rompen sin db push).
    // Si el body la trae (celda editada en la tabla), se guarda; si falla,
    // el guardado del producto NO se rompe por esto.
    let capacidadSalida: string | null | undefined;
    if (body.capacidad !== undefined) {
      const valorCap =
        body.capacidad === null || body.capacidad === ""
          ? null
          : String(body.capacidad).trim();
      try {
        await guardarCapacidad(id, valorCap);
      } catch {
        // la capacidad es un extra: jamás frena el guardado principal
      }
      capacidadSalida = valorCap;
    }

    // ─── COSTO EDITADO Y GUARDADO (regla del usuario) ───
    // El cliente solo envía los campos que el admin tocó (objeto "dirty"),
    // así que si el body trae un campo de COSTO de entrada es porque el admin
    // lo editó en esta edición. Se registra en la tabla aparte CostoEditado:
    //   1) La celda editada se pinta de DORADO VIBRANTE en la tabla (discernir).
    //   2) La importación de stock NUNCA pisa esos costos: para esos productos
    //      solo actualiza el STOCK.
    // El registro es acumulativo (nunca se borra automáticamente).
    // Tabla AUTO-GESTIONADA (ver src/lib/costo-editado.ts): si aún no existe
    // se crea sola; si no se pudiera crear, el guardado del producto NUNCA
    // falla por esto y la app sigue igual que antes (sin dorado todavía).
    const costosTocados = COSTO_EDIT_KEYS.filter((k) => body[k] !== undefined);

    // Registrar trazabilidad de la edición manual del admin
    // Esto se hace DESPUÉS de construir `data` con los campos editados, así
    // no se incluye en el `shouldRecalc` ni en ninguna otra lógica previa.
    // Sobrescribe el registro anterior (solo guardamos la ÚLTIMA edición).
    const editorName = (session.user as any)?.name || (session.user as any)?.email || "admin";
    data.ultimaEdicionAt = new Date();
    data.ultimaEdicionPor = editorName;

    const updated = await db.product.update({
      where: { id },
      data,
    });

    // Marcar los costos editados en la tabla aparte CostoEditado (acumulativo,
    // auto-gestionada: se crea sola si falta — ver src/lib/costo-editado.ts).
    await marcarCostosEditados(id, costosTocados);

    // Devolver costosEditados para que la tabla del panel pinte el dorado AL
    // INSTANTE después de guardar (el panel hace {...p, ...res}).
    const costosEditados = await leerColKeysProducto(id);

    // Task 97: devolver también la capacidad guardada (si esta edición la
    // tocó) para que la celda quede actualizada al instante.
    const productSalida: any = { ...updated, costosEditados };
    if (capacidadSalida !== undefined) {
      productSalida.capacidad = capacidadSalida;
    }

    return NextResponse.json({ product: productSalida });
  } catch (error) {
    console.error("Error actualizando producto:", error);
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}

// DELETE /api/products/[id] - elimina un producto (solo admin)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el administrador puede eliminar productos" },
        { status: 403 }
      );
    }

    // Task 79 + 82: usuarios de consulta (viza.compras@, filipe.campos@ —
    // lista en src/lib/usuarios-consulta.ts) son SOLO LECTURA de la base
    // (independiente del rol que tengan): jamás pueden eliminar productos.
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede eliminar productos" },
        { status: 403 }
      );
    }

    const { id } = await params;
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando producto:", error);
    return NextResponse.json(
      { error: "Error al eliminar producto" },
      { status: 500 }
    );
  }
}
