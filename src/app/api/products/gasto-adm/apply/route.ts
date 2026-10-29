// POST /api/products/gasto-adm/apply
//
// APLICA el 1% del dueño (Task 96/96b) a TODOS los productos de la base, en
// UN MISMO botón, EXCEPTO los TRANSPORTERS de CHACOMER/KENTON (excepción del
// dueño: quedan exactamente como están):
//   · GASTOS ADM (columna O) = 1% en TODOS los no-transporters.
//   · % ADD (columna M) = 1% SOLO donde está vacío (null o 0). Los que ya
//     tienen un % ADD PROPIO (planilla VALOR ADD o carga a mano, ej.
//     refuerzos SAFRA) NO se les pisa: se respeta su valor (regla de la
//     casa: nunca borrar valores que el producto ya tiene). Se cuentan en
//     conAddPropio y el preview los lista para que el dueño los vea.
//
// Cómo funciona (MISMO mecanismo que /api/config-cambio — Task 87 — y la
// edición manual PUT /api/products/[id]):
//   · Para cada producto: admPct = 0.01 y/o addPct = 0.01 (1%) y se
//     recalcula TODA la cadena de costos con las MISMAS fórmulas del Excel
//     (L → N = L+L×M → P = N+N×O → Costo Prod. → márgenes 1..30 → precios).
//   · Los costos de ENTRADA (costBR/costUS/costGs), % DESC, VALOR DESC.,
//     VALOR ADD y las bases de porcentajes NUNCA se modifican: solo % ADD
//     (cuando está vacío), GASTOS ADM y las columnas derivadas.
//   · IDEMPOTENTE: pone 1% (no suma 1%). Si algo se corta a la mitad
//     (red/timeout), apretar de nuevo completa el trabajo y el resultado es
//     exactamente el mismo — los que ya están en 1% se saltan (yaIgual).
//   · No toca ultimaEdicionAt/Por ni las marcas de CostoEditado: es una
//     operación global del dueño, no una edición de celda.
//   · SOLO supremo_admin (misma regla que borrar todo / importar márgenes /
//     cambiar la tasa). El frontend manda { confirm: true } como candado.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTasasCambio, TasasCambio, TASAS_DEFAULT } from "@/lib/tasas-cambio";
import {
  GASTO_ADM_DEFAULT,
  PCT_ADD_DEFAULT,
  yaEsGastoAdmDefault,
  yaEsAddPctDefault,
  tieneAddPctPropio,
  esTransporterChacomerKenton,
} from "@/lib/gasto-adm";

// La base entera puede tener miles de productos: mismo criterio que
// config-cambio y las importaciones pesadas de la casa.
export const maxDuration = 60;

// Campos derivados que se escriben en cada producto. ES LA MISMA LISTA que
// sobrescribe /api/config-cambio y el PUT /api/products/[id] tras
// recalculate(): ni un campo más, ni un campo menos.
const CAMPOS_RECALCULADOS: string[] = [
  "rsNoUS", "usNoGs", "rsToGs", "usToGs", "subCost",
  "minusDisc", "plusAdd", "plusAdd2", "minusDescV", "costProd",
  "priceContado", "price", "cost",
  ...Array.from({ length: 30 }, (_, i) => `marginC${i + 1}`),
  ...Array.from({ length: 30 }, (_, i) => `price${i + 1}`),
];

