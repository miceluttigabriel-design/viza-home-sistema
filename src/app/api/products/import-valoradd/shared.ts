// Lógica compartida para importar VALOR ADD desde la planilla LISTA VIZA HOME
// (hoja "base": headers en fila 2, columnas COD VIZA + "Valor Add" col S).
// Ruta hermana de import-margins / import-fabricante: mismo mecanismo
// (SheetJS en el navegador + JSON compacto). RUTA NUEVA Y AISLADA: no toca
// ninguna importación existente (productos, márgenes, fabricantes, stock).
//
// VALOR ADD es un INPUT de la cadena de costos (col S del Excel):
//   ... R = MENOS DESC. V → T = Costo Prod. = ROUND((R + S)/1000)*1000
// Por eso, a diferencia de import-fabricante (solo texto), aplicar VALOR ADD
// recalcula la cadena de costos y los precios — EXACTAMENTE igual que cuando
// el admin edita VALOR ADD a mano en la tabla (PUT /api/products/[id] llama
// recalculate con los mismos campos). Acá se reutiliza esa misma fórmula.

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface ValorAddRow {
  cod: string;
  valorAdd: number;
}

// Redondea a 6 decimales para limpiar ruido de punto flotante del Excel
// (igual que import-margins/shared.ts)
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
// REGLAS:
//   - Filas sin COD se descartan.
//   - Filas SIN VALOR ADD se cuentan aparte (sinValorAdd) y NO se aplican:
//     el importador NUNCA borra el valor que ya tiene el producto.
//   - Duplicados en el Excel: gana la última aparición (igual que las otras
//     importaciones).
//   - Se acepta cualquier número finito (positivo, 0 o negativo, por si la
//     planilla algún día trae un descuento); se rechazan valores absurdos.
export function parseBody(raw: any): { rows: ValorAddRow[]; sinValorAdd: number } | null {
  if (!raw || !Array.isArray(raw.rows)) return null;
  const rows: ValorAddRow[] = [];
  let sinValorAdd = 0;
  for (const r of raw.rows) {
    if (!r || typeof r !== "object") continue;
    const cod = normalizeCod(String(r.cod ?? ""));
    if (!cod || cod.length > 50) continue;
    const va = Number(r.valorAdd);
    if (r.valorAdd === null || r.valorAdd === undefined || r.valorAdd === "" || !Number.isFinite(va) || Math.abs(va) > 1e12) {
      sinValorAdd++;
      continue;
    }
    const idx = rows.findIndex((x) => x.cod === cod);
    if (idx >= 0) rows[idx] = { cod, valorAdd: round6(va) };
    else rows.push({ cod, valorAdd: round6(va) });
  }
  return { rows, sinValorAdd };
}

// Solo el SUPREMO_ADMIN puede ejecutar esta importación (misma regla que
// importar márgenes, importar fabricantes, importar stock y borrar todo).
export async function requireSupremo(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = (session.user as any)?.role;
  if (role !== "supremo_admin") {
    return NextResponse.json(
      { error: "Solo supremo_admin puede usar esta función" },
      { status: 403 }
    );
  }
  return null;
}

// Busca en la BD los productos que coinciden con los códigos del Excel
// (match por sku o por codViza, normalizados) — misma lógica que las rutas
// hermanas. SOLO LECTURA: este fetch no modifica nada.
// Se seleccionan los campos del producto que la cadena de costos necesita
// para recalcular (los mismos que usa PUT /api/products/[id] al editar
// VALOR ADD a mano) + los valores actuales para la vista previa.
export interface ProductForValorAdd {
  id: string;
  sku: string;
  codViza: string | null;
  name: string;
  valorAdd: number | null;
  costProd: number | null;
  priceContado: number | null;
  costBR: number | null;
  costUS: number | null;
  costGs: number | null;
  discountPct: number | null;
  addPct: number | null;
  admPct: number | null;
  valorDesc: number | null;
  pct1A6: number | null;
  pct7A13: number | null;
  pct14A30: number | null;
  marginContado: number | null;
}

export async function fetchMatchedProducts(rows: ValorAddRow[]) {
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
      valorAdd: true,
      costProd: true,
      priceContado: true,
      costBR: true,
      costUS: true,
      costGs: true,
      discountPct: true,
      addPct: true,
      admPct: true,
      valorDesc: true,
      pct1A6: true,
      pct7A13: true,
      pct14A30: true,
      marginContado: true,
    },
  });
  // Mapa normalizado: código → producto
  const byCod = new Map<string, ProductForValorAdd>();
  for (const p of products) {
    if (p.sku) byCod.set(normalizeCod(p.sku), p);
    if (p.codViza && !byCod.has(normalizeCod(p.codViza))) {
      byCod.set(normalizeCod(p.codViza), p);
    }
  }
  return { products, byCod };
}

