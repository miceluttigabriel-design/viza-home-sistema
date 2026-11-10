import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerSucursalesStock } from "@/lib/stock-sucursal";
import { leerIdeales, productIdsConIdeal } from "@/lib/stock-ideal";
import { leerCores } from "@/lib/producto-cores";
import {
  analizarPlanConIA,
  analisisRespaldo,
  iaConfigurada,
} from "@/lib/encargado-ia";
import {
  calcularPlanEncargado,
  ordenarSucursales,
  parsearColores,
  SUCURSALES_BALANCE,
  DEPOSITO_CENTRAL,
  type EntradaProductoEncargado,
} from "@/lib/encargado-distribucion";
import {
  guardarSnapshotEncargado,
  leerHistorialEncargado,
} from "@/lib/encargado-historial";

// ═══════════════════════════════════════════════════════════════════
// ENCARGADO DE DISTRIBUCIÓN — API (Task 160)
//
// POST /api/stock/encargado          → analiza + IA + guarda historial
// POST /api/stock/encargado?ia=0     → solo recalcula el plan (sin IA y
//                                      sin guardar historial, para el
//                                      refresco automático)
//
// Lee: StockSucursal (saldo real por sucursal), ProductStockIdeal,
// ProductCores (columna CORES) y EncargadoStockHistorial (bajadas =
// ventas). NO escribe stock: solo recomienda transferencias internas.
// ═══════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizarNodo(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase();
}

async function responder(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role || "";
    // Task 160 (pedido del dueño): el ENCARGADO es SOLO del usuario SUPREMO,
    // igual que el botón de Stock General. Nadie más puede consultar el plan.
    if (role !== "supremo_admin") {
      return NextResponse.json(
        { error: "El Encargado de Distribución es exclusivo del usuario supremo" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conIA = searchParams.get("ia") !== "0";

    // ── Nodos: CENTRAL + las 4 sucursales oficiales + lo que haya en la
    // tabla StockSucursal (así una sucursal en 0 también participa).
    const resumenSucursales = await leerSucursalesStock();
    const nodos = ordenarSucursales([
      DEPOSITO_CENTRAL,
      ...SUCURSALES_BALANCE,
      ...resumenSucursales.map((s) => s.nombre),
    ]);

    // ── Saldos reales (incluye filas en 0 para detectar la caída) ──
    let filasStock: Array<{ productId: string; sucursal: string; saldo: number }> = [];
    try {
      filasStock = await db.stockSucursal.findMany({
        select: { productId: true, sucursal: true, saldo: true },
      });
    } catch {
      filasStock = [];
    }

    const saldosPorProducto = new Map<string, Map<string, number>>();
    for (const f of filasStock) {
      const sucursal = normalizarNodo(f.sucursal);
      if (!sucursal) continue;
      const saldo = Math.max(0, Math.round(Number(f.saldo) || 0));
      let porNodo = saldosPorProducto.get(f.productId);
      if (!porNodo) {
        porNodo = new Map<string, number>();
        saldosPorProducto.set(f.productId, porNodo);
      }
      porNodo.set(sucursal, saldo);
    }

    // ── Productos: los que tienen stock + los que tienen ideal ──
    const idsConIdeal = await productIdsConIdeal();
    const ids = Array.from(
      new Set<string>([...saldosPorProducto.keys(), ...idsConIdeal])
    );

    if (ids.length === 0) {
      const plan = calcularPlanEncargado({ nodos, productos: [] });
      const ia = conIA
        ? analisisRespaldo(
            plan,
            "Todavía no hay stock por sucursal ni STOCK IDEAL configurado. Importá la planilla del ERP y configurá el ideal para activar al Encargado."
          )
        : null;
      return NextResponse.json({
        ok: true,
        plan,
        ia,
        iaConfigurada: iaConfigurada(),
        historialActualizado: false,
      });
    }

    const [productosDb, coresMap, idealesMap, historial] = await Promise.all([
      db.product.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          sku: true,
          name: true,
          tipo: true,
          categoria: true,
          marca: true,
          modelo: true,
        },
      }),
      leerCores(ids),
      leerIdeales(ids),
      leerHistorialEncargado(),
    ]);

    const productos: EntradaProductoEncargado[] = productosDb.map((p) => {
      const porNodo = saldosPorProducto.get(p.id);
      const idealesProducto = idealesMap.get(p.id);
      const historialProducto = historial.get(p.id);

      const saldos: Record<string, number> = {};
      const ideales: Record<string, number> = {};
      const vendido: Record<string, number> = {};

      for (const nodo of nodos) {
        const saldoNodo = Math.max(0, Math.round(porNodo?.get(nodo) ?? 0));
        saldos[nodo] = saldoNodo;

        const idealNodo = idealesProducto?.get(nodo) ?? 0;
        if (idealNodo > 0) ideales[nodo] = Math.round(idealNodo);

        // Bajada desde el último análisis explícito = venta / consumo.
        const previo = historialProducto?.get(nodo)?.saldoPrevio;
        vendido[nodo] =
          typeof previo === "number"
            ? Math.max(0, Math.round(previo) - saldoNodo)
            : 0;
      }

      const cores = coresMap.get(p.id) ?? null;

      return {
        id: p.id,
        sku: p.sku,
        nombre: p.name,
        tipo: p.tipo,
        categoria: p.categoria,
        marca: p.marca,
        modelo: p.modelo,
        colores: parsearColores(cores),
        colorLegacy: cores,
        saldos,
        ideales,
        vendido,
      };
    });

    const plan = calcularPlanEncargado({
      nodos,
      productos,
      generadoEn: new Date().toISOString(),
    });

    // ── Historial: SOLO en el análisis explícito (con IA). Así el
    // refresco automático no borra las ventas detectadas. ──
    let historialActualizado = false;
    if (conIA) {
      const actual = new Map<string, Map<string, number>>();
      for (const [productId, porNodo] of saldosPorProducto) {
        actual.set(productId, new Map(porNodo));
      }
      const guardado = await guardarSnapshotEncargado(actual);
      historialActualizado = guardado.ok;
      if (!guardado.ok) {
        console.warn(
          "[ENCARGADO] No se pudo guardar el historial:",
          guardado.errores.join(" | ")
        );
      }
    }

    const ia = conIA ? await analizarPlanConIA(plan) : null;

    return NextResponse.json({
      ok: true,
      plan,
      ia,
      iaConfigurada: iaConfigurada(),
      historialActualizado,
    });
  } catch (error: any) {
    console.error("Error en /api/stock/encargado:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Error al calcular el plan del Encargado de Distribución",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return responder(req);
}

export async function POST(req: NextRequest) {
  return responder(req);
}
