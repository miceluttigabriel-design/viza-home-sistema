// ============================================================================
// Task 117 (pedido del dueño) — COMPARATIVO POR PRODUCTO en el PDF del
// presupuesto del panel de ventas.
//
// "también necesito generar el presupuesto con los comparativos de cuotas"
//
// Qué dibuja: una tabla donde cada FILA es un producto del presupuesto y
// cada COLUMNA es una opción de pago (CONTADO / Plan A · 6 CUOTAS / ...),
// con la cuota de CADA producto en ese plan. Al pie, la fila
// "TOTAL POR CUOTA (UNIFICADO)" con el MISMO valor que ya muestra la tabla
// OPCIONES DE FINANCIACIÓN (así comparativo y unificado están siempre de
// acuerdo).
//
// Reglas de cuidado (lo que pidió el dueño):
//  - SOLO dibujo: no calcula nada de negocio. Los valores por producto
//    llegan listos desde el panel (priceN de la lista × cantidad — la
//    misma fuente que usa el cálculo unificado, que es la suma de estos).
//  - Es ADITIVO: si el payload no trae datos del comparativo (clientes
//    viejos, llamada directa a la API), la sección simplemente no sale y
//    el presupuesto queda EXACTAMENTE igual que siempre.
//  - Los regalos (CASCO / productos regalo) no se financian: fila con
//    "REGALO" y guiones.
//  - Respeta el diseño Viza del presupuesto (azul #155789, dorado #D9B86B,
//    zebra, cinta dorada en la fila de totales — igual que la tabla de
//    planes).
// ============================================================================

import type { jsPDF } from "jspdf";

// Paleta idéntica a la del route de quotes/pdf (mismos valores hex).
type RGB = [number, number, number];
const BLUE: RGB = [21, 87, 137];
const GOLD: RGB = [217, 184, 107];
const DARK: RGB = [28, 37, 51];
const GREY: RGB = [107, 119, 133];
const LIGHT: RGB = [238, 243, 248];
const ZEBRA: RGB = [246, 248, 251];
const GOLD_LIGHT: RGB = [250, 243, 224];
const LINE: RGB = [216, 222, 230];

// Una columna de la tabla = una opción de pago del presupuesto.
export interface ComparativoCol {
  titulo: string; // "CONTADO" | "A · 6 CUOTAS"
  total: number | null; // valor de la fila TOTAL (null → "—")
}

// Una fila = un producto del presupuesto.
export interface ComparativoFila {
  name: string;
  quantity: number;
  regalo: boolean;
  // Un valor por columna (mismo orden que cols). null → "—".
  valores: (number | null)[];
}

export interface TablaComparativoOpts {
  margin: number;
  contentW: number;
  y: number;
  cols: ComparativoCol[];
  filas: ComparativoFila[];
  // Control de salto de página, SIN estado compartido (a prueba de
  // desincronización): el helper pasa SU y VIVA y el callback decide.
  // Debe devolver la y a usar: la misma currentY si hay lugar, o 60 si
  // abrió página nueva (el route respeta la franja del vendedor + footer).
  ensureSpace: (currentY: number, needed: number) => number;
  // Etiqueta de la fila de totales (default "TOTAL POR CUOTA (UNIFICADO)")
  totalLabel?: string;
}

const ROW_H = 20;
const HEADER_H = 20;
const TOTAL_H = 24;
const COL_CONTADO_W = 86; // ancho de la columna CONTADO cuando existe

