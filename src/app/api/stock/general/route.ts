import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  leerSucursalesStock,
  leerSaldosSucursal,
} from "@/lib/stock-sucursal"; // Task 98 (tabla aparte auto-gestionada)

// ─────────────────────────────────────────────────────────────────
// GET /api/stock/general — datos del cuadro STOCK GENERAL (Task 98)
// "tenemos que hacer um filtro para poder ver por sucursal... lo que
// esta Central es nuestro deposito Central y los otros son por cada
// sucursal... tenemos que dividir bien".
//
// UN solo endpoint alimenta TODA la vista (cards + pills de sucursal +
// gráfico por sub-grupo + tabla), para que nada se desincronice:
//
//   ?sucursal=          (vacío) = TODAS (stock global Product.stock, igual que siempre)
//                       "CENTRAL" = depósito central
//                       "KATUETE" | "NUEVA ESPERANZA" | ... = sucursal de venta
//   &page=&pageSize=    paginación de la tabla
//   &sort=stock|name|sku  &dir=asc|desc
//   &search=            búsqueda (descripción, COD, marca, modelo…)
//   &subgrupo=          filtro del gráfico por sub-grupo (click)
//
// Respuesta:
//   sucursales: [{nombre, productos, unidades}]  → pills (siempre GLOBAL,
//                 no depende del filtro activo; CENTRAL primero)
//   stats: {totalProducts, totalStock, bySubgrupo} → cards + gráfico
//                 (según sucursal activa: TODAS usa el stock global de
//                 siempre; una sucursal usa el saldo de esa sucursal)
//   rows: [{id, sku, name, category, subGrupo, stock}] → tabla paginada
//
// SOLO LECTURA: acá no se escribe NADA (la importación es el endpoint
// import-stock de siempre, y la edición de productos sigue en LA BASE).
// Si la tabla StockSucursal todavía no existe (nunca se importó
// inventario con sucursales), la vista cae al modo TODAS sin error —
// igual que antes de esta tarea.
// ─────────────────────────────────────────────────────────────────

// Campos de búsqueda (mismos que GET /api/products: descripción, COD,
// marca, fabricante, tipo, modelo, referencia…).
const CAMPOS_BUSQUEDA = [
  "name",
  "sku",
  "brand",
  "subcategory",
  "fabricante",
  "tipo",
  "marca",
  "modelo",
  "referencia",
] as const;

function buildWhereBusqueda(search: string): { OR: Array<Record<string, unknown>> } | null {
  const s = search.trim();
  if (!s) return null;
  return {
    OR: CAMPOS_BUSQUEDA.map((campo) => ({
      [campo]: { contains: s, mode: "insensitive" },
    })),
  };
}

// Orden numérico por COD (mismo criterio de la BASE: "10000" < "9999" en
// alfabético no sirve; se ordena por los dígitos del código).
function codNumero(s: unknown): number | null {
  const digitos = String(s ?? "").replace(/\D/g, "");
  return digitos === "" ? null : Number(digitos);
}

