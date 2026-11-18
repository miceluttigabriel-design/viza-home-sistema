// ============================================================================
//  STOCK AUTOMATICO - API DEL TURNO (PC principal / reserva)
// ----------------------------------------------------------------------------
//  GET  /api/stock-auto/turno  -> quien tiene el turno ahora (solo consulta)
//  POST /api/stock-auto/turno  -> la PC pide/renueva el turno
//                                 Body: { "pc": "DESKTOP-XXXX" }
//
//  Solo admin / supremo_admin, igual que el resto del stock automatico.
//  Si otra PC tiene el turno vigente, el POST devuelve activo=false y el
//  agente de esa PC queda en espera (no toca el CtrCredito ni importa nada).
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { puedeControlarStockAuto } from "@/lib/config-stock-auto";
import { leerTurnoStockAuto, tomarTurnoStockAuto } from "@/lib/stock-auto-turno";

export const dynamic = "force-dynamic";

function puedeUsarTurno(session: { user?: any } | null): boolean {
  return puedeControlarStockAuto(session?.user?.role, session?.user?.email);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!puedeUsarTurno(session)) {
      return NextResponse.json(
        { error: "El usuario del robot tiene que ser admin (no de consulta)" },
        { status: 403 }
      );
    }

    const turno = await leerTurnoStockAuto();
    if (!turno) {
      return NextResponse.json({ error: "No se pudo leer el turno" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...turno });
  } catch (error) {
    console.error("Error leyendo el turno del stock automatico:", error);
    return NextResponse.json({ error: "Error leyendo el turno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!puedeUsarTurno(session)) {
      return NextResponse.json(
        { error: "El usuario del robot tiene que ser admin (no de consulta)" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pc = typeof body?.pc === "string" ? body.pc.trim() : "";
    if (!pc) {
      return NextResponse.json({ error: "Falta el nombre de la PC" }, { status: 400 });
    }

    const turno = await tomarTurnoStockAuto(pc);
    if (!turno) {
      return NextResponse.json({ error: "No se pudo tomar el turno" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...turno });
  } catch (error) {
    console.error("Error tomando el turno del stock automatico:", error);
    return NextResponse.json({ error: "Error tomando el turno" }, { status: 500 });
  }
}
