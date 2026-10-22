import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

// === Tipos del payload del Plan CON CHEQUE ===

interface ChequePdfProducto {
  sku: string;
  name: string;
  quantity: number;
  priceContado: number;
  subtotalContado: number;
}

interface ChequeResultado {
  numero: number;
  fecha: string; // ISO date (YYYY-MM-DD)
  valor: number;
}

interface ChequePdfPayload {
  cliente: {
    nombre: string;
    telefono: string;
    observaciones: string;
    fecha: string; // ISO fecha de emisión
  };
  productos: ChequePdfProducto[];
  totalContadoBruto?: number;
  cascoAplicado?: boolean;
  cascoValor?: number;
  cascoDescripcion?: string;
  cronograma?: Array<{
    mes: number;
    fecha: string;
    concepto: string;
    saldoInicial: number;
    pago: number;
    interes: number;
    saldoFinal: number;
  }>;
  totalIntereses?: number;
  totalPlan?: number; // = totalPagar
  saldoFinal?: number;
  cumple50?: boolean;
  cuadra?: boolean;
  faltanPara50?: number;
  tipoPlan?: string; // "CON_CHEQUE"
  resultadosCheques?: ChequeResultado[];
  totalPagar?: number;
}

// === Helpers ===

function formatPYG(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "Gs " + Math.round(v).toLocaleString("es-PY");
}

