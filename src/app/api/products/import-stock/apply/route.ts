import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// POST /api/products/import-stock/apply
// Recibe: JSON { nuevos: [...], actualizados: [...] }
// Aplica:
//   - Para cada item en `nuevos`: CREATE nuevo Product (sku/name/codViza/subGrupo/stock/costProd)
//   - Para cada item en `actualizados`: UPDATE solo el campo stock (reemplazar)
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
  referencia: string | null;  // ← antes era codViza, ahora es referencia (Codigo Fabrica)
  subGrupo: string | null;
  stock: number;
  costProd: number | null;
}

interface ActualizadoItem {
  sku: string;
  nameActual: string | null;
  stockActual: number;
  stockNuevo: number;
}

interface ApplyBody {
  nuevos: NuevoItem[];
  actualizados: ActualizadoItem[];
}

// Tamaño de lote para SQL bulk UPDATE con CASE WHEN.
// Postgres soporta hasta 65535 parámetros por query.
// Cada item usa 2 parámetros (sku, stock), así que 200 items = 400 params — seguro.
const UPDATE_BATCH_SIZE = 200;

// ─────────────────────────────────────────────────────────────
// recalculateFromCostProd: dispara el cálculo automático de márgenes
// y precios usando el costProd importado del Excel como base.
// Esto replica la lógica de recalcLive del admin-panel pero solo
// desde costProd (sin input costs como costBR/costUS).
// Los márgenes (marginContado, pct1A6, pct7A13, pct14A30) se
// asumen en 0 si no están seteados — el admin puede editarlos
// después y se recalculan los precios en vivo.
// ─────────────────────────────────────────────────────────────
function recalculateFromCostProd(p: any): void {
  const t = p.costProd ?? 0;
  const mContado = Number(p.marginContado) || 0;
  const y = Number(p.pct1A6) || 0;
  const z = Number(p.pct7A13) || 0;
  const aa = Number(p.pct14A30) || 0;

  // Márgenes acumulados (igual que recalcLive)
  let last = mContado;
  for (let i = 1; i <= 30; i++) {
    let base: number;
    if (i <= 6) base = y;
    else if (i <= 13) base = z;
    else base = aa;
    last = last + base;
    p[`marginC${i}`] = last;
  }

  // Precios calculados en base a costProd y márgenes
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  for (let i = 1; i <= 30; i++) {
    const margin = p[`marginC${i}`];
    p[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }

  // Campos legados de compatibilidad catálogo
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;
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
    // Items "nuevos" cuyo SKU no existe → CREATE
    // Items "nuevos" cuyo SKU sí existe → UPDATE stock
    // Items "actualizados" cuyo SKU existe → UPDATE stock
    // Items "actualizados" cuyo SKU no existe → CREATE
    const trulyNewFromNuevos = body.nuevos.filter(n => !existingSet.has(n.sku));
    const trulyNewFromActualizados = body.actualizados
      .filter(a => !existingSet.has(a.sku))
      .map(a => ({
        sku: a.sku,
        name: a.nameActual,
        referencia: null,   // ← antes era codViza, ahora es referencia
        subGrupo: null,
        stock: a.stockNuevo,
        costProd: null,
      }));
    const trulyNew = [...trulyNewFromNuevos, ...trulyNewFromActualizados];

    const updatesFromNuevos = body.nuevos
      .filter(n => existingSet.has(n.sku))
      .map(n => ({ sku: n.sku, stock: n.stock }));
    const updatesFromActualizados = body.actualizados
      .filter(a => existingSet.has(a.sku))
      .map(a => ({ sku: a.sku, stock: a.stockNuevo }));
    const allUpdates = [...updatesFromNuevos, ...updatesFromActualizados];

    // ─────────────────────────────────────────────────────
    // 5. BULK CREATE: una sola operación para todos los nuevos
    // (createMany con skipDuplicates para safety)
    // ─────────────────────────────────────────────────────
    let creados = 0;
    if (trulyNew.length > 0) {
      // Construir arreglo de datos con tipo explícito para evitar error de
      // inferencia de tipos de Prisma con createMany.
      // IMPORTANTE: el "Codigo Fabrica" del Excel se guarda en el campo
      // `referencia` (columna REFERENCIA del grupo DATOS), NO en `codViza`.
      // También disparamos el cálculo automático de márgenes y precios
      // a partir del costProd importado, con márgenes default en 0.
      const nuevosData: any[] = trulyNew.map(n => {
        const p: any = {
          sku: n.sku,
          name: n.name || `PRODUCTO ${n.sku}`,
          referencia: n.referencia,   // ← antes era codViza
          subGrupo: n.subGrupo,
          stock: n.stock,
          costProd: n.costProd,
          showInCatalog: false,
          brand: null,
          category: n.subGrupo,
          subcategory: n.subGrupo,
          description: n.name,
          // Márgenes default en 0 — el admin los edita después
          marginContado: 0,
          pct1A6: 0,
          pct7A13: 0,
          pct14A30: 0,
        };
        // Disparar cálculo de margins y prices en base a costProd
        recalculateFromCostProd(p);
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
        // Si createMany falla (por ej. constraint en algún campo),
        // intentar crear uno por uno como fallback
        const msg = err?.message || String(err);
        errores.push(`createMany falló: ${msg}. Intentando individual…`);
        for (const n of trulyNew) {
          try {
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
              marginContado: 0,
              pct1A6: 0,
              pct7A13: 0,
              pct14A30: 0,
            };
            recalculateFromCostProd(p);
            await db.product.create({ data: p });
            creados++;
          } catch (e2: any) {
            const m2 = e2?.message || String(e2);
            if (m2.includes("Unique constraint")) {
              // Ya existe (alguien lo creó entre el findMany y el create) → updatear stock
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
    //    1 round trip por lote de 200 items
    // ─────────────────────────────────────────────────────
    let actualizadosCount = 0;
    for (let i = 0; i < allUpdates.length; i += UPDATE_BATCH_SIZE) {
      const batch = allUpdates.slice(i, i + UPDATE_BATCH_SIZE);
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

    return NextResponse.json({
      ok: true,
      creados,
      actualizados: actualizadosCount,
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
