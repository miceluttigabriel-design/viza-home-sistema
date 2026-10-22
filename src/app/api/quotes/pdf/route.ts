import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

// === Interfaces (mantener exactamente igual para no romper el frontend) ===
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
  contadoOriginalBruto: number;
  contadoMarginPct: number;
  contadoAjustado: number;
  cascoAplicado?: boolean;
  cascoValor?: number;
  cascoDescripcion?: string;
  baseCalculo?: number;
  incluirContadoEnPresupuesto?: boolean;
  incluirPrecioContado?: boolean;
  tipoEntrega?: string;
  fechaInicioPago?: string;
  diasDiferidos?: number | null;
  margenAplicado?: number | null;
  mostrarConEntrega?: boolean;
  mostrarSinEntrega?: boolean;
  planes?: PdfPlan[];
  planesSinEntrega?: PdfPlanSinEntrega[] | null;
}

// === Helpers ===
function formatPYG(n: number): string {
  return "Gs " + Math.round(n).toLocaleString("es-PY");
}

function formatDateEs(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTimeEs(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const sec = String(now.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} - ${hh}:${min}:${sec}`;
  } catch {
    return isoDate;
  }
}

function generateQuoteNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VZH-${ymd}-${rnd}`;
}

// === Colores corporativos ===
const AZUL: [number, number, number] = [21, 87, 137];
const AZUL_OSCURO: [number, number, number] = [13, 61, 94];
const DORADO: [number, number, number] = [217, 184, 107];
const DORADO_OSCURO: [number, number, number] = [184, 152, 83];
const TEXTO: [number, number, number] = [51, 51, 51];
const FONDO_ALT: [number, number, number] = [245, 245, 245];
const VERDE: [number, number, number] = [40, 167, 69];
const NARANJA: [number, number, number] = [230, 126, 34];

export async function POST(req: NextRequest) {
  try {
    const body: PdfPayload = await req.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: "El presupuesto no tiene productos" }, { status: 400 });
    }

    // Validacion de casco
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json({ error: "El casco es obligatorio" }, { status: 400 });
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;
    let y = 0;

    // ============================================
    // 1. ENCABEZADO CON LOGO + SLOGAN
    // ============================================
    // Fondo azul superior
    doc.setFillColor(...AZUL);
    doc.rect(0, 0, pageW, 110, "F");

    // Banda dorada superior
    doc.setFillColor(...DORADO);
    doc.rect(0, 0, pageW, 4, "F");

    // Logo VIZA home
    doc.setTextColor(...DORADO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(32);
    doc.text("VIZA", margin + 10, 50);

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(18);
    doc.text("home", margin + 105, 50);

    // Slogan
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...DORADO);
    doc.text("Todo para tu hogar, en un solo lugar.", margin + 10, 70);

    // Titulo PRESUPUESTO DE VENTA
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("PRESUPUESTO DE VENTA", pageW - margin - 10, 50, { align: "right" });

    // Onda decorativa
    const waveY = 106;
    for (let i = 0; i < 16; i++) {
      const x0 = i * (pageW / 16);
      if (i % 2 === 0) {
        doc.setFillColor(...AZUL);
        doc.triangle(x0, waveY, x0 + pageW / 32, waveY + 6, x0 + pageW / 16, waveY, "F");
      } else {
        doc.setFillColor(...DORADO);
        doc.triangle(x0, waveY, x0 + pageW / 32, waveY + 4, x0 + pageW / 16, waveY, "F");
      }
    }

    y = 130;

    // ============================================
    // 2. NUMERO Y FECHA DEL PRESUPUESTO
    // ============================================
    const numBoxW = 200;
    const numBoxX = pageW - margin - numBoxW;

    doc.setFillColor(...AZUL);
    doc.roundedRect(numBoxX, y, numBoxW, 50, 6, 6, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("N° PRESUPUESTO", numBoxX + 12, y + 16);
    doc.setFontSize(14);
    doc.text(generateQuoteNumber(), numBoxX + 12, y + 34);

    // Fecha
    doc.setTextColor(...TEXTO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("FECHA DE EMISION:", margin, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(formatDateTimeEs(body.cliente.fecha || new Date().toISOString().slice(0, 10)), margin, y + 34);

    y += 70;

    // ============================================
    // 3. DATOS DEL CLIENTE (si hay)
    // ============================================
    if (body.cliente?.nombre) {
      doc.setFillColor(...FONDO_ALT);
      doc.roundedRect(margin, y, contentW, 50, 6, 6, "F");
      doc.setDrawColor(...DORADO);
      doc.setLineWidth(2);
      doc.line(margin, y, margin, y + 50);

      doc.setTextColor(...AZUL);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("CLIENTE", margin + 14, y + 16);

      doc.setTextColor(...TEXTO);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Nombre: ${body.cliente.nombre}`, margin + 14, y + 32);
      if (body.cliente.telefono) {
        doc.text(`Tel: ${body.cliente.telefono}`, margin + 250, y + 32);
      }
      y += 65;
    }

    // ============================================
    // 4. TABLA DE PRODUCTOS
    // ============================================
    // Titulo seccion
    doc.setTextColor(...AZUL);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PRODUCTOS DE LA COTIZACION", margin, y);
    y += 6;
    doc.setDrawColor(...DORADO);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + contentW, y);
    y += 12;

    // Header de tabla
    const colNum = margin;
    const colSku = margin + 30;
    const colProd = margin + 110;
    const colCant = margin + 340;
    const colPCont = margin + 400;
    const colSub = margin + contentW - 10;

    doc.setFillColor(...AZUL);
    doc.rect(margin, y - 8, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", colNum + 4, y + 5);
    doc.text("SKU", colSku, y + 5);
    doc.text("PRODUCTO", colProd, y + 5);
    doc.text("CANT.", colCant, y + 5);
    doc.text("P. CONTADO", colPCont, y + 5);
    doc.text("SUBTOTAL", colSub, y + 5, { align: "right" });
    y += 22;

    // Filas de productos
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    body.items.forEach((it, idx) => {
      if (y > pageH - 200) { doc.addPage(); y = margin; }
      const rowH = 22;
      const bg = idx % 2 === 0 ? [255, 255, 255] : FONDO_ALT;
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(margin, y - 8, contentW, rowH, "F");

      doc.setTextColor(...TEXTO);
      doc.text(String(idx + 1), colNum + 4, y + 5);
      doc.text(it.sku || "—", colSku, y + 5);

      const maxChars = 45;
      const nameStr = it.name || "";
      const truncated = nameStr.length > maxChars ? nameStr.substring(0, maxChars) + "…" : nameStr;
      doc.setFont("helvetica", "bold");
      doc.text(truncated, colProd, y + 5);
      doc.setFont("helvetica", "normal");

      doc.text(String(it.quantity || 1), colCant, y + 5);
      doc.text(formatPYG(it.priceContado), colPCont, y + 5);
      doc.text(formatPYG(it.subtotalContado), colSub, y + 5, { align: "right" });
      y += rowH;
    });

    // Linea separadora
    y += 4;
    doc.setDrawColor(...DORADO);
    doc.setLineWidth(1);
    doc.line(margin, y, margin + contentW, y);
    y += 12;

    // ============================================
    // 4b. TOTAL CONTADO DESTACADO
    // ============================================
    const totalContado = body.contadoOriginal || body.contadoAjustado || 0;
    const totalBoxW = 250;
    const totalBoxX = pageW - margin - totalBoxW;

    doc.setFillColor(...DORADO);
    doc.roundedRect(totalBoxX, y - 4, totalBoxW, 40, 6, 6, "F");
    doc.setTextColor(...AZUL_OSCURO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL CONTADO:", totalBoxX + 12, y + 16);
    doc.setFontSize(16);
    doc.text(formatPYG(totalContado), totalBoxX + totalBoxW - 12, y + 18, { align: "right" });

    y += 55;

    // ============================================
    // 5. CASCO (si aplica)
    // ============================================
    const descCasco = body.cascoAplicado && body.cascoValor ? body.cascoValor : 0;
    if (descCasco > 0) {
      if (y > pageH - 150) { doc.addPage(); y = margin; }
      doc.setFillColor(212, 237, 218);
      doc.roundedRect(margin, y, contentW, 40, 6, 6, "F");
      doc.setFillColor(...VERDE);
      doc.roundedRect(margin, y, 5, 40, 2, 2, "F");

      doc.setTextColor(20, 100, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DESCUENTO POR CASCO", margin + 14, y + 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Producto: ${body.cascoDescripcion || "Casco"}`, margin + 14, y + 32);
      doc.setTextColor(220, 53, 69);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("-" + formatPYG(descCasco), pageW - margin - 14, y + 24, { align: "right" });
      y += 55;
    }

    // ============================================
    // 6. TABLA DE OPCIONES DE FINANCIACION
    // ============================================
    const allPlanes: { letra: string; modalidad: string; cuotas: string; valor: number; total: number; conEntrega: boolean }[] = [];

    if (body.incluirContadoEnPresupuesto || body.incluirPrecioContado) {
      allPlanes.push({ letra: "A", modalidad: "CONTADO", cuotas: "1 PAGO", valor: totalContado, total: totalContado, conEntrega: false });
    }

    if (body.mostrarConEntrega && body.planes) {
      body.planes.forEach((p) => {
        allPlanes.push({
          letra: p.letra,
          modalidad: "CON ENTREGA",
          cuotas: p.cuotas === 1 ? "1 ENTRADA" : `1 ENTRADA + ${p.cuotas - 1} CUOTAS`,
          valor: p.valorPorCuota,
          total: p.total,
          conEntrega: true,
        });
      });
    }

    if (body.mostrarSinEntrega && body.planesSinEntrega) {
      body.planesSinEntrega.forEach((p) => {
        allPlanes.push({
          letra: p.letra,
          modalidad: "SIN ENTREGA",
          cuotas: `${p.cuotas} CUOTAS`,
          valor: p.valorPorCuota,
          total: p.total,
          conEntrega: false,
        });
      });
    }

    if (allPlanes.length > 0) {
      if (y > pageH - 180) { doc.addPage(); y = margin + 10; }

      // Titulo seccion
      doc.setTextColor(...AZUL);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("OPCIONES DE FINANCIACION", margin, y);
      y += 6;
      doc.setDrawColor(...DORADO);
      doc.setLineWidth(2);
      doc.line(margin, y, margin + contentW, y);
      y += 12;

      // Header tabla
      const colPlan = margin;
      const colModalidad = margin + 40;
      const colCuotas = margin + 170;
      const colValor = margin + 350;
      const colTotal = margin + contentW - 10;

      doc.setFillColor(...AZUL);
      doc.rect(margin, y - 8, contentW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("PLAN", colPlan + 4, y + 5);
      doc.text("MODALIDAD", colModalidad, y + 5);
      doc.text("CUOTAS", colCuotas, y + 5);
      doc.text("VALOR POR CUOTA", colValor, y + 5);
      doc.text("TOTAL DEL PLAN", colTotal, y + 5, { align: "right" });
      y += 22;

      // Filas de planes
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      allPlanes.forEach((p, idx) => {
        if (y > pageH - 100) { doc.addPage(); y = margin; }
        const rowH = 24;
        const bg = idx % 2 === 0 ? [255, 255, 255] : FONDO_ALT;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(margin, y - 8, contentW, rowH, "F");

        // Plan letra
        doc.setTextColor(...AZUL);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(p.letra, colPlan + 4, y + 6);

        // Badge CON/SIN ENTREGA
        if (p.conEntrega) {
          doc.setFillColor(...VERDE);
          doc.roundedRect(colModalidad, y - 4, 80, 14, 3, 3, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text("CON ENTREGA", colModalidad + 4, y + 5);
        } else if (p.modalidad === "SIN ENTREGA") {
          doc.setFillColor(...DORADO);
          doc.roundedRect(colModalidad, y - 4, 80, 14, 3, 3, "F");
          doc.setTextColor(...AZUL_OSCURO);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text("SIN ENTREGA", colModalidad + 4, y + 5);
        } else {
          doc.setTextColor(...TEXTO);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(p.modalidad, colModalidad, y + 6);
        }

        // Cuotas
        doc.setTextColor(...TEXTO);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(p.cuotas, colCuotas, y + 6);

        // Valor por cuota (color segun modalidad)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(p.conEntrega ? [220, 53, 69] : [230, 126, 34] as [number, number, number]);
        doc.text(formatPYG(p.valor), colValor, y + 6);

        // Total del plan
        doc.setTextColor(...AZUL);
        doc.text(formatPYG(p.total), colTotal, y + 6, { align: "right" });
        y += rowH;
      });
    }

    y += 15;

    // ============================================
    // 7. OBSERVACIONES (si hay)
    // ============================================
    if (body.cliente?.observaciones) {
      if (y > pageH - 100) { doc.addPage(); y = margin; }
      doc.setFillColor(255, 243, 205);
      doc.roundedRect(margin, y, contentW, 35, 4, 4, "F");
      doc.setDrawColor(...DORADO);
      doc.setLineWidth(2);
      doc.line(margin, y, margin, y + 35);

      doc.setTextColor(133, 100, 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("OBSERVACIONES", margin + 14, y + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const splitObs = doc.splitTextToSize(body.cliente.observaciones, contentW - 30);
      doc.text(splitObs.slice(0, 2), margin + 14, y + 26);
      y += 45;
    }

    // ============================================
    // 8. FOOTER
    // ============================================
    if (y > pageH - 120) { doc.addPage(); y = margin; }
    y = pageH - 130;

    // Linea dorada
    doc.setDrawColor(...DORADO);
    doc.setLineWidth(3);
    doc.line(margin, y, margin + contentW, y);
    y += 15;

    // Fondo azul del footer
    doc.setFillColor(...AZUL);
    doc.rect(0, y, pageW, pageH - y, "F");

    // Logo
    doc.setTextColor(...DORADO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("VIZA", margin + 10, y + 22);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("home", margin + 70, y + 22);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...DORADO);
    doc.text("Todo para tu hogar, en un solo lugar.", margin + 10, y + 38);

    // Contacto
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Tel: (0987) 700 707", margin + 10, y + 55);
    doc.text("Email: ventas.online@viza.com.py", margin + 10, y + 67);
    doc.text("Web: www.viza.com.py", margin + 10, y + 79);
    doc.text("Redes: @vizahome", margin + 10, y + 91);

    // Texto legal
    doc.setTextColor(...DORADO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("VIZA HOME E.A.S · Muebles, Electrodomesticos y Motos", pageW - margin - 10, y + 55, { align: "right" });
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.text("Presupuesto valido por 10 dias desde la fecha de emision.", pageW - margin - 10, y + 67, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DORADO);
    doc.text("¡Gracias por elegirnos!", pageW - margin - 10, y + 79, { align: "right" });

    // Devolver PDF
    const pdfBuffer = doc.output("arraybuffer");
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="VIZA-Presupuesto.pdf"',
      },
    });
  } catch (error) {
    console.error("Error generando PDF:", error);
    return NextResponse.json({ error: "Error al generar el PDF" }, { status: 500 });
  }
}
