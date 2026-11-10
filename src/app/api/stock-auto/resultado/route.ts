// ============================================================================
//  STOCK AUTOMATICO - API (la PC del robot informa el resultado)
// ----------------------------------------------------------------------------
//  POST /api/stock-auto/resultado
//  Body: { ok, nuevos, actualizados, mensaje }
//  Guarda como quedo la ultima corrida y LIMPIA el pedido manual (ya se
//  atendio). Lo que se guarda se ve en la Base, en el cuadro de STOCK
//  AUTOMATICO.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  puedeControlarStockAuto,
  registrarResultadoStockAuto,
} from "@/lib/config-stock-auto";

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
    await registrarResultadoStockAuto({
      ok: body?.ok === true,
      nuevos: Number(body?.nuevos) || 0,
      actualizados: Number(body?.actualizados) || 0,
      mensaje: typeof body?.mensaje === "string" ? body.mensaje : "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error guardando el resultado del stock automatico:", error);
    return NextResponse.json({ error: "Error al guardar el resultado" }, { status: 500 });
  }
}
