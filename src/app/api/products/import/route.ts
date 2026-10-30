import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { naceConMargenDefault } from "@/lib/gasto-adm";
import { guardarCapacidad } from "@/lib/producto-capacidad";
import { guardarCores } from "@/lib/producto-cores";
import ExcelJS from "exceljs";
import { getTasasCambio, TASAS_DEFAULT, TasasCambio } from "@/lib/tasas-cambio";

function toNumber(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

// Task 87: tasas por parámetro (activas de la base; antes fijas 1100/6000).
function recalculate(p: any, tasas: TasasCambio = TASAS_DEFAULT): void {
  const cambioRS = tasas.cambioRS; // $C$1 del Excel (editable desde la Base)
  const cambioUS = tasas.cambioUS; // $G$1 del Excel (editable desde la Base)
  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  p.rsNoUS = d && d > 0 ? d : f;
  const calcCost = p.rsNoUS && p.rsNoUS > 0 ? p.rsNoUS : (p.costGs ?? 0);
  p.usNoGs = calcCost;
  p.subCost = calcCost;
  p.rsToGs = d;
  p.usToGs = f;
  p.minusDisc = calcCost - (calcCost * (p.discountPct || 0));
  p.plusAdd = (p.minusDisc ?? 0) + ((p.minusDisc ?? 0) * (p.addPct || 0));
  p.plusAdd2 = (p.plusAdd ?? 0) + ((p.plusAdd ?? 0) * (p.admPct || 0));
  p.minusDescV = (p.plusAdd2 ?? 0) - (p.valorDesc ?? 0);
  const baseCosto = (p.minusDescV ?? 0) + (p.valorAdd ?? 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;
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
  const t = p.costProd ?? 0;
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  for (let i = 1; i <= 30; i++) {
    const margin = p[`marginC${i}`];
    p[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;
}

// POST /api/products/import - Importa productos desde Excel
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json({ error: "Solo admin o supremo_admin" }, { status: 403 });
    }
    // Task 82/83: usuarios de consulta (viza.compras@, filipe.campos@ — lista
    // en src/lib/usuarios-consulta.ts) no pueden importar productos, tengan el
    // rol que tengan (blindaje extra: un consulta con rol admin tampoco puede).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede importar productos" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No se encontro archivo" }, { status: 400 });

    // Task 87: tasas activas de la base para TODO el import (una sola
    // lectura; fallback blando a 1100/6000 si aún no se configuró).
    const tasasImport = await getTasasCambio();

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    // El tipo Buffer de exceljs entra en conflicto con el de @types/node
    // (Buffer<ArrayBuffer> vs Buffer), por eso el cast.
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet("PRODUCTOS") || wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: "No se encontro hoja" }, { status: 400 });

    // Mapeo de headers a campos
    const headerRow = ws.getRow(1);
    const headerMap: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const header = toString(headerRow.getCell(c).value).toUpperCase();
      headerMap[header] = c;
    }

    const getCell = (row: ExcelJS.Row, headerName: string): any => {
      const col = headerMap[headerName.toUpperCase()];
      if (!col) return null;
      const cell = row.getCell(col).value;
      if (cell && typeof cell === "object" && "result" in cell) return (cell as any).result;
      return cell;
    };

    const results = {
      total: 0,
      nuevos: 0,
      actualizados: 0,
      errores: [] as string[],
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sku = toString(getCell(row, "SKU"));
      const name = toString(getCell(row, "DESCRIPCION"));

      if (!sku) {
        results.errores.push(`Fila ${r}: SKU vacio`);
        continue;
      }
      if (!name) {
        results.errores.push(`Fila ${r}: DESCRIPCION vacia`);
        continue;
      }

      // Verificar si el producto YA existe - REGLA CRÍTICA DE NEGOCIO
      const existing = await db.product.findUnique({ where: { sku } });

      if (existing) {
        // ════════════════════════════════════════════════════════════════
        // PRODUCTO EXISTENTE: Actualizar SOLO campos no protegidos
        // ════════════════════════════════════════════════════════════════
        // REGLA DE ORO: Las ediciones manuales del admin (costos, márgenes,
        // precios, cuotas, datos finales, etiquetas) DEBEN PERMANECER INTACTAS.
        // Solo se actualizan desde la plantilla:
        //   - stock (STOCK) → única excepción: siempre se sobrescribe
        //   - referencia (REFERENCIA) → puede cambiar el código
        //   - codShow (COD SHOW) → puede cambiar el código
        //   - name (DESCRIPCION) → puede cambiar el nombre del producto
        //
        // NO se tocan (se preservan los valores actuales en BD):
        //   - costBR, costUS, costGs, todos los costos calculados
        //   - marginContado, marginC1..C30, todos los márgenes
        //   - priceContado, price1..30, todas las cuotas
        //   - pct1A6, pct7A13, pct14A30, bases de porcentaje
        //   - safra, fabricante, subGrupo, categoria, division, tipo,
        //     marca, modelo, valorTecnico, margenTecnico, coluna1, coluna2
        //   - costSistema
        //   - etiquetaColor (regla anterior: persiste siempre)
        //   - showInCatalog (visible en catálogo de vendedores)
        // ════════════════════════════════════════════════════════════════
        const stockExcel = toNumber(getCell(row, "STOCK")) ?? 0;
        const referenciaExcel = toString(getCell(row, "REFERENCIA")) || null;
        const codShowExcel = toString(getCell(row, "COD SHOW")) || null;
        const nameExcel = name;

        await db.product.update({
          where: { sku },
          data: {
            stock: stockExcel,
            referencia: referenciaExcel,
            codShow: codShowExcel,
            name: nameExcel,
            // ─────────────────────────────────────────────────────
            // CAMPOS PROTEGIDOS - INTENCIONALMENTE NO INCLUIDOS:
            // (Prisma.update solo modifica los campos que están en `data`)
            // ─────────────────────────────────────────────────────
            // costBR, costUS, costGs, discountPct, addPct, admPct,
            // valorDesc, valorAdd, pct1A6, pct7A13, pct14A30, marginContado,
            // safra, fabricante, subGrupo, categoria, division, tipo,
            // marca, modelo, valorTecnico, margenTecnico, coluna1, coluna2,
            // costSistema, etiquetaColor, showInCatalog,
            // y todos los campos calculados: rsToGs, usToGs, rsNoUS, usNoGs,
            // subCost, minusDisc, plusAdd, plusAdd2, minusDescV, costProd,
            // marginC1..C30, priceContado, price1..30, price, cost
          },
        });
        results.actualizados++;
      } else {
        // ════════════════════════════════════════════════════════════════
        // PRODUCTO NUEVO: Insertar TODOS los campos del Excel
        // ════════════════════════════════════════════════════════════════
        const productData: any = {
          sku,
          name,
          referencia: toString(getCell(row, "REFERENCIA")) || null,
          codShow: toString(getCell(row, "COD SHOW")) || null,
          costBR: toNumber(getCell(row, "COSTO R$")),
          costUS: toNumber(getCell(row, "COSTO US$")),
          costGs: toNumber(getCell(row, "COSTO GS")),
          discountPct: toNumber(getCell(row, "% DESC")),
          addPct: toNumber(getCell(row, "% ADD")),
          admPct: toNumber(getCell(row, "GASTOS ADM")),
          valorDesc: toNumber(getCell(row, "VALOR DESC.")),
          valorAdd: toNumber(getCell(row, "VALOR ADD")),
          pct1A6: toNumber(getCell(row, "1 A 6")),
          pct7A13: toNumber(getCell(row, "7 A 13")),
          pct14A30: toNumber(getCell(row, "14 A 30")),
          marginContado: toNumber(getCell(row, "% CONTADO")),
          safra: toString(getCell(row, "SAFRA")) || null,
          obs: toString(getCell(row, "OBS")) || null,
          fabricante: toString(getCell(row, "FABRICANTE")) || null,
          subGrupo: toString(getCell(row, "SUB-GRUPO")) || null,
          categoria: toString(getCell(row, "CATEGORIA")) || null,
          division: toString(getCell(row, "DIVISION")) || null,
          tipo: toString(getCell(row, "TIPO")) || null,
          marca: toString(getCell(row, "MARCA")) || null,
          modelo: toString(getCell(row, "MODELO")) || null,
          stock: toNumber(getCell(row, "STOCK")) ?? 0,
          showInCatalog: false,
          // Campos legados de compatibilidad catálogo
          codViza: sku,
          brand: toString(getCell(row, "FABRICANTE")) || null,
          category: toString(getCell(row, "TIPO")) || toString(getCell(row, "CATEGORIA")) || null,
          subcategory: toString(getCell(row, "SUB-GRUPO")) || null,
          // etiquetaColor: queda null por defecto (definido en schema)
        };
        // Task 96/96b (pedido del dueño): producto NUEVO de la planilla SIN
        // % ADD / GASTOS ADM propios → nace con 1% en AMBOS ("quiero que los
        // nuevos productos que no sean TRANSPORTERS ya nazcan con esta
        // margen"). Si la planilla trae las columnas (aunque sea 0), se
        // RESPETA la planilla. EXCEPCIÓN: los TRANSPORTERS de CHACOMER/
        // KENTON nacen como siempre (sin el 1%).
        naceConMargenDefault(productData);
        recalculate(productData, tasasImport);
        const creado = await db.product.create({ data: productData });

        // Task 97: CAPACIDAD (columna nueva de la Base, tabla aparte
        // ProductCapacidad). Si la planilla la trae (header "CAPACIDAD"),
        // nace con ella; si no existe la columna o falla el guardado, el
        // producto queda creado igual (jamás frena la importación).
        const capExcel = toString(getCell(row, "CAPACIDAD"));
        if (capExcel) {
          try {
            await guardarCapacidad(creado.id, capExcel);
          } catch {
            // sin capacidad: la importación sigue igual que siempre
          }
        }

        // Task 98: CORES (columna nueva de la Base, tabla aparte
        // ProductCores). Si la planilla la trae (header "CORES"), nace con
        // ella; si no existe la columna o falla el guardado, el producto
        // queda creado igual (jamás frena la importación).
        const coresExcel = toString(getCell(row, "CORES"));
        if (coresExcel) {
          try {
            await guardarCores(creado.id, coresExcel);
          } catch {
            // sin cores: la importación sigue igual que siempre
          }
        }
        results.nuevos++;
      }
      results.total++;
    }

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error) {
    console.error("Error importando:", error);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
