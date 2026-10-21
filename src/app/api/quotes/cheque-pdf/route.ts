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

function generarNumeroPresupuesto(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VZH-CHEQUE-${ymd}-${rnd}`;
}

// POST /api/quotes/cheque-pdf - genera PDF del presupuesto CON CHEQUE
// REGLA: NO mostrar columna SUBTOTAL ni bloque "Subtotal productos".
// Solo mostrar: #, SKU, DESCRIPCIÓN, CANT. (igual que en safra-pdf).
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

    // Colores corporativos VIZA
    const COLOR_BLUE: [number, number, number] = [21, 87, 137];
    const COLOR_GOLD: [number, number, number] = [217, 184, 107];
    const COLOR_DARK_BLUE: [number, number, number] = [13, 61, 94];
    const COLOR_GREEN: [number, number, number] = [40, 167, 69];
    const COLOR_RED: [number, number, number] = [220, 53, 69];

    let y = 0;

    // ===== ENCABEZADO CON IDENTIDAD VIZA HOME =====
    doc.setFillColor(...COLOR_BLUE);
    doc.rect(0, 0, pageW, 130, "F");

    doc.setFillColor(...COLOR_GOLD);
    doc.rect(0, 0, pageW, 4, "F");

    // Onda decorativa
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

    // Logo VIZA home
    doc.setTextColor(...COLOR_GOLD);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(32);
    doc.text("VIZA", margin, 50);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("home", margin + 95, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_GOLD);
    doc.text("TODO PARA TU HOGAR, EN UN SOLO LUGAR.", margin, 68);

    // Nro de presupuesto
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`PRESUPUESTO N°: ${generarNumeroPresupuesto()}`, margin, 92);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Emitido: ${formatDateEs(body.cliente.fecha || new Date().toISOString().slice(0, 10))}`, margin, 106);

    // Etiqueta derecha: PLAN CON CHEQUE
    doc.setFillColor(...COLOR_GOLD);
    doc.roundedRect(pageW - 220, 40, 178, 30, 4, 4, "F");
    doc.setTextColor(...COLOR_DARK_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PLAN CON CHEQUE", pageW - 215, 58);

    y = 150;

    // ===== DATOS DEL CLIENTE =====
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, contentW, 70, 4, 4, "F");
    doc.setDrawColor(...COLOR_GOLD);
    doc.setLineWidth(2);
    doc.line(margin, y, margin, y + 70);

    doc.setTextColor(...COLOR_BLUE);
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

    y += 90;

    // ===== TABLA DE PRODUCTOS (SIN SUBTOTAL) =====
    // REGLA: Solo mostrar #, SKU, DESCRIPCIÓN, CANT.
    // NO mostrar SUBTOTAL (es información interna de VIZA HOME).
    doc.setTextColor(...COLOR_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PRODUCTOS DE LA COTIZACIÓN", margin, y);
    y += 8;
    doc.setDrawColor(...COLOR_GOLD);
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
    doc.setFillColor(...COLOR_BLUE);
    doc.rect(margin, y - 10, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", colN + 4, y + 4);
    doc.text("SKU", colSku, y + 4);
    doc.text("DESCRIPCIÓN", colDesc, y + 4);
    doc.text("CANT.", colQty + 30, y + 4);
    y += 22;

    // Filas de productos - SIN columna SUBTOTAL
    doc.setFont("helvetica", "normal");
    body.productos.forEach((it, idx) => {
      if (y > pageH - 200) {
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

    // ===== DESCUENTO POR CASCO (si aplica) =====
    // NOTA: El bloque de casco SÍ se muestra porque es un descuento visible
    // para el cliente (no es un precio de producto, es un beneficio).
    const totalBruto = body.totalContadoBruto || 0;
    const descCasco = body.cascoAplicado && body.cascoValor ? body.cascoValor : 0;

    if (descCasco > 0) {
      // Verificar salto de página
      if (y > pageH - 100) {
        doc.addPage();
        y = margin + 10;
      }

      const cascoBoxH = 56;
      doc.setFillColor(...COLOR_GREEN);
      doc.roundedRect(margin, y, contentW, cascoBoxH, 4, 4, "F");
      doc.setFillColor(212, 237, 218);
      doc.roundedRect(margin + 3, y + 3, contentW - 6, cascoBoxH - 6, 3, 3, "F");

      doc.setTextColor(20, 100, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DESCUENTO POR CASCO", margin + 14, y + 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Producto: ${body.cascoDescripcion || "Casco"}`, margin + 14, y + 34);
      doc.setTextColor(...COLOR_RED);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("-" + formatPYG(descCasco), pageW - margin - 14, y + 36, { align: "right" });

      y += cascoBoxH + 18;
    }

    // ===== PLAN CON CHEQUE - TABLA DE CHEQUES =====
    const chequesTableH = 30 + cheques.length * 22 + 30;
    if (y + chequesTableH > pageH - 100) {
      doc.addPage();
      y = margin + 10;
    }

    doc.setTextColor(...COLOR_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PLAN CON CHEQUE", margin, y);
    y += 8;
    doc.setDrawColor(...COLOR_GOLD);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + contentW, y);
    y += 16;

    // Header tabla de cheques
    const chequeCols = {
      n: margin + 20,
      fecha: margin + 200,
      valor: margin + contentW - 50,
    };

    doc.setFillColor(...COLOR_BLUE);
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
      if (y > pageH - 80) {
        doc.addPage();
        y = margin;
      }
      const rowH = 22;
      const rowBg = idx % 2 === 0 ? [255, 255, 255] : [248, 249, 250];
      doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
      doc.rect(margin, y - 10, contentW, rowH, "F");

      doc.setTextColor(...COLOR_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Cheque ${c.numero}`, chequeCols.n - 10, y + 4);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.text(formatDateEs(c.fecha), chequeCols.fecha, y + 4);

      doc.setTextColor(...COLOR_DARK_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(formatPYG(c.valor), chequeCols.valor, y + 4, { align: "right" });

      y += rowH;
    });

    // Línea separadora
    y += 4;
    doc.setDrawColor(...COLOR_GOLD);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + contentW, y);
    y += 18;

    // Total a pagar
    const totalFinal = body.totalPagar || body.totalPlan || 0;
    const totalBoxW = 280;
    const totalBoxX = pageW - margin - totalBoxW;

    doc.setFillColor(...COLOR_GOLD);
    doc.roundedRect(totalBoxX, y - 6, totalBoxW, 36, 4, 4, "F");
    doc.setTextColor(...COLOR_DARK_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL A PAGAR:", totalBoxX + 12, y + 16);
    doc.setFontSize(14);
    doc.text(formatPYG(totalFinal), totalBoxX + totalBoxW - 12, y + 18, { align: "right" });

    y += 50;

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones) {
      if (y > pageH - 80) {
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

    // ===== FOOTER =====
    if (y > pageH - 80) {
      doc.addPage();
      y = margin;
    }
    y = pageH - 70;
    doc.setDrawColor(...COLOR_GOLD);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + contentW, y);
    y += 14;

    doc.setTextColor(...COLOR_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("VIZA HOME", margin, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("TEL: (0987) 700 707", margin, y + 26);
    doc.text("EMAIL: VENTAS.ONLINE@VIZA.COM.PY", margin, y + 38);
    doc.setTextColor(...COLOR_GOLD);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TODO PARA TU HOGAR, EN UN SOLO LUGAR", pageW - margin - 220, y + 32);

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
