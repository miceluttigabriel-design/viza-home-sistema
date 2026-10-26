<<<<<<< Updated upstream
=======
<<<<<<< HEAD
// Lógica compartida para importar FABRICANTES, MARCAS y GRUPO desde la
// planilla LISTA VIZA HOME (hoja "base": headers en fila 2, columnas COD VIZA
// + FABRICANTE col CO + CATEGORIA/GRUPO col CQ + MARCA col CT). Ruta hermana
// de import-margins / import-valoradd: mismo mecanismo (SheetJS en el
// navegador + JSON compacto). RUTA AISLADA: no toca ninguna importación
// existente (productos, márgenes, valor add, stock).
//
// GRUPO: la planilla llama "CATEGORIA" a esta columna (col CQ, justo detrás
// de SUB-GRUPO); en el sistema se muestra como GRUPO y se guarda en el campo
// "categoria" de la base (el mismo que ya usan el export Excel y la edición
// manual de la tabla). Se acepta el encabezado "GRUPO" o "CATEGORIA".
//
// Cada fila del Excel puede traer FABRICANTE, MARCA, GRUPO, varios o ninguno:
//   - Un campo null significa "esta fila no trae ese valor": el campo del
//     producto queda INTACTO (el importador NUNCA borra un valor existente;
//     en la planilla las celdas VAZIO/- de CATEGORIA traen vacío → intocadas).
=======
>>>>>>> Stashed changes
// Lógica compartida para importar FABRICANTES y MARCAS desde la planilla
// LISTA VIZA HOME (hoja "base": headers en fila 2, columnas COD VIZA +
// FABRICANTE col CO + MARCA col CT). Ruta hermana de import-margins /
// import-valoradd: mismo mecanismo (SheetJS en el navegador + JSON compacto).
// RUTA NUEVA Y AISLADA: no toca ninguna importación existente (productos,
// márgenes, valor add, stock).
//
// Cada fila del Excel puede traer FABRICANTE, MARCA, ambos o ninguno:
//   - Un campo null significa "esta fila no trae ese valor": el campo del
//     producto queda INTACTO (el importador NUNCA borra un valor existente).
<<<<<<< Updated upstream
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
//   - En la columna MARCA de la planilla, las celdas SIN marca vienen con 0
//     o "-" → se tratan como vacías (null).
//   - MARCA escribe el campo "marca" de la base (col CT del Excel: el mismo
//     campo que usan la importación de productos y el export, y el que muestra
//     la columna MARCA de la tabla admin). La MARCA explícita del Excel
//     SIEMPRE gana sobre cualquier valor previo del producto.
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
//   - GRUPO (categoria) sigue la misma regla que FABRICANTE/MARCA: el valor
//     explícito del Excel gana; fila sin GRUPO deja el campo como está.
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
//   - El campo "brand" (catálogo de vendedores) queda como espejo del
//     FABRICANTE, igual que en la importación de productos (brand = FABRICANTE):
//     se completa SOLO si está vacío, nunca sobrescribe.

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface FabricanteRow {
  cod: string;
  fabricante: string | null;
  marca: string | null;
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
  grupo: string | null;
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
}

export function normalizeCod(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\.0$/, "")
    .toUpperCase();
}

// Limpia un valor de texto del Excel: NBSP → espacio, espacios múltiples →
// uno, trim extremos. Devuelve null si queda vacío, es "-" o es numéricamente
// cero (la columna MARCA usa 0 para "sin marca"; el "-" también significa
// celda sin dato). Cualquier otro texto (incluidos números != 0) se acepta.
export function limpiarTextoExcel(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s === "-") return null;
  // Solo los ceros exactos ("0", "00", "0.0", "0,0") cuentan como vacíos;
  // cualquier otro número o texto se conserva tal cual.
  if (/^-?0+(?:[.,]0+)?$/.test(s)) return null;
  return s.slice(0, 200);
}

// Valida y normaliza el body recibido desde el navegador (ya parseado con SheetJS)
// REGLAS:
//   - Filas sin COD se descartan.
<<<<<<< Updated upstream
//   - Filas SIN FABRICANTE y SIN MARCA se cuentan aparte (sinValores) y NO se
//     aplican: el importador NUNCA borra los valores que ya tiene el producto.
=======
<<<<<<< HEAD
//   - Filas SIN FABRICANTE, SIN MARCA y SIN GRUPO se cuentan aparte
//     (sinValores) y NO se aplican: el importador NUNCA borra los valores
//     que ya tiene el producto.
=======
//   - Filas SIN FABRICANTE y SIN MARCA se cuentan aparte (sinValores) y NO se
//     aplican: el importador NUNCA borra los valores que ya tiene el producto.
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
//   - Duplicados en el Excel: gana la última aparición (igual que las otras
//     importaciones).
export function parseBody(raw: any): {
  rows: FabricanteRow[];
  sinValores: number;
  conFabricante: number;
  conMarca: number;
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
  conGrupo: number;
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
} | null {
  if (!raw || !Array.isArray(raw.rows)) return null;
  const rows: FabricanteRow[] = [];
  let sinValores = 0;
  let conFabricante = 0;
  let conMarca = 0;
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
  let conGrupo = 0;
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
  for (const r of raw.rows) {
    if (!r || typeof r !== "object") continue;
    const cod = normalizeCod(String(r.cod ?? ""));
    if (!cod || cod.length > 50) continue;
    const fabricante = limpiarTextoExcel(r.fabricante);
    const marca = limpiarTextoExcel(r.marca);
<<<<<<< Updated upstream
    if (fabricante === null && marca === null) {
      // Fila sin ninguno de los dos: no se aplica nada a esta fila
=======
<<<<<<< HEAD
    const grupo = limpiarTextoExcel(r.grupo);
    if (fabricante === null && marca === null && grupo === null) {
      // Fila sin ninguno de los tres: no se aplica nada a esta fila
=======
    if (fabricante === null && marca === null) {
      // Fila sin ninguno de los dos: no se aplica nada a esta fila
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
      sinValores++;
      continue;
    }
    if (fabricante !== null) conFabricante++;
    if (marca !== null) conMarca++;
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
    if (grupo !== null) conGrupo++;
    const idx = rows.findIndex((x) => x.cod === cod);
    if (idx >= 0) rows[idx] = { cod, fabricante, marca, grupo };
    else rows.push({ cod, fabricante, marca, grupo });
  }
  return { rows, sinValores, conFabricante, conMarca, conGrupo };
=======
>>>>>>> Stashed changes
    const idx = rows.findIndex((x) => x.cod === cod);
    if (idx >= 0) rows[idx] = { cod, fabricante, marca };
    else rows.push({ cod, fabricante, marca });
  }
  return { rows, sinValores, conFabricante, conMarca };
<<<<<<< Updated upstream
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
}

// Solo el SUPREMO_ADMIN puede ejecutar esta importación (misma regla que
// importar márgenes, valor add, la planilla de stock y borrar todo).
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
      marca: true,
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
      categoria: true,
=======
>>>>>>> b9e2a6d65abbbd0d00133cfce8058756dfe156d7
>>>>>>> Stashed changes
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
