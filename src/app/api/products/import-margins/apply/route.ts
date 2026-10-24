// POST /api/products/import-margins/apply
// Aplica las márgenes del Excel a los productos que coinciden.
// REGLAS:
//   - Solo se actualizan: marginContado, pct1A6/7A13/14A30, marginC1..C30
//   - Los precios (contado + 30 cuotas) se recalculan con el costProd YA EXISTENTE
//   - Los costos NUNCA se modifican
//   - Productos sin costo: solo márgenes (precios intocados)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, requireAdmin, fetchMatchedProducts, buildMarginUpdate } from "../shared";

export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }
    const { rows } = parsed;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El Excel no contiene márgenes válidos (hoja 'base', columna 'Contado')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Construir updates
    const updates: Array<{ id: string; sku: string; data: Record<string, number> }> = [];
    const noEncontrados: string[] = [];
    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      updates.push({
        id: product.id,
        sku: product.sku,
        data: buildMarginUpdate(product, row),
      });
    }

    // Ejecutar updates en lotes paralelos (rápido incluso con ~3.500 productos)
    let actualizados = 0;
    const errores: string[] = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          actualizados++;
        } else {
          const sku = batch[idx].sku;
          errores.push(`SKU ${sku}: ${String((r as PromiseRejectedResult).reason?.message || "error")}`);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      totalCodigos: rows.length,
      actualizados,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-margins:", error);
    return NextResponse.json({ error: "Error al aplicar márgenes" }, { status: 500 });
  }
}
