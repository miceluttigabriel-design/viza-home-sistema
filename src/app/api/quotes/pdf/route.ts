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

// Plan alternativo SIN ENTREGA inicial (con margen por diferido + fechas de cuotas)
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
  // === DESCUENTO POR CASCO (regalo obligatorio de VIZA Home) ===
  // Si cascoAplicado = true, el valor del descuento debe ser > 0.
  // El sistema BLOQUEA la generación del PDF si no se cumple.
  cascoAplicado?: boolean;
  cascoValor?: number;
  cascoDescripcion?: string;
  baseCalculo?: number; // contadoAjustado - descuentoCasco
  // Indica si el precio de contado se incluye como "Plan A" en el presupuesto
  incluirContadoEnPresupuesto?: boolean;
  // Si true, muestra la columna "P. CONTADO" en la tabla de productos del PDF
  // Por defecto es false (no muestra precio unitario)
  incluirPrecioContado?: boolean;
  // Tipo de entrega inicial (con/sin entrega)
  tipoEntrega?: TipoEntregaPdf;
  // Fecha de inicio de la primera cuota (ISO date) para sin_entrega
  fechaInicioPago?: string;
  // Días diferidos calculados (hoy -> fechaInicioPago)
  diasDiferidos?: number | null;
  // Margen aplicado sobre el valor base (0.05 o 0.10)
  margenAplicado?: number | null;
  // Flags para mostrar/ocultar opciones en el presupuesto
  mostrarConEntrega?: boolean;
  mostrarSinEntrega?: boolean;
  planes: PdfPlan[];
  // Planes alternativos sin entrega inicial (solo si tipoEntrega === "sin_entrega")
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

