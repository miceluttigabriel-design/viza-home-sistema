import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { guardarHashtag } from "@/lib/producto-hashtag";

/**
 * PATCH /api/products/[id]/hashtag
 * Guarda SOLO el #HASHTAG del producto (valor en Gs + fecha de validez).
 * No toca ningún otro campo - es una operación aislada (mismo patrón que
 * el endpoint de etiquetas /label).
 *
 * REGLA DE ORO: el hashtag vive en la tabla APARTE "ProductHashtag"
 * (src/lib/producto-hashtag.ts). El modelo Product y el PUT normal de
 * productos NO se tocan: editar cualquier celda de la base nunca borra
 * ni pisa el hashtag. Solo se borra si el admin limpia valor y fecha.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo el administrador puede cargar el #HASHTAG" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // valor: número >= 0 o null (vacío)
    let valor: number | null = null;
    if (body.valor !== null && body.valor !== undefined && body.valor !== "") {
      const n = Number(body.valor);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "El valor del #HASHTAG debe ser un número mayor o igual a 0" },
          { status: 400 }
        );
      }
      valor = n;
    }

    // fecha: "YYYY-MM-DD" (input date) o null
    let fecha: string | null = null;
    if (body.fecha !== null && body.fecha !== undefined && body.fecha !== "") {
      const f = String(body.fecha);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        return NextResponse.json(
          { error: "La fecha del #HASHTAG debe tener formato AAAA-MM-DD" },
          { status: 400 }
        );
      }
      fecha = f;
    }

    // Verificar que el producto existe
    const existing = await db.product.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const ok = await guardarHashtag(id, valor, fecha);
    if (!ok) {
      return NextResponse.json(
        { error: "No se pudo guardar el #HASHTAG (tabla no disponible)" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      hashtag: { valor, fecha },
    });
  } catch (error) {
    console.error("Error guardando #HASHTAG:", error);
    return NextResponse.json(
      { error: "Error al guardar el #HASHTAG" },
      { status: 500 }
    );
  }
}
