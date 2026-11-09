import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { contactoDe } from "@/lib/fun-viza-contactos";
import { asignarContacto } from "@/lib/usuario-contacto";

// PATCH /api/admin/usuarios/[id]/contacto
// Task 141 (pedido del dueño): desde el GDA el SUPREMO puede MODIFICAR el
// número de contacto de un usuario (el que sale en la franja del vendedor en
// los presupuestos) y también AGREGARLO si todavía no tiene.
// Body: { "telefono": "0983 000000" }
//   · número vacío = quitar la edición y volver al número de la planilla.
// Solo el SUPREMO_ADMIN. No toca el modelo User: guarda en tabla aparte.
export async function PATCH(
  req: NextRequest,
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

    const body = await req.json().catch(() => null);
    const telefono = String(body?.telefono ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "") // sin caracteres de control
      .trim()
      .slice(0, 40);

    // Acepta solo lo que puede tener un teléfono. Vacío es válido: quita la
    // edición y la planilla FUN.VIZA vuelve a mandar para ese email.
    if (telefono && !/^[0-9+()\s.\-]+$/.test(telefono)) {
      return NextResponse.json(
        { error: "Número inválido. Usá solo números, espacios, +, (), - o ." },
        { status: 400 }
      );
    }

    const ok = await asignarContacto(target.email, telefono);
    if (!ok) {
      return NextResponse.json(
        { error: "No se pudo guardar el contacto. Intentá nuevamente." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: target.id,
      email: target.email,
      // Lo que el GDA/PDF deben mostrar ahora: edición guardada o planilla.
      contacto: telefono || contactoDe(target.email),
      editado: !!telefono,
    });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id]/contacto PATCH] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
