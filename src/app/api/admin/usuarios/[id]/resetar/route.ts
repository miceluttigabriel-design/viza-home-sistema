import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// POST /api/admin/usuarios/[id]/resetar
// Solo el SUPREMO_ADMIN puede resetear la contraseña de cualquier usuario.
// Body: { "nuevaContrasena": "..." }  (opcional; si no se envía, se genera una nueva automática)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    let nueva: string;
    try {
      const body = await req.json();
      nueva = (body?.nuevaContrasena || "").toString();
    } catch {
      nueva = "";
    }
    if (!nueva || nueva.length < 4) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      let suffix = "";
      for (let i = 0; i < 4; i++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
      }
      nueva = `VizaHome2026!${suffix}`;
    }

    const hashed = await bcrypt.hash(nueva, 10);
    await db.user.update({
      where: { id: userId },
      data: { password: hashed, updatedAt: new Date() },
    });

    await db.passwordLog.create({
      data: {
        userId: target.id,
        email: target.email,
        contrasenaTextoPlano: nueva,
        cambiadoPor: "SUPREMO_ADMIN",
      },
    });

    return NextResponse.json({
      ok: true,
      email: target.email,
      nuevaContrasena: nueva,
    });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id]/resetar] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
