import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

// === Tipos del payload del Plan Safra ===

interface SafraPdfProducto {
  sku: string;
  name: string;
  quantity: number;
  priceContado: number;
  subtotalContado: number;
}

interface SafraPdfRefuerzo {
  fecha: string; // ISO date
  valor: number;
}

interface SafraPdfPayload {
  cliente: {
    nombre: string;
    telefono: string;
    observaciones: string;
    fecha: string; // ISO fecha de emisión
  };
  productos: SafraPdfProducto[];
  totalContado: number;
  margenPlan: number; // %
  totalPlan: number;
  fechaEntrega: string; // ISO date
  valorEntrega: number;
  pctEntrega: number;
  numRefuerzos: number;
  refuerzos: SafraPdfRefuerzo[];
  fechaFinal: string; // ISO date
  valorFinal: number;
  totalDistribuido: number;
  // === DESCUENTO POR CASCO (regalo obligatorio de VIZA Home) ===
  cascoAplicado?: boolean;
  cascoValor?: number;
  cascoDescripcion?: string;
  totalContadoBruto?: number; // bruto (sin casco) - para mostrar en PDF
  // Cronograma mes a mes con intereses calculados sobre saldo restante
  cronograma?: Array<{
    mes: number;
    fecha: string;
    concepto: string;
    saldoInicial: number;
    pago: number;
    interes: number;
    saldoFinal: number;
  }>;
  // Totales calculados en tiempo real
  totalIntereses?: number;
  totalPagado6Meses?: number;
  cumple50?: boolean;
  cuadra?: boolean;
  faltanPara50?: number;
}

function formatPYG(amount: number): string {
  const rounded = Math.round(amount);
  return "Gs " + rounded.toLocaleString("es-PY");
}

