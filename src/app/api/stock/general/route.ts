import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  leerSucursalesStock,
  leerSaldosSucursal,
} from "@/lib/stock-sucursal"; // Task 98 (tabla aparte auto-gestionada)
import { leerCapacidades } from "@/lib/producto-capacidad"; // Task 97 (tabla aparte auto-gestionada)
import { leerCores } from "@/lib/producto-cores"; // Task 98 (tabla aparte auto-gestionada)
import {
  condicionPrismaBienesEmpresa,
  esBienDeEmpresa,
} from "@/lib/bienes-empresa"; // Task 170: bienes de uso de la empresa (AUTOMOTOR S.A.)
// Task 171 (pedido del dueño): "el stock general no debe estar disponible para
// usuarios comunes". La MISMA matriz del Orquestador se re-valida acá, en el
// servidor, para que nadie entre llamando la API a mano.
import { accesosDeUsuario } from "@/lib/acceso-modulos";

// Task 126 (pedido del dueño): la respuesta SIEMPRE se calcula en vivo —
// nada de caché de ruta. Así, cada vez que LA BASE guarda una edición,
// STOCK GENERAL (que refresca sola al recibir el aviso) ve los valores
// nuevos al instante.
export const dynamic = "force-dynamic";

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
//   rows: [{id, sku, name, category, fabricante, categoria, subGrupo, marca,
//           tipo, modelo, referencia, stock, ultimaEdicionAt, ultimaEdicionPor,
//           capacidad, cores}] → tabla paginada
//           (Task 124: las columnas de LA BASE van dentro de STOCK GENERAL,
//            en la MISMA orden que la Base; capacidad/cores salen de las
//            tablas aparte auto-gestionadas, igual que GET /api/products)
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

// ─── Task 124: LAS COLUMNAS DE LA BASE DENTRO DE STOCK GENERAL ───
// Pedido del dueño: "TODAS ESTAS COLUNAS DE LA BASE... QUE ESTEA DENTRO
// DE STOCK GENERAL EN LA MISMA ORDEN... INCLUSO QUIERO QUE TODO LO
// REFERENTE A CADA CODIGO QUE SE EDITO DE LA BASE ESTEA REGISTRADO
// ALLA TANBIEN".
//
// Clave: LA BASE y STOCK GENERAL leen del MISMO modelo Product (la Base
// edita acá y el Stock General muestra acá), así que CADA edición hecha
// en la Base queda registrada automáticamente en Stock General — no hay
// una segunda copia que se desincronice. El select de abajo trae las
// mismas columnas que muestra la tabla de la Base:
//   COD=sku · PROVEDOR=fabricante · GRUPO=categoria · SUB-GRUPO=subGrupo
//   MARCA=marca · TIPO PRODUCTO=tipo · MODELO=modelo · REF.FABRICA=referencia
//   DESCRIPCION=name · + ultimaEdicion* (badge de quién/cuándo editó).
// CAPACIDAD y CORES viven en tablas aparte (ProductCapacidad/ProductCores,
// Tasks 97/98) y se fusionan con fusionarColumnasBase (abajo), igual que
// hace GET /api/products.
const SELECT_FILAS = {
  id: true,
  sku: true,
  name: true,
  category: true, // respaldo del SUB-GRUPO (igual que venía mostrando la vista)
  fabricante: true,
  categoria: true,
  subGrupo: true,
  marca: true,
  tipo: true,
  modelo: true,
  referencia: true,
  stock: true,
  ultimaEdicionAt: true,
  ultimaEdicionPor: true,
};

type FilaBase = {
  id: string;
  sku: string;
  name: string | null;
  category: string | null;
  fabricante: string | null;
  categoria: string | null;
  subGrupo: string | null;
  marca: string | null;
  tipo: string | null;
  modelo: string | null;
  referencia: string | null;
  stock: number;
  ultimaEdicionAt: Date | null;
  ultimaEdicionPor: string | null;
  capacidad?: string | null; // se agrega en fusionarColumnasBase
  cores?: string | null; // se agrega en fusionarColumnasBase
};

