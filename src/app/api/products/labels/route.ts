import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import {
  leerEtiquetasCreadas,
  crearEtiqueta,
  borrarEtiqueta,
} from "@/lib/etiquetas";

// ─── GET /api/products/labels ───
// Lista de etiquetas creadas por el supremo (a las 4 fijas de la UI las
// maneja el propio admin-panel). Disponible para CUALQUIER usuario con
// sesión (la necesitan el Panel ADM y el modo consulta para pintar
// filas, menús de etiquetado y filtros).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const creadas = await leerEtiquetasCreadas();
    return NextResponse.json({ creadas });
  } catch (error) {
    console.error("Error listando etiquetas:", error);
    return NextResponse.json({ error: "Error al obtener etiquetas" }, { status: 500 });
  }
}

// ─── POST /api/products/labels ───
// Crea una etiqueta nueva { nombre, color }.
// SOLO supremo_admin (pedido del dueño: el botón es apenas para el
// Supremo Usuario). Blindaje extra: un usuario de consulta (aunque tuviera
// rol admin) tampoco puede.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el Supremo Usuario puede crear etiquetas" },
        { status: 403 }
      );
    }
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede crear etiquetas" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const resultado = await crearEtiqueta(body?.nombre, body?.color);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json({ etiqueta: resultado.etiqueta }, { status: 201 });
  } catch (error) {
    console.error("Error creando etiqueta:", error);
    return NextResponse.json({ error: "Error al crear la etiqueta" }, { status: 500 });
  }
}

// ─── DELETE /api/products/labels?id=... ───
// Borra UNA etiqueta CREADA (las 4 fijas jamás). Los productos que la
// tenían quedan sin etiqueta (etiquetaColor = null).
// SOLO supremo_admin + blindaje extra de consulta.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el Supremo Usuario puede borrar etiquetas" },
        { status: 403 }
      );
    }
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede borrar etiquetas" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const resultado = await borrarEtiqueta(id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error borrando etiqueta:", error);
    return NextResponse.json({ error: "Error al borrar la etiqueta" }, { status: 500 });
  }
}
