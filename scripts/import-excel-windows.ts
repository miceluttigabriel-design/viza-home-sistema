// Importar Excel a la BD - version Windows (path relativo)
// Uso: bun run scripts/import-excel-windows.ts "upload\NOMBRE_ARCHIVO.xlsm"
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import path from "path";

const db = new PrismaClient();
const PASS = "viza4170";

// El archivo viene como argumento o usamos el nombre por defecto
const excelPath = process.argv[2] || path.join(process.cwd(), "upload", "LISTA  VIZA HOME.xlsm");
console.log("Archivo Excel:", excelPath);

function getValue(cell: any): any {
  if (cell == null) return null;
  if (typeof cell === "object") {
    if (cell.result !== undefined) return cell.result;
    if (cell.text !== undefined) return cell.text;
    return null;
  }
  return cell;
}

function toString(v: any): string {
  const val = getValue(v);
  if (val == null) return "";
  return String(val).trim();
}

function toNumber(v: any): number | null {
  const val = getValue(v);
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function recalculate(p: any): any {
  const cambioRS = 1100;
  const cambioUS = 6000;
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
  return p;
}

async function main() {
  console.log("Abriendo Excel...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath, { password: PASS });

  const ws = wb.getWorksheet("base");
  if (!ws) {
    console.error("ERROR: Hoja 'base' no encontrada");
    console.log("Hojas disponibles:");
    wb.worksheets.forEach((s) => console.log(`  - ${s.name}`));
    process.exit(1);
  }

  console.log(`Hoja 'base': ${ws.rowCount} filas, ${ws.columnCount} columnas`);

  const products = [];
  const seenSkus = new Set<string>();

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const codViza = toString(row.getCell(22).value);
    const descripcion = toString(row.getCell(24).value);
    if (!codViza || !descripcion) continue;
    if (seenSkus.has(codViza)) continue;
    seenSkus.add(codViza);

    const referencia = toString(row.getCell(21).value);
    const codShow = toString(row.getCell(23).value);
    const safra = toString(row.getCell(90).value);
    const productName = toString(row.getCell(91).value);
    const fabricante = toString(row.getCell(93).value);
    const subGrupo = toString(row.getCell(94).value);
    const categoria = toString(row.getCell(95).value);
    const division = toString(row.getCell(96).value);
    const tipo = toString(row.getCell(97).value);
    const marca = toString(row.getCell(98).value);
    const modelo = toString(row.getCell(99).value);
    const stockVal = toNumber(row.getCell(104).value) ?? 0;
    const costSistema = toNumber(row.getCell(105).value);
    const obs = toString(row.getCell(2).value);

    const p: any = {
      sku: codViza,
      name: descripcion,
      description: referencia ? `Ref: ${referencia}` : null,
      showInCatalog: false,
      obs: obs || null,
      costBR: toNumber(row.getCell(3).value),
      costUS: toNumber(row.getCell(5).value),
      costGs: toNumber(row.getCell(7).value),
      discountPct: toNumber(row.getCell(11).value),
      addPct: toNumber(row.getCell(13).value),
      admPct: toNumber(row.getCell(15).value),
      valorDesc: toNumber(row.getCell(17).value),
      valorAdd: toNumber(row.getCell(19).value),
      referencia: referencia || null,
      codViza,
      codShow: codShow || null,
      pct1A6: toNumber(row.getCell(25).value),
      pct7A13: toNumber(row.getCell(26).value),
      pct14A30: toNumber(row.getCell(27).value),
      marginContado: toNumber(row.getCell(28).value),
      safra: safra || null,
      productName: productName || null,
      fabricante: fabricante || null,
      subGrupo: subGrupo || null,
      categoria: categoria || null,
      division: division || null,
      tipo: tipo || null,
      marca: marca || null,
      modelo: modelo || null,
      valorTecnico: toNumber(row.getCell(100).value),
      margenTecnico: toNumber(row.getCell(101).value),
      coluna1: toString(row.getCell(102).value) || null,
      coluna2: toString(row.getCell(103).value) || null,
      stock: Math.round(stockVal),
      costSistema,
      brand: fabricante || null,
      category: tipo || categoria || null,
      subcategory: subGrupo || null,
    };
    for (let i = 1; i <= 30; i++) {
      p[`marginC${i}`] = toNumber(row.getCell(28 + i).value);
    }
    recalculate(p);
    products.push(p);
  }

  console.log(`\nProductos a importar: ${products.length}`);

  // Borrar productos viejos del Excel (no los de muestra del catalogo)
  console.log("Borrando productos viejos del Excel...");
  const deleted = await db.product.deleteMany({ where: { showInCatalog: false } });
  console.log(`Borrados: ${deleted.count}`);

  // Insertar en batches
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    try {
      const result = await db.product.createMany({ data: batch });
      inserted += result.count;
    } catch (e) {
      console.error(`Error batch ${i}:`, (e as Error).message?.slice(0, 150));
    }
    if (i % 1000 === 0 || i + BATCH >= products.length) {
      console.log(`Progreso: ${Math.min(i + BATCH, products.length)}/${products.length}`);
    }
  }

  const total = await db.product.count();
  console.log(`\nIMPORTACION COMPLETADA!`);
  console.log(`  Insertados: ${inserted}`);
  console.log(`  Total en BD: ${total}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
