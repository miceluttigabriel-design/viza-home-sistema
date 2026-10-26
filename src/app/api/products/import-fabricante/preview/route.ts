// POST /api/products/import-fabricante/preview
// Vista previa de la importación de FABRICANTES, MARCAS, GRUPO y MODELO desde
// la planilla LISTA VIZA HOME. SOLO LEE la base (findMany con select) — nunca
// modifica nada. El hermano apply es quien ejecuta los updates.
import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireSupremo, fetchMatchedProducts } from "../shared";

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSupremo();
    if (denied) return denied;

    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }
    const { rows, sinValores, conFabricante, conMarca, conGrupo, conModelo } = parsed;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El Excel no contiene filas con COD VIZA + FABRICANTE/MARCA/GRUPO/MODELO (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    const cambios: Array<{
      sku: string;
      name: string;
      fabricanteActual: string | null;
      fabricanteNuevo: string | null;
      marcaActual: string | null;
      marcaNuevo: string | null;
      grupoActual: string | null;
      grupoNuevo: string | null;
      modeloActual: string | null;
      modeloNuevo: string | null;
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
      const fabCambia =
        row.fabricante !== null &&
        (product.fabricante ?? "").trim() !== row.fabricante;
      const marcaCambia =
        row.marca !== null && (product.marca ?? "").trim() !== row.marca;
      const grupoCambia =
        row.grupo !== null && (product.categoria ?? "").trim() !== row.grupo;
      const modeloCambia =
        row.modelo !== null && (product.modelo ?? "").trim() !== row.modelo;
      if (!fabCambia && !marcaCambia && !grupoCambia && !modeloCambia) {
        // Ya tiene exactamente esos valores: queda intocado
        yaIgual++;
        continue;
      }
      aActualizar++;
      if (cambios.length < 100) {
        cambios.push({
          sku: product.sku,
          name: product.name,
          fabricanteActual: product.fabricante,
          fabricanteNuevo: fabCambia ? row.fabricante : null,
          marcaActual: product.marca,
          marcaNuevo: marcaCambia ? row.marca : null,
          grupoActual: product.categoria,
          grupoNuevo: grupoCambia ? row.grupo : null,
          modeloActual: product.modelo,
          modeloNuevo: modeloCambia ? row.modelo : null,
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
      conFabricante,
      conMarca,
      conGrupo,
      conModelo,
      cambios,
    });
  } catch (error) {
    console.error("Error preview import-fabricante:", error);
    return NextResponse.json({ error: "Error al leer la vista previa" }, { status: 500 });
  }
}
