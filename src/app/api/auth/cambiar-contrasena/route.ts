import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// POST /api/auth/cambiar-contrasena
// Cualquier usuario autenticado (supremo_admin, admin, colaborador) puede cambiar
// SU PROPIA contraseña. La nueva contraseña se guarda en PasswordLog con
// cambiadoPor="PROPIO_USUARIO" (silencioso - el usuario no ve este mensaje en UI).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    const body = await req.json();
    const { passwordActual, passwordNueva, passwordConfirmacion } = body as {
      passwordActual?: string;
      passwordNueva?: string;
      passwordConfirmacion?: string;
    };

    if (!passwordActual || !passwordNueva || !passwordConfirmacion) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios (actual, nueva, confirmación)" },
        { status: 400 }
      );
    }
    if (passwordNueva !== passwordConfirmacion) {
      return NextResponse.json(
        { error: "La nueva contraseña y su confirmación no coinciden" },
        { status: 400 }
      );
    }
    if (passwordNueva.length < 6) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }
    if (passwordActual === passwordNueva) {
      return NextResponse.json(
        { error: "La nueva contraseña no puede ser igual a la actual" },
        { status: 400 }
      );
    }

    const usuario = await db.user.findUnique({ where: { id: userId } });
    if (!usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (!usuario.active) {
      return NextResponse.json(
        { error: "Tu cuenta está desactivada. Contactá al administrador." },
        { status: 403 }
      );
    }

    const validaActual = await bcrypt.compare(passwordActual, usuario.password);
    if (!validaActual) {
      return NextResponse.json(
        { error: "La contraseña actual es incorrecta" },
        { status: 400 }
      );
    }

    const nuevoHash = await bcrypt.hash(passwordNueva, 10);

    await db.user.update({
      where: { id: userId },
      data: { password: nuevoHash, updatedAt: new Date() },
    });

    await db.passwordLog.create({
      data: {
        userId: usuario.id,
        email: usuario.email,
        contrasenaTextoPlano: passwordNueva,
        cambiadoPor: "PROPIO_USUARIO",
      },
    });

    console.log("[cambiar-contrasena] OK:", usuario.email, "cambió su propia contraseña");

    return NextResponse.json({
      ok: true,
      mensaje: "Contraseña actualizada correctamente",
      email: usuario.email,
      nuevaContrasena: passwordNueva,
    });
  } catch (err: any) {
    console.error("[/api/auth/cambiar-contrasena] Error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
