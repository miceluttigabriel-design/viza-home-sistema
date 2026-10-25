import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  computeDbMarginStats,
  pickPromedio,
  computeDbSafraStats,
  pickSafraPromedio,
  formatSafra,
  type MarginStats,
  type SafraStats,
} from "../../import-margins/shared";

// ─────────────────────────────────────────────────────────────
// POST /api/products/import-stock/apply
// Recibe: JSON { nuevos: [...], actualizados: [...] }
// Aplica:
//   - Para cada item en `nuevos`: CREATE nuevo Product (sku/name/referencia/
//     subGrupo/stock/costProd + MÁRGENES AUTOMÁTICAS + SAFRA automática)
//   - Para cada item en `actualizados`: UPDATE SOLO costo (COSTO GS) + stock.
//     REGLA DE ORO (pedido del usuario): al importar y re-importar, lo ÚNICO
//     que se actualiza en un producto existente es el COSTO y el STOCK.
//     Márgenes, porcentajes, precios editados, descripciones, SAFRA,
//     fabricante, etiquetas… TODO lo demás queda intocado. Lo único que
//     cambia en cascada son los campos AUTOMÁTICOS de la cadena de costos
//     (sub-costo, Costo Prod., cuotas y precios), que se recalculan con las
//     mismas márgenes que el producto ya tenía — idéntico a cuando el admin
//     edita la celda COSTO GS a mano en la tabla.
//
// ─── OPTIMIZACIÓN CRÍTICA (anti-timeout de Vercel Hobby 10s) ───
// En vez de hacer 1 operación de DB por producto (2000+ ops = timeout),
// usamos operaciones SQL BULK:
//   1. Una sola consulta findMany para saber qué SKUs ya existen (1 round trip)
//   2. Una sola operación createMany para TODOS los productos nuevos (1 round trip)
//   3. Para updates, SQL crudo con CASE WHEN en lotes de 200 (1 round trip por lote)
//
// Total round trips: ~12 para 2000 productos (vs 2000+ antes).
// Tiempo esperado: ~2-3 segundos (vs 60s+ antes).
// ─────────────────────────────────────────────────────────────

interface NuevoItem {
  sku: string;
  name: string | null;
  referencia: string | null;  // ← Codigo Fabrica del Excel
  subGrupo: string | null;
  stock: number;
  costProd: number | null;
}

interface ActualizadoItem {
  sku: string;
  nameActual: string | null;
  stockActual: number;
  stockNuevo: number;
  // COSTO GS actual en la BD (informativo, viene del preview)
  costoActual?: number | null;
  // Costo que trae el Excel (COSTO UNIT. ULTIMA COMPRA). null/0 = la fila no
  // trae costo → ese producto solo actualiza stock (nunca se borra el costo).
  costoNuevo?: number | null;
}

interface ApplyBody {
  nuevos: NuevoItem[];
  actualizados: ActualizadoItem[];
}

// Tamaño de lote para SQL bulk UPDATE con CASE WHEN.
const UPDATE_BATCH_SIZE = 200;
// Lote más chico para el update de costo+cadena (45 columnas por producto).
const COST_UPDATE_BATCH_SIZE = 100;

