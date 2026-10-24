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
    // Duplicados en el Excel: gana la última aparición
    const idx = rows.findIndex((x) => x.cod === cod);
    const clean: MarginRow = {
      cod,
      m: round6(m),
      y: num(r.y) !== null ? round6(num(r.y) as number) : 0,
      z: num(r.z) !== null ? round6(num(r.z) as number) : 0,
      aa: num(r.aa) !== null ? round6(num(r.aa) as number) : 0,
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

  return data;
}
