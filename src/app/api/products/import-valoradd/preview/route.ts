// POST /api/products/import-valoradd/preview
// Vista previa de la importación de % ADD, VALOR ADD y SAFRA desde la
// planilla LISTA VIZA HOME. SOLO LEE la base (findMany con select) — nunca
// modifica nada. El hermano apply es quien ejecuta los updates.
// Para cada producto coincidente se calcula el MISMO update que haría el apply
// (cadena de costos + precios recalculados como en la edición manual; la
// SAFRA se guarda tal cual, no recalcula nada), así la vista previa muestra
// el impacto real: % ADD, VALOR ADD, SAFRA, Costo Prod. y Precio Contado
// antes → después.
import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireSupremo,
  fetchMatchedProducts,
  buildValorAddUpdate,
  round6,
  normSafra,
} from "../shared";
import type { ValorAddRow, ProductForValorAdd } from "../shared";

// ¿La fila ya está aplicada en el producto? Un campo null en la fila significa
// "no trae ese valor" → ese campo no participa de la comparación.
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
  if (row.safra !== null && !(normSafra(product.safra) === row.safra)) {
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
    const { rows, sinValores, conValorAdd, conAddPct, conSafra } = parsed;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El Excel no contiene filas con COD VIZA + VALOR ADD, % ADD o SAFRA (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    const cambios: Array<{
      sku: string;
      name: string;
      addPctActual: number | null;
      addPctNuevo: number | null;
      valorAddActual: number | null;
      valorAddNuevo: number | null;
      safraActual: string | null;
      safraNuevo: string | null;
      costProdActual: number | null;
      costProdNuevo: number | null;
      precioActual: number | null;
      precioNuevo: number | null;
    }> = [];
    const noEncontrados: string[] = [];
    let aActualizar = 0;
    let yaIgual = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      if (filaYaAplicada(product, row)) {
        // Ya tiene exactamente esos valores: queda intocado
        yaIgual++;
        continue;
      }
      aActualizar++;
      if (cambios.length < 100) {
        const {
          addPctNuevo,
          valorAddNuevo,
          safraNuevo,
          costProdNuevo,
          priceNuevo: precioNuevo,
        } = buildValorAddUpdate(product, {
          valorAdd: row.valorAdd,
          addPct: row.addPct,
          safra: row.safra,
        });
        cambios.push({
          sku: product.sku,
          name: product.name,
          addPctActual: product.addPct,
          addPctNuevo: row.addPct !== null ? addPctNuevo : null, // null = la fila no trae % ADD (no cambia)
          valorAddActual: product.valorAdd,
          valorAddNuevo: row.valorAdd !== null ? valorAddNuevo : null, // null = la fila no trae VALOR ADD (no cambia)
          safraActual: product.safra,
          safraNuevo: row.safra !== null ? safraNuevo : null, // null = la fila no trae SAFRA (no cambia)
          costProdActual: product.costProd,
          costProdNuevo,
          precioActual: product.priceContado,
          precioNuevo,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      totalCodigos: rows.length,
      coinciden: rows.length - noEncontrados.length,
      aActualizar,
      yaIgual,
      noEncontrados: noEncontrados.length,
      noEncontradosMuestra: noEncontrados.slice(0, 50),
      sinValores,
      conValorAdd,
      conAddPct,
      conSafra,
      cambios,
    });
  } catch (error) {
    console.error("Error preview import-valoradd:", error);
    return NextResponse.json({ error: "Error al leer la vista previa" }, { status: 500 });
  }
}
