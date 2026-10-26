// POST /api/products/import-fabricante/apply
// Aplica el FABRICANTE, la MARCA y el GRUPO del Excel (planilla LISTA VIZA
// HOME, hoja "base") a los productos que coinciden por COD (sku o codViza).
// REGLAS DE SEGURIDAD (nada más se toca):
//   - SOLO se actualizan los campos fabricante, marca, grupo (categoria) y
//     (espejo) brand.
//   - La MARCA del Excel (col CT) se escribe en el campo "marca": el mismo
//     campo que usan la importación de productos y el export, y el que muestra
//     la columna MARCA de la tabla admin. SIEMPRE gana sobre el valor previo.
//   - GRUPO del Excel (col CQ "CATEGORIA") se escribe en el campo "categoria"
//     de la base (el mismo que usan el export y la edición manual de la
//     tabla, donde se muestra como GRUPO). Misma regla que FABRICANTE/MARCA:
//     el valor explícito del Excel gana; fila sin GRUPO deja el campo como
//     está (nunca borra).
//   - brand (catálogo de vendedores) queda como espejo del FABRICANTE, igual
//     que en la importación de productos (brand = FABRICANTE): se completa
//     SOLO si está vacío, nunca sobrescribe un brand existente.
//   - NUNCA se crean productos.
//   - NUNCA se tocan costos, márgenes, precios, stock, etiquetas, ni ningún
//     otro campo.
//   - NUNCA se borra un valor existente (las filas sin FABRICANTE, MARCA ni
//     GRUPO se ignoran por completo).
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
        { error: "El Excel no contiene filas con COD VIZA + FABRICANTE/MARCA/GRUPO (hoja 'base')" },
        { status: 400 }
      );
    }

    const { byCod } = await fetchMatchedProducts(rows);

    // Construir updates: solo fabricante, marca, grupo (categoria) y/o brand
    // (espejo del fabricante)
    const updates: Array<{
      id: string;
      sku: string;
      data: Record<string, string>;
    }> = [];
    const noEncontrados: string[] = [];
    let yaIgual = 0;

    for (const row of rows) {
      const product = byCod.get(row.cod);
      if (!product) {
        noEncontrados.push(row.cod);
        continue;
      }
      const marcaActual = (product.marca ?? "").trim();
      const brandActual = (product.brand ?? "").trim();
      const fabCambia =
        row.fabricante !== null &&
        (product.fabricante ?? "").trim() !== row.fabricante;
      const marcaCambia = row.marca !== null && marcaActual !== row.marca;
      const grupoCambia =
        row.grupo !== null && (product.categoria ?? "").trim() !== row.grupo;
      if (!fabCambia && !marcaCambia && !grupoCambia) {
        yaIgual++;
        continue;
      }
      const data: Record<string, string> = {};
      if (fabCambia && row.fabricante !== null) {
        data.fabricante = row.fabricante;
      }
      if (marcaCambia && row.marca !== null) {
        // MARCA explícita del Excel: va al campo "marca" (col CT), el mismo
        // campo que usan la importación de productos y el export. Siempre gana.
        data.marca = row.marca;
      }
      if (grupoCambia && row.grupo !== null) {
        // GRUPO del Excel (col CQ "CATEGORIA"): va al campo "categoria" de la
        // base, el mismo que usan el export y la edición manual. Siempre gana.
        data.categoria = row.grupo;
      }
      if (!brandActual && fabCambia && row.fabricante !== null) {
        // Espejo del catálogo de vendedores (igual que la importación de
        // productos: brand = FABRICANTE), SOLO si brand está vacío; nunca
        // sobrescribe un brand existente.
        data.brand = row.fabricante;
      }
      if (Object.keys(data).length === 0) {
        yaIgual++;
        continue;
      }
      updates.push({ id: product.id, sku: product.sku, data });
    }

    // Ejecutar updates en lotes paralelos (rápido incluso con ~3.500 productos,
    // mismo mecanismo que import-margins/import-valoradd/apply)
    let actualizados = 0;
    let conMarcaNueva = 0;
    let conGrupoNuevo = 0;
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
          if (batch[idx].data.marca !== undefined) conMarcaNueva++;
          if (batch[idx].data.categoria !== undefined) conGrupoNuevo++;
          if (batch[idx].data.brand !== undefined) conBrandEspejo++;
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
      conGrupoNuevo,
      conBrandEspejo,
      yaIgual,
      noEncontrados: noEncontrados.length,
      fallidos: errores.length,
      errores: errores.slice(0, 50),
    });
  } catch (error) {
    console.error("Error apply import-fabricante:", error);
    return NextResponse.json({ error: "Error al aplicar fabricantes, marcas y grupos" }, { status: 500 });
  }
}
