import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerProductosProtegidos } from "@/lib/costo-editado";
import ExcelJS from "exceljs";
import {
  computeDbMarginStats,
  pickPromedio,
  computeDbSafraStats,
  pickSafraPromedio,
  formatSafra,
} from "../../import-margins/shared";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function toString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Normaliza un header del Excel para comparación robusta:
 * - Quita acentos/diacríticos (Descripción → Descripcion)
 * - Pasa a mayúsculas (Descripcion → DESCRIPCION)
 * - Recorta espacios
 * Esto hace que "Descripción" → "DESCRIPCION" matchee con nuestro lookup.
 * Acepta any porque ExcelJS devuelve CellValue (string | number | Date | object | null).
 */
function normalizeHeader(s: any): string {
  return toString(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .toUpperCase();
}

/**
 * Normalización FLEXIBLE para matchear abreviaturas del ERP:
 * además de lo que hace normalizeHeader, convierte los puntos en espacios
 * ("UNIT." → "UNIT") y colapsa espacios múltiples.
 *   "Costo Unit. Ult. Compra"     → "COSTO UNIT ULT COMPRA"
 *   "COSTO UNIT. ULTIMA COMPRA"   → "COSTO UNIT ULTIMA COMPRA"
 */
function normalizeHeaderLoose(s: any): string {
  return normalizeHeader(s)
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match por PREFIJO de palabra (para aceptar abreviaturas del ERP).
 * Regla conservadora: misma cantidad de palabras y cada par de palabras
 * coincide igual o una es prefijo de la otra (mínimo 3 letras).
 *   "COSTO UNIT ULTIMA COMPRA" SÍ coincide con "COSTO UNIT ULT COMPRA"
 *     (ULT es prefijo de ULTIMA).
 *   "COSTO UNIT ULTIMA COMPRA" NO coincide con "COSTO PROM ULT COMPRA"
 *     (UNIT y PROM no coinciden) ni con "COSTO UNIT ULTIMA COMPRA GS"
 *     (distinta cantidad de palabras).
 */
function headerCoincidePorPrefijo(needle: string, hay: string): boolean {
  const nTok = needle.split(" ");
  const hTok = hay.split(" ");
  if (nTok.length !== hTok.length) return false;
  return nTok.every((n, i) => {
    const h = hTok[i];
    if (n === h) return true;
    const [corta, larga] = n.length <= h.length ? [n, h] : [h, n];
    return corta.length >= 3 && larga.startsWith(corta);
  });
}

/**
 * Limpia un Codigo del Excel que puede venir con coma como separador de miles.
 * Ej: "1,747" → "1747", "12,240" → "12240", "301" → "301".
 */
function cleanCodigo(raw: any): string {
  const s = toString(raw);
  if (!s) return "";
  // Quitar separadores de miles (coma) y espacios
  return s.replace(/[,\s]/g, "");
}

/**
 * Parsea el SALDO del Excel.
 * Regla del usuario: "lo que se considera es solo lo que esta a frente del lado isquierdo de la coma"
 * Es decir: tomamos solo la parte ENTERA (antes del separador decimal, sea "." o ",").
 * Ej: "1.0000" → 1, "9.0000" → 9, "94.0000" → 94, "1.5" → 1, "1,5" → 1.
 */
function parseSaldo(raw: any): number {
  const s = toString(raw);
  if (!s) return 0;
  // Tomar todo antes del primer "." o "," (separador decimal)
  const match = s.match(/^(-?\d+)/);
  if (!match) return 0;
  return parseInt(match[1], 10) || 0;
}

/**
 * Parsea el COSTO UNIT. ULTIMA COMPRA del Excel.
 * El valor viene con coma como separador de miles (ej: "974,588" → 974588, "1,100,000" → 1100000).
 * Devuelve número entero (Guaraníes no usa decimales).
 */
function parseCostoUnitario(raw: any): number | null {
  const s = toString(raw);
  if (!s) return null;
  // Quitar comas (separador de miles), espacios, y símbolos de moneda
  const cleaned = s.replace(/[,\s$R$]/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : Math.round(n);
}

// ─────────────────────────────────────────────────────────────
// POST /api/products/import-stock/preview
// Recibe: multipart/form-data con campo "file" (xlsx)
// Devuelve: JSON con preview { nuevos, actualizados, totalFilas, codigosUnicos, errores }
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Auth: solo supremo_admin puede usar la importación de stock
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

    // 2. Leer archivo del FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No se encontró archivo" },
        { status: 400 }
      );
    }

    // 3. Cargar el Excel con exceljs
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    // Hoja "Consulta" (la que viene en el ejemplo) o la primera hoja disponible
    const ws = wb.getWorksheet("Consulta") || wb.worksheets[0];
    if (!ws) {
      return NextResponse.json(
        { error: "No se encontró ninguna hoja en el Excel" },
        { status: 400 }
      );
    }

    // 4. Mapear headers (fila 1) → número de columna
    // Usamos normalizeHeader para que "Descripción" (con acento) → "DESCRIPCION"
    // y el lookup en getCell tambien normalice → siempre matchea.
    const headerRow = ws.getRow(1);
    // Mapa EXACTO (comportamiento de siempre, intacto) + lista FLEXIBLE
    // (sin puntos) para aceptar abreviaturas como "Costo Unit. Ult. Compra".
    const headerMap: Record<string, number> = {};
    const headersList: Array<{ loose: string; col: number }> = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const raw = headerRow.getCell(c).value;
      const header = normalizeHeader(raw);
      if (header) {
        headerMap[header] = c;
        const loose = normalizeHeaderLoose(raw);
        if (loose) headersList.push({ loose, col: c });
      }
    }

    // Resolvedor de columnas en 3 pasos (de más preciso a más flexible):
    //   1) EXACTO: igual que siempre (headerMap). Si la planilla trae
    //      "COSTO UNIT. ULTIMA COMPRA" matchea igual que antes → cero cambios.
    //   2) SIN PUNTOS: "COSTO UNIT ULTIMA COMPRA" (por si el Excel varía puntos
    //      o espacios de más).
    //   3) ABREVIATURA por prefijo de palabra: "Costo Unit. Ult. Compra" (como
    //      viene en la planilla real del ERP) matchea "COSTO UNIT. ULTIMA
    //      COMPRA" porque ULT es prefijo de ULTIMA (misma cantidad de palabras).
    const resolveColumn = (headerName: string): number | null => {
      const exacto = headerMap[normalizeHeader(headerName)];
      if (exacto) return exacto;
      const needle = normalizeHeaderLoose(headerName);
      for (const h of headersList) {
        if (h.loose === needle) return h.col;
      }
      for (const h of headersList) {
        if (headerCoincidePorPrefijo(needle, h.loose)) return h.col;
      }
      return null;
    };

    // Validar que tenga por lo menos las columnas clave
    const colCodigo = resolveColumn("CODIGO");
    if (!colCodigo) {
      return NextResponse.json(
        {
          error:
            'El Excel no tiene la columna "Codigo". Verificá que sea la planilla de inventario correcta.',
        },
        { status: 400 }
      );
    }

    // Helper para obtener valor de celda por nombre de header (normaliza para
    // match y acepta variantes/abreviaturas vía resolveColumn)
    const getCell = (row: ExcelJS.Row, headerName: string): any => {
      const col = resolveColumn(headerName);
      if (!col) return null;
      const cell = row.getCell(col).value;
      // Si es celda con fórmula, tomar el resultado
      if (cell && typeof cell === "object" && "result" in cell) {
        return (cell as any).result;
      }
      return cell;
    };

    // 5. Recorrer filas, agrupar por Codigo y acumular Saldo
    // IMPORTANTE: el "Codigo Fabrica" del Excel se guarda como `referencia`
    // (columna REFERENCIA del grupo DATOS en la tabla), NO como `codViza` (DATOS VIZA).
    const grouped: Record<
      string,
      {
        codigo: string;
        stockSumado: number;
        costProd: number | null;
        referencia: string | null;
        subGrupo: string | null;
        name: string | null;
        filas: number;
        // Task 98: saldo de ESTE codigo repartido por SUCURSAL tal cual
        // trae la planilla del ERP ("CENTRAL" = depósito central; el resto
        // son sucursales de venta). El stock global de siempre sigue
        // siendo la suma de TODAS las filas (stockSumado, intocado).
        porSucursal: Record<string, number>;
      }
    > = {};

    const errores: string[] = [];
    let totalFilas = 0;

    // ─── Task 98: columna SUCURSAL del ERP ───
    // Si la planilla no la trae (planilla vieja), stockPorSucursal queda
    // vacío y TODO funciona exactamente igual que siempre (retrocompatible).
    const colSucursal = resolveColumn("SUCURSAL");
    // Resumen por sucursal para la vista previa (el dueño ve ANTES de
    // confirmar cómo se va a dividir el inventario: filas, SKUs y unidades).
    const sucursalesResumen: Record<
      string,
      { nombre: string; filas: number; skus: Set<string>; unidades: number }
    > = {};

    // AVISO visible en la vista previa: si la columna de costo no se encontró
    // con NINGUNA de las variantes aceptadas, avisarlo CLARO antes de aplicar.
    // Así nunca vuelve a pasar en silencio (caso real: la planilla del ERP
    // trae "Costo Unit. Ult. Compra" abreviado y el sistema buscaba el nombre
    // completo "COSTO UNIT. ULTIMA COMPRA" → el costo de ningún producto se
    // habría leído). Con este aviso el usuario lo ve ANTES de confirmar.
    if (!resolveColumn("COSTO UNIT. ULTIMA COMPRA")) {
      errores.push(
        'AVISO: no se encontró la columna de costo en el Excel (se busca "COSTO UNIT. ULTIMA COMPRA", también se acepta abreviada como "Costo Unit. Ult. Compra"). Los costos NO se leerán de esta planilla; solo se actualizará el stock.'
      );
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const codigoRaw = getCell(row, "CODIGO");
      const codigo = cleanCodigo(codigoRaw);

      // Saltar fila vacía (sin Codigo)
      if (!codigo) continue;
      totalFilas++;

      // Saltar fila de "Total Acumulado" del Excel
      const codigoLower = toString(codigoRaw).toLowerCase();
      if (codigoLower.includes("total") || codigoLower.includes("suma")) {
        continue;
      }

      const saldo = parseSaldo(getCell(row, "SALDO"));
      const costProd = parseCostoUnitario(getCell(row, "COSTO UNIT. ULTIMA COMPRA"));
      // El Codigo Fabrica del Excel va al campo `referencia` de la base
      // (columna REFERENCIA del grupo DATOS), NO a `codViza` (DATOS VIZA).
      const referencia = toString(getCell(row, "CODIGO FABRICA")) || null;
      const subGrupo = toString(getCell(row, "SUBGRUPO")) || null;
      const name = toString(getCell(row, "DESCRIPCION")) || null;

      // ─── Task 98: sucursal de la fila (mayúsculas, sin espacios) ───
      let sucursalFila = "";
      if (colSucursal) {
        const rawSuc = row.getCell(colSucursal).value;
        sucursalFila = toString(rawSuc).toUpperCase();
      }

      // Si el Codigo ya está en grouped, sumar el saldo
      if (grouped[codigo]) {
        grouped[codigo].stockSumado += saldo;
        grouped[codigo].filas++;
      } else {
        grouped[codigo] = {
          codigo,
          stockSumado: saldo,
          costProd,
          referencia,
          subGrupo,
          name,
          filas: 1,
          porSucursal: {},
        };
      }

      // Reparto por sucursal (solo si la planilla trae la columna y la
      // fila tiene sucursal; saldo 0 no crea fila — no aporta unidades).
      if (sucursalFila && saldo !== 0) {
        grouped[codigo].porSucursal[sucursalFila] =
          (grouped[codigo].porSucursal[sucursalFila] || 0) + saldo;
        if (!sucursalesResumen[sucursalFila]) {
          sucursalesResumen[sucursalFila] = {
            nombre: sucursalFila,
            filas: 0,
            skus: new Set<string>(),
            unidades: 0,
          };
        }
        sucursalesResumen[sucursalFila].filas++;
        sucursalesResumen[sucursalFila].skus.add(codigo);
        sucursalesResumen[sucursalFila].unidades += saldo;
      }
    }

    // 6. Verificar cuáles SKUs ya existen en la base (consulta masiva)
    // costGs se lee para poder mostrar en la vista previa el CAMBIO DE COSTO
    // (COSTO GS actual → nuevo) de cada producto existente.
    // Los productos con costos editados a mano y guardados por el admin se
    // marcan como PROTEGIDO: la importación NO les cambia el costo (solo
    // stock). Se leen de la tabla aparte CostoEditado (best-effort: si la
    // tabla todavía no existe — falta `npx prisma db push` — nadie va
    // protegido y todo funciona igual que antes; nunca rompe esta ruta).
    const codigosList = Object.keys(grouped);
    const existentes = await db.product.findMany({
      where: { sku: { in: codigosList } },
      select: { id: true, sku: true, stock: true, name: true, costGs: true },
    });
    const existentesMap = new Map(existentes.map((p) => [p.sku, p]));

    // Productos con costos editados a mano y guardados por el admin (tabla
    // aparte AUTO-GESTIONADA: ver src/lib/costo-editado.ts; si aún no existe,
    // nadie va protegido y todo funciona igual que antes — nunca rompe esto).
    const protegidosIds = await leerProductosProtegidos();

    // 6.b Márgenes automáticas + SAFRA automática que recibirían los NUEVOS
    // (mismas funciones que usa el apply: promedio por sub-grupo → general,
    // calculado sobre los productos que ya tienen margen/SAFRA en la BD).
    const stats = await computeDbMarginStats();
    const safraStats = await computeDbSafraStats();

    // 7. Construir preview: separar en `nuevos` y `actualizados`
    const nuevos: Array<{
      sku: string;
      name: string | null;
      referencia: string | null;
      subGrupo: string | null;
      stock: number;
      costProd: number | null;
      // Automáticas que se le van a asignar al crearlo (informativo):
      margenAuto: number | null; // % Contado promedio (fracción 0.35 = 35%)
      margenFuente: string | null; // "grupo X" | "promedio general"
      safraAuto: string | null; // % SAFRA promedio (tasa Plan SAFRA)
    }> = [];

    const actualizados: Array<{
      sku: string;
      nameActual: string | null;
      stockActual: number;
      stockNuevo: number;
      // Garantía visual: en existentes SOLO se tocan COSTO GS y STOCK
      costoActual: number | null; // COSTO GS actual en la BD
      costoNuevo: number | null; // COSTO UNIT. ULTIMA COMPRA del Excel (null = no toca costo)
      // true = el admin editó y guardó un costo a mano → la importación NO
      // pisa su costo (solo stock). La vista lo muestra como PROTEGIDO.
      costoProtegido: boolean;
    }> = [];

    for (const codigo of codigosList) {
      const data = grouped[codigo];
      const existente = existentesMap.get(codigo);
      if (existente) {
        // SKU ya existe en la base → actualizar SOLO costo (COSTO GS) + stock
        // (márgenes, precios, descripciones y todo lo demás queda intocado)
        actualizados.push({
          sku: codigo,
          nameActual: existente.name,
          stockActual: existente.stock,
          stockNuevo: data.stockSumado,
          costoActual: existente.costGs ?? null,
          costoNuevo: data.costProd,
          costoProtegido: protegidosIds.has(existente.id),
        });
      } else {
        // SKU nuevo → crear producto con márgenes + SAFRA automáticas
        const pick = pickPromedio(stats, { subGrupo: data.subGrupo, tipo: null });
        const pickSafra = pickSafraPromedio(safraStats, { subGrupo: data.subGrupo, tipo: null });
        nuevos.push({
          sku: codigo,
          name: data.name,
          referencia: data.referencia,
          subGrupo: data.subGrupo,
          stock: data.stockSumado,
          costProd: data.costProd,
          margenAuto: pick ? pick.avg.m : null,
          margenFuente: pick ? pick.fuente : null,
          safraAuto: pickSafra ? formatSafra(pickSafra.avg) : null,
        });
      }
    }

    // 8. Task 98: mapa sku → { sucursal → saldo } para el apply (el stock
    // global de siempre sigue viniendo en nuevos/actualizados; esto es el
    // REPARTO por sucursal de la MISMA planilla). Las sucursales van en
    // orden fijo: CENTRAL (depósito central) primero, resto alfabético.
    const stockPorSucursal: Record<string, Record<string, number>> = {};
    for (const codigo of codigosList) {
      const por = grouped[codigo].porSucursal;
      if (!por || Object.keys(por).length === 0) continue;
      stockPorSucursal[codigo] = por;
    }
    const sucursales = Object.values(sucursalesResumen)
      .map((s) => ({
        nombre: s.nombre,
        filas: s.filas,
        skus: s.skus.size,
        unidades: Math.round(s.unidades),
      }))
      .sort((a, b) => {
        if (a.nombre === "CENTRAL") return -1;
        if (b.nombre === "CENTRAL") return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });

    // 9. Devolver preview al frontend
    return NextResponse.json({
      ok: true,
      totalFilas,
      codigosUnicos: codigosList.length,
      nuevosCount: nuevos.length,
      actualizadosCount: actualizados.length,
      nuevos,
      actualizados,
      // Task 98 (nuevo, opcional para clientes viejos):
      stockPorSucursal,
      sucursales,
      errores,
    });
  } catch (error) {
    console.error("Error en import-stock/preview:", error);
    return NextResponse.json(
      { error: "Error al procesar el Excel" },
      { status: 500 }
    );
  }
}
