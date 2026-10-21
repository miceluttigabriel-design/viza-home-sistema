import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET /api/stats - métricas para el dashboard
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const totalProducts = await db.product.count();
    const totalStock = await db.product.aggregate({ _sum: { stock: true } });
    const inventoryValue = await db.product.aggregate({
      _sum: { price: true },
    });

    const byCategoryRaw = await db.product.groupBy({
      by: ["category"],
      _count: true,
      _sum: { stock: true },
    });

    const byCategory = byCategoryRaw.map((c) => ({
      category: c.category,
      count: c._count,
      stock: c._sum.stock ?? 0,
    }));

    const recentQuotes = await db.quote.count();

    return NextResponse.json({
      totalProducts,
      totalStock: totalStock._sum.stock ?? 0,
      inventoryValue: inventoryValue._sum.price ?? 0,
      byCategory,
      recentQuotes,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Error al obtener estadísticas" }, { status: 500 });
  }
}
