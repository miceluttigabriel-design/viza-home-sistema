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

function generateQuoteNumber(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `VZH-SAFRA-${ymd}-${rnd}`;
}

// POST /api/quotes/safra-pdf - genera PDF del presupuesto SAFRA
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

    // Colores corporativos VIZA
    const COLOR_BLUE: [number, number, number] = [21, 87, 137]; // #155789
    const COLOR_GOLD: [number, number, number] = [217, 184, 107]; // #D9B86B
    const COLOR_DARK_BLUE: [number, number, number] = [13, 61, 94]; // #0d3d5e

    let y = 0;

    // ===== ENCABEZADO CON IDENTIDAD VIZA HOME =====
    doc.setFillColor(...COLOR_BLUE);
    doc.rect(0, 0, pageW, 130, "F");

    // Banda dorada superior
    doc.setFillColor(...COLOR_GOLD);
    doc.rect(0, 0, pageW, 4, "F");

    // Onda decorativa con triángulos dorados en la base del header
    const waveY = 126;
    const triCount = 16;
    const triW = pageW / triCount;
    for (let i = 0; i < triCount; i++) {
      const x0 = i * triW;
      if (i % 2 === 0) {
        doc.setFillColor(...COLOR_BLUE);
        doc.triangle(x0, waveY, x0 + triW / 2, waveY + 8, x0 + triW, waveY, "F");
      } else {
        doc.setFillColor(...COLOR_GOLD);
        doc.triangle(x0, waveY, x0 + triW / 2, waveY + 6, x0 + triW, waveY, "F");
      }
    }

    // Ícono de grilla (2x2 cuadrados dorados)
    const gridX = margin;
    const gridY = 36;
    const sqSize = 11;
    const sqGap = 3;
    doc.setFillColor(...COLOR_GOLD);
    doc.rect(gridX, gridY, sqSize, sqSize, "F");
    doc.rect(gridX + sqSize + sqGap, gridY, sqSize, sqSize, "F");
    doc.rect(gridX, gridY + sqSize + sqGap, sqSize, sqSize, "F");
    doc.rect(gridX + sqSize + sqGap, gridY + sqSize + sqGap, sqSize, sqSize, "F");

    // Texto "VIZA" blanco + " home" dorado
    let txtX = gridX + sqSize * 2 + sqGap + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    const vizaTxt = "VIZA";
    doc.text(vizaTxt, txtX, 60);
    const vizaW = doc.getTextWidth(vizaTxt);
    doc.setTextColor(...COLOR_GOLD);
    doc.text(" home", txtX + vizaW, 60);

    // Slogan en dorado
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_GOLD);
    doc.text("Todo para tu hogar, en un solo lugar.", txtX, 76);

    // Información de contacto (texto plano, sin emojis)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(220, 220, 220);
    doc.text("Tel: (0987) 700 707   ·   Email: ventas.online@viza.com.py", txtX, 92);
    doc.text("Web: www.viza.com.py   ·   Redes: @vizahome", txtX, 104);

    // Título PRESUPUESTO SAFRA (a la derecha)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...COLOR_GOLD);
    doc.text("PRESUPUESTO", pageW - margin, 56, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("SAFRA", pageW - margin, 72, { align: "right" });

    // Caja con número y fecha (debajo del header azul)
    y = 150;
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(margin, y, contentW, 36, 6, 6, "F");
    doc.setDrawColor(214, 211, 209);
    doc.setLineWidth(1);
    doc.roundedRect(margin, y, contentW, 36, 6, 6, "D");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text("N° PRESUPUESTO:", margin + 14, y + 14);
    doc.text("FECHA DE EMISIÓN:", margin + 220, y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(28, 25, 23);
    doc.text(generateQuoteNumber(), margin + 14, y + 28);
    doc.text(
      formatDateEs(body.cliente.fecha || new Date()),
      margin + 220,
      y + 28
    );

    // ===== DATOS DEL CLIENTE (si hay) =====
    y = 200;
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
    doc.setFillColor(...COLOR_BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let xx = margin + 6;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("SKU", xx, y + 16);
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
    doc.setFillColor(...COLOR_BLUE);
    doc.roundedRect(margin, y, contentW, 28, 4, 4, "F");
    doc.text("CRONOGRAMA DE PAGOS ESCALONADOS", margin + 14, y + 18);
    y += 36;

    // Tabla de cronograma
    const cColN = 30;
    const cColConcepto = 220;
    const cColFecha = 130;
    const cColValor = contentW - cColN - cColConcepto - cColFecha;

    // Header
    doc.setFillColor(...COLOR_BLUE);
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
      doc.setTextColor(...COLOR_DARK_BLUE);
      doc.text(formatPYG(valor), pp + cColValor - 6, y + 16, {
        align: "right",
      });

      y += rowH;
      rowIdx += 1;
    };

    // Entrada inicial (destacada)
    // v3.9+: el plan-safra ahora envía "entradaValor" en vez de "fechaEntrega/valorEntrega"
    // v4.0: si fechaEntrega viene vacío, usar la fecha de emisión del cliente
    const entradaValor: number = (body as any).entradaValor || body.valorEntrega || 0;
    drawCronoRow(
      "ENTRADA INICIAL",
      body.cliente?.fecha || body.fechaEntrega || "",
      entradaValor,
      true
    );

    // Refuerzos (v3.9: ahora se envían con {fecha, valor} calculados automáticamente)
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

    // Pago final (si existe) - v3.9+: ya no se usa, pero mantenemos compat
    if (body.fechaFinal && body.valorFinal && body.valorFinal > 0) {
      drawCronoRow(
        "PAGO FINAL",
        body.fechaFinal,
        body.valorFinal,
        true
      );
    }

    // ===== RESUMEN TOTAL =====
    ensureSpace(100);
    y += 12;

    const sumBoxW = 320;
    const sumBoxX = pageW - margin - sumBoxW;

    doc.setFillColor(...COLOR_DARK_BLUE);
    doc.roundedRect(sumBoxX, y, sumBoxW, 80, 6, 6, "F");

    // Banda dorada superior
    doc.setFillColor(...COLOR_GOLD);
    doc.rect(sumBoxX, y, sumBoxW, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(217, 184, 107);
    doc.text("TOTAL DEL PLAN SAFRA:", sumBoxX + 14, y + 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatPYG(body.totalPlan), sumBoxX + sumBoxW - 14, y + 22, {
      align: "right",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 220, 220);
    doc.text("Total distribuido:", sumBoxX + 14, y + 42);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(
      formatPYG(body.totalDistribuido),
      sumBoxX + sumBoxW - 14,
      y + 42,
      { align: "right" }
    );

    // Indicador cuadre
    const cuadra = body.totalDistribuido === body.totalPlan;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (cuadra) {
      doc.setTextColor(180, 252, 200);
      doc.text("CUADRA", sumBoxX + 14, y + 62);
    } else {
      doc.setTextColor(254, 202, 202);
      doc.text(
        `Diferencia: ${formatPYG(body.totalPlan - body.totalDistribuido)}`,
        sumBoxX + 14,
        y + 62
      );
    }

    y += 100;

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

    // ===== FOOTER =====
    const footerH = 70;
    const footerY = pageH - footerH;

    doc.setFillColor(...COLOR_BLUE);
    doc.rect(0, footerY, pageW, footerH, "F");

    doc.setFillColor(...COLOR_GOLD);
    doc.rect(0, footerY, pageW, 3, "F");

    // Mini logo: grilla dorada + texto "VIZA home"
    const fGridX = margin;
    const fGridY = footerY + 12;
    const fSqSize = 6;
    const fSqGap = 1.5;
    doc.setFillColor(...COLOR_GOLD);
    doc.rect(fGridX, fGridY, fSqSize, fSqSize, "F");
    doc.rect(fGridX + fSqSize + fSqGap, fGridY, fSqSize, fSqSize, "F");
    doc.rect(fGridX, fGridY + fSqSize + fSqGap, fSqSize, fSqSize, "F");
    doc.rect(fGridX + fSqSize + fSqGap, fGridY + fSqSize + fSqGap, fSqSize, fSqSize, "F");

    let fTxtX = fGridX + fSqSize * 2 + fSqGap + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    const fViza = "VIZA";
    doc.text(fViza, fTxtX, footerY + 22);
    const fVizaW = doc.getTextWidth(fViza);
    doc.setTextColor(...COLOR_GOLD);
    doc.text(" home", fTxtX + fVizaW, footerY + 22);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_GOLD);
    doc.text("Todo para tu hogar, en un solo lugar.", fTxtX, footerY + 32);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("Tel: (0987) 700 707", fTxtX, footerY + 44);
    doc.text("Email: ventas.online@viza.com.py", fTxtX, footerY + 54);
    doc.text("Web: www.viza.com.py   ·   Redes: @vizahome", fTxtX, footerY + 64);

    // Texto legal a la derecha
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(200, 200, 200);
    doc.text(
      "VIZA HOME E.A.S · Plan Safra de pagos escalonados",
      pageW - margin,
      footerY + 12,
      { align: "right" }
    );
    doc.text(
      "Presupuesto válido por 10 días desde la fecha de emisión.",
      pageW - margin,
      footerY + 22,
      { align: "right" }
    );
    doc.text(
      "¡Gracias por elegirnos!",
      pageW - margin,
      footerY + 32,
      { align: "right" }
    );

    // Número de página si tiene múltiples páginas
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_GOLD);
        doc.text(`Página ${i} de ${totalPages}`, pageW - margin, footerY + 64, {
          align: "right",
        });
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
