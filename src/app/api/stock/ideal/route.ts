import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { leerSucursalesStock, leerSaldosSucursal } from "@/lib/stock-sucursal";
import { leerIdeales, guardarIdeales } from "@/lib/stock-ideal";
import { leerCores } from "@/lib/producto-cores";

// ─────────────────────────────────────────────────────────────────
// STOCK IDEAL (Task 127 — Módulo de Distribución Inteligente)
//
// GET  /api/stock/ideal?search=&page=&pageSize=
//   Lista de productos con su SALDO y su STOCK IDEAL por nodo
//   (CENTRAL + cada sucursal). Es la pantalla "CONFIGURAR STOCK IDEAL"
//   del reporte de distribución: el dueño busca el producto y anota
//   cuánto DEBERÍA haber en cada nodo.
//
// PUT  /api/stock/ideal
//   Body: { items: [{ productId, sucursal, ideal }] }
//   Guarda una tanda de ideales (upsert por producto+sucursal; ideal 0
//   borra el ideal del nodo). SOLO admin/supremo — igual que la edición
//   de productos de la Base. Los usuarios de consulta (lista única en
//   src/lib/usuarios-consulta.ts) jamás escriben.
//
// La tabla ProductStockIdeal es APARTE y AUTO-GESTIONADA
// (src/lib/stock-ideal.ts): si no existe, se crea sola — nunca rompe.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

// Mismos campos de búsqueda que el resto del sistema (Base / Stock General).
const CAMPOS_BUSQUEDA = [
  "name",
  "sku",
  "fabricante",
  "tipo",
  "marca",
  "modelo",
  "referencia",
];

function buildWhereBusqueda(search: string) {
  const q = search.trim();
  if (!q) return null;
  return {
    OR: CAMPOS_BUSQUEDA.map((campo) => ({
      [campo]: { contains: q, mode: "insensitive" as const },
    })),
  };
}

// Orden por COD numérico (misma regla que la Base y Stock General:
// "9" antes que "10"). Copia local del helper — el de la Base no se
// exporta para no acoplar endpoints entre sí.
function codNumero(s: unknown): number | null {
  const m = String(s ?? "").match(/\d+/g);
  if (!m) return null;
  return Number(m.join(""));
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || "100"))
    );

    // Nodos reales del sistema: CENTRAL (depósito) + cada sucursal con
    // stock cargado por la planilla del ERP. Orden fijo del dueño: CENTRAL
    // primero, resto alfabético.
    const sucursales = (await leerSucursalesStock()).map((s) => s.nombre);

    // ── Productos (paginados, con búsqueda) ──
    const where: Record<string, unknown> = {};
    const orBusqueda = buildWhereBusqueda(search);
    if (orBusqueda) where.OR = orBusqueda.OR;

    // Para respetar el orden por COD numérico con paginación correcta:
    // 1) ids+sku de TODOS los coincidentes (liviano), 2) orden en memoria,
    // 3) página recortada, 4) filas completas solo de esa página.
    const todos = await db.product.findMany({
      where,
      select: { id: true, sku: true },
    });
    todos.sort((a, b) => {
      const na = codNumero(a.sku);
      const nb = codNumero(b.sku);
      if (na === null && nb === null)
        return String(a.sku).localeCompare(String(b.sku));
      if (na === null) return 1;
      if (nb === null) return -1;
      return na - nb;
    });
    const total = todos.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageIds = todos
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r) => r.id);

    const productos = await db.product.findMany({
      where: { id: { in: pageIds } },
      select: { id: true, sku: true, name: true, tipo: true, referencia: true },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const ordenados = pageIds
      .map((id) => porId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);

    // ── Saldo actual por nodo (StockSucursal, lo que dejó la planilla) ──
    const saldosPorNodo = await Promise.all(
      sucursales.map((s) => leerSaldosSucursal(s))
    );

    // ── Ideal configurado + CORES (color, columna de la Base) ──
    const idsPagina = ordenados.map((p) => p.id);
    const [ideales, coresMap] = await Promise.all([
      leerIdeales(idsPagina),
      leerCores(idsPagina),
    ]);

    const rows = ordenados.map((p) => {
      const saldos: Record<string, number> = {};
      sucursales.forEach((s, i) => {
        saldos[s] = Math.round(saldosPorNodo[i].get(p.id) ?? 0);
      });
      const idealesDelProducto = ideales.get(p.id);
      const idealesSalida: Record<string, number> = {};
      for (const s of sucursales) {
        const v = idealesDelProducto?.get(s);
        if (typeof v === "number" && v > 0) idealesSalida[s] = Math.round(v);
      }
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        tipo: p.tipo,
        referencia: p.referencia,
        cores: coresMap.get(p.id) ?? null, // COLOR (columna CORES de la Base)
        saldos,
        ideales: idealesSalida,
      };
    });

    return NextResponse.json({
      ok: true,
      sucursales,
      rows,
      total,
      totalPages,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error en GET /api/stock/ideal:", error);
    return NextResponse.json(
      { error: "Error al obtener productos para el stock ideal" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (
      (session.user as any)?.role !== "admin" &&
      (session.user as any)?.role !== "supremo_admin"
    ) {
      return NextResponse.json(
        { error: "Solo el administrador puede configurar el stock ideal" },
        { status: 403 }
      );
    }
    // Usuarios de consulta: SOLO LECTURA (misma regla de la Base).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "No hay ideales para guardar" },
        { status: 400 }
      );
    }
    if (items.length > 2000) {
      return NextResponse.json(
        { error: "Demasiados ideales de una sola vez (máx 2000)" },
        { status: 400 }
      );
    }

    const resultado = await guardarIdeales(items);
    // resultado ya trae { ok, filas, borradas, errores } — se devuelve tal cual.
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error en PUT /api/stock/ideal:", error);
    return NextResponse.json(
      { error: "Error al guardar el stock ideal" },
      { status: 500 }
    );
  }
}
