import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
      where.OR = [
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
    }

    // Aplicar filtros por columna: where[col] = { in: values }
    for (const [col, values] of Object.entries(columnFilters)) {
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
    // - Si el filtro "editados" está activo, ordenar por ultimaEdicionAt DESC
    //   (más reciente arriba) - IGNORAR el ordenamiento alfabético normal
    // - En caso contrario, orden alfabético estándar (categoría + nombre)
    const sortField = searchParams.get("sort");
    const sortDir: "asc" | "desc" = searchParams.get("dir") === "desc" ? "desc" : "asc";
    const orderBy = sortField === "stock"
      ? [{ stock: sortDir }, { category: "asc" as const }, { name: "asc" as const }]
      : etiquetaColor === "editados"
      ? [{ ultimaEdicionAt: "desc" as const }]
      : [{ category: "asc" as const }, { name: "asc" as const }];
    const products = await db.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      products,
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

    // Aplicar márgenes 1-30 si vienen
    for (let i = 1; i <= 30; i++) {
      if (body[`marginC${i}`] !== undefined) {
        data[`marginC${i}`] = Number(body[`marginC${i}`]);
      }
    }

    // Recalcular campos derivados
    const cambioRS = 1100;
    const cambioUS = 6000;
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

    const product = await db.product.create({ data });
    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error creando producto:", error);
    return NextResponse.json(
      { error: "Error al crear el producto" },
      { status: 500 }
    );
  }
}
