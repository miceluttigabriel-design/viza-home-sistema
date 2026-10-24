// POST /api/products/import-margins/preview
// Recibe filas {cod, m, y, z, aa, vt, mt} ya parseadas en el navegador (SheetJS)
// y devuelve la vista previa de qué productos van a ser actualizados.
// vt/mt = Valor Para Técnico + Margen P/Técnico (solo algunos productos los traen).
// ADEMÁS: detecta los productos del panel con margen 0 (que no están en la
// planilla) y calcula qué margen automática les corresponde (promedio por tipo).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseBody,
  requireAdmin,
  fetchMatchedProducts,
  buildMarginUpdate,
  computeDbMarginStats,
  pickPromedio,
  buildAutoMarginUpdate,
} from "../shared";

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
    const matchedIds = new Set<string>();
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
      matchedIds.add(product.id);
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

    // ─── MÁRGENES AUTOMÁTICAS ───
    // Productos del panel con margen 0/null que NO vienen en la planilla:
    // reciben el promedio de su tipo (o sub-grupo, o promedio general).
    const zeroProducts = await db.product.findMany({
      where: {
        OR: [{ marginContado: null }, { marginContado: 0 }],
        id: { notIn: Array.from(matchedIds) },
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

    let autoSinMargen = 0;
    let autoSinCosto = 0;
    const stats = await computeDbMarginStats();
    const autoMuestra: Array<{
      sku: string;
      name: string;
      tipo: string | null;
      margenAsignada: number;
      fuente: string;
    }> = [];

    for (const p of zeroProducts) {
      const pick = pickPromedio(stats, { tipo: p.tipo, subGrupo: p.subGrupo });
      if (!pick) continue; // no hay datos para promediar (BD sin márgenes)
      autoSinMargen++;
      if (!(p.costProd ?? 0 > 0)) autoSinCosto++;
      if (autoMuestra.length < 10) {
        autoMuestra.push({
          sku: p.sku,
          name: p.name,
          tipo: p.tipo,
          margenAsignada: pick.avg.m,
          fuente: pick.fuente,
        });
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
      autoSinMargen,
      autoSinCosto,
      autoMuestra,
      autoPromedioGlobal: stats.global ? stats.global.m : null,
      autoTipos: stats.byTipo.size,
    });
  } catch (error) {
    console.error("Error preview import-margins:", error);
    return NextResponse.json({ error: "Error al generar vista previa" }, { status: 500 });
  }
}