// Recalcula los campos derivados según las fórmulas del Excel.
// ES LA MISMA función que usan PUT /api/products/[id], /api/config-cambio y
// las importaciones (copia local, patrón de la casa).
function recalculate(p: any, tasas: TasasCambio): void {
  const cambioRS = tasas.cambioRS; // R$ → Gs (tasas activas de la base)
  const cambioUS = tasas.cambioUS; // US$ → Gs

  // D = C * cambioRS (si hay costo en R$)
  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  // F = E * cambioUS (si hay costo en US$)
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  // H = IF(D>0, D, F) (R$ NO US$)
  p.rsNoUS = d && d > 0 ? d : f;
  // I = IF(H>0, H, G) (costo final)
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

  // P = N + N*O (GASTOS ADM) — acá entra el 1% de esta tarea
  p.plusAdd2 = (p.plusAdd ?? 0) + ((p.plusAdd ?? 0) * (p.admPct || 0));

  // R = P - Q (MENOS DESC. V)
  p.minusDescV = (p.plusAdd2 ?? 0) - (p.valorDesc ?? 0);

  // T = ROUND((R + S) / 1000, 0) * 1000 (Costo Prod.)
  const baseCosto = (p.minusDescV ?? 0) + (p.valorAdd ?? 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;

  // Márgenes 1..30 desde bases Y/Z/AA + Contado
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
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo supremo_admin puede aplicar el 1% (% ADD + GASTOS ADM)" },
        { status: 403 }
      );
    }

    // Candado del frontend (misma medida que borrar todo)
    const body = await req.json().catch(() => ({}));
    if (!body || body.confirm !== true) {
      return NextResponse.json(
        { error: "Falta confirmación. El body debe ser { confirm: true }" },
        { status: 400 }
      );
    }

    // Tasas activas de la base (Task 87): el recálculo usa SIEMPRE las
    // mismas tasas que la edición manual. Fallback blando a 1100/6000.
    let tasas: TasasCambio = TASAS_DEFAULT;
    try {
      tasas = await getTasasCambio();
    } catch {
      // sin tasas configuradas: siguen las de siempre
    }

    // Se traen TODOS los productos y la excepción TRANSPORTER se resuelve
    // en JS con la MISMA función del lib (una sola fuente de verdad: lo que
    // dice el preview es exactamente lo que aplica el apply).
    const productos = await db.product.findMany();

    const t0 = Date.now();
    let actualizados = 0;
    let yaIgual = 0;
    let excluidos = 0;
    let conAddPropio = 0; // con % ADD propio que SE RESPETA (no se pisa)
    const errores: string[] = [];

    // Construir updates primero (rápido), para contar exacto y ejecutar en
    // lotes como config-cambio.
    const updates: Array<{ id: string; data: Record<string, number | null> }> = [];
    for (const producto of productos) {
      if (esTransporterChacomerKenton(producto)) {
        excluidos++; // TRANSPORTER CHACOMER/KENTON: NO se toca NADA
        continue;
      }
      const necesitaAdm = !yaEsGastoAdmDefault(producto.admPct);
      const addPropio = tieneAddPctPropio(producto.addPct);
      // % ADD: solo se llena si está VACÍO (null/0). Un valor propio
      // (ej. refuerzo SAFRA 25%) NUNCA se pisa con el 1%.
      const necesitaAdd = !addPropio && !yaEsAddPctDefault(producto.addPct);
      if (!necesitaAdm && !necesitaAdd) {
        // Nada que escribir (idempotencia)
        yaIgual++;
        if (addPropio) conAddPropio++;
        continue;
      }
      const merged: any = { ...producto };
      const data: Record<string, number | null> = {};
      if (necesitaAdm) {
        merged.admPct = GASTO_ADM_DEFAULT; // 1%
        data.admPct = GASTO_ADM_DEFAULT;
      }
      if (necesitaAdd) {
        merged.addPct = PCT_ADD_DEFAULT; // 1%
        data.addPct = PCT_ADD_DEFAULT;
      }
      recalculate(merged, tasas);
      for (const k of CAMPOS_RECALCULADOS) {
        data[k] = merged[k] ?? null;
      }
      updates.push({ id: producto.id, data });
      if (addPropio) conAddPropio++; // se actualizó pero SU % ADD quedó intacto
    }

    // Lotes de 150 updates por transacción: rápido y cada lote queda
    // consistente. Re-aplicar después de un corte completa lo que falta.
    const LOTE = 150;
    for (let i = 0; i < updates.length; i += LOTE) {
      const lote = updates.slice(i, i + LOTE);
      try {
        await db.$transaction(
          lote.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
        );
        actualizados += lote.length;
      } catch (err) {
        // Un lote fallido no corta la operación: se cuentan los fallidos y
        // el dueño puede re-aplicar (los ya hechos se saltan por yaIgual).
        console.error("gasto-adm/apply: lote fallido:", err);
        errores.push(`Lote ${Math.floor(i / LOTE) + 1}: ${String((err as Error)?.message || "error")}`);
      }
    }

    return NextResponse.json({
      ok: true,
      total: productos.length,
      actualizados,
      yaIgual,
      excluidos,
      conAddPropio,
      fallidos: updates.length - actualizados, // updates construidos menos los exitosos
      errores: errores.slice(0, 20),
      duracionMs: Date.now() - t0,
    });
  } catch (error) {
    console.error("Error en gasto-adm/apply:", error);
    return NextResponse.json(
      { error: "Error al aplicar el 1% (intenta de nuevo: el proceso continúa donde quedó)" },
      { status: 500 }
    );
  }
}
