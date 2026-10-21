import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/admin/usuarios/[id]/historial
// Solo el SUPREMO_ADMIN puede ver el historial de cambios de contraseña de un usuario.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const logs = await db.passwordLog.findMany({
      where: { userId },
      orderBy: { fechaCambio: "desc" },
    });

    return NextResponse.json({
      email: target.email,
      name: target.name,
      historial: logs.map((l) => ({
        id: l.id,
        contrasena: l.contrasenaTextoPlano,
        fechaCambio: l.fechaCambio,
        cambiadoPor: l.cambiadoPor,
      })),
    });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id]/historial] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
