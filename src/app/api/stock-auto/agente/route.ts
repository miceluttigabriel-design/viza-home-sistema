// ============================================================================
//  STOCK AUTOMATICO - API (la PC del robot consulta)
// ----------------------------------------------------------------------------
//  POST /api/stock-auto/agente
//  La PC del robot llama a este endpoint cada minuto. Sirve para dos cosas:
//    1. Dejar la "senal de vida" (heartbeat) -> el panel muestra si la PC
//       esta encendida y conectada.
//    2. Recibir el estado: interruptor ON/OFF, si hay un pedido manual
//       pendiente y cuando fue la ultima corrida.
//
//  El robot entra con el usuario del .env (NextAuth credentials), igual que
//  la importacion: no hay secretos nuevos ni endpoints abiertos.
// ============================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getConfigStockAuto,
  puedeControlarStockAuto,
  registrarHeartbeatStockAuto,
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
        { error: "El usuario del robot tiene que ser admin (no de consulta)" },
        { status: 403 }
      );
    }

    await registrarHeartbeatStockAuto();
    const cfg = await getConfigStockAuto();
    return NextResponse.json({ ok: true, ...cfg });
  } catch (error) {
    console.error("Error en el ping del agente de stock:", error);
    return NextResponse.json({ error: "Error en el ping" }, { status: 500 });
  }
}
