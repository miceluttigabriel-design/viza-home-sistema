import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────
// POST /api/products/cleanup-all/preview
//
// Devuelve el total de productos en la base y un sample de los primeros 5
// (para mostrar en el modal antes de borrar todo).
//
// Solo supremo_admin puede usarlo. Es una operación DESTRUCTIVA.
// ─────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo supremo_admin puede borrar todos los productos" },
        { status: 403 }
      );
    }

    // Contar total
    const total = await db.product.count();

    // Sample de los primeros 5 (para mostrar en el modal)
    const sample = await db.product.findMany({
      take: 5,
      orderBy: { sku: "asc" },
      select: { sku: true, name: true, stock: true },
    });

    return NextResponse.json({
      ok: true,
      total,
      sample,
    });
  } catch (error) {
    console.error("Error en cleanup-all/preview:", error);
    return NextResponse.json(
      { error: "Error al contar productos" },
      { status: 500 }
    );
  }
}
