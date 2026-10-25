// Lógica compartida para importar FABRICANTES desde la planilla LISTA VIZA HOME
// (hoja "base": headers en fila 2, columnas COD VIZA + FABRICANTE).
// Ruta hermana de import-margins: mismo mecanismo de navegadores (SheetJS en el
// cliente) + JSON compacto. RUTA NUEVA Y AISLADA: no toca ninguna importación
// existente (productos, márgenes, stock).
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface FabricanteRow {
  cod: string;
  fabricante: string;
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
//   - Filas SIN FABRICANTE se cuentan aparte (sinFabricante) y NO se aplican:
//     el importador NUNCA borra el fabricante que ya tiene el producto.
//   - Duplicados en el Excel: gana la última aparición (igual que import-margins).
export function parseBody(raw: any): { rows: FabricanteRow[]; sinFabricante: number } | null {
  if (!raw || !Array.isArray(raw.rows)) return null;
  const rows: FabricanteRow[] = [];
  let sinFabricante = 0;
  for (const r of raw.rows) {
    if (!r || typeof r !== "object") continue;
    const cod = normalizeCod(String(r.cod ?? ""));
    if (!cod || cod.length > 50) continue;
    const fabricante = String(r.fabricante ?? "").trim().slice(0, 200);
    if (!fabricante) {
      sinFabricante++;
      continue;
    }
    const idx = rows.findIndex((x) => x.cod === cod);
    if (idx >= 0) rows[idx] = { cod, fabricante };
    else rows.push({ cod, fabricante });
  }
  return { rows, sinFabricante };
}

// Solo el SUPREMO_ADMIN puede ejecutar esta importación (misma regla que
// importar márgenes, importar la planilla de stock y borrar todo).
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
// (match por sku o por codViza, normalizados) — misma lógica que import-margins.
// SOLO LECTURA: este fetch no modifica nada.
export async function fetchMatchedProducts(rows: FabricanteRow[]) {
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
      fabricante: true,
      brand: true,
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