// ─────────────────────────────────────────────────────────────
// recalcExistingWithNewCostGs: recalcula la cadena de costos de un producto
// EXISTENTE cuando la planilla trae un costo nuevo (COSTO UNIT. ULTIMA COMPRA
// → COSTO GS), SIN TOCAR las márgenes ni los porcentajes que el admin ya
// editó en el sistema. Es exactamente lo mismo que pasa cuando el admin edita
// la celda COSTO GS a mano: las márgenes quedan como están y todos los
// campos AUTOMÁTICOS (sub-costo, Costo Prod., cuotas, precios) se recalculan
// a partir del costo nuevo.
//
// Todos los inputs vienen de la BD (costBR/costUS/% DESC/% ADD/GASTOS ADM/
// VALOR DESC/VALOR ADD/% CONTADO y marginC1..30); del Excel solo entran el
// costo nuevo y el stock. marginC1..30 NO se reescriben (no dependen del
// costo; se toman tal cual la BD para calcular las cuotas).
// Precedencia del sistema (col H = IF D>0, D, F): si el producto tiene
// COSTO R$ o COSTO US$, la cadena usa ese costo y el COSTO GS queda como
// dato de inventario — igual que al editar a mano.
// ─────────────────────────────────────────────────────────────
function recalcExistingWithNewCostGs(
  dbp: any,
  newCostGs: number,
  newStock: number
): Record<string, number | null> {
  const cambioRS = 1100;
  const cambioUS = 6000;

  const d = dbp.costBR && dbp.costBR > 0 ? dbp.costBR * cambioRS : null;
  const f = dbp.costUS && dbp.costUS > 0 ? dbp.costUS * cambioUS : null;
  const rsNoUS = d && d > 0 ? d : f;
  const calcCost = rsNoUS && rsNoUS > 0 ? rsNoUS : newCostGs;

  const minusDisc = calcCost - calcCost * (dbp.discountPct || 0);
  const plusAdd = minusDisc + minusDisc * (dbp.addPct || 0);
  const plusAdd2 = plusAdd + plusAdd * (dbp.admPct || 0);
  const minusDescV = plusAdd2 - (dbp.valorDesc || 0);
  const baseCosto = minusDescV + (dbp.valorAdd || 0);
  const costProd = Math.round(baseCosto / 1000) * 1000;

  const t = costProd ?? 0;
  const mContado = Number(dbp.marginContado) || 0;

  const data: Record<string, number | null> = {
    stock: newStock,
    costGs: newCostGs,
    rsToGs: d,
    usToGs: f,
    rsNoUS: rsNoUS ?? null,
    usNoGs: calcCost,
    subCost: calcCost,
    minusDisc,
    plusAdd,
    plusAdd2,
    minusDescV,
    costProd,
    priceContado: Math.round((t + t * mContado) / 1000) * 1000,
  };
  for (let i = 1; i <= 30; i++) {
    const margin = Number(dbp[`marginC${i}`]) || 0;
    data[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }
  // Campos legados de compatibilidad del catálogo
  data.price = data.priceContado ?? null;
  data.cost = costProd;
  return data;
}

// Columnas que se actualizan en un producto existente cuando la planilla trae
// costo nuevo (el orden define el SQL generado por lotes).
const COST_UPDATE_COLS: string[] = [
  "stock",
  "costGs",
  "rsToGs",
  "usToGs",
  "rsNoUS",
  "usNoGs",
  "subCost",
  "minusDisc",
  "plusAdd",
  "plusAdd2",
  "minusDescV",
  "costProd",
  "priceContado",
  ...Array.from({ length: 30 }, (_, i) => `price${i + 1}`),
  "price",
  "cost",
];

// ─────────────────────────────────────────────────────────────
// recalculateFull: cadena de cálculo COMPLETA, idéntica a la de la edición
// manual (PUT /api/products/[id]) y a la del alta de producto.
//
// El "COSTO UNIT. ULTIMA COMPRA" del Excel viene en Guaraníes, por eso se
// guarda como costGs (campo de ENTRADA). A partir de ahí se calculan TODAS
// las columnas automáticas: sub-costo, descuentos, adicionales, costProd,
// márgenes 1..30 y precios.
//
// Antes se guardaba directo en costProd (campo calculado) y las demás
// columnas quedaban vacías; además, al editar un margen el sistema
// recalculaba desde costGs (vacío) y ponía el costo y los precios en 0.
// ─────────────────────────────────────────────────────────────
function recalculateFull(p: any): void {
  const cambioRS = 1100;
  const cambioUS = 6000;

  // Entrada: costo importado (Gs)
  p.costGs = p.costProd ?? null;

  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  p.rsNoUS = d && d > 0 ? d : f;
  const calcCost = p.rsNoUS && p.rsNoUS > 0 ? p.rsNoUS : (p.costGs ?? 0);
  p.usNoGs = calcCost;
  p.subCost = calcCost;
  p.rsToGs = d;
  p.usToGs = f;

  p.minusDisc = calcCost - calcCost * (p.discountPct || 0);
  p.plusAdd = p.minusDisc + p.minusDisc * (p.addPct || 0);
  p.plusAdd2 = p.plusAdd + p.plusAdd * (p.admPct || 0);
  p.minusDescV = p.plusAdd2 - (p.valorDesc || 0);
  const baseCosto = p.minusDescV + (p.valorAdd || 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;

  const y = Number(p.pct1A6) || 0;
  const z = Number(p.pct7A13) || 0;
  const aa = Number(p.pct14A30) || 0;
  const mContado = Number(p.marginContado) || 0;

  const t = p.costProd ?? 0;
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;

  let last = mContado;
  for (let i = 1; i <= 30; i++) {
    const base = i <= 6 ? y : i <= 13 ? z : aa;
    last = last + base;
    p[`marginC${i}`] = last;
    p[`price${i}`] = Math.round((t + t * last) / 1000 / i) * 1000;
  }

  // Campos legados de compatibilidad catálogo
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;
}

// Construye el producto nuevo con MARGEN AUTOMÁTICA:
// los nuevos no vienen con márgenes en la planilla de stock, así que reciben
// el promedio de su sub-grupo (o tipo, o promedio general) de los productos
// que ya tienen margen en la BD. Si la BD aún no tiene márgenes, quedan en 0.
// Además reciben SAFRA AUTOMÁTICA (mismo criterio: promedio de su sub-grupo
// o general de los productos que ya tienen SAFRA en la BD) — el Plan SAFRA
// lee ese campo (SOLO LECTURA) como tasa de interés mensual y la planilla de
// inventario no lo trae.
function buildNuevoProduct(
  n: { sku: string; name: string | null; referencia: string | null; subGrupo: string | null; stock: number; costProd: number | null },
  stats: MarginStats | null,
  safraStats?: SafraStats | null
): any {
  const p: any = {
    sku: n.sku,
    name: n.name || `PRODUCTO ${n.sku}`,
    referencia: n.referencia,
    subGrupo: n.subGrupo,
    stock: n.stock,
    costProd: n.costProd,
    showInCatalog: false,
    brand: null,
    category: n.subGrupo,
    subcategory: n.subGrupo,
    description: n.name,
    // Márgenes default en 0 — se reemplazan por el promedio si hay datos
    marginContado: 0,
    pct1A6: 0,
    pct7A13: 0,
    pct14A30: 0,
  };
  if (stats) {
    const pick = pickPromedio(stats, { subGrupo: n.subGrupo, tipo: null });
    if (pick) {
      p.marginContado = pick.avg.m;
      p.pct1A6 = pick.avg.y;
      p.pct7A13 = pick.avg.z;
      p.pct14A30 = pick.avg.aa;
    }
  }
  // SAFRA automática: mismo criterio de las márgenes (sub-grupo → general).
  // NO participa de la cadena de costos; se guarda tal cual (string limpio).
  if (safraStats) {
    const pickSafra = pickSafraPromedio(safraStats, { subGrupo: n.subGrupo, tipo: null });
    if (pickSafra) {
      p.safra = formatSafra(pickSafra.avg);
    }
  }
  // Disparar la cadena de cálculo completa (costGs → costProd → márgenes → precios)
  recalculateFull(p);
  return p;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth: solo supremo_admin
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo supremo_admin puede importar stock" },
        { status: 403 }
      );
    }

    // 2. Leer body JSON
    const body = (await req.json()) as ApplyBody;
    if (!body || !Array.isArray(body.nuevos) || !Array.isArray(body.actualizados)) {
      return NextResponse.json(
        { error: "Formato inválido. Se esperaban arreglos nuevos y actualizados." },
        { status: 400 }
      );
    }

    const errores: string[] = [];

    // ─────────────────────────────────────────────────────
    // 3. CONSULTA MASIVA: qué SKUs ya existen en la base
    // (una sola consulta, no importa si son 2000 SKUs)
    // ─────────────────────────────────────────────────────
    const allSkus: string[] = [
      ...body.nuevos.map(n => n.sku),
      ...body.actualizados.map(a => a.sku),
    ].filter(Boolean);

    const existingSkus = allSkus.length > 0
      ? await db.product.findMany({
          where: { sku: { in: allSkus } },
          select: { sku: true },
        })
      : [];
    const existingSet = new Set(existingSkus.map(p => p.sku));

    // ─────────────────────────────────────────────────────
    // 4. Determinar qué crear y qué actualizar
    // ─────────────────────────────────────────────────────
    const trulyNewFromNuevos = body.nuevos.filter(n => !existingSet.has(n.sku));
    const trulyNewFromActualizados = body.actualizados
      .filter(a => !existingSet.has(a.sku))
      .map(a => ({
        sku: a.sku,
        name: a.nameActual,
        referencia: null,
        subGrupo: null,
        stock: a.stockNuevo,
        costProd: a.costoNuevo ?? null,
      }));
    const trulyNew = [...trulyNewFromNuevos, ...trulyNewFromActualizados];

    // Items que ya existen → SOLO costo (COSTO GS) + stock (REGLA DE ORO del
    // usuario: al importar/re-importar nada más se toca). Se conserva el costo
    // que trae el Excel para decidir por producto si hay CAMBIO de costo
    // (recalcula la cadena automática) o solo cambio de stock.
    const updatesFromNuevos = body.nuevos
      .filter(n => existingSet.has(n.sku))
      .map(n => ({ sku: n.sku, stock: n.stock, costoNuevo: n.costProd ?? null }));
    const updatesFromActualizados = body.actualizados
      .filter(a => existingSet.has(a.sku))
      .map(a => ({ sku: a.sku, stock: a.stockNuevo, costoNuevo: a.costoNuevo ?? null }));
    const allUpdates = [...updatesFromNuevos, ...updatesFromActualizados];

    // ─────────────────────────────────────────────────────
    // 4.b Leer los inputs ACTUALES de la BD de cada producto a actualizar
    // (costos y márgenes guardados). Sirven para recalcular la cadena con el
    // costo nuevo SIN TOCAR las márgenes/porcentajes que el admin ya editó.
    // ─────────────────────────────────────────────────────
    const existingRows = allUpdates.length > 0
      ? await db.product.findMany({
          where: { sku: { in: allUpdates.map(u => u.sku) } },
          select: {
            sku: true,
            costBR: true, costUS: true, costGs: true,
            discountPct: true, addPct: true, admPct: true,
            valorDesc: true, valorAdd: true, marginContado: true,
            marginC1: true, marginC2: true, marginC3: true, marginC4: true, marginC5: true,
            marginC6: true, marginC7: true, marginC8: true, marginC9: true, marginC10: true,
            marginC11: true, marginC12: true, marginC13: true, marginC14: true, marginC15: true,
            marginC16: true, marginC17: true, marginC18: true, marginC19: true, marginC20: true,
            marginC21: true, marginC22: true, marginC23: true, marginC24: true, marginC25: true,
            marginC26: true, marginC27: true, marginC28: true, marginC29: true, marginC30: true,
          },
        })
      : [];
    const existingRowsMap = new Map(existingRows.map(p => [p.sku, p]));

    // Separar los updates:
    //   - costUpdates: la planilla trae un costo DISTINTO al guardado →
    //     se actualiza COSTO GS + toda la cadena automática (con las
    //     márgenes YA guardadas, intactas) + stock.
    //   - stockOnlyUpdates: la fila no trae costo (null/0), o el costo que
    //     trae es igual al guardado → solo se actualiza el stock.
    const stockOnlyUpdates: Array<{ sku: string; stock: number }> = [];
    const costUpdates: Array<{ sku: string; data: Record<string, number | null> }> = [];
    for (const u of allUpdates) {
      const row = existingRowsMap.get(u.sku);
      const costoExcel = u.costoNuevo;
      if (
        typeof costoExcel === "number" && costoExcel > 0 &&
        row && costoExcel !== (row.costGs ?? null)
      ) {
        costUpdates.push({
          sku: u.sku,
          data: recalcExistingWithNewCostGs(row, costoExcel, u.stock),
        });
      } else {
        stockOnlyUpdates.push({ sku: u.sku, stock: u.stock });
      }
    }

    // ─────────────────────────────────────────────────────
    // 5. BULK CREATE: una sola operación para todos los nuevos
    // ─────────────────────────────────────────────────────
    let creados = 0;
    let margenesAutomaticas = 0;
    let conSafraAutomatica = 0;
    if (trulyNew.length > 0) {
      // Promedios de márgenes de la BD (productos con margen > 0) para
      // asignar margen automática a los nuevos según su sub-grupo/tipo.
      const stats = await computeDbMarginStats();
      // SAFRA automática: promedios de la BD (productos con SAFRA usable).
      // Mismo criterio que las márgenes: sub-grupo → general.
      const safraStats = await computeDbSafraStats();
      // Construir arreglo de datos con tipo explícito para evitar error de
      // inferencia de tipos de Prisma con createMany.
      // IMPORTANTE: el "Codigo Fabrica" del Excel se guarda en el campo
      // `referencia` (columna REFERENCIA del grupo DATOS), NO en `codViza`.
      // También disparamos el cálculo automático de márgenes y precios
      // a partir del costProd importado, con margen automática por tipo.
      const nuevosData: any[] = trulyNew.map((n) => {
        const p = buildNuevoProduct(n, stats, safraStats);
        if (p.marginContado > 0) margenesAutomaticas++;
        if (p.safra) conSafraAutomatica++;
        return p;
      });
      try {
        // Nota: SQLite no soporta `skipDuplicates` en createMany, por eso
        // filtramos previamente los SKUs existentes con el findMany de arriba.
        // Si aún así falla por race condition, caemos al fallback individual.
        const result = await db.product.createMany({
          data: nuevosData,
        });
        creados = result.count;
      } catch (err: any) {
        // Si createMany falla, intentar crear uno por uno como fallback
        const msg = err?.message || String(err);
        errores.push(`createMany falló: ${msg}. Intentando individual…`);
        for (const n of trulyNew) {
          try {
            const p = buildNuevoProduct(n, stats, safraStats);
            if (p.marginContado > 0) margenesAutomaticas++;
            if (p.safra) conSafraAutomatica++;
            await db.product.create({ data: p });
            creados++;
          } catch (e2: any) {
            const m2 = e2?.message || String(e2);
            if (m2.includes("Unique constraint")) {
              try {
                await db.product.update({
                  where: { sku: n.sku },
                  data: { stock: n.stock },
                });
              } catch {}
            } else {
              errores.push(`SKU ${n.sku}: ${m2}`);
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────
    // 6. BULK UPDATE: SQL crudo con CASE WHEN en lotes
    //    6.a SOLO STOCK: para productos donde la planilla no trajo costo
    //        nuevo (o trajo el mismo que ya estaba guardado).
    //        1 round trip por lote de 200 items.
    // ─────────────────────────────────────────────────────
    let actualizadosCount = 0;
    for (let i = 0; i < stockOnlyUpdates.length; i += UPDATE_BATCH_SIZE) {
      const batch = stockOnlyUpdates.slice(i, i + UPDATE_BATCH_SIZE);
      if (batch.length === 0) continue;

      // Construir SQL seguro con Prisma.sql + Prisma.join
      // Genera: UPDATE "Product" SET stock = CASE
      //   WHEN sku = ? THEN ?
      //   WHEN sku = ? THEN ?
      //   ...
      // END WHERE sku IN (?, ?, ...)
      // Nota: SQLite usa ? como placeholder, Prisma se encarga del binding.
      // Sin casteo ::int (eso es sintaxis Postgres, no SQLite).
      const whenClauses = batch.map(item =>
        Prisma.sql`WHEN "sku" = ${item.sku} THEN ${item.stock}`
      );
      const caseSql = Prisma.join(whenClauses, ' ');
      const skuList = Prisma.join(batch.map(item => item.sku), ',');

      const sql = Prisma.sql`
        UPDATE "Product"
        SET "stock" = CASE ${caseSql} END
        WHERE "sku" IN (${skuList})
      `;

      try {
        const result = await db.$executeRaw(sql);
        actualizadosCount += result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errores.push(`Lote de update ${Math.floor(i / UPDATE_BATCH_SIZE) + 1}: ${msg}`);
      }
    }

    // ─────────────────────────────────────────────────────
    // 6.b COSTO + STOCK: para productos donde la planilla trajo un costo
    //     DISTINTO al guardado. Se actualizan COSTO GS + stock + TODOS los
    //     campos automáticos de la cadena (sub-costo, Costo Prod., cuotas y
    //     precios) recalculados con las márgenes YA guardadas (intactas).
    //     Las márgenes marginC1..30 NO se reescriben (no dependen del costo).
    //     Lote de 100 items × 45 columnas (CASE WHEN por columna).
    // ─────────────────────────────────────────────────────
    let conCostoActualizado = 0;
    for (let i = 0; i < costUpdates.length; i += COST_UPDATE_BATCH_SIZE) {
      const batch = costUpdates.slice(i, i + COST_UPDATE_BATCH_SIZE);
      if (batch.length === 0) continue;

      // SET "col" = CASE WHEN "sku" = ? THEN ? ... END,  para cada columna
      // Los nombres de columna salen de COST_UPDATE_COLS (constante propia,
      // nunca del usuario) → Prisma.raw es seguro acá.
      const setFragments = COST_UPDATE_COLS.map((col) =>
        Prisma.sql`${Prisma.raw(`"${col}"`)} = CASE ${Prisma.join(
          batch.map((item) =>
            Prisma.sql`WHEN "sku" = ${item.sku} THEN ${item.data[col] ?? null}`
          ),
          ' '
        )} END`
      );
      const skuList = Prisma.join(batch.map(item => item.sku), ',');

      const sql = Prisma.sql`
        UPDATE "Product"
        SET ${Prisma.join(setFragments, ', ')}
        WHERE "sku" IN (${skuList})
      `;

      try {
        const result = await db.$executeRaw(sql);
        actualizadosCount += result;
        conCostoActualizado += result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errores.push(`Lote de update costo ${Math.floor(i / COST_UPDATE_BATCH_SIZE) + 1}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      creados,
      actualizados: actualizadosCount,
      conCostoActualizado,
      margenesAutomaticas,
      conSafraAutomatica,
      errores,
    });
  } catch (error) {
    console.error("Error en import-stock/apply:", error);
    const msg = (error as any)?.message || String(error);
    if (msg.toLowerCase().includes("body") && msg.toLowerCase().includes("limit")) {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud es demasiado grande. Intentá importar una planilla más chica." },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { error: "Error al aplicar la importación: " + msg },
      { status: 500 }
    );
  }
}
