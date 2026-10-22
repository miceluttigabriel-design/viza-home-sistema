import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

interface PdfItem {
  sku: string;
  name: string;
  quantity: number;
  priceContado: number;
  subtotalContado: number;
}

interface PdfPlan {
  letra: string;
  cuotas: number;
  valorPorCuota: number;
  total: number;
}

interface PdfPlanSinEntrega {
  letra: string;
  cuotas: number;
  valorPorCuota: number;
  total: number;
  fechas: string[];
}

type TipoEntregaPdf = "con_entrega" | "sin_entrega";

interface PdfPayload {
  cliente: {
    nombre: string;
    telefono: string;
    documento: string;
    observaciones: string;
    fecha: string;
  };
  items: PdfItem[];
  contadoOriginal: number;
  contadoMarginPct: number;
  contadoAjustado: number;
  cascoAplicado?: boolean;
  cascoValor?: number;
  cascoDescripcion?: string;
  baseCalculo?: number;
  incluirContadoEnPresupuesto?: boolean;
  incluirPrecioContado?: boolean; // Legacy - ahora SIEMPRE se muestran los precios
  tipoEntrega?: TipoEntregaPdf;
  fechaInicioPago?: string;
  diasDiferidos?: number | null;
  margenAplicado?: number | null;
  mostrarConEntrega?: boolean;
  mostrarSinEntrega?: boolean;
  planes: PdfPlan[];
  planesSinEntrega?: PdfPlanSinEntrega[] | null;
}

function formatPYG(amount: number): string {
  const rounded = Math.round(amount);
  return "Gs " + rounded.toLocaleString("es-PY");
}