function formatDateEs(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Formatea fecha Y hora en formato DD/MM/AAAA - HH:MM:SS (hora local del servidor)
function formatDateTimeEs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fecha = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const hora = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${fecha} - ${hora}`;
}

function generateQuoteNumber(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `VZH-SAFRA-${ymd}-${rnd}`;
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
const C_ROW_SIN: [number, number, number] = [255, 251, 235]; // #fffbeb
const C_ROW_ENT: [number, number, number] = [240, 253, 244]; // #f0fdf4
const C_CREAM: [number, number, number] = [255, 248, 231]; // #fff8e7
const C_BOX_BG: [number, number, number] = [250, 250, 249]; // #fafaf9
const C_BORDER: [number, number, number] = [214, 211, 209]; // #d6d3d1
const C_BADGE_ENT: [number, number, number] = [40, 167, 69]; // verde
const C_BADGE_SIN: [number, number, number] = [255, 193, 7]; // dorado fuerte
const C_HIGHLIGHT: [number, number, number] = [254, 243, 199]; // #fef3c7

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
  _contentW: number,
  y: number,
  etiqueta: string,
  valor: number,
  etiquetaSecundaria?: string,
  valorSecundario?: number
): number {
  const boxW = 320;
  const boxX = pageW - margin - boxW;
  const boxH = etiquetaSecundaria && valorSecundario !== undefined ? 78 : 50;

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

  if (etiquetaSecundaria && valorSecundario !== undefined) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text(etiquetaSecundaria, boxX + 16, y + 54);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C_INK);
    doc.text(formatPYG(valorSecundario), boxX + boxW - 16, y + 58, { align: "right" });
  }

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

// POST /api/quotes/safra-pdf - genera PDF del presupuesto SAFRA (estilo editorial VIZA HOME)
export async function POST(req: NextRequest) {
  try {
    const body: SafraPdfPayload = await req.json();

    if (!body.productos || body.productos.length === 0) {
      return NextResponse.json(
        { error: "El presupuesto Safra no tiene productos" },
        { status: 400 }
      );
    }

    // === BLOQUEO DE SEGURIDAD: EL CASCO ES UN REGALO OBLIGATORIO ===
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF Safra. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco. Complete el valor del descuento o desmarque el casco.",
        },
        { status: 400 }
      );
    }
    if (
      body.cascoAplicado &&
      body.cascoValor &&
      body.cascoValor > (body.totalContadoBruto || 0)
    ) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: El valor del descuento por casco no puede ser mayor al total de productos.",
        },
        { status: 400 }
      );
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42; // 15mm
    const contentW = pageW - margin * 2;

    let y = 0;

    // ===== HEADER EDITORIAL =====
    drawVizaHeader(doc, pageW, margin, "PLAN SAFRA");

    // ===== BLOQUE N° PRESUPUESTO + FECHA =====
    y = 150;
    // La fecha de emisión usa la fecha Y hora del momento de generación del PDF
    // (no la fecha de creación del presupuesto).
    y = drawMetaBox(
      doc,
      margin,
      contentW,
      y,
      generateQuoteNumber(),
      formatDateTimeEs(new Date())
    );

    // ===== DATOS DEL CLIENTE (si hay) =====
    y += 24;
    if (body.cliente && body.cliente.nombre) {
      drawSectionTitle(doc, margin, contentW, y, "CLIENTE");
      y += 22;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...C_INK);
      doc.text(body.cliente.nombre, margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);

      if (body.cliente.telefono) {
        doc.text(`Teléfono/WhatsApp: ${body.cliente.telefono}`, margin, y);
        y += 12;
      }
    }

    // ===== TABLA DE PRODUCTOS =====
    y += 18;

    const ensureSpace = (min: number) => {
      if (y > pageH - min) {
        doc.addPage();
        y = 60;
      }
    };

    ensureSpace(180);

    drawSectionTitle(doc, margin, contentW, y, "PRODUCTOS DEL PLAN");
    y += 22;

    // REGLA DE NEGOCIO v4.0: NO mostrar P. CONTADO ni SUBTOTAL en Plan Safra.
    // El cliente solo ve qué productos lleva y la cantidad. Los valores
    // se muestran únicamente en el cronograma de pagos.
    const colN = 30;
    const colSku = 90;
    const colCant = 60;
    const colName = contentW - colN - colSku - colCant;

    // Header tabla (azul corporativo, blanco, bold)
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

    // Filas productos - alternando blanco / gris muy claro
    doc.setFontSize(9);
    body.productos.forEach((it, idx) => {
      ensureSpace(60);
      const rowH = 30;

      if (idx % 2 === 0) {
        doc.setFillColor(...C_ROW_ALT);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let xxx = margin + 8;
      doc.setTextColor(...C_MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(idx + 1), xxx, y + 18);
      xxx += colN;
      doc.text(it.sku, xxx, y + 18);

      xxx += colSku;
      doc.setTextColor(...C_INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(it.name, colName - 8);
      doc.text(nameLines.slice(0, 2), xxx, y + 18);

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_INK);
      doc.text(String(it.quantity), xxx, y + 18);

      y += rowH;
    });

    // REGLA DE NEGOCIO v4.0: NO mostrar "Total al contado" ni "Total plan (+margen)".
    // El total se muestra al final del cronograma como "TOTAL DEL PLAN SAFRA".
    y += 14;

    // ===== CRONOGRAMA DE PAGOS SAFRA =====
    ensureSpace(180);

    drawSectionTitle(doc, margin, contentW, y, "CRONOGRAMA DE PAGOS ESCALONADOS", 13);
    y += 22;

    // Tabla de cronograma
    const cColN = 30;
    const cColConcepto = 220;
    const cColFecha = 130;
    const cColValor = contentW - cColN - cColConcepto - cColFecha;

    // Header (azul corporativo, blanco, bold)
    doc.setFillColor(...C_BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let cc = margin + 8;
    doc.text("#", cc, y + 16);
    cc += cColN;
    doc.text("CONCEPTO", cc, y + 16);
    cc += cColConcepto;
    doc.text("FECHA DE PAGO", cc, y + 16);
    cc += cColFecha;
    doc.text("VALOR", cc + cColValor - 8, y + 16, { align: "right" });

    y += 24;

    let rowIdx = 0;

    const drawCronoRow = (
      concepto: string,
      fecha: string,
      valor: number,
      destacado: boolean
    ) => {
      ensureSpace(30);
      const rowH = 26;
      if (rowIdx % 2 === 0) {
        doc.setFillColor(...C_ROW_ALT);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      // Destacado dorado para entrada y pago final
      if (destacado) {
        doc.setFillColor(...C_HIGHLIGHT);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let pp = margin + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C_GOLD);
      doc.text(String(rowIdx + 1), pp, y + 17);

      pp += cColN;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...C_INK);
      doc.text(concepto, pp, y + 17);

      pp += cColConcepto;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_MUTED);
      doc.text(formatDateEs(fecha), pp, y + 17);

      pp += cColFecha;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C_DARK_BLUE);
      doc.text(formatPYG(valor), pp + cColValor - 8, y + 17, { align: "right" });

      y += rowH;
      rowIdx += 1;
    };

    // Entrada inicial (destacada)
    const entradaValor: number = (body as any).entradaValor || body.valorEntrega || 0;
    drawCronoRow(
      "ENTRADA INICIAL",
      body.cliente?.fecha || body.fechaEntrega || "",
      entradaValor,
      true
    );

    // Refuerzos
    const refuerzos = body.refuerzos || [];
    const n = refuerzos.length;
    for (let i = 0; i < n; i++) {
      const r = refuerzos[i] || { fecha: "", valor: 0 };
      drawCronoRow(
        `REFUERZO ${i + 1}`,
        r.fecha || "",
        r.valor || 0,
        false
      );
    }

    // Pago final (si existe)
    if (body.fechaFinal && body.valorFinal && body.valorFinal > 0) {
      drawCronoRow(
        "PAGO FINAL",
        body.fechaFinal,
        body.valorFinal,
        true
      );
    }

    // ===== RESUMEN TOTAL =====
    ensureSpace(110);
    y += 14;

    const cuadra = body.totalDistribuido === body.totalPlan;
    y = drawTotalBlock(
      doc,
      pageW,
      margin,
      contentW,
      y,
      "TOTAL DEL PLAN SAFRA",
      body.totalPlan,
      "Total distribuido:",
      body.totalDistribuido
    );

    // Indicador de cuadre (debajo del bloque)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (cuadra) {
      doc.setTextColor(40, 167, 69);
      doc.text("CUADRA", pageW - margin - 14, y + 14, { align: "right" });
    } else {
      doc.setTextColor(220, 53, 69);
      doc.text(
        `Diferencia: ${formatPYG(body.totalPlan - body.totalDistribuido)}`,
        pageW - margin - 14,
        y + 14,
        { align: "right" }
      );
    }
    y += 22;

    // ===== OBSERVACIONES =====
    if (
      body.cliente &&
      body.cliente.observaciones &&
      body.cliente.observaciones.trim()
    ) {
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
      "VIZA HOME E.A.S · Plan Safra de pagos escalonados"
    );

    // Generar buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VIZA-Presupuesto-Safra.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF Safra:", error);
    return NextResponse.json(
      { error: "Error al generar el PDF Safra" },
      { status: 500 }
    );
  }
}
