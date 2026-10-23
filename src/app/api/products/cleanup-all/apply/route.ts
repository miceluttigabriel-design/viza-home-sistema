import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────
// POST /api/products/cleanup-all/apply
//
// BORRA TODOS los productos de la base. Operación DESTRUCTIVA.
//
// Recibe JSON: { confirm: true } (el frontend debe mandar confirm=true
// como medida extra de seguridad — el botón lo hace).
//
// Solo supremo_admin puede ejecutarlo.
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

    // Medida de seguridad: exigir confirm=true en el body
    const body = await req.json().catch(() => ({}));
    if (!body || body.confirm !== true) {
      return NextResponse.json(
        { error: "Falta confirmación. El body debe ser { confirm: true }" },
        { status: 400 }
      );
    }

    // Contar antes de borrar
    const totalAntes = await db.product.count();

    // BORRAR TODO con deleteMany (where vacío = borra todo)
    const result = await db.product.deleteMany({});

    return NextResponse.json({
      ok: true,
      borrados: result.count,
      totalAntes,
    });
  } catch (error) {
    console.error("Error en cleanup-all/apply:", error);
    return NextResponse.json(
      { error: "Error al borrar todos los productos" },
      { status: 500 }
    );
  }
}
