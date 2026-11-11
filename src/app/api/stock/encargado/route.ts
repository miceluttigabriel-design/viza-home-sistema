import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  analizarPlanConIA,
  analisisRespaldo,
  iaConfigurada,
} from "@/lib/encargado-ia";
import { calcularPlanEncargado } from "@/lib/encargado-distribucion";
import {
  guardarSnapshotEncargado,
} from "@/lib/encargado-historial";
import { cargarDatosEncargado } from "@/lib/encargado-datos";

// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA — API (Task 160)
//
// POST /api/stock/encargado          → analiza + IA + guarda historial
// POST /api/stock/encargado?ia=0     → solo recalcula el plan (sin IA y
//                                      sin guardar historial, para el
//                                      refresco automático)
//
// Lee: StockSucursal, ProductStockIdeal, ProductCores (CORES) y
// EncargadoStockHistorial (bajadas = ventas). NO escribe stock: solo
// recomienda transferencias internas. Es exclusivo del usuario supremo.
// ═══════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
        { error: "El Departamento Distribución/Logística es exclusivo del usuario supremo" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conIA = searchParams.get("ia") !== "0";

    const { nodos, productos, saldosPorProducto } = await cargarDatosEncargado();

    if (productos.length === 0) {
      const plan = calcularPlanEncargado({ nodos, productos: [] });
      const ia = conIA
        ? analisisRespaldo(
            plan,
            "Todavía no hay stock por sucursal ni STOCK IDEAL configurado. Importá la planilla del ERP para activar al Encargado."
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
          "Error al calcular el plan del Departamento Distribución/Logística",
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