export async function GET(req: NextRequest) {
  try {
    // Auth: cualquier usuario autenticado puede VER (igual que /api/stats y
    // /api/products). La escritura NO existe en este endpoint.
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sucursalFiltro = (searchParams.get("sucursal") || "")
      .trim()
      .toUpperCase();
    const search = (searchParams.get("search") || "").trim();
    const subgrupo = (searchParams.get("subgrupo") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || "50"))
    );
    const sort = searchParams.get("sort") || "stock";
    const dir: "asc" | "desc" = searchParams.get("dir") === "desc" ? "desc" : "asc";

    // ─── Pills de sucursales (SIEMPRE global; CENTRAL = depósito central) ───
    // Best-effort: si la tabla no existe todavía, vuelve [] y la vista solo
    // muestra TODAS — la app sigue funcionando igual que siempre.
    const sucursales = await leerSucursalesStock();

    const orBusqueda = buildWhereBusqueda(search);

    // ═══════════════════════════════════════════════════════
    // MODO TODAS (sin sucursal): stock global Product.stock —
    // exactamente los mismos números de siempre (cards /api/stats +
    // tabla /api/products ahora en un solo llamado).
    // ═══════════════════════════════════════════════════════
    if (!sucursalFiltro) {
      const where: Record<string, unknown> = {};
      if (subgrupo) where.category = subgrupo;
      if (orBusqueda) where.OR = orBusqueda.OR;

      const [total, agg, byCatRaw] = await Promise.all([
        db.product.count({ where }),
        db.product.aggregate({ where, _sum: { stock: true } }),
        db.product.groupBy({
          by: ["category"],
          where,
          _count: true,
          _sum: { stock: true },
        }),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      // Filas de la página (mismos criterios de orden que la BASE).
      let rows: Array<{
        id: string;
        sku: string;
        name: string | null;
        category: string | null;
        subGrupo: string | null;
        stock: number;
      }>;
      if (sort === "sku") {
        const rowsCod = await db.product.findMany({
          where,
          select: { id: true, sku: true },
        });
        rowsCod.sort((a, b) => {
          const na = codNumero(a.sku);
          const nb = codNumero(b.sku);
          if (na === null && nb === null)
            return String(a.sku).localeCompare(String(b.sku));
          if (na === null) return 1; // sin número: al final siempre
          if (nb === null) return -1;
          return dir === "desc" ? nb - na : na - nb;
        });
        const pageIds = rowsCod
          .slice((page - 1) * pageSize, page * pageSize)
          .map((r) => r.id);
        const filasPagina = await db.product.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            subGrupo: true,
            stock: true,
          },
        });
        const porId = new Map(filasPagina.map((f) => [f.id, f]));
        rows = pageIds
          .map((id) => porId.get(id))
          .filter((f): f is NonNullable<typeof f> => !!f);
      } else {
        const orderBy =
          sort === "name"
            ? [{ name: dir }, { sku: "asc" as const }]
            : [{ stock: dir }, { category: "asc" as const }, { name: "asc" as const }];
        rows = await db.product.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            subGrupo: true,
            stock: true,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        sucursal: null,
        sucursales,
        stats: {
          totalProducts: total,
          totalStock: agg._sum.stock ?? 0,
          bySubgrupo: byCatRaw
            .map((c) => ({
              category: c.category,
              count: c._count,
              stock: c._sum.stock ?? 0,
            }))
            .sort((a, b) => b.stock - a.stock),
        },
        rows,
        total,
        totalPages,
        page,
        pageSize,
      });
    }

    // ═══════════════════════════════════════════════════════
    // MODO SUCURSAL (CENTRAL o sucursal de venta): los saldos vienen
    // de la tabla aparte StockSucursal (lo que dejó la última
    // importación del inventario). Solo se muestran productos con
    // saldo > 0 en esa sucursal — "ver qué hay EN cada sucursal".
    // Volumen: unos pocos miles de filas como máximo → el join y los
    // cálculos van en memoria, sin SQL crudo ni casts que rompan entre
    // PostgreSQL y SQLite.
    // ═══════════════════════════════════════════════════════
    const saldos = await leerSaldosSucursal(sucursalFiltro);
    const idsConSaldo = Array.from(saldos.keys());

    const where: Record<string, unknown> = { id: { in: idsConSaldo } };
    if (subgrupo) where.category = subgrupo;
    if (orBusqueda) where.OR = orBusqueda.OR;

    const productos = await db.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        subGrupo: true,
        stock: true, // global (informativo); la vista muestra el de la sucursal
      },
    });

    // Combinar producto + saldo de la sucursal.
    type Fila = {
      id: string;
      sku: string;
      name: string | null;
      category: string | null;
      subGrupo: string | null;
      stock: number;
    };
    const filas: Fila[] = productos.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      subGrupo: p.subGrupo,
      stock: Math.round(saldos.get(p.id) ?? 0),
    }));

    // Stats en memoria con el SALDO de la sucursal (no el global).
    const total = filas.length;
    const totalStock = filas.reduce((acc, f) => acc + f.stock, 0);
    const porSubgrupo = new Map<string, { count: number; stock: number }>();
    for (const f of filas) {
      const key = f.category ?? "__sin__";
      const actual = porSubgrupo.get(key) ?? { count: 0, stock: 0 };
      actual.count += 1;
      actual.stock += f.stock;
      porSubgrupo.set(key, actual);
    }
    const bySubgrupo = Array.from(porSubgrupo.entries())
      .map(([k, v]) => ({
        category: k === "__sin__" ? null : k,
        count: v.count,
        stock: v.stock,
      }))
      .sort((a, b) => b.stock - a.stock);

    // Orden en JS (mismos criterios que la BASE / modo TODAS).
    filas.sort((a, b) => {
      if (sort === "name") {
        const cmp = String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
        return dir === "desc" ? -cmp : cmp;
      }
      if (sort === "sku") {
        const na = codNumero(a.sku);
        const nb = codNumero(b.sku);
        if (na === null && nb === null)
          return String(a.sku).localeCompare(String(b.sku));
        if (na === null) return 1;
        if (nb === null) return -1;
        return dir === "desc" ? nb - na : na - nb;
      }
      // stock (default): por saldo de la sucursal, desempate sub-grupo + nombre
      if (a.stock !== b.stock) return dir === "desc" ? b.stock - a.stock : a.stock - b.stock;
      const cmp = String(a.category ?? "").localeCompare(String(b.category ?? ""), "es");
      if (cmp !== 0) return cmp;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const rows = filas.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      ok: true,
      sucursal: sucursalFiltro,
      sucursales,
      stats: {
        totalProducts: total,
        totalStock,
        bySubgrupo,
      },
      rows,
      total,
      totalPages,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error en /api/stock/general:", error);
    return NextResponse.json(
      { error: "Error al obtener el stock por sucursal" },
      { status: 500 }
    );
  }
}
