// POST /api/products/import-valoradd/preview
// Vista previa de la importación de VALOR ADD desde la planilla LISTA VIZA HOME.
// SOLO LEE la base (findMany con select) — nunca modifica nada.
// El hermano apply es quien ejecuta los updates.
// Para cada producto coincidente se calcula el MISMO update que haría el apply
// (cadena de costos + precios recalculados como en la edición manual), así la
// vista previa muestra el impacto real: VALOR ADD, Costo Prod. y Precio Contado
// antes → después.
import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireSupremo,
  fetchMatchedProducts,
  buildValorAddUpdate,
  round6,
} from "../shared";

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSupremo();
    if (denied) return denied;

    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }
    const { rows, sinValorAdd } = parsed;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El Excel no contiene filas con COD VIZA + VALOR ADD (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    const cambios: Array<{
      sku: string;
      name: string;
      valorAddActual: number | null;
      valorAddNuevo: number;
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
      const actual = product.valorAdd;
      if (actual !== null && round6(actual) === round6(row.valorAdd)) {
        // Ya tiene exactamente ese VALOR ADD: queda intocado
        yaIgual++;
        continue;
      }
      aActualizar++;
      if (cambios.length < 100) {
        const { costProdNuevo, priceNuevo: precioNuevo } = buildValorAddUpdate(product, row.valorAdd);
        cambios.push({
          sku: product.sku,
          name: product.name,
          valorAddActual: product.valorAdd,
          valorAddNuevo: row.valorAdd,
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
      sinValorAdd,
      cambios,
    });
  } catch (error) {
    console.error("Error preview import-valoradd:", error);
    return NextResponse.json({ error: "Error al leer la vista previa" }, { status: 500 });
  }
}
