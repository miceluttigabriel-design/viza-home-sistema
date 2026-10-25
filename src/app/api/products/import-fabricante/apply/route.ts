// POST /api/products/import-fabricante/apply
// Aplica el FABRICANTE del Excel (planilla LISTA VIZA HOME, hoja "base")
// a los productos que coinciden por COD (sku o codViza).
// REGLAS DE SEGURIDAD (nada más se toca):
//   - SOLO se actualiza el campo fabricante.
//   - brand (espejo del fabricante que muestra el catálogo de vendedores) SOLO
//     se completa si está vacío; si ya tiene valor, no se toca.
//   - NUNCA se crean productos.
//   - NUNCA se tocan costos, márgenes, precios, stock, etiquetas, ni ningún
//     otro campo.
//   - NUNCA se borra un fabricante existente (filas sin fabricante se ignoran).
//   - Productos que ya tienen exactamente ese fabricante quedan intocados.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, requireSupremo, fetchMatchedProducts } from "../shared";

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
        { error: "El Excel no contiene filas con COD VIZA + FABRICANTE (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Construir updates: solo fabricante (+ brand si estaba vacío)
    const updates: Array<{ id: string; sku: string; data: Record<string, string> }> = [];
    const noEncontrados: string[] = [];
    let yaIgual = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      const actual = (product.fabricante ?? "").trim();
      if (actual === row.fabricante) {
        yaIgual++;
        continue;
      }
      const data: Record<string, string> = { fabricante: row.fabricante };
      if (!(product.brand ?? "").trim()) {
        data.brand = row.fabricante;
      }
      updates.push({ id: product.id, sku: product.sku, data });
    }

    // Ejecutar updates en lotes paralelos (rápido incluso con ~3.500 productos,
    // mismo mecanismo que import-margins/apply)
    let actualizados = 0;
    let conBrandNuevo = 0;
    const errores: string[] = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          actualizados++;
          if (batch[idx].data.brand !== undefined) conBrandNuevo++;
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
      conBrandNuevo,
      yaIgual,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-fabricante:", error);
    return NextResponse.json({ error: "Error al aplicar fabricantes" }, { status: 500 });
  }
}
