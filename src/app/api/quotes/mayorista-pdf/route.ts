import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nextSequentialQuoteNumber } from "../../../../lib/quote-number";
import { guardarQuoteEmitido } from "../../../../lib/guardar-quote";
import { drawHeader, drawFooter, formatPYG, formatDateEs, formatDateTimeEs, BLUE, GOLD, GREY } from "../../../../lib/pdf/vizaPdfDesign";
import { esProductoRegalo } from "../../../../lib/producto-regalo";

// === Tipos del payload del Presupuesto MAYORISTA ===

interface MayoristaPdfProducto {
  sku: string;
  name: string;
  quantity: number;
  priceTecnico: number;
  subtotal: number;
}

interface MayoristaPdfPayload {
  cliente: {
    nombre: string;
    telefono?: string;
    documento?: string; // RUC o CI (opcional)
    observaciones?: string;
    fecha?: string; // YYYY-MM-DD local del vendedor (momento de generar el PDF)
    hora?: string; // HH:MM:SS local del vendedor
  };
  productos: MayoristaPdfProducto[];
  total: number;
}

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

// POST /api/quotes/mayorista-pdf - genera PDF del presupuesto MAYORISTA
// (usa el PRECIO TÉCNICO de la BASE; la tabla muestra precios + TOTAL)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body: MayoristaPdfPayload = await req.json();

    if (!body.productos || body.productos.length === 0) {
      return NextResponse.json(
        { error: "El presupuesto MAYORISTA no tiene productos" },
        { status: 400 }
      );
    }

    // === REGLA MAYORISTA: todos los productos deben tener precio técnico > 0 ===
    // (La UI ya bloquea agregar productos sin precio; esto es el control server-side)
    const sinPrecio = body.productos.filter(
      (p) => !p.priceTecnico || p.priceTecnico <= 0
    );
    if (sinPrecio.length > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede generar el PDF MAYORISTA: hay productos sin PRECIO TÉCNICO cargado en la BASE.",
        },
        { status: 400 }
      );
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42; // 15mm
    const contentW = pageW - margin * 2;

    // ===== ENCABEZADO (mismo diseño que SAFRA/CHEQUE) =====
    const now = parseFechaEmision(body.cliente?.fecha, body.cliente?.hora) ?? new Date();
    // drawHeader devuelve el borde inferior de las 3 cajas (N°/FECHA/VÁLIDO):
    // todo el contenido arranca DEBAJO de esa línea para no pisar el encabezado
    // N° SECUENCIAL por (plan MAYOR, usuario): MAYOR-01, MAYOR-02 ...
    // (Task 78: el número se captura en una variable para registrar la
    // EMISIÓN en la base y que el CRM la contabilice — mismo número
    // impreso en el PDF = mismo número en el ranking por plan.)
    const quoteNumberMayor = await nextSequentialQuoteNumber("MAYOR", (session.user as any)?.id);
    const headerBottom = drawHeader(
      doc,
      pageW,
      margin,
      contentW,
      quoteNumberMayor,
      "MAYORISTA",
      now,
      formatDateTimeEs,
      formatDateEs
    );

    // ===== DATOS DEL CLIENTE (si hay) =====
    let y = headerBottom + 26;
    if (body.cliente && body.cliente.nombre) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(28, 25, 23);
      doc.text("CLIENTE", margin, y);

      doc.setDrawColor(217, 184, 107);
      doc.setLineWidth(2);
      doc.line(margin, y + 4, margin + 70, y + 4);

      y += 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(28, 25, 23);
      doc.text(body.cliente.nombre, margin, y);

      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120, 113, 108);

      if (body.cliente.telefono) {
        doc.text(`Teléfono/WhatsApp: ${body.cliente.telefono}`, margin, y);
        y += 12;
      }
      if (body.cliente.documento) {
        doc.text(`RUC/CI: ${body.cliente.documento}`, margin, y);
        y += 12;
      }
    }

    // ===== TABLA DE PRODUCTOS (con precios) =====
    y += 15;

    const ensureSpace = (min: number) => {
      if (y > pageH - min) {
        doc.addPage();
        y = 60;
      }
    };

    ensureSpace(180);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(28, 25, 23);
    doc.text("PRODUCTOS MAYORISTA", margin, y);
    doc.setDrawColor(217, 184, 107);
    doc.setLineWidth(2);
    doc.line(margin, y + 4, margin + 200, y + 4);

    y += 20;
    // Columnas: # | SKU | DESCRIPCIÓN | P. TÉCNICO | CANT. | SUBTOTAL
    const colN = 28;
    const colSku = 80;
    const colPrecio = 90;
    const colCant = 40;
    const colSub = 95;
    const colName = contentW - colN - colSku - colPrecio - colCant - colSub;

    // Header tabla
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let xx = margin + 6;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("COD", xx, y + 16);
    xx += colSku;
    doc.text("DESCRIPCIÓN", xx, y + 16);
    xx += colName;
    doc.text("P. TÉCNICO", xx + colPrecio - 6, y + 16, { align: "right" });
    xx += colPrecio;
    doc.text("CANT.", xx + colCant - 6, y + 16, { align: "right" });
    xx += colCant;
    doc.text("SUBTOTAL", xx + colSub - 6, y + 16, { align: "right" });

    y += 24;

    // Filas productos
    doc.setFontSize(9);
    body.productos.forEach((it, idx) => {
      ensureSpace(60);
      const rowH = 30;

      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 244);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let xxx = margin + 6;
      doc.setTextColor(120, 113, 108);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(idx + 1), xxx, y + 13);
      xxx += colN;
      doc.text(it.sku || "—", xxx, y + 13);

      xxx += colSku;
      doc.setTextColor(28, 25, 23);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(it.name, colName - 6);
      doc.text(nameLines.slice(0, 2), xxx, y + 13);

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(28, 25, 23);
      doc.text(formatPYG(it.priceTecnico), xxx + colPrecio - 6, y + 13, {
        align: "right",
      });
      xxx += colPrecio;
      doc.text(String(it.quantity), xxx + colCant - 6, y + 13, {
        align: "right",
      });
      xxx += colCant;
      doc.setFont("helvetica", "bold");
      doc.text(
        formatPYG(it.subtotal || it.priceTecnico * it.quantity),
        xxx + colSub - 6,
        y + 13,
        { align: "right" }
      );

      y += rowH;
    });

    // ===== TOTAL MAYORISTA =====
    ensureSpace(120);
    y += 12;

    // El total se recalcula server-side (suma de subtotales) - no se confía en el cliente
    // === REGALO CHAPA (COD 100068) - mismo mecanismo que el CASCO ===
    // La chapa es un REGALO de VIZA Home: si está en el presupuesto, su
    // subtotal se detecta acá por COD exacto (no se confía en el cliente) y
    // se descuenta del TOTAL MAYORISTA. Sin chapa, el total es la suma
    // normal de siempre.
    const sumaSubtotales = body.productos.reduce(
      (sum, p) => sum + (p.subtotal || p.priceTecnico * p.quantity),
      0
    );
    const descuentoChapaPdf = body.productos
      .filter((p) => esProductoRegalo(p.sku))
      .reduce(
        (sum, p) => sum + (p.subtotal || p.priceTecnico * p.quantity),
        0
      );
    const totalMayorista = Math.max(0, sumaSubtotales - descuentoChapaPdf);

    const sumBoxW = 320;
    const sumBoxH = 56;
    const sumBoxX = pageW - margin - sumBoxW;

    doc.setFillColor(...BLUE);
    doc.roundedRect(sumBoxX, y, sumBoxW, sumBoxH, 6, 6, "F");

    // Banda dorada superior
    doc.setFillColor(...GOLD);
    doc.rect(sumBoxX, y, sumBoxW, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(217, 184, 107);
    doc.text("TOTAL MAYORISTA:", sumBoxX + 14, y + 25);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatPYG(totalMayorista), sumBoxX + sumBoxW - 14, y + 25, {
      align: "right",
    });

    y += sumBoxH + 16;

    // ===== OBSERVACIONES =====
    if (
      body.cliente &&
      body.cliente.observaciones &&
      body.cliente.observaciones.trim()
    ) {
      ensureSpace(80);
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(28, 25, 23);
      doc.text("OBSERVACIONES", margin, y);
      doc.setDrawColor(214, 211, 209);
      doc.setLineWidth(1);
      doc.line(margin, y + 4, margin + 130, y + 4);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120, 113, 108);
      const obsLines = doc.splitTextToSize(
        body.cliente.observaciones,
        contentW - 20
      );
      doc.text(obsLines, margin, y);
      y += obsLines.length * 12;
    }

    // ===== FOOTER (mismo diseño unificado) =====
    drawFooter(doc, pageW, pageH, margin, contentW, "Presupuesto Mayorista");
    // Número de página si tiene múltiples páginas
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GREY);
        doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 54, { align: "right" });
      }
    }

    // Generar buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // REGISTRO DE EMISIÓN (Task 78, pedido del dueño): queda en la base
    // para que el CRM contabilice el presupuesto MAYORISTA emitido.
    // Best-effort: si falla, el PDF sale igual (nunca rompe la emisión).
    await guardarQuoteEmitido({
      plan: "MAYOR",
      quoteNumber: quoteNumberMayor,
      userId: (session.user as any)?.id,
      customerName: body.cliente?.nombre,
      customerPhone: body.cliente?.telefono,
      notes: body.cliente?.observaciones,
      subtotal: sumaSubtotales,
      discount: descuentoChapaPdf,
      total: totalMayorista,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VIZA-Presupuesto-Mayorista.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF MAYORISTA:", error);
    return NextResponse.json(
      { error: "Error al generar el PDF MAYORISTA" },
      { status: 500 }
    );
  }
}
