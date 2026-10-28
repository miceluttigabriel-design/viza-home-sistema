import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nextSequentialQuoteNumber } from "../../../../lib/quote-number";
import { guardarQuoteEmitido } from "../../../../lib/guardar-quote";
import { drawHeader, drawFooter, drawSectionTitle, formatPYG, formatDateEs, formatDateTimeEs, FOOTER_RESERVE, BLUE, GOLD, DARK, GREY } from "../../../../lib/pdf/vizaPdfDesign";
const GREEN: [number, number, number] = [40, 167, 69];
const RED: [number, number, number] = [220, 53, 69];

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
    documento?: string; // RUC o CI (opcional)
    observaciones: string;
    fecha: string; // ISO fecha de emisión
    hora?: string; // HH:MM:SS local del vendedor (momento de generar el PDF)
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





// FECHA DE EMISIÓN: se usa la fecha/hora LOCAL que envía el navegador del
// vendedor en el momento exacto de generar el PDF (cliente.fecha / cliente.hora).
// El servidor vive en UTC y puede estar en otro día/hora que Uruguay (UTC-3),
// por eso new Date() queda solo como fallback si el payload no trae fecha.
// Formato esperado: fecha "YYYY-MM-DD", hora "HH:MM:SS".
function parseFechaEmision(fecha?: string, hora?: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fecha ?? "").trim());
  if (!m) return null;
  let hh = 12; let mm = 0; let ss = 0;
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((hora ?? "").trim());
  if (t) {
    hh = Number(t[1]);
    mm = Number(t[2]);
    ss = Number(t[3] ?? 0);
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, ss);
  return isNaN(d.getTime()) ? null : d;
}


