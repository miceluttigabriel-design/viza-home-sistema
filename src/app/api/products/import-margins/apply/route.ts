// POST /api/products/import-margins/apply
// Aplica las márgenes del Excel a los productos que coinciden.
// REGLAS:
//   - Solo se actualizan: marginContado, pct1A6/7A13/14A30, marginC1..C30
//   - Los precios (contado + 30 cuotas) se recalculan con el costProd YA EXISTENTE
//   - Los costos NUNCA se modifican
//   - Productos sin costo: solo márgenes (precios intocados)
//   - valorTecnico/margenTecnico SOLO para los productos que traen Valor Para
//     Técnico en el Excel (col CV > 0); los demás quedan intocados.
// MÁRGENES AUTOMÁTICAS:
//   - Los productos del panel con margen 0/null que NO vienen en la planilla
//     reciben el promedio de su TIPO (o sub-grupo, o promedio general).
//   - Se ejecuta SIEMPRE (cada vez que se corre el importador), pero como solo
//     toca productos con margen 0, cada producto recibe la automática una sola vez.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseBody,
  requireSupremo,
  fetchMatchedProducts,
  buildMarginUpdate,
  computeDbMarginStats,
  pickPromedio,
  buildAutoMarginUpdate,
} from "../shared";

export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSupremo();
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

    // Construir updates del Excel
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

    // Ejecutar updates del Excel en lotes paralelos (rápido incluso con ~3.500 productos)
    let actualizados = 0;
    let conTecnico = 0;
    const errores: string[] = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          actualizados++;
          if (typeof batch[idx].data.valorTecnico === "number") conTecnico++;
        } else {
          const sku = batch[idx].sku;
          errores.push(`SKU ${sku}: ${String((r as PromiseRejectedResult).reason?.message || "error")}`);
        }
      });
    }

    // ─── MÁRGENES AUTOMÁTICAS ───
    // Productos del panel con margen 0/null que NO están en la planilla:
    // reciben el promedio de su tipo (o sub-grupo, o promedio general).
    const matchedIds = updates.map((u) => u.id);
    const zeroProducts = await db.product.findMany({
      where: {
        OR: [{ marginContado: null }, { marginContado: 0 }],
        id: { notIn: matchedIds },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        tipo: true,
        subGrupo: true,
        costProd: true,
      },
    });

    const stats = await computeDbMarginStats();
    const autoUpdates: Array<{ id: string; sku: string; data: Record<string, number> }> = [];
    let autoCandidatos = 0;
    for (const p of zeroProducts) {
      const pick = pickPromedio(stats, { tipo: p.tipo, subGrupo: p.subGrupo });
      if (!pick) continue;
      autoCandidatos++;
      autoUpdates.push({
        id: p.id,
        sku: p.sku,
        data: buildAutoMarginUpdate(p.costProd, pick.avg),
      });
    }

    let autoActualizados = 0;
    for (let i = 0; i < autoUpdates.length; i += BATCH_SIZE) {
      const batch = autoUpdates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          autoActualizados++;
        } else {
          const sku = batch[idx].sku;
          errores.push(`SKU ${sku} (auto): ${String((r as PromiseRejectedResult).reason?.message || "error")}`);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      totalCodigos: rows.length,
      actualizados,
      conTecnico,
      autoSinMargen: autoCandidatos,
      autoActualizados,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-margins:", error);
    return NextResponse.json({ error: "Error al aplicar márgenes" }, { status: 500 });
  }
}
