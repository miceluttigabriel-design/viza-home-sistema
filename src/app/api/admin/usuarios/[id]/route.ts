import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { borrarContactoDeUsuario } from "@/lib/usuario-contacto";

// DELETE /api/admin/usuarios/[id]
// Task 141 (pedido del dueño): opción de ELIMINAR un usuario desde el GDA.
// Solo el SUPREMO_ADMIN. Protecciones pensadas para no romper nada:
//   · NO se puede eliminar la propia cuenta (evita quedar sin acceso).
//   · NO se puede eliminar ningún usuario SUPREMO_ADMIN.
//   · los presupuestos ya emitidos NO se borran: Quote.userId pasa a NULL
//     (onDelete: SetNull) y el historial de numeración QuoteSequence queda
//     intacto para conservar la cuenta histórica.
//   · PasswordLog cae en cascada con el usuario.
//   · se limpian las filas aparte de Sucursal y Contacto de ese email.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Acceso denegado. Solo SUPREMO_ADMIN." },
        { status: 403 }
      );
    }

    const { id: userId } = await params;
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const propioEmail = String((session.user as any)?.email || "")
      .trim()
      .toLowerCase();
    const targetEmail = target.email.trim().toLowerCase();

    if (propioEmail && propioEmail === targetEmail) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propia cuenta" },
        { status: 400 }
      );
    }
    if (target.role === "supremo_admin") {
      return NextResponse.json(
        { error: "No se puede eliminar un usuario SUPREMO_ADMIN" },
        { status: 400 }
      );
    }

    // Limpieza best-effort de las tablas aparte (nunca frenan el borrado).
    await borrarContactoDeUsuario(targetEmail);
    try {
      await db.usuarioSucursal.deleteMany({ where: { userEmail: targetEmail } });
    } catch {
      // tabla UsuarioSucursal ausente / BD caída: no hay nada que limpiar
    }

    // La bitácora de contraseñas pertenece al usuario: se borra con él.
    await db.passwordLog.deleteMany({ where: { userId: target.id } });

    await db.user.delete({ where: { id: target.id } });

    return NextResponse.json({
      ok: true,
      id: target.id,
      email: target.email,
      eliminado: true,
    });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
