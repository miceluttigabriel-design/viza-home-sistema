import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nextSequentialQuoteNumber } from "../../../../lib/quote-number";
import { drawHeader, drawFooter, drawSectionTitle, formatPYG, formatDateEs, formatDateTimeEs, FOOTER_RESERVE, BLUE, GOLD, DARK, GREY } from "../../../../lib/pdf/vizaPdfDesign";

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
    documento?: string; // RUC o CI (opcional)
    observaciones: string;
    fecha: string; // ISO fecha de emisión
    hora?: string; // HH:MM:SS local del vendedor (momento de generar el PDF)
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
  // Si cascoAplicado = true, el valor del descuento debe ser > 0.
  // El sistema BLOQUEA la generación del PDF si no se cumple.
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


// POST /api/quotes/safra-pdf - genera PDF del presupuesto SAFRA
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body: SafraPdfPayload = await req.json();

    if (!body.productos || body.productos.length === 0) {
      return NextResponse.json(
        { error: "El presupuesto Safra no tiene productos" },
        { status: 400 }
      );
    }

    // === BLOQUEO DE SEGURIDAD: EL CASCO ES UN REGALO OBLIGATORIO ===
    // REGLA DE NEGOCIO: Si el vendedor marcó "Aplicar descuento por casco",
    // DEBE ingresar el valor del descuento. El sistema NO permite generar el PDF
    // Safra si el casco está activado pero el descuento no fue aplicado.
    // El casco es un regalo de VIZA Home y DEBE figurar como descuento en el PDF.
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF Safra. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco. Complete el valor del descuento o desmarque el casco.",
        },
        { status: 400 }
      );
    }
    // Validación adicional: el valor del casco no puede ser mayor al total de productos
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

    // ===== ENCABEZADO (nuevo diseño con logo + wave + 3 cajas) =====
    const now = parseFechaEmision(body.cliente?.fecha, body.cliente?.hora) ?? new Date();
    // N° SECUENCIAL por (plan SAFRA, usuario): SAFRA-01, SAFRA-02 ...
    const headerBottom = drawHeader(
      doc,
      pageW,
      margin,
      contentW,
      await nextSequentialQuoteNumber("SAFRA", (session.user as any)?.id),
      "SAFRA",
      now,
      formatDateTimeEs,
      formatDateEs
    );

    // ===== DATOS DEL CLIENTE (si hay) =====
    // drawHeader devuelve el borde inferior de las 3 cajas (N°/FECHA/VÁLIDO):
    // todo el contenido arranca DEBAJO de esa línea para no pisar el encabezado
    // (mismo criterio que CHEQUE y MAYORISTA)
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

    // ===== TABLA DE PRODUCTOS =====
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
    doc.text("PRODUCTOS DEL PLAN", margin, y);
    doc.setDrawColor(217, 184, 107);
    doc.setLineWidth(2);
    doc.line(margin, y + 4, margin + 200, y + 4);

    y += 20;
    // Columnas: # | SKU | Producto | Cant.
    // REGLA DE NEGOCIO v4.0: NO mostrar P. CONTADO ni SUBTOTAL en Plan Safra.
    // El cliente solo ve qué productos lleva y la cantidad. Los valores
    // se muestran únicamente en el cronograma de pagos.
    // Al quitar P. CONTADO y SUBTOTAL, DESCRIPCIÓN tiene más espacio.
    const colN = 30;
    const colSku = 90;
    const colCant = 60;
    const colName = contentW - colN - colSku - colCant;

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
    doc.text("CANT.", xx, y + 16);

    y += 24;

    // Filas productos - SIN P. CONTADO y SIN SUBTOTAL
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
      doc.text(it.sku, xxx, y + 13);

      xxx += colSku;
      doc.setTextColor(28, 25, 23);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      // Más espacio para el nombre (porque quitamos 2 columnas)
      const nameLines = doc.splitTextToSize(it.name, colName - 6);
      doc.text(nameLines.slice(0, 2), xxx, y + 13);

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(28, 25, 23);
      doc.text(String(it.quantity), xxx, y + 13);

      y += rowH;
    });

    // REGLA DE NEGOCIO v4.0: NO mostrar "Total al contado" ni "Total plan (+margen)".
    // En Plan Safra, el cliente solo ve los productos con cantidad, y luego
    // el cronograma de pagos con su valor. El total se muestra al final del
    // cronograma como "TOTAL DEL PLAN SAFRA".
    y += 12;

    // ===== CRONOGRAMA DE PAGOS SAFRA =====
    ensureSpace(180);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(...BLUE);
    doc.roundedRect(margin, y, contentW, 28, 4, 4, "F");
    doc.text("CRONOGRAMA DE PAGOS ESCALONADOS", margin + 14, y + 18);
    y += 36;

    // Tabla de cronograma
    const cColN = 30;
    const cColConcepto = 220;
    const cColFecha = 130;
    const cColValor = contentW - cColN - cColConcepto - cColFecha;

    // Header
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let cc = margin + 6;
    doc.text("#", cc, y + 14);
    cc += cColN;
    doc.text("CONCEPTO", cc, y + 14);
    cc += cColConcepto;
    doc.text("FECHA DE PAGO", cc, y + 14);
    cc += cColFecha;
    doc.text("VALOR", cc + cColValor - 6, y + 14, { align: "right" });

    y += 22;

    let rowIdx = 0;

    // Helper para dibujar una fila del cronograma
    const drawCronoRow = (
      concepto: string,
      fecha: string,
      valor: number,
      destacado: boolean
    ) => {
      ensureSpace(30);
      const rowH = 26;
      if (rowIdx % 2 === 0) {
        doc.setFillColor(245, 245, 244);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      // Destacado dorado para entrega y pago final
      if (destacado) {
        doc.setFillColor(254, 243, 199);
        doc.rect(margin, y, contentW, rowH, "F");
      }

      let pp = margin + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(217, 184, 107);
      doc.text(String(rowIdx + 1), pp, y + 16);

      pp += cColN;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(28, 25, 23);
      doc.text(concepto, pp, y + 16);

      pp += cColConcepto;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 113, 108);
      doc.text(formatDateEs(fecha), pp, y + 16);

      pp += cColFecha;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(formatPYG(valor), pp + cColValor - 6, y + 16, {
        align: "right",
      });

      y += rowH;
      rowIdx += 1;
    };

    // === FILAS DEL CRONOGRAMA: se usan los datos REALES del plan (body.cronograma) ===
    // El panel SAFRA calcula el cronograma mes a mes (interés sobre saldo restante) y
    // lo envía con {fecha, concepto, pago}. Ahí están las FECHAS de cada refuerzo, los
    // VALORES auto-calculados y el ÚLTIMO pago ya etiquetado como "PAGO FINAL".
    // (Antes el PDF reconstruía las filas desde body.refuerzos, que llegan SIN fecha y
    //  con valor 0 porque el cálculo real queda solo dentro del cronograma.)
    // Se muestran solo los pagos reales (pago > 0), igual que en el panel.
    const filasPago = (body.cronograma || []).filter((c) => c.pago > 0);

    filasPago.forEach((c) => {
      const esEntrada = c.mes === 0;
      const esPagoFinal = (c.concepto || "").toUpperCase() === "PAGO FINAL";
      drawCronoRow(
        esEntrada ? "ENTRADA INICIAL" : (c.concepto || "REFUERZO").toUpperCase(),
        c.fecha || "",
        c.pago,
        esEntrada || esPagoFinal
      );
    });

    // Fallback de compatibilidad: si no viene cronograma pero sí entrada, mostrar la entrada
    if (filasPago.length === 0) {
      const entradaValor: number = (body as any).entradaValor || body.valorEntrega || 0;
      if (entradaValor > 0) {
        drawCronoRow(
          "ENTRADA INICIAL",
          body.cliente?.fecha || body.fechaEntrega || "",
          entradaValor,
          true
        );
      }
    }

    // ===== RESUMEN TOTAL =====
    ensureSpace(100);
    y += 12;

    const sumBoxW = 320;
    const sumBoxH = 56; // mismo tamaño que el cuadro de MAYORISTA
    const sumBoxX = pageW - margin - sumBoxW;

    doc.setFillColor(...BLUE);
    doc.roundedRect(sumBoxX, y, sumBoxW, sumBoxH, 6, 6, "F");

    // Banda dorada superior
    doc.setFillColor(...GOLD);
    doc.rect(sumBoxX, y, sumBoxW, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(217, 184, 107);
    doc.text("TOTAL DEL PLAN SAFRA:", sumBoxX + 14, y + 25);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatPYG(body.totalPlan), sumBoxX + sumBoxW - 14, y + 25, {
      align: "right",
    });

    // (Eliminadas las líneas "Total distribuido" y "Diferencia": el campo
    //  totalDistribuido nunca se enviaba desde el panel y mostraba "Gs NaN".
    //  El total del plan ya incluye intereses y cuadra por diseño del cronograma.)

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

    // ===== FOOTER (nuevo diseño unificado) =====
    drawFooter(doc, pageW, pageH, margin, contentW, "Plan Safra");
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
