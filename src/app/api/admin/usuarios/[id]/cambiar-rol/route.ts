import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/admin/usuarios/[id]/cambiar-rol
// Task 82 (pedido del dueño): cambia el TIPO DE USUARIO de un usuario
// existente desde la Gestión de Accesos (antes solo se podía elegir el tipo
// al CREAR el usuario; cambiar el de uno existente exigía tocar la base).
// Caso de uso: filipe.campos@viza.com.py pasa de COMÚN a ADMIN (ADM de solo
// visualización: su modo lectura va por EMAIL, lista en
// src/lib/usuarios-consulta.ts, así que aunque sea ADMIN no puede editar
// la base ni nada).
// Solo el SUPREMO_ADMIN puede cambiar tipos. Reglas:
//   · roles permitidos en el cambio: "admin" | "colaborador" (COMÚN).
//     No se crea ni se toca ningún supremo_admin desde acá.
//   · no se puede cambiar el tipo de un supremo_admin.
//   · no se puede cambiar el propio tipo (evita quedar sin supremo).
// OJO: la sesión es JWT — el nuevo rol le llega al usuario en su próximo
// inicio de sesión (cerrar y volver a entrar). La etiqueta en la Gestión de
// Accesos se actualiza al instante (lee la base).
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

    if (target.role === "supremo_admin") {
      return NextResponse.json(
        { error: "No se puede cambiar el tipo de un usuario SUPREMO" },
        { status: 400 }
      );
    }
    if ((session.user as any)?.email === target.email) {
      return NextResponse.json(
        { error: "No puedes cambiar el tipo de tu propia cuenta" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const nuevoRol = typeof body?.role === "string" ? body.role.trim() : "";
    if (nuevoRol !== "admin" && nuevoRol !== "colaborador") {
      return NextResponse.json(
        { error: "Rol inválido. Valores permitidos: admin, colaborador" },
        { status: 400 }
      );
    }
    if (nuevoRol === target.role) {
      return NextResponse.json(
        { error: "El usuario ya tiene ese tipo" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { role: nuevoRol, updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true, id: updated.id, role: updated.role });
  } catch (err: any) {
    console.error("[/api/admin/usuarios/[id]/cambiar-rol] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
