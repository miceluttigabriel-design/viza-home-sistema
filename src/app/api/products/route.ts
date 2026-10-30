import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerCostosEditados } from "@/lib/costo-editado";
import { leerHashtags } from "@/lib/producto-hashtag";
import { hashtagVisibleParaVendedor, hoyParaguay } from "@/lib/hashtag-formato";
import { naceConMargenDefault } from "@/lib/gasto-adm";
import { calcularValorMayorista } from "@/lib/margen-mayorista";
import { guardarCapacidad, idsPorCapacidad, leerCapacidades } from "@/lib/producto-capacidad";
import { guardarCores, idsPorCores, leerCores } from "@/lib/producto-cores";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { getTasasCambio } from "@/lib/tasas-cambio";

// GET /api/products - lista de productos con filtros opcionales y paginación
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const sku = searchParams.get("sku");
    // Filtro por etiqueta de color: "verde" | "azul" | "dorado" | "rojo" | "sin"
    // "sin" muestra productos SIN etiqueta asignada (etiquetaColor = null)
    const etiquetaColor = searchParams.get("etiquetaColor");
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") || "60")));

    // Filtros por columna (JSON: { colKey: string[] })
    let columnFilters: Record<string, string[]> = {};
    const filtersParam = searchParams.get("filters");
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v) && v.length > 0) {
              columnFilters[k] = v.map(String);
            }
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }

    const where: Record<string, unknown> = {};
    if (category && category !== "Todas") {
      where.category = category;
    }
    if (sku) {
      where.sku = { contains: sku };
    }
    // Filtro por etiqueta de color o por productos editados
    if (etiquetaColor === "sin") {
      // Productos SIN etiqueta
      where.etiquetaColor = null;
    } else if (etiquetaColor === "editados") {
      // Productos que SÍ fueron editados manualmente (tienen ultimaEdicionAt)
      where.ultimaEdicionAt = { not: null };
    } else if (etiquetaColor) {
      // Productos con la etiqueta específica
      where.etiquetaColor = etiquetaColor;
    }
    if (search) {
      // CORRECCIÓN v1.1: Búsqueda CASE-INSENSITIVE (no distingue mayúsculas de minúsculas)
      // Ahora "moto" encuentra "MOTO KENTON", "Moto", "mOtO", etc.
      // Funciona para TODOS los usuarios (supremo, admin, colaborador).
      const orList: Record<string, unknown>[] = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { subcategory: { contains: search, mode: "insensitive" } },
        { fabricante: { contains: search, mode: "insensitive" } },
        { tipo: { contains: search, mode: "insensitive" } },
        { marca: { contains: search, mode: "insensitive" } },
        { modelo: { contains: search, mode: "insensitive" } },
        { referencia: { contains: search, mode: "insensitive" } },
      ];
      // Task 97: la CAPACIDAD vive en tabla aparte (ProductCapacidad, mismo
      // patrón que #HASHTAG), así que su búsqueda se resuelve por ids y se
      // suma al OR. Si la tabla aún no existe, idsPorCapacidad devuelve []
      // y la búsqueda sigue funcionando igual por los demás campos.
      const idsCap = await idsPorCapacidad(search.trim(), null);
      if (idsCap.length > 0) {
        orList.push({ id: { in: idsCap } });
      }
      // Task 98: los CORES viven en tabla aparte (ProductCores, mismo
      // patrón que CAPACIDAD), así que su búsqueda también se resuelve
      // por ids y se suma al OR. Si la tabla aún no existe, idsPorCores
      // devuelve [] y la búsqueda sigue funcionando igual.
      const idsCores = await idsPorCores(search.trim(), null);
      if (idsCores.length > 0) {
        orList.push({ id: { in: idsCores } });
      }
      where.OR = orList;
    }

    // Aplicar filtros por columna: where[col] = { in: values }
    // Task 97: CAPACIDAD no es columna de Product — su filtro se traduce a
    // ids desde la tabla aparte (idéntico criterio que la búsqueda de arriba).
    for (const [col, values] of Object.entries(columnFilters)) {
      if (col === "capacidad") {
        const idsCap = await idsPorCapacidad(null, values);
        where.id = { in: idsCap.length > 0 ? idsCap : ["__sin_coincidencia__"] };
        continue;
      }
      // Task 98: CORES no es columna de Product — su filtro se traduce a
      // ids desde la tabla aparte (idéntico criterio que CAPACIDAD).
      if (col === "cores") {
        const idsCores = await idsPorCores(null, values);
        where.id = { in: idsCores.length > 0 ? idsCores : ["__sin_coincidencia__"] };
        continue;
      }
      where[col] = { in: values };
    }

    // CORRECCIÓN v1.0: TODOS los usuarios (incluyendo colaboradores) pueden ver
    // TODOS los productos en la búsqueda del panel de ventas.
    // Antes, los colaboradores solo veían productos con showInCatalog=true,
    // lo que hacía que no encontraran productos al buscar (ej: "DAKAR", "MOTO").
    // Ahora, cualquier usuario autenticado ve TODOS los productos sin filtro de rol.
    // El filtro showInCatalog se eliminó para evitar que falten productos en la búsqueda.
    // (NO se toca la base de datos, NO se toca la lógica de roles, NO se toca el panel admin)

    // Siempre paginar (incluso con búsqueda activa)
    const total = await db.product.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Ordenamiento:
    // - Si llega sort=stock (dir=asc|desc), ordenar por stock (flechita de la columna STOCK
    //   en el Panel ADM) con category+name como desempate. Solo se permite "stock".
    // - Si llega sort=name (dir=asc|desc), ordenar ALFABÉTICO por DESCRIPCION
    //   (flechita de la columna DESCRIPCION en el Panel ADM) con sku de desempate.
    // - Si llega sort=sku (dir=asc|desc), orden NUMÉRICO por COD (flechita de la
    //   columna COD): se resuelve MÁS ABAJO en JS (los COD son strings y el orden
    //   alfabético de la base no respeta el orden numérico: "10000" < "9999").
    // - Si el filtro "editados" está activo, ordenar por ultimaEdicionAt DESC
    //   (más reciente arriba) - IGNORAR el ordenamiento alfabético normal
    // - En caso contrario, orden alfabético estándar (categoría + nombre)
    const sortField = searchParams.get("sort");
    const sortDir: "asc" | "desc" = searchParams.get("dir") === "desc" ? "desc" : "asc";
    const orderBy = sortField === "stock"
      ? [{ stock: sortDir }, { category: "asc" as const }, { name: "asc" as const }]
      : sortField === "name"
      ? [{ name: sortDir }, { sku: "asc" as const }]
      : etiquetaColor === "editados"
      ? [{ ultimaEdicionAt: "desc" as const }]
      : [{ category: "asc" as const }, { name: "asc" as const }];

    // ORDEN NUMÉRICO POR COD (sort=sku): se traen SOLO id+sku de TODAS las
    // filas que coinciden con los filtros, se ordenan en JS por el número
    // extraído del código (funciona igual en PostgreSQL y SQLite, sin SQL
    // crudo ni casts que rompan con códigos alfanuméricos) y se pide la
    // página completa ya en el orden correcto. Los códigos sin número van
    // al final (ordenados por su texto). Sin paginar de más: total/pages
    // siguen siendo los de TODO el filtro (ya calculados arriba).
    let products;
    if (sortField === "sku") {
      const rowsCod = await db.product.findMany({
        where,
        select: { id: true, sku: true },
      });
      const codNumero = (s: unknown): number | null => {
        const digitos = String(s ?? "").replace(/\D/g, "");
        return digitos === "" ? null : Number(digitos);
      };
      rowsCod.sort((a, b) => {
        const na = codNumero(a.sku);
        const nb = codNumero(b.sku);
        if (na === null && nb === null) return String(a.sku).localeCompare(String(b.sku));
        if (na === null) return 1;  // sin número: al final siempre
        if (nb === null) return -1;
        return sortDir === "desc" ? nb - na : na - nb;
      });
      const pageIds = rowsCod
        .slice((page - 1) * pageSize, page * pageSize)
        .map((r) => r.id);
      const filasPagina = await db.product.findMany({
        where: { id: { in: pageIds } },
      });
      const porId = new Map(filasPagina.map((f) => [f.id, f]));
      products = pageIds
        .map((id) => porId.get(id))
        .filter((f): f is (typeof filasPagina)[number] => !!f);
    } else {
      products = await db.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    }

    // ─── COSTOS EDITADOS POR EL ADMIN (guardados) ───
    // Tabla aparte AUTO-GESTIONADA (ver src/lib/costo-editado.ts): si aún no
    // existe se crea sola y NUNCA rompe esta ruta (devuelve sin marcas y la
    // lista de productos carga igual, con saldos y costos intactos).
    const editadosMap = await leerCostosEditados(products.map((p) => p.id));

    // ─── #HASHTAG por producto (promo del admin) ───
    // Tabla aparte AUTO-GESTIONADA (ver src/lib/producto-hashtag.ts): si aún
    // no existe se crea sola y NUNCA rompe esta ruta (devuelve mapa vacío y
    // los productos salen sin hashtag, igual que antes de esta función).
    // Cada producto sale con hashtag: {valor, fecha} | null — lo usan la
    // tabla del Panel ADM y las búsquedas de los paneles del vendedor.
    const hashtagsMap = await leerHashtags(products.map((p) => p.id));

    // ─── CAPACIDAD por producto (Task 97, columna nueva de la Base) ───
    // Tabla aparte AUTO-GESTIONADA (ver src/lib/producto-capacidad.ts):
    // si aún no existe se crea sola y NUNCA rompe esta ruta (devuelve mapa
    // vacío y los productos salgan sin capacidad, igual que antes). Sale
    // fusionada como campo "capacidad" de cada producto, igual que el
    // hashtag — la tabla del Panel ADM la muestra entre MODELO y
    // REF.FABRICA, en el orden que pidió el dueño.
    const capacidadesMap = await leerCapacidades(products.map((p) => p.id));

    // ─── CORES por producto (Task 98, columna nueva de la Base) ───
    // Tabla aparte AUTO-GESTIONADA (ver src/lib/producto-cores.ts):
    // si aún no existe se crea sola y NUNCA rompe esta ruta (devuelve mapa
    // vacío y los productos salen sin cores, igual que antes). Sale
    // fusionada como campo "cores" de cada producto, igual que capacidad
    // — la tabla del Panel ADM la muestra entre MODELO y CAPACIDAD, en
    // el orden que pidió el dueño.
    const coresMap = await leerCores(products.map((p) => p.id));

    // ─── VENCIDOS FUERA DE LA VISTA DEL VENDEDOR (Task 95, pedido del dueño) ───
    // El valor del # se paga como PREMIO al vendedor y tiene fecha de validez.
    // Cuando la fecha ya pasó, el # desaparece SOLO para la gente de ventas:
    // no pueden verlo ni agregarlo a un presupuesto nuevo (el sistema lo saca
    // automáticamente, sin que nadie tenga que borrar nada).
    //   · admin / supremo_admin → ven TODO (es su base de trabajo: la celda
    //     les queda pintada roja en el panel para que la renueven o limpien).
    //   · usuarios de consulta (solo lectura) → ven TODO igual que el admin
    //     (no cargan premios, es la misma base en modo lectura).
    //   · cualquier otro (vendedores) → SOLO hashtags no vencidos: se ven
    //     hasta el ÚLTIMO día de la fecha, al día siguiente desaparecen.
    // No se borra NADA de la tabla: el admin sigue viendo el valor y la fecha
    // para renovarlo. Los presupuestos ya emitidos y los carritos en curso no
    // se tocan (la evidencia del premio queda igual que siempre).
    const rolSesion = (session.user as any)?.role || "";
    const emailSesion = ((session.user as any)?.email || "").trim().toLowerCase();
    const veBaseCompleta =
      rolSesion === "admin" ||
      rolSesion === "supremo_admin" ||
      esEmailSoloLectura(emailSesion);
    const hashtagsSalida = (() => {
      if (veBaseCompleta) return hashtagsMap;
      const hoy = hoyParaguay();
      const filtrado = new Map<string, { valor: number | null; fecha: string | null }>();
      for (const [pid, h] of hashtagsMap) {
        if (hashtagVisibleParaVendedor(h.fecha, hoy)) filtrado.set(pid, h);
      }
      return filtrado;
    })();

    return NextResponse.json({
      products: products.map((p) => ({
        ...p,
        costosEditados: editadosMap.get(p.id) ?? [],
        hashtag: hashtagsSalida.get(p.id) ?? null,
        capacidad: capacidadesMap.get(p.id) ?? null,
        cores: coresMap.get(p.id) ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Error al obtener productos" }, { status: 500 });
  }
}

// POST /api/products - crea un nuevo producto (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el administrador puede crear productos" },
        { status: 403 }
      );
    }
    // Task 79 + 82: usuarios de consulta (viza.compras@, filipe.campos@ —
    // lista en src/lib/usuarios-consulta.ts) no pueden crear productos,
    // tengan el rol que tengan (blindaje extra: un consulta con rol admin
    // tampoco puede).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede crear productos" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Generar SKU único si no viene
    let sku = body.sku?.trim() || `NEW-${Date.now()}`;

    // Verificar que el SKU no exista
    const existing = await db.product.findUnique({ where: { sku } });
    if (existing) {
      return NextResponse.json(
        { error: `El SKU ${sku} ya existe` },
        { status: 400 }
      );
    }

    // Crear producto con campos mínimos + los que vengan del body
    const data: any = {
      sku,
      name: body.name || "NUEVO PRODUCTO",
      description: body.description || null,
      showInCatalog: body.showInCatalog ?? false,
      category: body.category || null,
      subcategory: body.subcategory || null,
      brand: body.brand || null,
      model: body.model || null,
      // Costos
      costBR: body.costBR ? Number(body.costBR) : null,
      costUS: body.costUS ? Number(body.costUS) : null,
      costGs: body.costGs ? Number(body.costGs) : null,
      discountPct: body.discountPct ? Number(body.discountPct) : null,
      addPct: body.addPct ? Number(body.addPct) : null,
      admPct: body.admPct ? Number(body.admPct) : null,
      valorDesc: body.valorDesc ? Number(body.valorDesc) : null,
      valorAdd: body.valorAdd ? Number(body.valorAdd) : null,
      // Bases
      pct1A6: body.pct1A6 ? Number(body.pct1A6) : null,
      pct7A13: body.pct7A13 ? Number(body.pct7A13) : null,
      pct14A30: body.pct14A30 ? Number(body.pct14A30) : null,
      marginContado: body.marginContado ? Number(body.marginContado) : null,
      // Datos
      referencia: body.referencia || null,
      codViza: sku,
      codShow: body.codShow || null,
      safra: body.safra || null,
      productName: body.productName || null,
      fabricante: body.fabricante || null,
      subGrupo: body.subGrupo || null,
      categoria: body.categoria || null,
      division: body.division || null,
      tipo: body.tipo || null,
      marca: body.marca || null,
      modelo: body.modelo || null,
      obs: body.obs || null,
      coluna1: body.coluna1 || null,
      coluna2: body.coluna2 || null,
      stock: body.stock ? Number(body.stock) : 0,
      costSistema: body.costSistema ? Number(body.costSistema) : null,
      valorTecnico: body.valorTecnico ? Number(body.valorTecnico) : null,
      margenTecnico: body.margenTecnico ? Number(body.margenTecnico) : null,
    };

    // Task 96/96b (pedido del dueño): producto NUEVO sin % ADD ni GASTOS ADM
    // propio → nace con 1% en AMBOS ("quiero que los nuevos productos que no
    // sean TRANSPORTERS ya nazcan con esta margen"). Si el admin carga un
    // valor explícito, se RESPETA. EXCEPCIÓN: los TRANSPORTERS de
    // CHACOMER/KENTON nacen como siempre (sin el 1%).
    naceConMargenDefault(data);

    // Aplicar márgenes 1-30 si vienen
    for (let i = 1; i <= 30; i++) {
      if (body[`marginC${i}`] !== undefined) {
        data[`marginC${i}`] = Number(body[`marginC${i}`]);
      }
    }

    // Recalcular campos derivados
    // Task 87: tasas activas de la base (antes fijas 1100/6000).
    const tasas = await getTasasCambio();
    const cambioRS = tasas.cambioRS; // R$ → Gs (editable desde la Base)
    const cambioUS = tasas.cambioUS; // US$ → Gs (editable desde la Base)
    const d = data.costBR && data.costBR > 0 ? data.costBR * cambioRS : null;
    const f = data.costUS && data.costUS > 0 ? data.costUS * cambioUS : null;
    data.rsNoUS = d && d > 0 ? d : f;
    const calcCost = data.rsNoUS && data.rsNoUS > 0 ? data.rsNoUS : (data.costGs ?? 0);
    data.usNoGs = calcCost;
    data.subCost = calcCost;
    data.rsToGs = d;
    data.usToGs = f;
    data.minusDisc = calcCost - (calcCost * (data.discountPct || 0));
    data.plusAdd = (data.minusDisc ?? 0) + ((data.minusDisc ?? 0) * (data.addPct || 0));
    data.plusAdd2 = (data.plusAdd ?? 0) + ((data.plusAdd ?? 0) * (data.admPct || 0));
    data.minusDescV = (data.plusAdd2 ?? 0) - (data.valorDesc ?? 0);
    const baseCosto = (data.minusDescV ?? 0) + (data.valorAdd ?? 0);
    data.costProd = Math.round(baseCosto / 1000) * 1000;
    const t = data.costProd ?? 0;
    const mContado = data.marginContado || 0;
    data.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
    let lastMargin = mContado;
    for (let i = 1; i <= 30; i++) {
      let base: number;
      if (i <= 6) base = data.pct1A6 || 0;
      else if (i <= 13) base = data.pct7A13 || 0;
      else base = data.pct14A30 || 0;
      lastMargin = lastMargin + base;
      data[`marginC${i}`] = lastMargin;
      data[`price${i}`] = Math.round((t + t * lastMargin) / 1000 / i) * 1000;
    }
    data.price = data.priceContado ?? 0;
    data.cost = data.costProd ?? 0;

    // Task 97: % MAYORISTA automático al CREAR el producto. Si el admin
    // carga MARGEN MAYORISTA (margenTecnico) sin escribir VALOR MAYORISTA,
    // el valor nace solo con la fórmula de la planilla:
    //   AIRES → COSTO GS · DEMÁS → COSTO PROD. · VALOR = CostoBase * (1 + %)
    // Si trae valorTecnico explícito, se RESPETA (regla de la casa).
    if (body.valorTecnico === undefined) {
      const valorAuto = calcularValorMayorista(data, data.margenTecnico);
      if (valorAuto !== null) data.valorTecnico = valorAuto;
    }

    const product = await db.product.create({ data });

    // Task 97: CAPACIDAD (columna nueva de la Base) — vive en tabla aparte
    // (ProductCapacidad, mismo patrón que #HASHTAG). Si el body la trae, se
    // guarda; si falla, la creación del producto NO se rompe por esto.
    if (body.capacidad !== undefined) {
      try {
        await guardarCapacidad(product.id, body.capacidad === null || body.capacidad === "" ? null : String(body.capacidad));
      } catch {
        // sin capacidad: el producto quedó creado igual (mismo espíritu del
        // resto de las tablas aparte — jamás frenan la operación principal)
      }
    }

    // Task 98: CORES (columna nueva de la Base) — vive en tabla aparte
    // (ProductCores, mismo patrón que CAPACIDAD). Si el body la trae, se
    // guarda; si falla, la creación del producto NO se rompe por esto.
    if (body.cores !== undefined) {
      try {
        await guardarCores(product.id, body.cores === null || body.cores === "" ? null : String(body.cores));
      } catch {
        // sin cores: el producto quedó creado igual (jamás frena la operación)
      }
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error creando producto:", error);
    return NextResponse.json(
      { error: "Error al crear el producto" },
      { status: 500 }
    );
  }
}
