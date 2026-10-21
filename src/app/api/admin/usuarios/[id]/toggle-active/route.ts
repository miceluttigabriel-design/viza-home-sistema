import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/admin/usuarios/[id]/toggle-active
// Solo el SUPREMO_ADMIN puede activar/desactivar usuarios.
// Body: { "active": true|false }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== "supremo_admin") {
      return NextResponse.json({ error: "Acceso denegado. Solo SUPREMO_ADMIN." }, { status: 403 });
    }

    const { id: userId } = await params;
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (target.role === "supremo_admin" && (session.user as any)?.email === target.email) {
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta supremo" }, { status: 400 });
    }

    const body = await req.json();
    const active = !!body?.active;

    const updated = await db.user.update({
      where: { id: userId },
      data: { active, updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true, id: updated.id, active: updated.active });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id]/toggle-active] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
