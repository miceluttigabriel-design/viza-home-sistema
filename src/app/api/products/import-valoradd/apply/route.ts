// POST /api/products/import-valoradd/apply
// Aplica el VALOR ADD del Excel (planilla LISTA VIZA HOME, hoja "base")
// a los productos que coinciden por COD (sku o codViza).
// REGLAS DE SEGURIDAD:
//   - SOLO se toca la columna VALOR ADD y lo que el propio sistema recalcula
//     cuando el admin edita VALOR ADD a mano en la tabla (PUT
//     /api/products/[id]): cadena de costos (rsToGs, usToGs, rsNoUS, usNoGs,
//     subCost, minusDisc, plusAdd, plusAdd2, minusDescV), Costo Prod.,
//     márgenes 1..30, precios 1..30, priceContado y los campos legados
//     price/cost del catálogo de vendedores.
//   - NUNCA se crean productos.
//   - NUNCA se borra un VALOR ADD existente (filas sin valor se ignoran).
//   - Productos que ya tienen exactamente ese VALOR ADD quedan intocados.
//   - No se tocan: costos de entrada (costBR/costUS/costGs), % DESC, % ADD,
//     GASTOS ADM, VALOR DESC., bases de porcentajes, % Contado, stock,
//     etiquetas, fabricante ni ningún otro dato.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseBody,
  requireSupremo,
  fetchMatchedProducts,
  buildValorAddUpdate,
  round6,
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
        { error: "El Excel no contiene filas con COD VIZA + VALOR ADD (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Construir updates: valorAdd nuevo + cadena de costos/precios recalculada
    // (misma fórmula que la edición manual del admin)
    const updates: Array<{ id: string; sku: string; data: Record<string, number | null> }> = [];
    const noEncontrados: string[] = [];
    let yaIgual = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      const actual = product.valorAdd;
      if (actual !== null && round6(actual) === round6(row.valorAdd)) {
        yaIgual++;
        continue;
      }
      const { data } = buildValorAddUpdate(product, row.valorAdd);
      updates.push({ id: product.id, sku: product.sku, data });
    }

    // Ejecutar updates en lotes paralelos (rápido incluso con ~3.500 productos,
    // mismo mecanismo que import-margins/import-fabricante apply)
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
          errores.push(
            `SKU ${sku}: ${String((r as PromiseRejectedResult).reason?.message || "error")}`
          );
        }
      });
    }

    return NextResponse.json({
      ok: true,
      totalCodigos: rows.length,
      actualizados,
      yaIgual,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-valoradd:", error);
    return NextResponse.json({ error: "Error al aplicar VALOR ADD" }, { status: 500 });
  }
}