function formatDateEs(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

function formatDateTimeEs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fecha = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const hora = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${fecha} - ${hora}`;
}

function generarNumeroPresupuesto(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `VZH-CHEQUE-${ymd}-${rnd}`;
}

// =====================================================================
// DIBUJO COMPARTIDO — Estilo editorial VIZA HOME (Profesional)
// =====================================================================
const C_BLUE: [number, number, number] = [21, 87, 137]; // #155789
const C_GOLD: [number, number, number] = [217, 184, 107]; // #D9B86B
const C_DARK_BLUE: [number, number, number] = [13, 61, 94]; // #0d3d5e
const C_INK: [number, number, number] = [28, 25, 23]; // #1c1917
const C_MUTED: [number, number, number] = [120, 113, 108]; // #78716c
const C_ROW_ALT: [number, number, number] = [245, 245, 244]; // #f5f5f4
const C_CREAM: [number, number, number] = [255, 248, 231]; // #fff8e7
const C_BOX_BG: [number, number, number] = [250, 250, 249]; // #fafaf9
const C_BORDER: [number, number, number] = [214, 211, 209]; // #d6d3d1
const C_GREEN: [number, number, number] = [40, 167, 69]; // verde
const C_RED: [number, number, number] = [220, 53, 69]; // rojo

// Dibuja el header VIZA HOME (logo + slogan + título derecho)
function drawVizaHeader(doc: jsPDF, pageW: number, margin: number, subtitulo: string) {
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, pageW, 124, "F");

  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pageW, 4, "F");

  const waveY = 120;
  const triCount = 16;
  const triW = pageW / triCount;
  for (let i = 0; i < triCount; i++) {
    const x0 = i * triW;
    if (i % 2 === 0) {
      doc.setFillColor(...C_BLUE);
      doc.triangle(x0, waveY, x0 + triW / 2, waveY + 8, x0 + triW, waveY, "F");
    } else {
      doc.setFillColor(...C_GOLD);
      doc.triangle(x0, waveY, x0 + triW / 2, waveY + 6, x0 + triW, waveY, "F");
    }
  }

  const gridX = margin;
  const gridY = 32;
  const sqSize = 11;
  const sqGap = 3;
  doc.setFillColor(...C_GOLD);
  doc.rect(gridX, gridY, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY, sqSize, sqSize, "F");
  doc.rect(gridX, gridY + sqSize + sqGap, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY + sqSize + sqGap, sqSize, sqSize, "F");

  const txtX = gridX + sqSize * 2 + sqGap + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  const vizaTxt = "VIZA";
  doc.text(vizaTxt, txtX, 56);
  const vizaW = doc.getTextWidth(vizaTxt);
  doc.setTextColor(...C_GOLD);
  doc.text(" home", txtX + vizaW, 56);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...C_GOLD);
  doc.text("Todo para tu hogar, en un solo lugar.", txtX, 72);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_GOLD);
  doc.text("PRESUPUESTO", pageW - margin, 56, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(subtitulo, pageW - margin, 74, { align: "right" });
}

// Dibuja el bloque de metadata (número + fecha de emisión) estilo editorial
function drawMetaBox(
  doc: jsPDF,
  margin: number,
  contentW: number,
  yStart: number,
  numeroPresupuesto: string,
  fechaEmision: string
): number {
  const boxH = 42;
  doc.setFillColor(...C_BOX_BG);
  doc.roundedRect(margin, yStart, contentW, boxH, 6, 6, "F");
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(1);
  doc.roundedRect(margin, yStart, contentW, boxH, 6, 6, "D");
  doc.setFillColor(...C_GOLD);
  doc.rect(margin, yStart, 4, boxH, "F");

  const colGap = contentW / 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text("N° PRESUPUESTO", margin + 14, yStart + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C_INK);
  doc.text(numeroPresupuesto, margin + 14, yStart + 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text("FECHA DE EMISIÓN", margin + colGap + 14, yStart + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C_INK);
  doc.text(fechaEmision, margin + colGap + 14, yStart + 32);

  return yStart + boxH;
}

// Dibuja título de sección con subrayado dorado estilo editorial
function drawSectionTitle(
  doc: jsPDF,
  margin: number,
  contentW: number,
  y: number,
  texto: string,
  size: number = 12
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...C_INK);
  doc.text(texto, margin, y);
  const txtW = doc.getTextWidth(texto);
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(2);
  doc.line(margin, y + 4, margin + Math.min(txtW + 30, contentW), y + 4);
  return y;
}

// Dibuja el bloque TOTAL destacado (estilo editorial: cream + borde dorado)
function drawTotalBlock(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  etiqueta: string,
  valor: number
): number {
  const boxW = 280;
  const boxX = pageW - margin - boxW;
  const boxH = 50;

  doc.setFillColor(...C_CREAM);
  doc.roundedRect(boxX, y, boxW, boxH, 6, 6, "F");
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(2);
  doc.roundedRect(boxX, y, boxW, boxH, 6, 6, "D");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text(etiqueta, boxX + 16, y + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text(formatPYG(valor), boxX + boxW - 16, y + 26, { align: "right" });

  return y + boxH;
}

// Dibuja el footer VIZA HOME (banda azul + contacto + validez + agradecimiento)
function drawVizaFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  textoLegal: string
) {
  const footerH = 78;
  const footerY = pageH - footerH;

  doc.setFillColor(...C_BLUE);
  doc.rect(0, footerY, pageW, footerH, "F");

  doc.setFillColor(...C_GOLD);
  doc.rect(0, footerY, pageW, 3, "F");

  const fGridX = margin;
  const fGridY = footerY + 14;
  const fSqSize = 6;
  const fSqGap = 1.5;
  doc.setFillColor(...C_GOLD);
  doc.rect(fGridX, fGridY, fSqSize, fSqSize, "F");
  doc.rect(fGridX + fSqSize + fSqGap, fGridY, fSqSize, fSqSize, "F");
  doc.rect(fGridX, fGridY + fSqSize + fSqGap, fSqSize, fSqSize, "F");
  doc.rect(fGridX + fSqSize + fSqGap, fGridY + fSqSize + fSqGap, fSqSize, fSqSize, "F");

  const fTxtX = fGridX + fSqSize * 2 + fSqGap + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const fViza = "VIZA";
  doc.text(fViza, fTxtX, footerY + 22);
  const fVizaW = doc.getTextWidth(fViza);
  doc.setTextColor(...C_GOLD);
  doc.text(" home", fTxtX + fVizaW, footerY + 22);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...C_GOLD);
  doc.text("Todo para tu hogar, en un solo lugar.", fTxtX, footerY + 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("Tel: (0987) 700 707", fTxtX, footerY + 44);
  doc.text("Email: ventas.online@viza.com.py", fTxtX, footerY + 54);
  doc.text("Web: www.viza.com.py   ·   Redes: @vizahome", fTxtX, footerY + 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(220, 220, 220);
  doc.text(textoLegal, pageW - margin, footerY + 14, { align: "right" });
  doc.text("Presupuesto válido por 10 días desde la fecha de emisión.", pageW - margin, footerY + 26, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C_GOLD);
  doc.text("¡Gracias por elegirnos!", pageW - margin, footerY + 42, { align: "right" });

  const totalPages = doc.getNumberOfPages();
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(220, 220, 220);
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, footerY + 64, { align: "right" });
    }
  }
}

// POST /api/quotes/cheque-pdf - genera PDF del presupuesto CON CHEQUE (estilo editorial VIZA HOME)
// REGLA: NO mostrar columna SUBTOTAL ni bloque "Subtotal productos".
// Solo mostrar: #, SKU, PRODUCTO, CANT. (igual que en safra-pdf).
export async function POST(req: NextRequest) {
  try {
    const body: ChequePdfPayload = await req.json();

    if (!body.productos || body.productos.length === 0) {
      return NextResponse.json(
        { error: "El presupuesto CON CHEQUE no tiene productos" },
        { status: 400 }
      );
    }

    const cheques = body.resultadosCheques || [];
    if (cheques.length === 0) {
      return NextResponse.json(
        { error: "No hay cheques calculados. Generá los cheques primero." },
        { status: 400 }
      );
    }

    // Validación de casco
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF CON CHEQUE. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco.",
        },
        { status: 400 }
      );
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentW = pageW - margin * 2;

    let y = 0;

    // ===== HEADER EDITORIAL =====
    drawVizaHeader(doc, pageW, margin, "PLAN CON CHEQUE");

    // ===== BLOQUE N° PRESUPUESTO + FECHA =====
    y = 150;
    y = drawMetaBox(
      doc,
      margin,
      contentW,
      y,
      generarNumeroPresupuesto(),
      formatDateTimeEs(new Date())
    );

    // ===== DATOS DEL CLIENTE =====
    y += 24;
    drawSectionTitle(doc, margin, contentW, y, "DATOS DEL CLIENTE");
    y += 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C_INK);
    doc.text(body.cliente?.nombre || "—", margin, y);
    y += 16;

    if (body.cliente && body.cliente.telefono) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      doc.text(`Teléfono/WhatsApp: ${body.cliente.telefono}`, margin, y);
      y += 12;
    }

    // ===== TABLA DE PRODUCTOS (SIN SUBTOTAL) =====
    // REGLA: Solo mostrar #, SKU, PRODUCTO, CANT.
    y += 18;

    const ensureSpace = (min: number) => {
      if (y > pageH - min) {
        doc.addPage();
        y = 60;
      }
    };

    ensureSpace(180);

    drawSectionTitle(doc, margin, contentW, y, "PRODUCTOS DE LA COTIZACIÓN");
    y += 22;

    // Columnas redimensionadas: # (5%), SKU (15%), PRODUCTO (60%), CANT. (20%)
    const colN = 25;
    const colSku = 70;
    const colCant = 60;
    const colName = contentW - colN - colSku - colCant;

    // Header de la tabla (azul corporativo, blanco, bold)
    doc.setFillColor(...C_BLUE);
    doc.rect(margin, y, contentW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let xx = margin + 8;
    doc.text("#", xx, y + 17);
    xx += colN;
    doc.text("SKU", xx, y + 17);
    xx += colSku;
    doc.text("PRODUCTO", xx, y + 17);
    xx += colName;
    doc.text("CANT.", xx, y + 17);
    y += 26;

    // Filas de productos - alternando blanco / gris claro, SIN SUBTOTAL
    doc.setFont("helvetica", "normal");
    body.productos.forEach((it, idx) => {
      ensureSpace(60);
      const rowH = 26;

      if (idx % 2 === 0) {
        doc.setFillColor(...C_ROW_ALT);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let xxx = margin + 8;
      doc.setTextColor(...C_MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(idx + 1), xxx, y + 17);
      xxx += colN;
      doc.text(it.sku || "—", xxx, y + 17);

      xxx += colSku;
      doc.setTextColor(...C_INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(it.name || "", colName - 8);
      doc.text(nameLines.slice(0, 2), xxx, y + 17);

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_INK);
      doc.text(String(it.quantity || 1), xxx, y + 17);

      y += rowH;
    });

    y += 14;

    // ===== DESCUENTO POR CASCO (si aplica) =====
    const descCasco = body.cascoAplicado && body.cascoValor ? body.cascoValor : 0;

    if (descCasco > 0) {
      ensureSpace(80);

      const cascoBoxH = 60;
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, y, contentW, cascoBoxH, 6, 6, "F");
      doc.setDrawColor(...C_GREEN);
      doc.setLineWidth(2);
      doc.roundedRect(margin, y, contentW, cascoBoxH, 6, 6, "D");
      // Pequeño acento verde a la izquierda
      doc.setFillColor(...C_GREEN);
      doc.rect(margin, y, 4, cascoBoxH, "F");

      doc.setTextColor(20, 100, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DESCUENTO POR CASCO", margin + 14, y + 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      doc.text(`Producto: ${body.cascoDescripcion || "Casco"}`, margin + 14, y + 38);
      doc.setTextColor(...C_RED);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("-" + formatPYG(descCasco), pageW - margin - 14, y + 36, { align: "right" });

      y += cascoBoxH + 18;
    }

    // ===== TABLA DE CHEQUES =====
    ensureSpace(150);

    drawSectionTitle(doc, margin, contentW, y, "CRONOGRAMA DE CHEQUES", 13);
    y += 22;

    // Columnas: N° CHEQUE | FECHA DE VENCIMIENTO | VALOR DEL CHEQUE
    const chequeColN = 140;
    const chequeColFecha = 200;
    const chequeColValor = contentW - chequeColN - chequeColFecha;

    // Header tabla (azul corporativo, blanco, bold)
    doc.setFillColor(...C_BLUE);
    doc.rect(margin, y, contentW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    let cc = margin + 8;
    doc.text("N° CHEQUE", cc, y + 17);
    cc += chequeColN;
    doc.text("FECHA DE VENCIMIENTO", cc, y + 17);
    cc += chequeColFecha;
    doc.text("VALOR DEL CHEQUE", cc + chequeColValor - 8, y + 17, { align: "right" });
    y += 26;

    // Filas de cheques
    doc.setFontSize(10);
    cheques.forEach((c, idx) => {
      ensureSpace(40);
      const rowH = 26;

      if (idx % 2 === 0) {
        doc.setFillColor(...C_ROW_ALT);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let pp = margin + 8;
      doc.setTextColor(...C_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Cheque ${c.numero}`, pp, y + 17);

      pp += chequeColN;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_MUTED);
      doc.setFontSize(10);
      doc.text(formatDateEs(c.fecha), pp, y + 17);

      pp += chequeColFecha;
      doc.setTextColor(...C_DARK_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(formatPYG(c.valor), pp + chequeColValor - 8, y + 17, { align: "right" });

      y += rowH;
    });

    // ===== TOTAL A PAGAR =====
    y += 14;
    ensureSpace(70);
    const totalFinal = body.totalPagar || body.totalPlan || 0;
    y = drawTotalBlock(doc, pageW, margin, y, "TOTAL A PAGAR", totalFinal);
    y += 20;

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones && body.cliente.observaciones.trim()) {
      ensureSpace(80);
      y += 14;
      drawSectionTitle(doc, margin, contentW, y, "OBSERVACIONES");
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      const obsLines = doc.splitTextToSize(body.cliente.observaciones, contentW - 20);
      doc.text(obsLines, margin, y);
      y += obsLines.length * 12;
    }

    // ===== FOOTER EDITORIAL =====
    drawVizaFooter(
      doc,
      pageW,
      pageH,
      margin,
      "VIZA HOME E.A.S · Plan Con Cheque"
    );

    // Devolver PDF
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="VIZA-Presupuesto-Cheque.pdf"',
      },
    });
  } catch (error: any) {
    console.error("Error generando PDF CON CHEQUE:", error);
    return NextResponse.json(
      { error: "Error al generar el PDF: " + (error?.message || "desconocido") },
      { status: 500 }
    );
  }
}
