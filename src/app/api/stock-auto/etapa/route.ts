// ============================================================================
//  STOCK AUTOMATICO - API (etapa en vivo)
// ----------------------------------------------------------------------------
//  POST /api/stock-auto/etapa
//  La PC del robot avisa en que paso esta: exportando, preview, aplicando.
//  El panel lo usa para cambiar el texto del boton y no dejar un spinner mudo.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  puedeControlarStockAuto,
  registrarHeartbeatStockAuto,
} from "@/lib/config-stock-auto";
import { registrarEtapaStockAuto } from "@/lib/stock-auto-etapa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => ({}));
    // La etapa tambien cuenta como senal de vida: si la exportacion tarda
    // varios minutos, el panel NO debe decir "PC sin senal" en el medio.
    await registrarHeartbeatStockAuto();
    await registrarEtapaStockAuto(
      typeof body?.etapa === "string" ? body.etapa : null,
      typeof body?.mensaje === "string" ? body.mensaje : null
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error guardando la etapa del stock automatico:", error);
    return NextResponse.json({ error: "Error al guardar la etapa" }, { status: 500 });
  }
}