function formatDateEs(date: Date): string {
  return date.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateEsSafe(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return "-";
  const [año, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${año}`;
}

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
  return `VZH-${ymd}-${rnd}`;
}

// =====================================================================
// PALETA CORPORATIVA VIZA HOME - Replica exacta de la referencia
// =====================================================================
const C_BLUE: [number, number, number] = [21, 87, 137]; // #155789 (header tablas + footer)
const C_DARK_BLUE: [number, number, number] = [13, 74, 122]; // #0D4A7A (logo VIZA + precios - azul corporativo)
const C_GOLD: [number, number, number] = [217, 184, 107]; // #D9B86B (acento dorado)
const C_INK: [number, number, number] = [40, 40, 40]; // #282828 (texto principal)
const C_MUTED: [number, number, number] = [102, 102, 102]; // #666 (slogan + textos secundarios)
const C_LIGHT_BG: [number, number, number] = [240, 244, 248]; // #F0F4F8 (metadata)
const C_CREAM: [number, number, number] = [255, 248, 231]; // #FFF8E7 (total contado)
const C_BORDER_LIGHT: [number, number, number] = [224, 224, 224]; // #E0E0E0 (bordes sutiles)
const C_ROW_ALT: [number, number, number] = [232, 236, 242]; // #E8ECF2 (zebra visible)
const C_WHITE: [number, number, number] = [255, 255, 255]; // #FFFFFF

// ===== HEADER ESTILO REFERENCIA: fondo blanco + logo azul + línea dorada inferior =====
function drawVizaHeader(doc: jsPDF, pageW: number, margin: number, subtitulo: string) {
  // Fondo BLANCO (sin relleno azul). El blanco es el default de la página.

  // Ícono de grilla (2x2 cuadrados dorados) - reemplaza la "A" de VIZA
  const gridX = margin;
  const gridY = 28;
  const sqSize = 12;
  const sqGap = 3;
  doc.setFillColor(...C_GOLD);
  doc.rect(gridX, gridY, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY, sqSize, sqSize, "F");
  doc.rect(gridX, gridY + sqSize + sqGap, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY + sqSize + sqGap, sqSize, sqSize, "F");

  // Texto "VIZA" azul oscuro + " home" dorado
  const txtX = gridX + sqSize * 2 + sqGap + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...C_DARK_BLUE);
  const vizaTxt = "VIZA";
  doc.text(vizaTxt, txtX, 56);
  const vizaW = doc.getTextWidth(vizaTxt);
  doc.setTextColor(...C_GOLD);
  doc.text(" home", txtX + vizaW, 56);

  // Slogan en gris medio, debajo del logo
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...C_MUTED);
  doc.text("Todo para tu hogar, en un solo lugar.", txtX, 72);

  // Título "PRESUPUESTO" + subtitulo alineado a la derecha (azul oscuro)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text("PRESUPUESTO", pageW - margin, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text(subtitulo, pageW - margin, 70, { align: "right" });

  // Línea dorada inferior que atraviesa todo el ancho
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(2);
  doc.line(0, 86, pageW, 86);
}

// ===== METADATA BOX: fondo gris claro, SIN borde visible, dos columnas =====
function drawMetaBox(
  doc: jsPDF,
  margin: number,
  contentW: number,
  yStart: number,
  numeroPresupuesto: string,
  fechaEmision: string
): number {
  const boxH = 38;

  // Fondo gris azulado claro (sin borde visible)
  doc.setFillColor(...C_LIGHT_BG);
  doc.rect(margin, yStart, contentW, boxH, "F");

  const colGap = contentW / 2;

  // Columna izquierda: N° PRESUPUESTO
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text("N° PRESUPUESTO", margin + 14, yStart + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_INK);
  doc.text(numeroPresupuesto, margin + 14, yStart + 30);

  // Columna derecha: FECHA DE EMISIÓN
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text("FECHA DE EMISIÓN", margin + colGap + 14, yStart + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_INK);
  doc.text(fechaEmision, margin + colGap + 14, yStart + 30);

  return yStart + boxH;
}

// ===== TÍTULO DE SECCIÓN: solo texto azul oscuro, SIN subrayado =====
function drawSectionTitle(
  doc: jsPDF,
  margin: number,
  _contentW: number,
  y: number,
  texto: string,
  size: number = 12
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text(texto, margin, y);
  return y;
}

// ===== BLOQUE TOTAL CONTADO: crema + borde RECTO dorado 2px =====
function drawTotalBlock(
  doc: jsPDF,
  pageW: number,
  margin: number,
  contentW: number,
  y: number,
  etiqueta: string,
  valor: number,
  etiquetaSecundaria?: string,
  valorSecundario?: number
): number {
  const boxW = 300;
  const boxX = pageW - margin - boxW;
  const boxH = etiquetaSecundaria && valorSecundario !== undefined ? 70 : 50;

  // Fondo crema pálido
  doc.setFillColor(...C_CREAM);
  doc.rect(boxX, y, boxW, boxH, "F");
  // Borde dorado RECTO (no redondeado) - 2px
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(2);
  doc.rect(boxX, y, boxW, boxH, "D");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_INK);
  doc.text(etiqueta, boxX + 16, y + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_DARK_BLUE);
  doc.text(formatPYG(valor), boxX + boxW - 16, y + 26, { align: "right" });

  if (etiquetaSecundaria && valorSecundario !== undefined) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text(etiquetaSecundaria, boxX + 16, y + 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C_DARK_BLUE);
    doc.text(formatPYG(valorSecundario), boxX + boxW - 16, y + 54, { align: "right" });
  }

  return y + boxH;
}

// ===== FOOTER: azul + banda dorada superior + "¡Gracias!" dorado =====
function drawVizaFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  textoLegal: string
) {
  const footerH = 78;
  const footerY = pageH - footerH;

  // Fondo azul corporativo
  doc.setFillColor(...C_BLUE);
  doc.rect(0, footerY, pageW, footerH, "F");

  // Banda dorada superior del footer (3-4px)
  doc.setFillColor(...C_GOLD);
  doc.rect(0, footerY, pageW, 3.5, "F");

  // Mini logo VIZA home (texto, sin grilla decorativa)
  const fTxtX = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const fViza = "VIZA";
  doc.text(fViza, fTxtX, footerY + 22);
  const fVizaW = doc.getTextWidth(fViza);
  doc.setTextColor(...C_GOLD);
  doc.text(" home", fTxtX + fVizaW, footerY + 22);

  // Slogan en blanco/gris claro
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(204, 204, 204);
  doc.text("Todo para tu hogar, en un solo lugar.", fTxtX, footerY + 34);

  // Información de contacto (texto plano)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(238, 238, 238);
  doc.text("Tel: (0987) 700 707", fTxtX, footerY + 46);
  doc.text("Email: ventas.online@viza.com.py", fTxtX, footerY + 56);
  doc.text("Web: www.viza.com.py   ·   Redes: @vizahome", fTxtX, footerY + 66);

  // Texto legal + validez + agradecimiento (a la derecha)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(204, 204, 204);
  doc.text(textoLegal, pageW - margin, footerY + 14, { align: "right" });
  doc.text("Presupuesto válido por 10 días desde la fecha de emisión.", pageW - margin, footerY + 26, { align: "right" });

  // "¡Gracias por elegirnos!" en DORADO bold (no blanco)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_GOLD);
  doc.text("¡Gracias por elegirnos!", pageW - margin, footerY + 44, { align: "right" });

  const totalPages = doc.getNumberOfPages();
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(204, 204, 204);
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, footerY + 66, { align: "right" });
    }
  }
}

// POST /api/quotes/pdf - genera PDF del presupuesto profesional (estilo referencia VIZA HOME)
// REGLA v6.0: Réplica exacta del diseño de referencia - estilo LIMPIO y MINIMALISTA
// - Header fondo BLANCO + logo azul + línea dorada inferior
// - Metadata SIN borde, fondo gris claro
// - Títulos SIN subrayado
// - Tabla productos filas TODAS blancas (sin zebra)
// - Bloque TOTAL CONTADO con borde RECTO (no redondeado)
// - Tabla financiación modalidades TEXTO PLANO (no badges), línea dorada separa grupos
// - SIEMPRE muestra P. CONTADO, SUBTOTAL y bloque TOTAL CONTADO
export async function POST(req: NextRequest) {
  try {
    const body: PdfPayload = await req.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: "El presupuesto no tiene productos" }, { status: 400 });
    }

    // === BLOQUEO DE SEGURIDAD: EL CASCO ES UN REGALO OBLIGATORIO ===
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco.",
        },
        { status: 400 }
      );
    }
    if (body.cascoAplicado && body.cascoValor && body.cascoValor > (body.contadoOriginal || 0)) {
      return NextResponse.json(
        { error: "BLOQUEO DE SEGURIDAD: El valor del descuento por casco no puede ser mayor al total de productos." },
        { status: 400 }
      );
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42; // 15mm
    const contentW = pageW - margin * 2;

    let y = 0;

    // ===== HEADER (fondo blanco + logo azul + línea dorada) =====
    drawVizaHeader(doc, pageW, margin, "DE VENTA");

    // ===== METADATA (caja gris, sin borde) =====
    y = 100;
    y = drawMetaBox(
      doc,
      margin,
      contentW,
      y,
      generateQuoteNumber(),
      formatDateTimeEs(new Date())
    );

    // ===== TABLA DE PRODUCTOS =====
    y += 30;

    const ensureSpace = (min: number) => {
      if (y > pageH - min) {
        doc.addPage();
        y = 60;
      }
    };

    ensureSpace(180);

    // Título de sección SIN subrayado
    drawSectionTitle(doc, margin, contentW, y, "PRODUCTOS DE LA COTIZACIÓN");
    y += 18;

    // 6 COLUMNAS (siempre): #, SKU, PRODUCTO, CANT., P. CONTADO, SUBTOTAL
    const colN = 25;
    const colSku = 70;
    const colCant = 45;
    const colPU = 105;
    const colSub = 105;
    const colName = contentW - colN - colSku - colCant - colPU - colSub;

    // Header tabla (fondo azul, texto blanco, bold)
    doc.setFillColor(...C_BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let xx = margin + 8;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("SKU", xx, y + 16);
    xx += colSku;
    doc.text("PRODUCTO", xx, y + 16);
    xx += colName;
    doc.text("CANT.", xx, y + 16);
    xx += colCant;
    doc.text("P. CONTADO", xx, y + 16);
    xx += colPU;
    doc.text("SUBTOTAL", xx + colSub - 8, y + 16, { align: "right" });

    y += 24;

    // Filas productos - con zebra sutil (alternando blanco y gris muy claro)
    doc.setFontSize(9);
    body.items.forEach((it, idx) => {
      ensureSpace(60);
      const rowH = 28;

      // Zebra: filas pares con fondo gris muy claro, impares blancas
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

      // SIEMPRE mostrar P. CONTADO y SUBTOTAL
      xxx += colCant;
      doc.setTextColor(...C_INK);
      doc.text(formatPYG(it.priceContado), xxx, y + 18);
      xxx += colPU;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C_DARK_BLUE);
      doc.text(formatPYG(it.subtotalContado), xxx + colSub - 8, y + 18, { align: "right" });

      y += rowH;
    });

    // ===== BLOQUE TOTAL CONTADO (siempre visible, borde RECTO) =====
    ensureSpace(90);
    y += 14;
    const mostrarAjustado =
      body.contadoMarginPct > 0 && body.contadoAjustado !== body.contadoOriginal;
    y = drawTotalBlock(
      doc,
      pageW,
      margin,
      contentW,
      y,
      "TOTAL CONTADO",
      body.contadoOriginal,
      mostrarAjustado ? "PRECIO FINAL CONTADO:" : undefined,
      mostrarAjustado ? body.contadoAjustado : undefined
    );
    y += 20;

    // ===== OPCIONES DE FINANCIACIÓN =====
    ensureSpace(120);

    drawSectionTitle(doc, margin, contentW, y, "OPCIONES DE FINANCIACIÓN");
    y += 18;

    // 5 COLUMNAS: PLAN | MODALIDAD | CUOTAS | VALOR POR CUOTA | TOTAL DEL PLAN
    const pColBadge = 40;       // PLAN (letra)
    const pColModalidad = 100;  // MODALIDAD (texto plano)
    const pColCuotas = 170;     // CUOTAS (texto)
    const pColValor = 130;      // VALOR POR CUOTA
    const pColTotal = contentW - pColBadge - pColModalidad - pColCuotas - pColValor;

    const hayPlanesConEntrega = body.mostrarConEntrega !== false && body.planes && body.planes.length > 0;
    const hayPlanesSinEntrega = body.mostrarSinEntrega !== false && body.planesSinEntrega && body.planesSinEntrega.length > 0;

    if (!hayPlanesConEntrega && !hayPlanesSinEntrega) {
      ensureSpace(50);
      doc.setFillColor(...C_LIGHT_BG);
      doc.rect(margin, y, contentW, 36, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C_MUTED);
      doc.text("CONSULTE OPCIONES DE FINANCIACIÓN", margin + contentW / 2, y + 22, { align: "center" });
      y += 44;
    } else {
      // Header de tabla (fondo azul, blanco, bold) - 5 columnas
      doc.setFillColor(...C_BLUE);
      doc.rect(margin, y, contentW, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      let pp = margin + 8;
      doc.text("PLAN", pp, y + 16);
      pp += pColBadge;
      doc.text("MODALIDAD", pp, y + 16);
      pp += pColModalidad;
      doc.text("CUOTAS", pp, y + 16);
      pp += pColCuotas;
      doc.text("VALOR POR CUOTA", pp, y + 16);
      pp += pColValor;
      doc.text("TOTAL DEL PLAN", pp + pColTotal - 8, y + 16, { align: "right" });
      y += 24;

      const rowH = 28;
      let rowIdx = 0;
      let tuvoConEntrega = false;

      // ===== CON ENTREGA (texto plano, sin badges) =====
      if (body.mostrarConEntrega !== false && body.planes) {
        body.planes.forEach((plan, idxCe) => {
          if (plan.cuotas === 1) return;
          ensureSpace(rowH);

          // Zebra: filas pares con fondo gris visible, impares blancas
          if (idxCe % 2 === 0) {
            doc.setFillColor(...C_ROW_ALT);
            doc.rect(margin, y, contentW, rowH, "F");
          }

          // Col 1: Letra (PLAN)
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(plan.letra, pp2, y + 18);

          // Col 2: MODALIDAD - TEXTO PLANO (sin badge)
          pp2 += pColBadge;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...C_INK);
          doc.text("CON ENTREGA", pp2, y + 18);

          // Col 3: CUOTAS
          pp2 += pColModalidad;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...C_INK);
          doc.text(`1 ENTRADA + ${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`, pp2, y + 18);

          // Col 4: VALOR POR CUOTA
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 18);

          // Col 5: TOTAL DEL PLAN
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 18, { align: "right" });
          y += rowH;
          rowIdx++;
          tuvoConEntrega = true;
        });
      }

      // ===== LÍNEA DORADA separadora entre CON ENTREGA y SIN ENTREGA =====
      if (tuvoConEntrega && hayPlanesSinEntrega) {
        doc.setDrawColor(...C_GOLD);
        doc.setLineWidth(2);
        doc.line(margin, y, margin + contentW, y);
        y += 4;
      }

      // ===== SIN ENTREGA (texto plano, sin badges) =====
      if (hayPlanesSinEntrega && body.planesSinEntrega) {
        body.planesSinEntrega.forEach((plan, idxSe) => {
          ensureSpace(rowH);

          // Zebra: filas pares con fondo gris visible, impares blancas
          if (idxSe % 2 === 0) {
            doc.setFillColor(...C_ROW_ALT);
            doc.rect(margin, y, contentW, rowH, "F");
          }

          // Col 1: Letra
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(plan.letra, pp2, y + 18);

          // Col 2: MODALIDAD - TEXTO PLANO
          pp2 += pColBadge;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...C_INK);
          doc.text("SIN ENTREGA", pp2, y + 18);

          // Col 3: CUOTAS
          pp2 += pColModalidad;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...C_INK);
          doc.text(plan.cuotas === 1 ? "1 PAGO" : `${plan.cuotas} CUOTAS`, pp2, y + 18);

          // Col 4: VALOR POR CUOTA
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 18);

          // Col 5: TOTAL DEL PLAN
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 18, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }
    }

    // ===== OBSERVACIONES (si hay) =====
    if (body.cliente && body.cliente.observaciones && body.cliente.observaciones.trim()) {
      ensureSpace(80);
      y += 16;
      drawSectionTitle(doc, margin, contentW, y, "OBSERVACIONES");
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      const obsLines = doc.splitTextToSize(body.cliente.observaciones, contentW - 20);
      doc.text(obsLines, margin, y);
      y += obsLines.length * 12;
    }

    // ===== FOOTER =====
    drawVizaFooter(
      doc,
      pageW,
      pageH,
      margin,
      "VIZA HOME E.A.S · Muebles, Electrodomésticos y Motos"
    );

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VIZA-Presupuesto.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF:", error);
    return NextResponse.json({ error: "Error al generar el PDF" }, { status: 500 });
  }
}