// CAPACIDAD y CORES (tablas aparte AUTO-GESTIONADAS, lib best-effort: si
// la tabla todavía no existe devuelven mapa vacío y la vista carga igual,
// sin esas celdas — NUNCA rompe esta ruta). Se fusionan SOLO en las filas
// de la página (máx. pageSize), no en todo el listado.
async function fusionarColumnasBase<T extends { id: string }>(
  filas: T[]
): Promise<(T & { capacidad: string | null; cores: string | null })[]> {
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.id);
  const [capMap, coresMap] = await Promise.all([
    leerCapacidades(ids),
    leerCores(ids),
  ]);
  return filas.map((f) => ({
    ...f,
    capacidad: capMap.get(f.id) ?? null,
    cores: coresMap.get(f.id) ?? null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    // Auth: SOLO los tipos con acceso a STOCK GENERAL (Task 171).
    // Cualquier otro usuario autenticado recibe 403, aunque llame la API a
    // mano: el módulo ya no está disponible para los usuarios COMUNES.
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const accesos = accesosDeUsuario({
      email: session.user?.email || "",
      role: (session.user as any)?.role || "",
    });
    if (!accesos.puedeVerStock) {
      return NextResponse.json(
        {
          error: "STOCK GENERAL no está disponible para usuarios comunes",
        },
        { status: 403 }
      );
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
    // Task 170 (pedido del dueño): "bienes=1" = ver SOLO los bienes de uso
    // de la empresa (vehículos de AUTOMOTOR S.A.). Sin el parámetro, esos
    // bienes NO se mezclan con el inventario de venta.
    const soloBienes = searchParams.get("bienes") === "1";

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
      // Task 170: separa los BIENES DE LA EMPRESA del inventario de venta.
      //   · vista normal  → NOT bienes (no se mezclan)
      //   · bienes=1      → SOLO bienes
      const condBienes = condicionPrismaBienesEmpresa();
      if (soloBienes) {
        where.AND = [{ OR: (condBienes as any).OR }];
      } else {
        where.NOT = condBienes;
      }

      const [total, agg, byCatRaw, totalBienes, aggBienes] = await Promise.all([
        db.product.count({ where }),
        db.product.aggregate({ where, _sum: { stock: true } }),
        db.product.groupBy({
          by: ["category"],
          where,
          _count: true,
          _sum: { stock: true },
        }),
        // Siempre el total de bienes de la empresa (para el aviso del detalle)
        db.product.count({ where: condBienes as any }),
        db.product.aggregate({
          where: condBienes as any,
          _sum: { stock: true },
        }),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      // Filas de la página (mismos criterios de orden que la BASE).
      // Task 124: el MISMO select de columnas de la Base para los dos
      // caminos de orden (COD y stock/name); capacidad/cores se fusionan
      // después, una sola vez.
      let rows: FilaBase[];
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
          select: SELECT_FILAS,
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
          select: SELECT_FILAS,
        });
      }

      // Task 124: CAPACIDAD y CORES (tablas aparte) solo en las filas de la página.
      rows = await fusionarColumnasBase(rows);

      return NextResponse.json({
        ok: true,
        sucursal: null,
        sucursales,
        stats: {
          totalProducts: total,
          totalStock: agg._sum.stock ?? 0,
          // Task 170: bienes de uso de la empresa (fuera del inventario de venta)
          bienesEmpresa: {
            productos: totalBienes,
            unidades: aggBienes._sum.stock ?? 0,
          },
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

    // Task 124: el MISMO select de columnas de la Base que el modo TODAS.
    const productos = await db.product.findMany({
      where,
      select: SELECT_FILAS,
    });

    // Combinar producto + saldo de la sucursal (el stock que se muestra es
    // el SALDO de la sucursal; el global de Product queda informativo).
    const filasTodas: FilaBase[] = productos.map((p) => ({
      ...p,
      stock: Math.round(saldos.get(p.id) ?? 0),
    }));

    // Task 170: separa los bienes de uso de la empresa del inventario de venta.
    const filasBienes = filasTodas.filter((f) => esBienDeEmpresa(f.fabricante));
    const filas = soloBienes
      ? filasBienes
      : filasTodas.filter((f) => !esBienDeEmpresa(f.fabricante));

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
    // Task 124: capacidad/cores fusionadas SOLO en las filas de la página
    // (las stats y el gráfico por sub-grupo no las necesitan).
    const rows = await fusionarColumnasBase(
      filas.slice((page - 1) * pageSize, page * pageSize)
    );

    return NextResponse.json({
      ok: true,
      sucursal: sucursalFiltro,
      sucursales,
      stats: {
        totalProducts: total,
        totalStock,
        // Task 170: bienes de uso de la empresa en esta sucursal
        bienesEmpresa: {
          productos: filasBienes.length,
          unidades: filasBienes.reduce((acc, f) => acc + f.stock, 0),
        },
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
