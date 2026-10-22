import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/admin/activity-logs - listar registros de ediciones (solo supremo)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if ((session.user as any)?.role !== "supremo_admin")
      return NextResponse.json({ error: "Solo SUPREMO_ADMIN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Number(searchParams.get("limit") || "100"));

    const logs = await db.activityLog.findMany({
      orderBy: { fechaHora: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs, total: logs.length });
  } catch (err: any) {
    console.error("[activity-logs GET] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE /api/admin/activity-logs - borrar TODOS los registros (solo supremo)
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if ((session.user as any)?.role !== "supremo_admin")
      return NextResponse.json({ error: "Solo SUPREMO_ADMIN" }, { status: 403 });

    const result = await db.activityLog.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err: any) {
    console.error("[activity-logs DELETE] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
