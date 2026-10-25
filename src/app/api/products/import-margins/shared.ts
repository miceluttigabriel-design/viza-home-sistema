// Shared logic para importação de MÁRGENES desde a planilha LISTA VIZA HOME
// (hoja "base": headers na linha 2, datos desde la línea 3)
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface MarginRow {
  cod: string;
  m: number | null; // % Contado (margem base)
  y: number | null; // base 1 A 6
  z: number | null; // base 7 A 13
  aa: number | null; // base 14 A 30
  vt: number | null; // Valor Para Técnico (col CV, precio en Gs) - solo algunos productos
  mt: number | null; // Margen P/Técnico (col CW, fracción 0.05 = 5%) - solo algunos productos
}

// Redondea a 6 decimales para limpiar ruido de punto flotante del Excel (0.3999999999999999 → 0.4)
export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function normalizeCod(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\.0$/, "")
    .toUpperCase();
}

// Valida y normaliza el body recibido desde el navegador (ya parseado con SheetJS)
export function parseBody(raw: any): { rows: MarginRow[]; sinMargen: number } | null {
  if (!raw || !Array.isArray(raw.rows)) return null;
  const rows: MarginRow[] = [];
  let sinMargen = 0;
  for (const r of raw.rows) {
    if (!r || typeof r !== "object") continue;
    const cod = normalizeCod(String(r.cod ?? ""));
    if (!cod || cod.length > 50) continue;
    const num = (v: any): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const m = num(r.m);
    // Sin margen válida → fila ignorada (solo se actualiza con margen definida)
    if (m === null || m < 0) {
      sinMargen++;
      continue;
    }
    // Datos técnicos (opcionales): en la planilla, CV=0 o vacío significa
    // "sin precio técnico". Solo se importan cuando hay valor > 0.
    const vtRaw = num(r.vt);
    const mtRaw = num(r.mt);
    const hasTec = vtRaw !== null && vtRaw > 0;
    // Duplicados en el Excel: gana la última aparición
    const idx = rows.findIndex((x) => x.cod === cod);
    const clean: MarginRow = {
      cod,
      m: round6(m),
      y: num(r.y) !== null ? round6(num(r.y) as number) : 0,
      z: num(r.z) !== null ? round6(num(r.z) as number) : 0,
      aa: num(r.aa) !== null ? round6(num(r.aa) as number) : 0,
      vt: hasTec ? round6(vtRaw) : null,
      mt: hasTec && mtRaw !== null ? round6(mtRaw) : null,
    };
    if (idx >= 0) rows[idx] = clean;
    else rows.push(clean);
  }
  return { rows, sinMargen };
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = (session.user as any)?.role;
  if (role !== "admin" && role !== "supremo_admin") {
    return NextResponse.json({ error: "Solo admin o supremo_admin" }, { status: 403 });
  }
  return null;
}

// Solo el SUPREMO_ADMIN puede ejecutar las operaciones críticas:
// importar márgenes, importar la planilla de stock y borrar todos los productos.
// Los admins comunes NO pueden, ni desde la UI ni llamando la API directamente.
export async function requireSupremo(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = (session.user as any)?.role;
  if (role !== "supremo_admin") {
    return NextResponse.json({ error: "Solo supremo_admin puede usar esta función" }, { status: 403 });
  }
  return null;
}

// Busca en la BD los productos que coinciden con los códigos del Excel
// (match por sku o por codViza, normalizados)
export async function fetchMatchedProducts(rows: MarginRow[]) {
  const codes = Array.from(new Set(rows.map((r) => r.cod)));
  const products = await db.product.findMany({
    where: {
      OR: [{ sku: { in: codes } }, { codViza: { in: codes } }],
    },
    select: {
      id: true,
      sku: true,
      codViza: true,
      name: true,
      costProd: true,
      marginContado: true,
      pct1A6: true,
      pct7A13: true,
      pct14A30: true,
      priceContado: true,
      valorTecnico: true,
      margenTecnico: true,
    },
  });
  // Mapa normalizado: código → producto
  const byCod = new Map<string, (typeof products)[number]>();
  for (const p of products) {
    if (p.sku) byCod.set(normalizeCod(p.sku), p);
    if (p.codViza && !byCod.has(normalizeCod(p.codViza))) {
      byCod.set(normalizeCod(p.codViza), p);
    }
  }
  return { products, byCod };
}

