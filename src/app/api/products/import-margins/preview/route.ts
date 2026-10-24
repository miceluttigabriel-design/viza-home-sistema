// POST /api/products/import-margins/preview
// Recibe filas {cod, m, y, z, aa, vt, mt} ya parseadas en el navegador (SheetJS)
// y devuelve la vista previa de qué productos van a ser actualizados.
// vt/mt = Valor Para Técnico + Margen P/Técnico (solo algunos productos los traen).
import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAdmin, fetchMatchedProducts, buildMarginUpdate } from "../shared";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }
    const { rows, sinMargen } = parsed;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El Excel no contiene márgenes válidos (hoja 'base', columna 'Contado')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    let coinciden = 0;
    let sinCosto = 0;
    let conTecnico = 0;
    const cambios: Array<{
      sku: string;
      name: string;
      marginActual: number | null;
      marginNuevo: number;
      pct1A6: number;
      pct7A13: number;
      pct14A30: number;
      precioContadoNuevo: number | null;
    }> = [];
    const cambiosTecnico: Array<{
      sku: string;
      name: string;
      valorTecnicoActual: number | null;
      valorTecnicoNuevo: number;
      margenTecnicoNuevo: number | null;
    }> = [];
    const noEncontrados: string[] = [];

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      coinciden++;
      const update = buildMarginUpdate(product, row);
      if (!(product.costProd ?? 0 > 0)) sinCosto++;
      if (cambios.length < 10) {
        cambios.push({
          sku: product.sku,
          name: product.name,
          marginActual: product.marginContado,
          marginNuevo: update.marginContado,
          pct1A6: update.pct1A6,
          pct7A13: update.pct7A13,
          pct14A30: update.pct14A30,
          precioContadoNuevo: update.priceContado ?? null,
        });
      }
      // Datos técnicos: solo los productos que traen Valor Para Técnico en el Excel
      if (typeof update.valorTecnico === "number") {
        conTecnico++;
        if (cambiosTecnico.length < 10) {
          cambiosTecnico.push({
            sku: product.sku,
            name: product.name,
            valorTecnicoActual: product.valorTecnico ?? null,
            valorTecnicoNuevo: update.valorTecnico,
            margenTecnicoNuevo: typeof update.margenTecnico === "number" ? update.margenTecnico : null,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      totalCodigos: rows.length,
      coinciden,
      noEncontrados: noEncontrados.length,
      noEncontradosMuestra: noEncontrados.slice(0, 20),
      sinMargen,
      sinCosto,
      conTecnico,
      cambios,
      cambiosTecnico,
    });
  } catch (error) {
    console.error("Error preview import-margins:", error);
    return NextResponse.json({ error: "Error al generar vista previa" }, { status: 500 });
  }
}
