import { jsPDF } from "jspdf";
import { VIZA_LOGO_WORDMARK_PNG, VIZA_LOGO_WORDMARK_RATIO } from "./vizaLogo";

export type RGB = [number, number, number];
export const BLUE: RGB = [21, 87, 137];
export const GOLD: RGB = [217, 184, 107];
export const DARK: RGB = [28, 37, 51];
export const GREY: RGB = [107, 119, 133];
export const LIGHT: RGB = [238, 243, 248];
export const ZEBRA: RGB = [246, 248, 251];
export const GOLD_LIGHT: RGB = [250, 243, 224];
export const LINE: RGB = [216, 222, 230];

export const VALIDEZ_DIAS = 10;
export const FOOTER_H = 64;
export const FOOTER_BOTTOM_GAP = 34;
export const FOOTER_RESERVE = FOOTER_H + FOOTER_BOTTOM_GAP + 14;

type Seg = ["L", number, number] | ["C", number, number, number, number, number, number];

function fillPath(doc: jsPDF, start: [number, number], segs: Seg[], color: RGB) {
  let cx = start[0]; let cy = start[1];
  const rel: number[][] = [];
  for (const s of segs) {
    if (s[0] === "L") { rel.push([s[1] - cx, s[2] - cy]); cx = s[1]; cy = s[2]; }
    else { rel.push([s[1] - cx, s[2] - cy, s[3] - cx, s[4] - cy, s[5] - cx, s[6] - cy]); cx = s[5]; cy = s[6]; }
  }
  doc.setFillColor(...color);
  doc.lines(rel, start[0], start[1], [1, 1], "F", true);
}

const WAVE_LIGHT_GOLD: RGB = [224, 192, 128];
export function drawWave(doc: jsPDF, pageW: number) {
  const k = pageW / 1223;
  const P = (x: number, y: number): [number, number] => [x * k, y * k];
  const C = (a: number, b: number, c: number, d: number, e: number, f: number): Seg => ["C", a * k, b * k, c * k, d * k, e * k, f * k];
  const L = (x: number, y: number): Seg => ["L", x * k, y * k];
  fillPath(doc, P(557, 0), [L(557, 40), C(740, 95, 930, 150, 1060, 172), C(1120, 182, 1180, 192, 1223, 202), L(1223, 0)], GOLD);
  fillPath(doc, P(1100, 100), [L(1223, 100), L(1223, 202), C(1180, 192, 1130, 183, 1100, 177)], WAVE_LIGHT_GOLD);
  fillPath(doc, P(180, 0), [C(300, 15, 400, 42, 490, 42), C(570, 42, 630, 25, 700, 25), C(800, 25, 930, 65, 1010, 110), C(1060, 150, 1100, 176, 1140, 168), C(1190, 160, 1215, 125, 1223, 98), L(1223, 0)], BLUE);
}

export function drawHeader(doc: jsPDF, pageW: number, margin: number, contentW: number, quoteNumber: string, subtitle: string, emision: Date, fmtDT: (d: Date) => string, fmtD: (d: Date) => string) {
  drawWave(doc, pageW);
  const lh = 40; const lw = lh * VIZA_LOGO_WORDMARK_RATIO;
  doc.addImage(VIZA_LOGO_WORDMARK_PNG, "PNG", margin, 34, lw, lh);
  doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.setTextColor(...GOLD);
  doc.text("home", margin + lw + 6, 73);
  doc.setFontSize(8.5);
  const s1 = "Todo para tu hogar";
  doc.setTextColor(...GOLD); doc.text(s1, margin, 88);
  doc.setTextColor(...BLUE); doc.text(", en un solo lugar.", margin + doc.getTextWidth(s1), 88);
  doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.setTextColor(...BLUE);
  doc.text("PRESUPUESTO", margin, 150);
  const tw = doc.getTextWidth("PRESUPUESTO");
  doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
  doc.text(subtitle, margin + tw + 8, 150);
  doc.setFillColor(...GOLD); doc.rect(margin, 160, 48, 2.5, "F");
  const gap = 10; const bw = (contentW - gap * 2) / 3; const by = 173; const bh = 42;
  const validez = new Date(emision); validez.setDate(validez.getDate() + VALIDEZ_DIAS);
  const boxes: [string, string][] = [
    ["N° PRESUPUESTO", quoteNumber],
    ["FECHA DE EMISIÓN", fmtDT(emision)],
    ["VÁLIDO HASTA", fmtD(validez)],
  ];
  boxes.forEach(([label, value], i) => {
    const x = margin + i * (bw + gap);
    doc.setFillColor(...LIGHT); doc.roundedRect(x, by, bw, bh, 8, 8, "F");
    doc.setFillColor(...BLUE); doc.rect(x, by + 10, 3, bh - 20, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...GREY);
    doc.text(label, x + 14, by + 15);
    doc.setFontSize(10); doc.setTextColor(...BLUE);
    doc.text(value, x + 14, by + 33);
  });
  return by + bh;
}

