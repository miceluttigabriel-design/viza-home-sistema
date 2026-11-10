// ============================================================================
//  STOCK AUTOMATICO - API (interruptor ON/OFF)
// ----------------------------------------------------------------------------
//  GET  /api/stock-auto   -> estado del interruptor + resultado de la ultima
//                            corrida + si la PC del robot esta dando senal.
//  PUT  /api/stock-auto   -> mueve el interruptor. Body: { "habilitado": true }
//
//  Solo admin / supremo_admin (NUNCA usuarios de consulta solo lectura). La
//  misma regla la valida la UI, asi panel y backend deciden siempre igual.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getConfigStockAuto,
  guardarHabilitadoStockAuto,
  puedeControlarStockAuto,
} from "@/lib/config-stock-auto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const cfg = await getConfigStockAuto();
    return NextResponse.json({
      ...cfg,
      puedeControlar: puedeControlarStockAuto(
        (session.user as any)?.role,
        (session.user as any)?.email
      ),
    });
  } catch (error) {
    console.error("Error leyendo config de stock automatico:", error);
    // Degradado: el panel sigue andando, el robot usa su ultimo estado.
    return NextResponse.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (
      !puedeControlarStockAuto(
        (session.user as any)?.role,
        (session.user as any)?.email
      )
    ) {
      return NextResponse.json(
        { error: "Solo un usuario ADMIN puede mover el interruptor del stock automatico" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const habilitado = body?.habilitado === true; // estricto
    const quien =
      (session.user as any)?.name || (session.user as any)?.email || "admin";

    const guardado = await guardarHabilitadoStockAuto(habilitado, quien);
    if (guardado === null) {
      return NextResponse.json(
        { error: "No se pudo guardar el estado en la base (intenta de nuevo)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, habilitado: guardado });
  } catch (error) {
    console.error("Error guardando config de stock automatico:", error);
    return NextResponse.json(
      { error: "Error al guardar el estado (intenta de nuevo)" },
      { status: 500 }
    );
  }
}
