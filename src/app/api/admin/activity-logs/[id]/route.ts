import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// DELETE /api/admin/activity-logs/[id] - borrar un registro individual (solo supremo)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if ((session.user as any)?.role !== "supremo_admin")
      return NextResponse.json({ error: "Solo SUPREMO_ADMIN" }, { status: 403 });

    const { id } = await params;
    await db.activityLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[activity-logs/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