// Dibuja la tabla comparativa y devuelve la Y donde quedó el cursor.
// La llama el route dos veces: una para CONTADO + planes CON ENTREGA y
// otra (si aplica) para los planes SIN ENTREGA INICIAL.
export function drawTablaComparativo(doc: jsPDF, o: TablaComparativoOpts): number {
  let y = o.y;
  const cols = o.cols;
  if (cols.length === 0 || o.filas.length === 0) return y;

  // Anchos: PRODUCTO lleva un ancho FIJO suficiente para el nombre truncado
  // y las opciones de pago reparten parejo lo que sobra. Si hay muchos planes
  // y cada columna quedaría chica (< 46pt), PRODUCTO cede ancho hasta su
  // mínimo. (Antes se calculaba al revés y PRODUCTO quedaba en 0 — los
  // nombres pisaban las columnas de valores.)
  const conContado = cols[0].titulo === "CONTADO";
  const contadoW = conContado ? COL_CONTADO_W : 0;
  const nPago = cols.length - (conContado ? 1 : 0);
  let prodColW = conContado ? 190 : 214;
  let planColW = nPago > 0 ? (o.contentW - contadoW - prodColW) / nPago : 0;
  if (nPago > 0 && planColW < 46) {
    prodColW = Math.max(112, o.contentW - contadoW - nPago * 46);
    planColW = (o.contentW - contadoW - prodColW) / nPago;
  }
  const fontCol = planColW < 64 ? 6.5 : 7.2;

  // ---------- HEADER (azul, igual que las otras tablas del presupuesto) ----------
  y = o.ensureSpace(y, HEADER_H + ROW_H + 4);
  doc.setFillColor(...BLUE);
  doc.rect(o.margin, y, o.contentW, HEADER_H, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.text("PRODUCTO", o.margin + 8, y + 13.5);
  let cx = o.margin + prodColW;
  cols.forEach((c, i) => {
    if (i === 0 && conContado) {
      doc.text(c.titulo, cx + contadoW - 8, y + 13.5, { align: "right" });
    } else {
      doc.text(c.titulo, cx + planColW - 8, y + 13.5, { align: "right" });
    }
    cx += i === 0 && conContado ? contadoW : planColW;
  });
  y += HEADER_H;

  // ---------- FILAS DE PRODUCTOS ----------
  o.filas.forEach((f, idx) => {
    y = o.ensureSpace(y, ROW_H + 2);
    if (idx % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(o.margin, y, o.contentW, ROW_H, "F");
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(o.margin, y + ROW_H, o.margin + o.contentW, y + ROW_H);

    // Nombre (1 línea, con … si no entra) + marcación a la derecha:
    //  - producto normal: "× cantidad"
    //  - REGALO: chip "REGALO" (ocupa el lugar del × cantidad, así nunca se
    //    pisan; los regalos no se financian y sus columnas van con guiones)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...DARK);
    const anchoNombre = f.regalo ? prodColW - 92 : prodColW - 60;
    const lines = doc.splitTextToSize(f.name, anchoNombre) as string[];
    const nombre = (lines[0] || f.name) + (lines.length > 1 ? "…" : "");
    doc.text(nombre, o.margin + 8, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...GREY);
    if (f.regalo) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.text("REGALO", o.margin + prodColW - 8, y + 13, {
        align: "right",
      });
    } else {
      doc.text(`× ${f.quantity}`, o.margin + prodColW - 8, y + 13, { align: "right" });
    }

    // Valores por columna
    let vx = o.margin + prodColW;
    f.valores.forEach((v, i) => {
      const isContado = i === 0 && conContado;
      const w = isContado ? contadoW : planColW;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(isContado ? 7.4 : 7.6);
      doc.setTextColor(...DARK);
      doc.text(
        v === null || v === undefined ? "—" : formatGs(v),
        vx + w - 8,
        y + 13,
        { align: "right" }
      );
      vx += w;
    });
    y += ROW_H;
  });

  // ---------- FILA TOTAL (misma idea que las tablas del presupuesto:
  // fondo dorado clarito + cinta dorada a la izquierda) ----------
  y = o.ensureSpace(y, TOTAL_H + 4);
  doc.setFillColor(...GOLD_LIGHT);
  doc.rect(o.margin, y, o.contentW, TOTAL_H, "F");
  doc.setFillColor(...GOLD);
  doc.rect(o.margin, y, 3, TOTAL_H, "F");
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(o.margin, y + TOTAL_H, o.margin + o.contentW, y + TOTAL_H);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...DARK);
  doc.text(o.totalLabel || "TOTAL POR CUOTA (UNIFICADO)", o.margin + 12, y + 15.5);

  let tx = o.margin + prodColW;
  o.cols.forEach((c, i) => {
    const isContado = i === 0 && conContado;
    const w = isContado ? contadoW : planColW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...BLUE);
    doc.text(c.total === null || c.total === undefined ? "—" : formatGs(c.total), tx + w - 8, y + 15.5, {
      align: "right",
    });
    tx += w;
  });
  y += TOTAL_H;
  return y;
}

// Formateo Gs idéntico al del presupuesto (Gs + miles es-PY).
function formatGs(v: number): string {
  return "Gs " + Math.round(v).toLocaleString("es-PY");
}

// Nota al pie del comparativo (explica ajustes que se aplican sobre el
// total unificado y no por producto). Gris discreto, no estorba.
export function drawNotaComparativo(
  doc: jsPDF,
  o: { margin: number; contentW: number; y: number; lineas: string[] }
): number {
  if (!o.lineas.length) return o.y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(...GREY);
  let yy = o.y;
  o.lineas.forEach((l) => {
    doc.text(l, o.margin, yy);
    yy += 8.5;
  });
  return yy;
}
