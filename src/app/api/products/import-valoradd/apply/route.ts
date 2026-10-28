// POST /api/products/import-valoradd/apply
// Aplica el % ADD, el VALOR ADD y la SAFRA del Excel (planilla LISTA VIZA
// HOME, hoja "base") a los productos que coinciden por COD (sku o codViza).
// REGLAS DE SEGURIDAD:
//   - SOLO se tocan las columnas % ADD y VALOR ADD cuando la fila del Excel
//     las trae, más lo que el propio sistema recalcula cuando el admin edita
//     % ADD o VALOR ADD a mano en la tabla (PUT /api/products/[id]): cadena
//     de costos (rsToGs, usToGs, rsNoUS, usNoGs, subCost, minusDisc, plusAdd,
//     plusAdd2, minusDescV), Costo Prod., márgenes 1..30, precios 1..30,
//     priceContado y los campos legados price/cost del catálogo de vendedores.
//   - SAFRA (col CL, String en la base) es un dato INDEPENDIENTE de la cadena
//     de costos: se escribe SOLO cuando la fila la trae Y el producto está sin
//     SAFRA utilizable (vacío / "null" / 0) — REGLA "SOLO DONDE FALTA": los
//     productos que YA tienen SAFRA quedan EXACTAMENTE igual (nunca se
//     sobrescribe, aunque el Excel traiga otro valor). NO recalcula nada.
//   - NUNCA se crean productos.
//   - NUNCA se borra un % ADD, VALOR ADD o SAFRA existente (filas sin esos
//     valores se ignoran; un campo ausente en la fila deja el campo del
//     producto intacto).
//   - Productos que ya tienen exactamente esos valores quedan intocados.
//   - No se tocan: costos de entrada (costBR/costUS/costGs), % DESC,
//     GASTOS ADM, VALOR DESC., bases de porcentajes, % Contado, stock,
//     etiquetas ni fabricante.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseBody,
  requireSupremo,
  fetchMatchedProducts,
  buildValorAddUpdate,
  round6,
  safraEstaVacia,
} from "../shared";
import type { ValorAddRow, ProductForValorAdd } from "../shared";
import { getTasasCambio } from "@/lib/tasas-cambio";

export const maxDuration = 60;

const BATCH_SIZE = 50;

// ¿La fila ya está aplicada en el producto? (misma regla que el preview)
// SAFRA: una fila que trae SAFRA para un producto que YA la tiene no genera
// ningún cambio de SAFRA (no cuenta como pendiente por ese campo).
function filaYaAplicada(product: ProductForValorAdd, row: ValorAddRow): boolean {
  if (
    row.valorAdd !== null &&
    !(product.valorAdd !== null && round6(product.valorAdd) === round6(row.valorAdd))
  ) {
    return false;
  }
  if (
    row.addPct !== null &&
    !(product.addPct !== null && round6(product.addPct) === round6(row.addPct))
  ) {
    return false;
  }
  if (row.safra !== null && safraEstaVacia(product.safra)) {
    return false;
  }
  return true;
}

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
        { error: "El Excel no contiene filas con COD VIZA + VALOR ADD, % ADD o SAFRA (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Task 87: tasas activas de la base para TODO el recálculo de este apply
    // (fallback blando a 1100/6000 si aún no se configuró).
    const tasasValorAdd = await getTasasCambio();

    // Construir updates: % ADD / VALOR ADD / SAFRA nuevos + cadena de
    // costos/precios recalculada (misma fórmula que la edición manual del admin)
    const updates: Array<{ id: string; sku: string; data: Record<string, number | string | null> }> = [];
    const noEncontrados: string[] = [];
    let yaIgual = 0;
    let safraAgregadas = 0;
    let safraMantenidas = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      // Contadores de SAFRA (mismos criterios que el preview): la fila trae
      // SAFRA y el producto está sin ella → se la AGREGA; ya la tiene → su
      // SAFRA se MANTIENE igual (nunca se sobrescribe).
      if (row.safra !== null) {
        if (safraEstaVacia(product.safra)) safraAgregadas++;
        else safraMantenidas++;
      }
      if (filaYaAplicada(product, row)) {
        yaIgual++;
        continue;
      }
      const { data } = buildValorAddUpdate(
        product,
        {
          valorAdd: row.valorAdd,
          addPct: row.addPct,
          safra: row.safra,
        },
        tasasValorAdd
      );
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
      safraAgregadas,
      safraMantenidas,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-valoradd:", error);
    return NextResponse.json({ error: "Error al aplicar VALOR ADD, % ADD o SAFRA" }, { status: 500 });
  }
}
