// ============================================================================
// Task 118 — muestra visual del arreglo del rótulo del COMPARATIVO.
// El dueño detectó: arriba "1 ENTRADA + 7 CUOTAS" y abajo "A · 8 CUOTAS".
// Acá se reproducen los 3 casos de rótulos nuevos:
//   1. Caso del dueño (2 motos, plan A de 8 pagos) → "A · 1 ENTRADA/+ 7 CUOTAS"
//   2. Varios planes + contado (columnas angostas) → 2 líneas que entran
//   3. Entrega inicial personalizada → "A · 7 CUOTAS" (igual que arriba)
// Salida: muestras-t118/ para revisar con pdftoppm.
// ============================================================================
import { jsPDF } from "jspdf";
import {
  drawTablaComparativo,
  drawNotaComparativo,
  type ComparativoFila,
} from "../src/lib/pdf/presupuesto-comparativo";
import { writeFileSync, mkdirSync } from "fs";

mkdirSync("muestras-t118", { recursive: true });

function makeEnsureSpace(doc: jsPDF) {
  const pageH = doc.internal.pageSize.getHeight();
  const yVend = pageH - 30 - 56;
  return (curY: number, needed: number): number =>
    curY + needed > yVend - 12 ? (doc.addPage(), 60) : curY;
}

function titulo(doc: jsPDF, margin: number, contentW: number, y: number, txt: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(21, 87, 137);
  doc.text(txt, margin, y);
  doc.setDrawColor(217, 184, 107);
  doc.setLineWidth(1.2);
  doc.line(margin, y + 5, margin + contentW, y + 5);
}

const motos: ComparativoFila[] = [
  {
    name: "MOTO KENTON GTR 150 LTD BLACK",
    quantity: 1,
    regalo: false,
    valores: [1157000],
  },
  {
    name: "MOTO KENTON HUNTER 230CC BLACK",
    quantity: 1,
    regalo: false,
    valores: [1634000],
  },
];

// ─── CASO 1: el caso exacto del dueño (1 plan de 8 pagos, sin contado) ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  const ensure = makeEnsureSpace(doc);
  titulo(doc, margin, contentW, 80, "COMPARATIVO POR PRODUCTO — CUOTA DE CADA UNO");
  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: 94,
    cols: [
      // Rótulo NUEVO (antes: "A · 8 CUOTAS")
      { titulo: "A · 1 ENTRADA", titulo2: "+ 7 CUOTAS", total: 2791000 },
    ],
    filas: motos,
    ensureSpace: ensure,
  });
  drawNotaComparativo(doc, {
    margin,
    contentW,
    y: yFin + 6,
    lineas: [
      "Valores por producto según la lista de cada plan; la cuota unificada es la suma de todos los productos.",
    ],
  });
  writeFileSync(
    "muestras-t118/caso1-dueño-8pagos.pdf",
    Buffer.from(doc.output("arraybuffer"))
  );
  console.log("  → muestras-t118/caso1-dueño-8pagos.pdf");
}

// ─── CASO 2: contado + 4 planes (columnas angostas, 2 líneas deben entrar) ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  const ensure = makeEnsureSpace(doc);
  titulo(doc, margin, contentW, 80, "COMPARATIVO — CONTADO + 4 PLANES (COLUMNAS ANGOSTAS)");
  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: 94,
    cols: [
      { titulo: "CONTADO", total: 4630500 },
      { titulo: "B · 1 ENTRADA", titulo2: "+ 5 CUOTAS", total: 850000 },
      { titulo: "C · 1 ENTRADA", titulo2: "+ 11 CUOTAS", total: 460000 },
      { titulo: "D · 1 ENTRADA", titulo2: "+ 17 CUOTAS", total: 252000 },
      { titulo: "E · 1 ENTRADA", titulo2: "+ 23 CUOTAS", total: 187000 },
    ],
    filas: motos,
    ensureSpace: ensure,
  });
  drawNotaComparativo(doc, { margin, contentW, y: yFin + 6, lineas: [] });
  writeFileSync(
    "muestras-t118/caso2-angostas.pdf",
    Buffer.from(doc.output("arraybuffer"))
  );
  console.log("  → muestras-t118/caso2-angostas.pdf");
}

// ─── CASO 3: entrega inicial personalizada → solo las cuotas restantes ───
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  const ensure = makeEnsureSpace(doc);
  titulo(doc, margin, contentW, 80, "COMPARATIVO — CON ENTREGA INICIAL PERSONALIZADA");
  const yFin = drawTablaComparativo(doc, {
    margin,
    contentW,
    y: 94,
    cols: [
      // Arriba la tabla de planes muestra fila "ENTREGA INICIAL" + "7 CUOTAS"
      { titulo: "A · 7 CUOTAS", total: 2500000 },
    ],
    filas: motos,
    ensureSpace: ensure,
  });
  drawNotaComparativo(doc, {
    margin,
    contentW,
    y: yFin + 6,
    lineas: [
      "La entrega inicial (Gs 2.000.000) se descuenta del total del plan; los valores por producto son los de la lista.",
    ],
  });
  writeFileSync(
    "muestras-t118/caso3-entrega-personalizada.pdf",
    Buffer.from(doc.output("arraybuffer"))
  );
  console.log("  → muestras-t118/caso3-entrega-personalizada.pdf");
}

console.log("OK — revisar con pdftoppm");
