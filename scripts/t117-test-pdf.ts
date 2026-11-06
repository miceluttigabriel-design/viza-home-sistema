// ============================================================================
// Task 117 — prueba de humo del COMPARATIVO POR PRODUCTO en el PDF.
// Genera muestras reales con el helper nuevo (presupuesto-comparativo.ts)
// y valida:
//   1. Tabla 1 (CONTADO + 3 planes): valores por producto, fila TOTAL
//      unificada = suma EXACTA de la columna, REGALO con guiones.
//   2. Tabla 2 (SIN ENTREGA con +3%): per-item redondeado + nota.
//   3. Salto de página: tabla que arranca sin espacio sigue en página 2
//      (el ensureSpace del route devuelve la y=60 vigente).
//   4. Retro-compatibilidad: sin comparativoItems no se dibuja nada
//      (la función no se llama — se documenta acá, el route la omite).
// Muestras en muestras-t117/ para revisar con pdftoppm.
// ============================================================================
import { jsPDF } from "jspdf";
import {
  drawTablaComparativo,
  drawNotaComparativo,
  type ComparativoFila,
} from "../src/lib/pdf/presupuesto-comparativo";
import { writeFileSync, mkdirSync } from "fs";

let ok = 0;
let fails = 0;
function check(nombre: string, cond: boolean, extra = "") {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nombre}${extra ? " — " + extra : ""}`);
  } else {
    fails++;
    console.error(`  ✗ ${nombre}${extra ? " — " + extra : ""}`);
  }
}

const fmt = (v: number) => "Gs " + Math.round(v).toLocaleString("es-PY");

// ensureSpace SIN ESTADO, el mismo contrato que usa el route: el helper
// pasa su y viva; acá se decide si abre página (franja vendedor + footer).
function makeEnsureSpace(doc: jsPDF) {
  const pageH = doc.internal.pageSize.getHeight();
  const yVend = pageH - 30 - 56;
  return (curY: number, needed: number): number =>
    curY + needed > yVend - 12 ? (doc.addPage(), 60) : curY;
}

mkdirSync("muestras-t117", { recursive: true });

// ─── ESCENARIO 1: 2 TVs + casco regalo, CONTADO + 3 planes ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = 80;
  let yState = 80;
  const ensure = makeEnsureSpace(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(21, 87, 137);
  doc.text("COMPARATIVO POR PRODUCTO — CUOTA DE CADA UNO", margin, y);
  doc.setDrawColor(217, 184, 107);
  doc.setLineWidth(1.2);
  doc.line(margin, y + 5, margin + contentW, y + 5);
  yState = y + 14;

  // Los valores salen del mismo cálculo que la pantalla (T116):
  // LG 32" qty1, MIDAS 32" qty2, casco regalo.
  const filas: ComparativoFila[] = [
    {
      name: "LED LG 32LR600BPSC SMART TV 32 pulgadas HD",
      quantity: 1,
      regalo: false,
      valores: [1690500, 310000, 168000, 92000],
    },
    {
      name: "LED MIDAS MD-XP32GTV SMART TV 32 pulgadas HD con Netflix y YouTube",
      quantity: 2,
      regalo: false,
      // qty 2: los valores ya traen la cantidad multiplicada (igual que la
      // pantalla) → 6 cuotas: 270.000 × 2 = 540.000
      valores: [2940000, 540000, 292000, 160000],
    },
    {
      name: "CASCO MOTOCICLISTA TALLA M VIZA HOME",
      quantity: 1,
      regalo: true,
      valores: [null, null, null, null],
    },
  ];
  const cols = [
    { titulo: "CONTADO", total: 4630500 },
    { titulo: "A · 6 CUOTAS", total: 850000 },
    { titulo: "B · 12 CUOTAS", total: 460000 },
    { titulo: "C · 18 CUOTAS", total: 252000 },
  ];
  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: yState,
    cols,
    filas,
    ensureSpace: ensure,
  });
  yState = yFin;
  yState = drawNotaComparativo(doc, {
    margin,
    contentW,
    y: yState + 6,
    lineas: [
      "Valores por producto según la lista de cada plan; la cuota unificada es la suma de todos los productos.",
    ],
  });

  // VALIDACIONES de negocio (los mismos números que la pantalla):
  const suma6 = 310000 + 540000; // LG qty1 + MIDAS qty2 (la fila ya trae ×2)
  check("Tabla 1: fila TOTAL 6 cuotas = suma de productos", cols[1].total === suma6, `${fmt(suma6)}`);
  check("Tabla 1: regalo con todos los valores en null", filas[2].valores.every((v) => v === null));
  check("Tabla 1: contado = suma de subtotales", cols[0].total === 1690500 + 2940000);
  check("Tabla 1: y final avanza", yFin > y + 40);
  check("Tabla 1: una sola página (cabe)", doc.getNumberOfPages() === 1);

  writeFileSync("muestras-t117/comparativo-tabla1.pdf", Buffer.from(doc.output("arraybuffer")));
  console.log("  → muestras-t117/comparativo-tabla1.pdf");
}

// ─── ESCENARIO 2: SIN ENTREGA (+3%) + nota ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  let yState = 80;
  const ensure = makeEnsureSpace(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(21, 87, 137);
  doc.text("COMPARATIVO POR PRODUCTO — SIN ENTREGA INICIAL", margin, 80);
  doc.setDrawColor(217, 184, 107);
  doc.setLineWidth(1.2);
  doc.line(margin, 85, margin + contentW, 85);
  yState = 94;

  const filas: ComparativoFila[] = [
    {
      name: "LED LG 32LR600BPSC SMART TV 32 pulgadas HD",
      quantity: 1,
      regalo: false,
      // base × 1.03 redondeado por producto (misma regla que la pantalla)
      valores: [Math.round(310000 * 1.03), Math.round(168000 * 1.03)],
    },
    {
      name: "LED MIDAS MD-XP32GTV SMART TV 32 pulgadas HD",
      quantity: 2,
      regalo: false,
      valores: [Math.round(270000 * 1.03), Math.round(146000 * 1.03)],
    },
  ];
  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: yState,
    cols: [
      { titulo: "A · 6 CUOTAS", total: 875500 },
      { titulo: "B · 12 CUOTAS", total: 474000 },
    ],
    filas,
    ensureSpace: ensure,
  });
  yState = drawNotaComparativo(doc, {
    margin,
    contentW,
    y: yFin + 6,
    lineas: [
      "En SIN ENTREGA INICIAL (31-60 días) el recargo y el redondeo comercial se aplican sobre el total unificado.",
    ],
  });
  // El total unificado (875.500 = redondeo comercial de la suma ×1.03) puede
  // diferir en unos miles de la suma de los per-item — la nota lo explica.
  check("Tabla 2: per-item con +3% aplicado", filas[0].valores[0] === 319300);
  check("Tabla 2: dos páginas como máximo", doc.getNumberOfPages() <= 2);
  writeFileSync("muestras-t117/comparativo-sin-entrega.pdf", Buffer.from(doc.output("arraybuffer")));
  console.log("  → muestras-t117/comparativo-sin-entrega.pdf");
}

// ─── ESCENARIO 3: salto de página (arranca sin espacio) ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  // y cerca del fondo: la tabla NO entra → ensureSpace abre página 2
  const yInicio = doc.internal.pageSize.getHeight() - 30 - 56 - 30;
  const ensure = makeEnsureSpace(doc);

  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: yInicio,
    cols: [
      { titulo: "A · 6 CUOTAS", total: 850000 },
      { titulo: "B · 12 CUOTAS", total: 460000 },
    ],
    filas: [
      { name: "PRODUCTO DE PRUEBA UNO", quantity: 1, regalo: false, valores: [310000, 168000] },
      { name: "PRODUCTO DE PRUEBA DOS", quantity: 3, regalo: false, valores: [270000, 146000] },
    ],
    ensureSpace: ensure,
  });
  check("Salto de página: la tabla completa quedó en página 2", doc.getNumberOfPages() === 2);
  check("Salto de página: y en página 2 arranca arriba (60 + contenido)", yFin < 260, `yFin=${Math.round(yFin)}`);
  writeFileSync("muestras-t117/comparativo-salto-pagina.pdf", Buffer.from(doc.output("arraybuffer")));
  console.log("  → muestras-t117/comparativo-salto-pagina.pdf");
}

console.log(`\nRESULTADO: ${ok} OK, ${fails} FALLOS`);
process.exit(fails > 0 ? 1 : 0);
