// ============================================================================
//  STOCK AUTOMATICO - API (boton ACTUALIZAR AHORA)
// ----------------------------------------------------------------------------
//  POST /api/stock-auto/pedido
//  Deja un "pedido de corrida" en la base. La PC del robot lo ve en su
//  siguiente consulta (<= 1 minuto) y ejecuta el ciclo completo:
//  exporta el CtrCredito e importa la planilla.
//
//  El pedido vence a los 30 minutos: si la PC estaba apagada, no se dispara
//  solo horas despues (ver PEDIDO_VIGENTE_MINUTOS).
// ============================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getConfigStockAuto,
  pedirCorridaStockAuto,
  puedeControlarStockAuto,
} from "@/lib/config-stock-auto";

export const dynamic = "force-dynamic";

export async function POST() {
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
        { error: "Solo un usuario ADMIN puede pedir la actualizacion de stock" },
        { status: 403 }
      );
    }

    const quien =
      (session.user as any)?.name || (session.user as any)?.email || "admin";
    const ok = await pedirCorridaStockAuto(quien);
    if (!ok) {
      return NextResponse.json(
        { error: "No se pudo enviar el pedido (intenta de nuevo)" },
        { status: 500 }
      );
    }

    const cfg = await getConfigStockAuto();
    return NextResponse.json({ ok: true, ...cfg });
  } catch (error) {
    console.error("Error pidiendo corrida de stock:", error);
    return NextResponse.json({ error: "Error al pedir la corrida" }, { status: 500 });
  }
}