// Calcula el update completo de márgenes + precios para un producto
// REGLA DE SEGURIDAD: los costos NO se tocan. Los precios se recalculan
// con el costProd YA EXISTENTE en la BD. Si no tiene costo, solo se
// actualizan los márgenes (precios intocados).
// DATOS TÉCNICOS: valorTecnico/margenTecnico SOLO se incluyen cuando la fila
// del Excel los trae (col CV > 0). Los productos sin datos técnicos quedan
// intocados en esos campos. El VALOR TÉCNICO se guarda tal cual la planilla
// (la planilla ya lo calcula: Costo Gs * (1 + Margen P/Técnico)).
export function buildMarginUpdate(
  product: { costProd: number | null },
  row: MarginRow
): Record<string, number> {
  const m = row.m ?? 0;
  const y = row.y ?? 0;
  const z = row.z ?? 0;
  const aa = row.aa ?? 0;

  const data: Record<string, number> = {
    marginContado: m,
    pct1A6: y,
    pct7A13: z,
    pct14A30: aa,
  };

  // Márgenes acumulativos: misma fórmula del sistema y del Excel
  let last = m;
  for (let i = 1; i <= 30; i++) {
    const base = i <= 6 ? y : i <= 13 ? z : aa;
    last = round6(last + base);
    data[`marginC${i}`] = last;
  }

  // Precios recalculados SOLO si el producto tiene costo existente
  const t = product.costProd ?? 0;
  if (t > 0) {
    data.priceContado = Math.round((t + t * m) / 1000) * 1000;
    for (let i = 1; i <= 30; i++) {
      const margin = data[`marginC${i}`];
      data[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
    }
    // Campo legado de compatibilidad del catálogo
    data.price = data.priceContado;
  }

  // Datos técnicos: solo si la fila del Excel los trae (CV > 0)
  if (row.vt !== null && row.vt > 0) {
    data.valorTecnico = row.vt;
    if (row.mt !== null) data.margenTecnico = row.mt;
  }

  return data;
}

// ════════════════════════════════════════════════════════════════════
// MÁRGENES AUTOMÁTICAS (promedio por tipo de producto)
// ════════════════════════════════════════════════════════════════════
// Los productos que NO están en el planilla (o los nuevos importados) quedan
// con margen 0. Para ellos se asigna el PROMEDIO de márgenes de los productos
// del mismo TIPO (con margen > 0 en la BD); si el tipo no tiene promedio,
// se usa el promedio por SUB-GRUPO; si tampoco hay, el promedio GENERAL.

export interface MargenPromedio {
  m: number; // promedio % Contado
  y: number; // promedio base 1 A 6
  z: number; // promedio base 7 A 13
  aa: number; // promedio base 14 A 30
  count: number; // cuántos productos se promediaron
}

export function normalizeKey(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function avgOf(values: Array<{ m: number; y: number; z: number; aa: number }>): MargenPromedio | null {
  if (values.length === 0) return null;
  const sum = values.reduce(
    (acc, v) => ({ m: acc.m + v.m, y: acc.y + v.y, z: acc.z + v.z, aa: acc.aa + v.aa }),
    { m: 0, y: 0, z: 0, aa: 0 }
  );
  const n = values.length;
  return {
    m: round6(sum.m / n),
    y: round6(sum.y / n),
    z: round6(sum.z / n),
    aa: round6(sum.aa / n),
    count: n,
  };
}

export interface MarginStats {
  byTipo: Map<string, MargenPromedio>;
  bySubGrupo: Map<string, MargenPromedio>;
  global: MargenPromedio | null;
}

// Promedios de márgenes calculados desde la BD (solo productos con margen > 0)
export async function computeDbMarginStats(): Promise<MarginStats> {
  const rows = await db.product.findMany({
    where: { marginContado: { gt: 0 } },
    select: {
      tipo: true,
      subGrupo: true,
      marginContado: true,
      pct1A6: true,
      pct7A13: true,
      pct14A30: true,
    },
  });

  const groupsTipo = new Map<string, Array<{ m: number; y: number; z: number; aa: number }>>();
  const groupsSub = new Map<string, Array<{ m: number; y: number; z: number; aa: number }>>();
  const all: Array<{ m: number; y: number; z: number; aa: number }> = [];

  for (const r of rows) {
    const v = {
      m: r.marginContado ?? 0,
      y: r.pct1A6 ?? 0,
      z: r.pct7A13 ?? 0,
      aa: r.pct14A30 ?? 0,
    };
    all.push(v);
    const t = normalizeKey(r.tipo);
    if (t) {
      const arr = groupsTipo.get(t) || [];
      arr.push(v);
      groupsTipo.set(t, arr);
    }
    const s = normalizeKey(r.subGrupo);
    if (s) {
      const arr = groupsSub.get(s) || [];
      arr.push(v);
      groupsSub.set(s, arr);
    }
  }

  const byTipo = new Map<string, MargenPromedio>();
  for (const [k, arr] of groupsTipo) {
    const avg = avgOf(arr);
    if (avg) byTipo.set(k, avg);
  }
  const bySubGrupo = new Map<string, MargenPromedio>();
  for (const [k, arr] of groupsSub) {
    const avg = avgOf(arr);
    if (avg) bySubGrupo.set(k, avg);
  }

  return { byTipo, bySubGrupo, global: avgOf(all) };
}

// Elige el promedio para un producto: TIPO → SUB-GRUPO → GENERAL
export function pickPromedio(
  stats: MarginStats,
  keys: { tipo?: string | null; subGrupo?: string | null }
): { avg: MargenPromedio; fuente: string } | null {
  const t = normalizeKey(keys.tipo);
  if (t && stats.byTipo.has(t)) {
    return { avg: stats.byTipo.get(t)!, fuente: `tipo ${t}` };
  }
  const s = normalizeKey(keys.subGrupo);
  if (s && stats.bySubGrupo.has(s)) {
    return { avg: stats.bySubGrupo.get(s)!, fuente: `grupo ${s}` };
  }
  if (stats.global) {
    return { avg: stats.global, fuente: "promedio general" };
  }
  return null;
}

// Update completo de márgenes automáticas para un producto
// (mismas fórmulas acumulativas y de precios del importador; costos intactos;
//  precios solo se recalculan si el producto tiene costo > 0)
export function buildAutoMarginUpdate(
  costProd: number | null,
  avg: MargenPromedio
): Record<string, number> {
  return buildMarginUpdate(
    { costProd },
    { cod: "", m: avg.m, y: avg.y, z: avg.z, aa: avg.aa, vt: null, mt: null }
  );
}

// ════════════════════════════════════════════════════════════════════
// SAFRA AUTOMÁTICA (promedio por tipo / sub-grupo / general)
// ════════════════════════════════════════════════════════════════════
// El Plan SAFRA lee el campo `safra` del producto (SOLO LECTURA, col CL de la
// planilla) como TASA DE INTERÉS MENSUAL (%) del cronograma. La planilla de
// inventario (hoja "Consulta") NO trae SAFRA, así que los productos NUEVOS
// creados por la importación de inventario reciben el PROMEDIO de SAFRA de los
// productos del mismo TIPO (o sub-grupo, o general) que ya tienen SAFRA en la
// BD. Mismo criterio de las márgenes automáticas de arriba.
// REGLA: SAFRA NO participa de la cadena de costos (es independiente).

// Parsea el string SAFRA de la BD ("7", "4.5", "null", "") a número.
// Devuelve null cuando no representa un % usable (así no contamina el promedio).
export function parseSafraPct(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (!t || t.toLowerCase() === "null") return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Formatea el promedio como el string limpio que guarda la BD:
// 7 → "7", 6.5 → "6.5", 6.6666… → "6.67" (máximo 2 decimales, sin ceros extra)
export function formatSafra(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

export interface SafraPromedio {
  avg: number; // promedio % SAFRA (tasa de interés mensual)
  count: number; // cuántos productos se promediaron
}

export interface SafraStats {
  byTipo: Map<string, SafraPromedio>;
  bySubGrupo: Map<string, SafraPromedio>;
  global: SafraPromedio | null;
}

// Promedios de SAFRA calculados desde la BD (solo productos con SAFRA usable)
export async function computeDbSafraStats(): Promise<SafraStats> {
  const rows = await db.product.findMany({
    where: { safra: { not: null } },
    select: { tipo: true, subGrupo: true, safra: true },
  });

  const groupsTipo = new Map<string, number[]>();
  const groupsSub = new Map<string, number[]>();
  const all: number[] = [];

  for (const r of rows) {
    const v = parseSafraPct(r.safra);
    if (v === null) continue;
    all.push(v);
    const t = normalizeKey(r.tipo);
    if (t) {
      const arr = groupsTipo.get(t) || [];
      arr.push(v);
      groupsTipo.set(t, arr);
    }
    const s = normalizeKey(r.subGrupo);
    if (s) {
      const arr = groupsSub.get(s) || [];
      arr.push(v);
      groupsSub.set(s, arr);
    }
  }

  const avgOf = (values: number[]): SafraPromedio | null => {
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return { avg: round6(sum / values.length), count: values.length };
  };

  const byTipo = new Map<string, SafraPromedio>();
  for (const [k, arr] of groupsTipo) {
    const avg = avgOf(arr);
    if (avg) byTipo.set(k, avg);
  }
  const bySubGrupo = new Map<string, SafraPromedio>();
  for (const [k, arr] of groupsSub) {
    const avg = avgOf(arr);
    if (avg) bySubGrupo.set(k, avg);
  }

  return { byTipo, bySubGrupo, global: avgOf(all) };
}

// Elige el promedio de SAFRA para un producto: TIPO → SUB-GRUPO → GENERAL
export function pickSafraPromedio(
  stats: SafraStats,
  keys: { tipo?: string | null; subGrupo?: string | null }
): { avg: number; count: number; fuente: string } | null {
  const t = normalizeKey(keys.tipo);
  if (t && stats.byTipo.has(t)) {
    const p = stats.byTipo.get(t)!;
    return { avg: p.avg, count: p.count, fuente: `tipo ${t}` };
  }
  const s = normalizeKey(keys.subGrupo);
  if (s && stats.bySubGrupo.has(s)) {
    const p = stats.bySubGrupo.get(s)!;
    return { avg: p.avg, count: p.count, fuente: `grupo ${s}` };
  }
  if (stats.global) {
    return {
      avg: stats.global.avg,
      count: stats.global.count,
      fuente: "promedio general",
    };
  }
  return null;
}
