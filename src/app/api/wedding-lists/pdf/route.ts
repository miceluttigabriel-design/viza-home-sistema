import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  drawHeader,
  drawFooter,
  drawSectionTitle,
  formatPYG,
  formatDateEs,
  formatDateTimeEs,
  FOOTER_RESERVE,
  BLUE,
  GOLD,
  DARK,
  GREY,
  LIGHT,
  ZEBRA,
  GOLD_LIGHT,
  LINE,
  type RGB,
} from "../../../../lib/pdf/vizaPdfDesign";

interface PdfItem {
  sku: string;
  name: string;
  quantity: number;
  priceContado: number;
  subtotalContado: number;
  // Datos del entregante (quien regala el producto)
  giverName?: string | null;
  giverPhone?: string | null;
  giverCi?: string | null;
  // Modalidad con la que se cotizó este regalo
  quoteType?: string | null;
  quoteCuotas?: number | null;
  quoteLabel?: string | null;
  quotedUnit?: number | null;
  quotedTotal?: number | null;
}

interface PdfPlan {
  letra: string;
  cuotas: number;
  valorPorCuota: number;
  total: number;
  fechas?: string[];
}

interface WeddingPdfPayload {
  title: string;
  eventDate?: string | null;
  notes?: string | null;
  vendorName?: string | null;
  items: PdfItem[];
  contadoOriginal: number;
  contadoAjustado: number;
  contadoMarginPct: number;
  planes: PdfPlan[];
  planesSinEntrega?: PdfPlan[] | null;
  mostrarConEntrega?: boolean;
  mostrarSinEntrega?: boolean;
}