// Formatea una fecha ISO ("YYYY-MM-DD") sin usar new Date(string) para evitar
// el problema de zona horaria (UTC vs local) que puede cambiar el día.
// CRÍTICO: Parsear manualmente para mantener la fecha EXACTA.
function formatDateEsSafe(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return "-";
  const [año, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${año}`;
}

// Formatea fecha Y hora en formato DD/MM/AAAA - HH:MM:SS (hora local del servidor)
// Se usa para la "FECHA DE EMISIÓN" del PDF - refleja el momento exacto de generación
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
// DIBUJO COMPARTIDO — Estilo editorial VIZA HOME (Profesional)
// =====================================================================
// Paleta corporativa
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

// Dibuja el header VIZA HOME (logo + slogan + título derecho)
function drawVizaHeader(doc: jsPDF, pageW: number, margin: number, subtitulo: string) {
  // Fondo azul corporativo
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, pageW, 124, "F");

  // Banda dorada superior (acento)
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pageW, 4, "F");

  // Onda decorativa con triángulos en la base del header
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

  // Ícono de grilla (2x2 cuadrados dorados) - reemplaza la "A" de VIZA
  const gridX = margin;
  const gridY = 32;
  const sqSize = 11;
  const sqGap = 3;
  doc.setFillColor(...C_GOLD);
  doc.rect(gridX, gridY, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY, sqSize, sqSize, "F");
  doc.rect(gridX, gridY + sqSize + sqGap, sqSize, sqSize, "F");
  doc.rect(gridX + sqSize + sqGap, gridY + sqSize + sqGap, sqSize, sqSize, "F");

  // Texto "VIZA" blanco + " home" dorado
  const txtX = gridX + sqSize * 2 + sqGap + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  const vizaTxt = "VIZA";
  doc.text(vizaTxt, txtX, 56);
  const vizaW = doc.getTextWidth(vizaTxt);
  doc.setTextColor(...C_GOLD);
  doc.text(" home", txtX + vizaW, 56);

  // Slogan en dorado itálico
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...C_GOLD);
  doc.text("Todo para tu hogar, en un solo lugar.", txtX, 72);

  // Título "PRESUPUESTO" (dorado) + subtítulo (blanco) a la derecha
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
  // Fondo crema muy claro
  doc.setFillColor(...C_BOX_BG);
  doc.roundedRect(margin, yStart, contentW, boxH, 6, 6, "F");
  // Borde fino
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(1);
  doc.roundedRect(margin, yStart, contentW, boxH, 6, 6, "D");
  // Pequeño acento dorado a la izquierda
  doc.setFillColor(...C_GOLD);
  doc.rect(margin, yStart, 4, boxH, "F");

  const colGap = contentW / 2;

  // Columna izquierda: N° PRESUPUESTO
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text("N° PRESUPUESTO", margin + 14, yStart + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C_INK);
  doc.text(numeroPresupuesto, margin + 14, yStart + 32);

  // Columna derecha: FECHA DE EMISIÓN
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
  weight: "bold" | "normal" = "bold",
  size: number = 12
): number {
  doc.setFont("helvetica", weight);
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
  doc.roundedRect(boxX, y, boxW, boxH, 6, 6, "F");
  // Borde dorado
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
    doc.setTextColor(...C_GOLD);
    doc.text(etiquetaSecundaria, boxX + 16, y + 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C_DARK_BLUE);
    doc.text(formatPYG(valorSecundario), boxX + boxW - 16, y + 54, { align: "right" });
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

  // Fondo azul corporativo
  doc.setFillColor(...C_BLUE);
  doc.rect(0, footerY, pageW, footerH, "F");

  // Banda dorada superior del footer
  doc.setFillColor(...C_GOLD);
  doc.rect(0, footerY, pageW, 3, "F");

  // Mini logo: grilla dorada + texto "VIZA home"
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

  // Slogan
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...C_GOLD);
  doc.text("Todo para tu hogar, en un solo lugar.", fTxtX, footerY + 32);

  // Información de contacto (texto plano, sin emojis)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("Tel: (0987) 700 707", fTxtX, footerY + 44);
  doc.text("Email: ventas.online@viza.com.py", fTxtX, footerY + 54);
  doc.text("Web: www.viza.com.py   ·   Redes: @vizahome", fTxtX, footerY + 64);

  // Texto legal + validez + agradecimiento (a la derecha)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(220, 220, 220);
  doc.text(textoLegal, pageW - margin, footerY + 14, { align: "right" });
  doc.text("Presupuesto válido por 10 días desde la fecha de emisión.", pageW - margin, footerY + 26, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C_GOLD);
  doc.text("¡Gracias por elegirnos!", pageW - margin, footerY + 42, { align: "right" });

  // Número de página si tiene múltiples páginas
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

// POST /api/quotes/pdf - genera PDF del presupuesto profesional (estilo editorial VIZA HOME)
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
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco. Complete el valor del descuento o desmarque el casco.",
        },
        { status: 400 }
      );
    }
    if (body.cascoAplicado && body.cascoValor && body.cascoValor > (body.contadoOriginal || 0)) {
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
    drawVizaHeader(doc, pageW, margin, "DE VENTA");

    // ===== BLOQUE N° PRESUPUESTO + FECHA =====
    y = 150;
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

      const clienteLines: string[] = [];
      if (body.cliente.telefono) clienteLines.push(`Teléfono/WhatsApp: ${body.cliente.telefono}`);
      if (body.cliente.documento) clienteLines.push(`Documento: ${body.cliente.documento}`);
      clienteLines.forEach((line, idx) => {
        doc.text(line, margin, y + idx * 12);
      });
      y += Math.max(clienteLines.length * 12, 12);
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

    drawSectionTitle(doc, margin, contentW, y, "PRODUCTOS DE LA COTIZACIÓN");
    y += 22;

    // REGLA: Si incluirPrecioContado === false, solo mostrar #, SKU, PRODUCTO, CANT.
    // Si incluirPrecioContado === true, mostrar todas las columnas + bloque TOTAL
    const incluirPrecioContado = body.incluirPrecioContado === true;
    const colN = 25;
    const colSku = 70;
    const colCant = 50;
    const colPU = 110;
    const colSub = 110;
    const colName = incluirPrecioContado
      ? contentW - colN - colSku - colCant - colPU - colSub
      : contentW - colN - colSku - colCant;

    // Header tabla (fondo azul, texto blanco, bold)
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
    xx += colCant;
    if (incluirPrecioContado) {
      doc.text("P. CONTADO", xx, y + 17);
      xx += colPU;
      doc.text("SUBTOTAL", xx + colSub - 8, y + 17, { align: "right" });
    }

    y += 26;

    // Filas productos - alternando blanco / gris muy claro
    doc.setFontSize(9);
    body.items.forEach((it, idx) => {
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

      if (incluirPrecioContado) {
        xxx += colCant;
        doc.setTextColor(...C_INK);
        doc.text(formatPYG(it.priceContado), xxx, y + 18);
        xxx += colPU;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C_DARK_BLUE);
        doc.text(formatPYG(it.subtotalContado), xxx + colSub - 8, y + 18, { align: "right" });
      }

      y += rowH;
    });

    // Solo mostrar bloque TOTAL CONTADO si incluirPrecioContado es true
    if (incluirPrecioContado) {
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
    } else {
      y += 14;
    }

    // ===== OPCIONES DE FINANCIACIÓN (PLANES) =====
    ensureSpace(120);

    drawSectionTitle(doc, margin, contentW, y, "OPCIONES DE FINANCIACIÓN");
    y += 22;

    // Columnas más anchas para evitar superposición
    const pColBadge = 90;
    const pColCuotas = 140;
    const pColValor = 160;
    const pColTotal = contentW - pColBadge - pColCuotas - pColValor;

    const hayPlanesConEntrega = body.mostrarConEntrega !== false && body.planes && body.planes.length > 0;
    const hayPlanesSinEntrega = body.mostrarSinEntrega !== false && body.planesSinEntrega && body.planesSinEntrega.length > 0;

    if (!hayPlanesConEntrega && !hayPlanesSinEntrega) {
      ensureSpace(50);
      doc.setFillColor(...C_BOX_BG);
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, contentW, 40, 4, 4, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C_MUTED);
      doc.text("CONSULTE OPCIONES DE FINANCIACIÓN", margin + contentW / 2, y + 24, { align: "center" });
      y += 48;
    } else {
      // Header de tabla (estilo editorial: azul, blanco, bold)
      doc.setFillColor(...C_BLUE);
      doc.rect(margin, y, contentW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      let pp = margin + 8;
      doc.text("PLAN", pp, y + 17);
      pp += pColBadge;
      doc.text("MODALIDAD", pp, y + 17);
      pp += pColCuotas;
      doc.text("VALOR POR CUOTA", pp, y + 17);
      pp += pColValor;
      doc.text("TOTAL DEL PLAN", pp + pColTotal - 8, y + 17, { align: "right" });
      y += 26;

      const rowH = 32;
      let rowIdx = 0;

      // ===== CON ENTREGA (saltar si cuotas === 1) =====
      if (body.mostrarConEntrega !== false && body.planes) {
        body.planes.forEach((plan) => {
          if (plan.cuotas === 1) return;
          ensureSpace(rowH);
          if (rowIdx % 2 === 0) {
            doc.setFillColor(...C_ROW_ALT);
            doc.rect(margin, y, contentW, rowH, "F");
          }
          // Columna 1: Letra + Badge
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(...C_GOLD);
          doc.text(plan.letra, pp2, y + 20);
          // Badge CON ENTREGA (caja con fondo verde)
          doc.setFillColor(...C_BADGE_ENT);
          doc.rect(pp2 + 16, y + 11, 65, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text("CON ENTREGA", pp2 + 19, y + 21);
          // Columna 2: Modalidad
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...C_INK);
          doc.text(`1 ENTRADA + ${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`, pp2, y + 21);
          // Columna 3: Valor por cuota
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 21);
          // Columna 4: Total
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 21, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }

      // ===== SIN ENTREGA (misma tabla) =====
      if (hayPlanesSinEntrega && body.planesSinEntrega) {
        body.planesSinEntrega.forEach((plan) => {
          ensureSpace(rowH);
          if (rowIdx % 2 === 0) {
            doc.setFillColor(...C_ROW_SIN);
            doc.rect(margin, y, contentW, rowH, "F");
          }
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(...C_GOLD);
          doc.text(plan.letra, pp2, y + 20);
          // Badge SIN ENTREGA
          doc.setFillColor(...C_BADGE_SIN);
          doc.rect(pp2 + 16, y + 11, 65, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(...C_INK);
          doc.text("SIN ENTREGA", pp2 + 19, y + 21);
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...C_INK);
          doc.text(plan.cuotas === 1 ? "1 PAGO" : `${plan.cuotas} CUOTAS`, pp2, y + 21);
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 21);
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C_DARK_BLUE);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 21, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }
    }

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones && body.cliente.observaciones.trim()) {
      ensureSpace(80);
      y += 16;
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
      "VIZA HOME E.A.S · Muebles, Electrodomésticos y Motos"
    );

    // Generar buffer
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