// ─── VENDEDOR (Task 102, pedido del dueño) ───
// Franja fina y elegante con el nombre completo del vendedor que emite el
// presupuesto, su sucursal y su número de contacto (planilla FUN.VIZA).
// Va justo debajo de las 3 cajas del encabezado, en TODOS los presupuestos
// (PRESUPUESTO / SAFRA / CON CHEQUE / MAYORISTA). Discreta: 34pt de alto,
// mismo estilo de etiqueta+valor que DATOS DEL CLIENTE, acento dorado VIZA.
// Devuelve el Y inferior dibujado (para encadenar el contenido siguiente).
export interface VendedorPdf {
  nombre: string;
  sucursal?: string;
  telefono?: string;
}

const VENDEDOR_H = 34;

export function drawVendedor(
  doc: jsPDF,
  margin: number,
  y: number,
  contentW: number,
  vendedor: VendedorPdf
): number {
  const h = VENDEDOR_H;
  // Fondo igual al de DATOS DEL CLIENTE + barra de acento dorada (marca VIZA)
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, y, contentW, h, 6, 6, "F");
  doc.setFillColor(...GOLD);
  doc.rect(margin, y + 8, 3, h - 16, "F");

  // Columnas: VENDEDOR (45%) · SUCURSAL (25%) · TELÉFONO (30%).
  // Sucursal y teléfono se omiten si no hay dato (sin "—" innecesarios).
  const cols: [string, string, number][] = [
    ["VENDEDOR", (vendedor.nombre || "—").toUpperCase(), margin + 14],
  ];
  const c2 = margin + contentW * 0.45;
  const c3 = margin + contentW * 0.72;
  if (vendedor.sucursal) cols.push(["SUCURSAL", vendedor.sucursal.toUpperCase(), c2]);
  if (vendedor.telefono) cols.push(["TELÉFONO / WHATSAPP", vendedor.telefono, c3]);
  cols.forEach(([label, value, cx]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(label, cx, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(value, cx, y + 27);
  });
  return y + h;
}

export function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number, w: number) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...BLUE);
  doc.text(text, x, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.2);
  doc.line(x, y + 5, x + w, y + 5);
}

export function drawFooter(doc: jsPDF, pageW: number, pageH: number, margin: number, contentW: number, planType: string) {
  const x = margin; const h = FOOTER_H;
  const y = pageH - FOOTER_BOTTOM_GAP - h;
  const split = contentW * 0.5;
  doc.setFillColor(...GOLD); doc.roundedRect(x, y, contentW, h, 12, 12, "F");
  doc.setFillColor(...BLUE); doc.roundedRect(x, y, split + 14, h, 12, 12, "F");
  doc.setFillColor(...GOLD); doc.rect(x + split, y, 14, h, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(255, 255, 255);
  doc.text("VENTAS ONLINE", x + 18, y + 19);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("WhatsApp: (0987) 700 707", x + 18, y + 34);
  doc.text("ventas.online@viza.com.py", x + 18, y + 47);
  doc.setTextColor(...BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("SEGUINOS", x + split + 18, y + 19);
  doc.text("VISITANOS", x + split + 135, y + 19);
  doc.setFontSize(8);
  doc.text("Facebook · Instagram", x + split + 18, y + 34);
  doc.text("@vizahome", x + split + 18, y + 47);
  doc.text("www.viza.com.py", x + split + 135, y + 34);
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...GREY);
  doc.text(`Viza E.A.S (Viza Home) Presupuesto válido por ${VALIDEZ_DIAS} días desde la fecha de emisión.`, pageW / 2, pageH - 20, { align: "center" });
}

export function formatPYG(amount: number): string {
  return "Gs " + Math.round(amount).toLocaleString("es-PY");
}

export function formatDateEs(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTimeEs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} - ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