// POST /api/quotes/cheque-pdf - genera PDF del presupuesto CON CHEQUE
// REGLA: NO mostrar columna SUBTOTAL ni bloque "Subtotal productos".
// Solo mostrar: #, SKU, DESCRIPCIÓN, CANT. (igual que en safra-pdf).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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

    // ===== ENCABEZADO (nuevo diseño con logo + wave + 3 cajas) =====
    const now = parseFechaEmision(body.cliente?.fecha, body.cliente?.hora) ?? new Date();
    // N° SECUENCIAL por (plan CHEQUE, usuario): CHEQUE-01, CHEQUE-02 ...
    // (Task 78: el número se captura en una variable para registrar la
    // EMISIÓN en la base y que el CRM la contabilice — mismo número
    // impreso en el PDF = mismo número en el ranking por plan.)
    const quoteNumberCheque = await nextSequentialQuoteNumber("CHEQUE", (session.user as any)?.id);
    const headerBottom = drawHeader(
      doc,
      pageW,
      margin,
      contentW,
      quoteNumberCheque,
      "CON CHEQUE",
      now,
      formatDateTimeEs,
      formatDateEs
    );
    y = headerBottom + 26;

    // ===== DATOS DEL CLIENTE =====
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, contentW, 70, 4, 4, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(2);
    doc.line(margin, y, margin, y + 70);

    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DATOS DEL CLIENTE", margin + 14, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);

    if (body.cliente && body.cliente.nombre) {
      doc.text(`Nombre: ${body.cliente.nombre}`, margin + 14, y + 36);
    } else {
      doc.text("Nombre: —", margin + 14, y + 36);
    }
    if (body.cliente && body.cliente.telefono) {
      doc.text(`Teléfono/WhatsApp: ${body.cliente.telefono}`, margin + 14, y + 52);
    }
    if (body.cliente && body.cliente.documento) {
      doc.text(`RUC/CI: ${body.cliente.documento}`, margin + 14, y + 68);
    }

    y += 90;

    // ===== TABLA DE PRODUCTOS (SIN SUBTOTAL) =====
    // REGLA: Solo mostrar #, SKU, DESCRIPCIÓN, CANT.
    // NO mostrar SUBTOTAL (es información interna de VIZA HOME).
    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PRODUCTOS DE LA COTIZACIÓN", margin, y);
    y += 8;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + contentW, y);
    y += 14;

    // Columnas redimensionadas: # (5%), SKU (15%), DESCRIPCIÓN (60%), CANT. (20%)
    // Al quitar SUBTOTAL, DESCRIPCIÓN tiene más espacio.
    const colN = margin;
    const colSku = margin + Math.round(contentW * 0.05);  // 5%
    const colDesc = margin + Math.round(contentW * 0.20); // 20%
    const colQty = margin + Math.round(contentW * 0.80);  // 80%

    // Header de la tabla
    doc.setFillColor(...BLUE);
    doc.rect(margin, y - 10, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", colN + 4, y + 4);
    doc.text("COD", colSku, y + 4);
    doc.text("DESCRIPCIÓN", colDesc, y + 4);
    doc.text("CANT.", colQty + 30, y + 4);
    y += 22;

    // Filas de productos - SIN columna SUBTOTAL
    doc.setFont("helvetica", "normal");
    body.productos.forEach((it, idx) => {
      if (y > pageH - FOOTER_RESERVE) {
        doc.addPage();
        y = margin;
      }
      const rowH = 22;
      const rowBg = idx % 2 === 0 ? [255, 255, 255] : [248, 249, 250];
      doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
      doc.rect(margin, y - 10, contentW, rowH, "F");

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      doc.text(String(idx + 1), colN + 4, y + 4);
      doc.text(it.sku || "—", colSku, y + 4);

      // Nombre truncado - ahora con MÁS espacio porque quitamos SUBTOTAL
      const maxDescChars = 75;
      const nameStr = it.name || "";
      const truncated = nameStr.length > maxDescChars ? nameStr.substring(0, maxDescChars) + "…" : nameStr;
      doc.setFont("helvetica", "bold");
      doc.text(truncated, colDesc, y + 4);
      doc.setFont("helvetica", "normal");

      doc.text(String(it.quantity || 1), colQty + 30, y + 4);

      y += rowH;
    });

    // Línea separadora (NO se muestra "Subtotal productos" - es regla de negocio)
    y += 4;

    // ===== DESCUENTO POR CASCO - OCULTO en el PDF CON CHEQUE (no se muestra al cliente) =====

    // ===== PLAN CON CHEQUE - TABLA DE CHEQUES =====
    const chequesTableH = 30 + cheques.length * 22 + 30;
    if (y + chequesTableH > pageH - 100) {
      doc.addPage();
      y = margin + 10;
    }

    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PLAN CON CHEQUE", margin, y);
    y += 8;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + contentW, y);
    y += 16;

    // Header tabla de cheques
    const chequeCols = {
      n: margin + 20,
      fecha: margin + 200,
      valor: margin + contentW - 50,
    };

    doc.setFillColor(...BLUE);
    doc.rect(margin, y - 12, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("N° CHEQUE", chequeCols.n - 10, y + 3);
    doc.text("FECHA DE VENCIMIENTO", chequeCols.fecha, y + 3);
    doc.text("VALOR DEL CHEQUE", chequeCols.valor, y + 3, { align: "right" });
    y += 22;

    // Filas de cheques
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    cheques.forEach((c, idx) => {
      if (y > pageH - FOOTER_RESERVE) {
        doc.addPage();
        y = margin;
      }
      const rowH = 22;
      const rowBg = idx % 2 === 0 ? [255, 255, 255] : [248, 249, 250];
      doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
      doc.rect(margin, y - 10, contentW, rowH, "F");

      doc.setTextColor(...BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Cheque ${c.numero}`, chequeCols.n - 10, y + 4);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.text(formatDateEs(c.fecha), chequeCols.fecha, y + 4);

      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(formatPYG(c.valor), chequeCols.valor, y + 4, { align: "right" });

      y += rowH;
    });

    // Línea separadora
    y += 4;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + contentW, y);
    y += 18;

    // Total a pagar
    const totalFinal = body.totalPagar || body.totalPlan || 0;
    const totalBoxW = 280;
    const totalBoxX = pageW - margin - totalBoxW;

    doc.setFillColor(...GOLD);
    doc.roundedRect(totalBoxX, y - 6, totalBoxW, 36, 4, 4, "F");
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL A PAGAR:", totalBoxX + 12, y + 16);
    doc.setFontSize(14);
    doc.text(formatPYG(totalFinal), totalBoxX + totalBoxW - 12, y + 18, { align: "right" });

    y += 50;

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones) {
      if (y > pageH - FOOTER_RESERVE) {
        doc.addPage();
        y = margin;
      }
      const obsH = 50;
      doc.setFillColor(255, 243, 205);
      doc.roundedRect(margin, y, contentW, obsH, 4, 4, "F");
      doc.setDrawColor(255, 193, 7);
      doc.setLineWidth(2);
      doc.line(margin, y, margin, y + obsH);

      doc.setTextColor(133, 100, 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("OBSERVACIONES", margin + 14, y + 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const obsText = body.cliente.observaciones;
      const splitObs = doc.splitTextToSize(obsText, contentW - 30);
      doc.text(splitObs.slice(0, 2), margin + 14, y + 32);

      y += obsH + 18;
    }

    // ===== FOOTER (nuevo diseño) =====
    drawFooter(doc, pageW, pageH, margin, contentW, "Plan Con Cheque");

    // REGISTRO DE EMISIÓN (Task 78, pedido del dueño): queda en la base
    // para que el CRM contabilice el presupuesto CON CHEQUE emitido.
    // Best-effort: si falla, el PDF sale igual (nunca rompe la emisión).
    await guardarQuoteEmitido({
      plan: "CHEQUE",
      quoteNumber: quoteNumberCheque,
      userId: (session.user as any)?.id,
      customerName: body.cliente?.nombre,
      customerPhone: body.cliente?.telefono,
      notes: body.cliente?.observaciones,
      subtotal: body.totalContadoBruto ?? totalFinal,
      total: totalFinal,
    });

    // Devolver PDF
    const pdfBuffer = doc.output("arraybuffer");
    return new NextResponse(Buffer.from(pdfBuffer), {
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
