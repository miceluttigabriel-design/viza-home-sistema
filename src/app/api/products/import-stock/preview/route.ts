import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExcelJS from "exceljs";

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
    const headerMap: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const header = normalizeHeader(headerRow.getCell(c).value);
      if (header) headerMap[header] = c;
    }

    // Validar que tenga por lo menos las columnas clave
    const colCodigo = headerMap["CODIGO"];
    if (!colCodigo) {
      return NextResponse.json(
        {
          error:
            'El Excel no tiene la columna "Codigo". Verificá que sea la planilla de inventario correcta.',
        },
        { status: 400 }
      );
    }

    const colSaldo = headerMap["SALDO"];
    const colCostoUnit = headerMap["COSTO UNIT. ULTIMA COMPRA"];
    const colCodigoFabrica = headerMap["CODIGO FABRICA"];
    const colSubgrupo = headerMap["SUBGRUPO"];
    const colDescripcion = headerMap["DESCRIPCION"];

    // Helper para obtener valor de celda por nombre de header (normaliza para match)
    const getCell = (row: ExcelJS.Row, headerName: string): any => {
      const col = headerMap[normalizeHeader(headerName)];
      if (!col) return null;
      const cell = row.getCell(col).value;
      // Si es celda con fórmula, tomar el resultado
      if (cell && typeof cell === "object" && "result" in cell) {
        return (cell as any).result;
      }
      return cell;
    };

    // 5. Recorrer filas, agrupar por Codigo y acumular Saldo
    // Estructura: { [codigoLimpio]: { stockSumado, costProd, referencia, subGrupo, name, filas } }
    // IMPORTANTE: el "Codigo Fabrica" del Excel se guarda como `referencia`
    // (columna REFERENCIA del grupo DATOS en la tabla), NO como `codViza` (DATOS VIZA).
    const grouped: Record<
      string,
      {
        codigo: string;
        stockSumado: number;
        costProd: number | null;
        referencia: string | null;  // ← antes era codViza, ahora es referencia
        subGrupo: string | null;
        name: string | null;
        filas: number;
      }
    > = {};

    const errores: string[] = [];
    let totalFilas = 0;
    let filaActual = 1; // header es fila 1, datos empiezan en 2

    for (let r = 2; r <= ws.rowCount; r++) {
      filaActual = r;
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
        };
      }
    }

    // 6. Verificar cuáles SKUs ya existen en la base (consulta masiva)
    const codigosList = Object.keys(grouped);
    const existentes = await db.product.findMany({
      where: { sku: { in: codigosList } },
      select: { sku: true, stock: true, name: true },
    });
    const existentesMap = new Map(existentes.map((p) => [p.sku, p]));

    // 7. Construir preview: separar en `nuevos` y `actualizados`
    const nuevos: Array<{
      sku: string;
      name: string | null;
      referencia: string | null;  // ← antes era codViza, ahora es referencia
      subGrupo: string | null;
      stock: number;
      costProd: number | null;
    }> = [];

    const actualizados: Array<{
      sku: string;
      nameActual: string | null;
      stockActual: number;
      stockNuevo: number;
    }> = [];

    for (const codigo of codigosList) {
      const data = grouped[codigo];
      const existente = existentesMap.get(codigo);
      if (existente) {
        // SKU ya existe en la base → actualizar stock (REEMPLAZAR, no sumar)
        actualizados.push({
          sku: codigo,
          nameActual: existente.name,
          stockActual: existente.stock,
          stockNuevo: data.stockSumado,
        });
      } else {
        // SKU nuevo → crear producto
        nuevos.push({
          sku: codigo,
          name: data.name,
          referencia: data.referencia,  // ← antes era codViza
          subGrupo: data.subGrupo,
          stock: data.stockSumado,
          costProd: data.costProd,
        });
      }
    }

    // 8. Devolver preview al frontend
    return NextResponse.json({
      ok: true,
      totalFilas,
      codigosUnicos: codigosList.length,
      nuevosCount: nuevos.length,
      actualizadosCount: actualizados.length,
      nuevos,
      actualizados,
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