function generarNumero(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `VZH-BODAS-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Fecha ISO "YYYY-MM-DD" → "DD/MM/AAAA" sin new Date(string) (evita UTC).
function fechaSegura(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "-";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "") || "Novios";
}

// POST /api/wedding-lists/pdf - PDF de la lista de bodas con diseño VIZA
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body: WeddingPdfPayload = await req.json();
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: "La lista de bodas no tiene productos" },
        { status: 400 }
      );
    }
    const title = String(body.title ?? "").trim() || "Lista de Bodas";

    // Valor de cada regalo según la modalidad elegida (con respaldo al
    // contado para payloads viejos que no traían estos campos).
    const quoteTotalOf = (it: PdfItem) => {
      const q = Number(it.quotedTotal);
      return Number.isFinite(q) && q > 0 ? q : Number(it.subtotalContado) || 0;
    };
    const quoteUnitOf = (it: PdfItem) => {
      const q = Number(it.quotedUnit);
      return Number.isFinite(q) && q > 0 ? q : Number(it.priceContado) || 0;
    };
    const quoteCuotasOf = (it: PdfItem) => Math.max(1, Number(it.quoteCuotas) || 1);
    const quoteLabelOf = (it: PdfItem) => {
      const saved = String(it.quoteLabel ?? "").trim();
      if (saved) return saved.toUpperCase();
      return quoteCuotasOf(it) > 1 ? `PLAN ${quoteCuotasOf(it)} CUOTAS` : "SOLO CONTADO";
    };

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentW = pageW - margin * 2;

    const now = new Date();
    const headerBottom = drawHeader(
      doc,
      pageW,
      margin,
      contentW,
      generarNumero(),
      "DE BODAS",
      now,
      formatDateTimeEs,
      formatDateEs
    );

    let y = headerBottom + 22;
    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - FOOTER_RESERVE) {
        doc.addPage();
        y = 60;
      }
    };

    // ===== TÍTULO DE LOS NOVIOS =====
    const boxH = 62;
    doc.setFillColor(...GOLD_LIGHT);
    doc.roundedRect(margin, y, contentW, boxH, 8, 8, "F");
    doc.setFillColor(...GOLD);
    doc.rect(margin, y, 4, boxH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BLUE);
    const titleLines = doc.splitTextToSize(title, contentW - 32);
    doc.text(titleLines.slice(0, 2), margin + 18, y + 23);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(`FECHA DEL EVENTO: ${fechaSegura(body.eventDate)}`, margin + 18, y + 44);
    if (body.vendorName) {
      doc.text(`VENDEDOR: ${body.vendorName}`, margin + contentW - 18, y + 44, {
        align: "right",
      });
    }
    y += boxH + 24;

    // ===== TABLA DE REGALOS Y ENTREGANTES =====
    ensureSpace(180);
    drawSectionTitle(doc, "LISTA DE REGALOS Y ENTREGANTES", margin, y, contentW);
    y += 14;

    const colN = 20;
    const colSku = 52;
    const colCant = 34;
    const colMode = 72;
    const colValor = 88;
    const colName =
      contentW - 7 - colN - colSku - colCant - colMode - colValor;

    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    let xx = margin + 7;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("SKU", xx, y + 16);
    xx += colSku;
    doc.text("PRODUCTO", xx, y + 16);
    xx += colName;
    doc.text("CANT.", xx, y + 16);
    xx += colCant;
    doc.text("MODALIDAD", xx, y + 16);
    doc.text("VALOR", margin + contentW - 8, y + 16, { align: "right" });
    y += 24;

    const mainH = 34;
    const subH = 16;
    body.items.forEach((it, idx) => {
      ensureSpace(mainH + subH + 2);
      const rowH = mainH + subH;
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);

      // --- Fila principal: producto + modalidad + valor ---
      let x = margin + 7;
      doc.setTextColor(...GREY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(idx + 1), x, y + 14);
      x += colN;
      doc.text(it.sku, x, y + 14);

      x += colSku;
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(it.name, colName - 8).slice(0, 2), x, y + 14);

      x += colName;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(String(it.quantity), x + 4, y + 14);

      x += colCant;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLUE);
      doc.text(
        doc.splitTextToSize(quoteLabelOf(it), colMode - 4).slice(0, 2),
        x,
        y + 14
      );

      const cuotas = quoteCuotasOf(it);
      const valorUnit = quoteUnitOf(it);
      const valorTotal = quoteTotalOf(it);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      if (cuotas > 1) {
        doc.text(formatPYG(valorUnit), margin + contentW - 8, y + 12, {
          align: "right",
        });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GREY);
        doc.text(
          `${cuotas} pagos = ${formatPYG(valorTotal)}`,
          margin + contentW - 8,
          y + 23,
          { align: "right" }
        );
      } else {
        doc.text(formatPYG(valorTotal), margin + contentW - 8, y + 14, {
          align: "right",
        });
      }

      // --- Sub-fila: persona que entrega el regalo ---
      const giverParts = [
        String(it.giverName ?? "").trim(),
        String(it.giverPhone ?? "").trim()
          ? `Tel. ${String(it.giverPhone).trim()}`
          : "",
        String(it.giverCi ?? "").trim() ? `CI ${String(it.giverCi).trim()}` : "",
      ].filter(Boolean);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      if (giverParts.length > 0) {
        doc.setTextColor(...BLUE);
        doc.text("ENTREGANTE:", margin + 7, y + mainH + 10);
        const labelW = doc.getTextWidth("ENTREGANTE: ") + 3;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        doc.text(
          doc
            .splitTextToSize(giverParts.join("  ·  "), contentW - 14 - labelW)
            .slice(0, 1),
          margin + 7 + labelW,
          y + mainH + 10
        );
      } else {
        doc.setTextColor(...GREY);
        doc.text("ENTREGANTE: SIN ASIGNAR", margin + 7, y + mainH + 10);
      }
      y += rowH;
    });

    // ===== TOTALES =====
    ensureSpace(90);
    y += 14;
    const totalBoxW = 280;
    const totalBoxX = pageW - margin - totalBoxW;
    const ajustado =
      Number(body.contadoMarginPct) > 0 &&
      Number(body.contadoAjustado) !== Number(body.contadoOriginal);
    const totalBoxH = ajustado ? 54 : 44;
    const giftsTotal = body.items.reduce((sum, it) => sum + quoteTotalOf(it), 0);
    const assignedCount = body.items.filter((it) =>
      String(it.giverName ?? "").trim()
    ).length;

    // Resumen de regalos (izquierda)
    const summaryW = totalBoxX - margin - 8;
    doc.setFillColor(...GOLD_LIGHT);
    doc.roundedRect(margin, y, summaryW, totalBoxH, 6, 6, "F");
    doc.setFillColor(...GOLD);
    doc.rect(margin, y, 3, totalBoxH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text("RESUMEN DE REGALOS", margin + 12, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text(
      `${body.items.length} regalo${body.items.length !== 1 ? "s" : ""} · ${assignedCount} asignado${assignedCount !== 1 ? "s" : ""}`,
      margin + 12,
      y + 26
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...GREY);
    doc.text("TOTAL SEGÚN MODALIDAD", margin + 12, y + totalBoxH - 6);
    doc.setFontSize(9.5);
    doc.setTextColor(...BLUE);
    doc.text(formatPYG(giftsTotal), margin + summaryW - 12, y + totalBoxH - 6, {
      align: "right",
    });

    // Total contado del presupuesto (derecha)
    doc.setFillColor(...BLUE);
    doc.rect(totalBoxX, y, totalBoxW, totalBoxH, "F");
    doc.setFillColor(...GOLD);
    doc.rect(totalBoxX, y + totalBoxH, totalBoxW, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL CONTADO", totalBoxX + 14, y + 20);
    doc.setFontSize(12);
    doc.text(formatPYG(body.contadoOriginal), totalBoxX + totalBoxW - 14, y + 20, {
      align: "right",
    });
    if (ajustado) {
      doc.setFontSize(8.5);
      doc.setTextColor(...GOLD);
      doc.text("PRECIO FINAL CONTADO", totalBoxX + 14, y + 40);
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(formatPYG(body.contadoAjustado), totalBoxX + totalBoxW - 14, y + 40, {
        align: "right",
      });
    }
    y += totalBoxH + 3 + 22;

    // ===== OPCIONES DE FINANCIACIÓN =====
    ensureSpace(120);
    drawSectionTitle(doc, "OPCIONES DE FINANCIACIÓN", margin, y, contentW);
    y += 14;

    const planes = Array.isArray(body.planes) ? body.planes : [];
    const planesSin = Array.isArray(body.planesSinEntrega) ? body.planesSinEntrega! : [];
    const hayCon = body.mostrarConEntrega !== false && planes.length > 0;
    const haySin = body.mostrarSinEntrega !== false && planesSin.length > 0;

    if (!hayCon && !haySin) {
      ensureSpace(50);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(margin, y, contentW, 38, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...GREY);
      doc.text("CONSULTE OPCIONES DE FINANCIACIÓN", margin + contentW / 2, y + 23, {
        align: "center",
      });
      y += 46;
    } else {
      const cBadge = 100;
      const cCuotas = 140;
      const cValor = 150;

      doc.setFillColor(...BLUE);
      doc.rect(margin, y, contentW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      let p = margin + 10;
      doc.text("PLAN", p, y + 17);
      p += cBadge;
      doc.text("CUOTAS", p, y + 17);
      p += cCuotas;
      doc.text("VALOR POR CUOTA", p, y + 17);
      doc.text("TOTAL DEL PLAN", margin + contentW - 10, y + 17, { align: "right" });
      y += 26;

      const rowH = 32;
      let rowIdx = 0;
      const rowBase = () => {
        if (rowIdx === 0) {
          doc.setFillColor(...GOLD_LIGHT);
          doc.rect(margin, y, contentW, rowH, "F");
          doc.setFillColor(...GOLD);
          doc.rect(margin, y, 3, rowH, "F");
        } else if (rowIdx % 2 === 0) {
          doc.setFillColor(...ZEBRA);
          doc.rect(margin, y, contentW, rowH, "F");
        }
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
      };
      const badge = (x: number, label: string, fill: RGB, text: RGB) => {
        doc.setFillColor(...fill);
        doc.roundedRect(x + 16, y + 9, 70, 15, 7.5, 7.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(...text);
        doc.text(label, x + 16 + 35, y + 19.3, { align: "center" });
      };
      const planRow = (plan: PdfPlan, conEntrega: boolean) => {
        ensureSpace(rowH);
        rowBase();
        let x = margin + 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...BLUE);
        doc.text(plan.letra, x, y + 20);
        badge(x, conEntrega ? "CON ENTREGA" : "SIN ENTREGA", conEntrega ? BLUE : GOLD, conEntrega ? ([255, 255, 255] as RGB) : BLUE);
        x += cBadge;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...DARK);
        const label = conEntrega
          ? plan.cuotas === 1
            ? "1 PAGO"
            : `1 ENTRADA + ${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`
          : plan.cuotas === 1
            ? "1 CUOTA"
            : `${plan.cuotas} CUOTAS`;
        doc.text(label, x, y + 20);
        x += cCuotas;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...BLUE);
        doc.text(formatPYG(plan.valorPorCuota), x, y + 20);
        doc.setTextColor(...DARK);
        doc.text(formatPYG(plan.total), margin + contentW - 10, y + 20, { align: "right" });
        y += rowH;
        rowIdx++;
      };

      if (hayCon) planes.forEach((plan) => planRow(plan, true));
      if (haySin) planesSin.forEach((plan) => planRow(plan, false));
    }

    // ===== OBSERVACIONES =====
    if (body.notes && body.notes.trim()) {
      ensureSpace(80);
      y += 22;
      drawSectionTitle(doc, "OBSERVACIONES", margin, y, contentW);
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GREY);
      const lines = doc.splitTextToSize(body.notes, contentW - 20);
      doc.text(lines, margin, y);
    }

    // ===== FOOTER EN TODAS LAS PÁGINAS =====
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc, pageW, pageH, margin, contentW, "LISTA DE BODAS");
      if (totalPages > 1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 8, {
          align: "right",
        });
      }
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VIZA-ListaBodas-${slug(title)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF de lista de bodas:", error);
    return NextResponse.json({ error: "Error al generar el PDF de bodas" }, { status: 500 });
  }
}