// Recalcula los campos derivados según las fórmulas del Excel.
// MISMA función que PUT /api/products/[id] (recalculate): así importar VALOR ADD
// produce exactamente el mismo resultado que editarlo a mano en la tabla.
function recalculate(p: any): void {
  const cambioRS = 1100; // $C$1 del Excel
  const cambioUS = 6000; // $G$1 del Excel

  // D = C * cambioRS (si hay costo en R$)
  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  // F = E * cambioUS (si hay costo en US$)
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  // H = IF(D>0, D, F) (R$ NO US$)
  p.rsNoUS = d && d > 0 ? d : f;
  // I = IF(H>0, H, G) (US$ NO GS - costo final)
  const calcCost = p.rsNoUS && p.rsNoUS > 0 ? p.rsNoUS : (p.costGs ?? 0);
  p.usNoGs = calcCost;
  // J = I (sub-costo)
  p.subCost = calcCost;
  p.rsToGs = d;
  p.usToGs = f;

  // L = J - J*K (MENOS DESC. %)
  p.minusDisc = calcCost - (calcCost * (p.discountPct || 0));

  // N = L + L*M (MAIS % ADD)
  p.plusAdd = (p.minusDisc ?? 0) + ((p.minusDisc ?? 0) * (p.addPct || 0));

  // P = N + N*O (MAIS % ADD 2)
  p.plusAdd2 = (p.plusAdd ?? 0) + ((p.plusAdd ?? 0) * (p.admPct || 0));

  // R = P - Q (MENOS DESC. V)
  p.minusDescV = (p.plusAdd2 ?? 0) - (p.valorDesc ?? 0);

  // T = ROUND((R + S) / 1000, 0) * 1000 (Costo Prod.)
  const baseCosto = (p.minusDescV ?? 0) + (p.valorAdd ?? 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;

  // Recalcular márgenes 1..30 desde bases Y/Z/AA + Contado
  const y = p.pct1A6 || 0;
  const z = p.pct7A13 || 0;
  const aa = p.pct14A30 || 0;
  const mContado = p.marginContado || 0;

  let lastMargin = mContado;
  for (let i = 1; i <= 30; i++) {
    let base: number;
    if (i <= 6) base = y;
    else if (i <= 13) base = z;
    else base = aa;
    lastMargin = lastMargin + base;
    p[`marginC${i}`] = lastMargin;
  }

  // Precios finales
  const t = p.costProd ?? 0;
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  for (let i = 1; i <= 30; i++) {
    const margin = p[`marginC${i}`];
    p[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }

  // Compatibilidad catálogo
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;
}

// Calcula el update completo para un producto al que se le aplica un VALOR ADD
// del Excel. Imita EXACTAMENTE el PUT /api/products/[id]:
//   1. merged = producto actual + valorAdd nuevo
//   2. Caso especial: productos viejos importados solo con Costo Prod. (sin
//      costBR/costUS/costGs) usan ese costo como base para que la cadena no
//      se vaya a 0 al recalcular.
//   3. recalculate() → costProd, márgenes y precios recalculados.
// Devuelve el `data` para Prisma + los valores nuevos para la vista previa.
export function buildValorAddUpdate(
  product: ProductForValorAdd,
  valorAdd: number
): {
  data: Record<string, number | null>;
  costProdNuevo: number | null;
  priceNuevo: number | null;
} {
  const merged: any = { ...product, valorAdd };
  const sinCostoEntrada =
    !(merged.costBR > 0) && !(merged.costUS > 0) && !(merged.costGs > 0);
  if (sinCostoEntrada && (product.costProd ?? 0) > 0) {
    merged.costGs = product.costProd;
  }
  recalculate(merged);

  const data: Record<string, number | null> = {
    valorAdd,
    rsNoUS: merged.rsNoUS,
    usNoGs: merged.usNoGs,
    rsToGs: merged.rsToGs,
    usToGs: merged.usToGs,
    subCost: merged.subCost,
    minusDisc: merged.minusDisc,
    plusAdd: merged.plusAdd,
    plusAdd2: merged.plusAdd2,
    minusDescV: merged.minusDescV,
    costProd: merged.costProd,
    priceContado: merged.priceContado,
    price: merged.priceContado ?? 0,
    cost: merged.costProd ?? 0,
  };
  for (let i = 1; i <= 30; i++) {
    data[`marginC${i}`] = merged[`marginC${i}`];
    data[`price${i}`] = merged[`price${i}`];
  }

  return {
    data,
    costProdNuevo: merged.costProd ?? null,
    priceNuevo: merged.priceContado ?? null,
  };
}
