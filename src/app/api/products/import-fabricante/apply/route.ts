// POST /api/products/import-fabricante/apply
// Aplica el FABRICANTE y la MARCA del Excel (planilla LISTA VIZA HOME, hoja
// "base") a los productos que coinciden por COD (sku o codViza).
// REGLAS DE SEGURIDAD (nada más se toca):
//   - SOLO se actualizan los campos fabricante y brand (MARCA).
//   - La MARCA explícita del Excel SIEMPRE gana: se escribe en brand aunque
//     ya tuviera el espejo del fabricante de una importación anterior.
//   - Si la fila NO trae MARCA, brand se completa con el fabricante SOLO si
//     está vacío (espejo del catálogo de vendedores, convención del sistema).
//   - NUNCA se crean productos.
//   - NUNCA se tocan costos, márgenes, precios, stock, etiquetas, ni ningún
//     otro campo.
//   - NUNCA se borra un valor existente (las filas sin FABRICANTE ni MARCA
//     se ignoran por completo).
//   - Productos que ya tienen exactamente esos valores quedan intocados
//     (idempotente: se puede reaplicar la misma planilla sin efecto).
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
        { error: "El Excel no contiene filas con COD VIZA + FABRICANTE/MARCA (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Construir updates: solo fabricante y/o brand (MARCA)
    const updates: Array<{
      id: string;
      sku: string;
      data: Record<string, string>;
      traeMarca: boolean;
    }> = [];
    const noEncontrados: string[] = [];
    let yaIgual = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      const brandActual = (product.brand ?? "").trim();
      const fabCambia =
        row.fabricante !== null &&
        (product.fabricante ?? "").trim() !== row.fabricante;
      const marcaCambia = row.marca !== null && brandActual !== row.marca;
      if (!fabCambia && !marcaCambia) {
        yaIgual++;
        continue;
      }
      const data: Record<string, string> = {};
      if (fabCambia && row.fabricante !== null) {
        data.fabricante = row.fabricante;
      }
      if (marcaCambia && row.marca !== null) {
        // MARCA explícita del Excel: siempre gana sobre el espejo anterior
        data.brand = row.marca;
      } else if (!brandActual && fabCambia && row.fabricante !== null) {
        // La fila no trae MARCA: espejo del catálogo de vendedores, SOLO si
        // brand está vacío (misma convención de la versión anterior)
        data.brand = row.fabricante;
      }
      if (Object.keys(data).length === 0) {
        yaIgual++;
        continue;
      }
      updates.push({ id: product.id, sku: product.sku, data, traeMarca: row.marca !== null });
    }

    // Ejecutar updates en lotes paralelos (rápido incluso con ~3.500 productos,
    // mismo mecanismo que import-margins/import-valoradd/apply)
    let actualizados = 0;
    let conMarcaNueva = 0;
    let conBrandEspejo = 0;
    const errores: string[] = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => db.product.update({ where: { id: u.id }, data: u.data }))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          actualizados++;
          if (batch[idx].data.brand !== undefined) {
            if (batch[idx].traeMarca) conMarcaNueva++;
            else conBrandEspejo++;
          }
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
      conMarcaNueva,
      conBrandEspejo,
      yaIgual,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-fabricante:", error);
    return NextResponse.json({ error: "Error al aplicar fabricantes y marcas" }, { status: 500 });
  }
}
