import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { existeEtiquetaCreada } from "@/lib/etiquetas";

// Valores válidos de etiqueta de color (las 4 fijas de siempre).
// Task 84: además se acepta el id de una etiqueta CREADA por el supremo
// (ver existeEtiquetaCreada más abajo).
const VALID_LABELS = ["verde", "azul", "dorado", "rojo"];

/**
 * PATCH /api/products/[id]/label
 * Actualiza SOLO la etiqueta de color del producto.
 * No toca ningún otro campo - es una operación aislada.
 *
 * REGLA DE ORO: La etiqueta debe sobrevivir a:
 *   - Recargas de página (se guarda en BD)
 *   - Ediciones de otras celdas (PUT normal no la toca)
 *   - Importaciones Excel (import route la preserva)
 * Solo se borra si el usuario la quita manualmente (pasar `null`).
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
        { error: "Solo el administrador puede etiquetar productos" },
        { status: 403 }
      );
    }

    // Task 79 + 82: usuarios de consulta (viza.compras@, filipe.campos@ —
    // lista en src/lib/usuarios-consulta.ts) son SOLO LECTURA de la base
    // (independiente del rol que tengan): jamás pueden etiquetar productos.
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede etiquetar productos" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const color = body.color; // string | null

    // Validar: debe ser null, una de las fijas, o una etiqueta creada
    if (color !== null && !VALID_LABELS.includes(color)) {
      const creadaValida = await existeEtiquetaCreada(color);
      if (!creadaValida) {
        return NextResponse.json(
          { error: `Etiqueta inválida (no es una fija ni una etiqueta creada)` },
          { status: 400 }
        );
      }
    }

    // Verificar que el producto existe
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // REGLA DE ORO: ETIQUETAR != EDITAR.
    // El endpoint de etiquetas SOLO actualiza etiquetaColor.
    // NO toca ultimaEdicionAt ni ultimaEdicionPor.
    // El badge de fecha/hora SOLO aparece cuando se editan datos reales
    // (PUT /api/products/[id]), NUNCA cuando se etiqueta.
    const updated = await db.product.update({
      where: { id },
      data: {
        etiquetaColor: color,
        // NO tocar ultimaEdicionAt ni ultimaEdicionPor aqui.
      },
      select: {
        id: true,
        sku: true,
        etiquetaColor: true,
        ultimaEdicionAt: true,
        ultimaEdicionPor: true,
      },
    });

    return NextResponse.json({
      ok: true,
      product: updated,
    });
  } catch (error) {
    console.error("Error actualizando etiqueta de color:", error);
    return NextResponse.json(
      { error: "Error al actualizar la etiqueta de color" },
      { status: 500 }
    );
  }
}
