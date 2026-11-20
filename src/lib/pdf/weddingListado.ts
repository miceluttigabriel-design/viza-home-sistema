import { jsPDF } from "jspdf";
import {
  VIZA_LOGO_WORDMARK_PNG,
  VIZA_LOGO_WORDMARK_RATIO,
} from "./vizaLogo";
import { formatPYG } from "./vizaPdfDesign";

// ============================================================
// LISTADO DE REGALOS — diseño "invitación" (marfil + dorado).
// Es a propósito OTRA CARA respecto del presupuesto de bodas:
// no muestra opciones de financiación ni tablas de planes.
// ============================================================

export interface WeddingListadoItem {
  sku: string;
  name: string;
  quantity: number;
  priceContado?: number | null;
  subtotalContado?: number | null;
  giverName?: string | null;
  giverPhone?: string | null;
  giverCi?: string | null;
  quoteType?: string | null;
  quoteCuotas?: number | null;
  quoteLabel?: string | null;
  quotedUnit?: number | null;
  quotedTotal?: number | null;
}

export interface WeddingListadoPayload {
  title: string;
  eventDate?: string | null;
  notes?: string | null;
  items: WeddingListadoItem[];
}

type RGB = [number, number, number];

const CREAM: RGB = [249, 244, 234];
const PAPER: RGB = [255, 253, 248];
const GOLD: RGB = [201, 167, 96];
const GOLD_DARK: RGB = [160, 124, 54];
const GOLD_SOFT: RGB = [232, 217, 184];
const NAVY: RGB = [18, 59, 92];
const INK: RGB = [44, 48, 56];
const MUTED: RGB = [134, 124, 108];

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function fechaElegante(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "";
  const [a, m, d] = iso.split("-");
  const mes = MESES[Number(m) - 1];
  if (!mes) return `${d}/${m}/${a}`;
  return `${d} DE ${mes} DE ${a}`;
}

function quoteTotalOf(it: WeddingListadoItem): number {
  const q = Number(it.quotedTotal);
  if (Number.isFinite(q) && q > 0) return q;
  const sub = Number(it.subtotalContado);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return (Number(it.priceContado) || 0) * (Number(it.quantity) || 1);
}

function quoteCuotasOf(it: WeddingListadoItem): number {
  return Math.max(1, Number(it.quoteCuotas) || 1);
}

function quoteLabelOf(it: WeddingListadoItem): string {
  const saved = String(it.quoteLabel ?? "").trim();
  if (saved) return saved.toUpperCase();
  const n = quoteCuotasOf(it);
  return n > 1 ? `PLAN ${n} CUOTAS` : "SOLO CONTADO";
}

function giverLine(it: WeddingListadoItem): string {
  const parts = [
    String(it.giverPhone ?? "").trim()
      ? `Tel. ${String(it.giverPhone).trim()}`
      : "",
    String(it.giverCi ?? "").trim() ? `CI ${String(it.giverCi).trim()}` : "",
  ].filter(Boolean);
  return parts.join("  ·  ");
}

export function generateWeddingListadoPdf(
  payload: WeddingListadoPayload
): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 46;
  const contentW = pageW - M * 2;
  const now = new Date();

  const paintPage = () => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.1);
    doc.rect(24, 24, pageW - 48, pageH - 48);
    doc.setDrawColor(...GOLD_SOFT);
    doc.setLineWidth(0.4);
    doc.rect(30, 30, pageW - 60, pageH - 60);
  };

  const drawOrnament = (cx: number, y: number, width: number) => {
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.line(cx - width / 2, y, cx - 9, y);
    doc.line(cx + 9, y, cx + width / 2, y);
    doc.setFillColor(...GOLD);
    doc.circle(cx - 13, y, 1.2, "F");
    doc.circle(cx + 13, y, 1.2, "F");
    doc.circle(cx, y, 2.4, "F");
  };

  paintPage();

  let y = 52;

  // ===== MEMBRETE =====
  const logoW = 74;
  const logoH = logoW / VIZA_LOGO_WORDMARK_RATIO;
  doc.addImage(
    VIZA_LOGO_WORDMARK_PNG,
    "PNG",
    (pageW - logoW) / 2,
    y,
    logoW,
    logoH
  );
  y += logoH + 20;

  drawOrnament(pageW / 2, y, 150);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...GOLD_DARK);
  doc.text("L I S T A   D E   B O D A S", pageW / 2, y, {
    align: "center",
    charSpace: 2.2,
  });
  y += 24;

  // Nombres de los novios (serif, como una invitación)
  const title = String(payload.title ?? "").trim() || "Lista de Bodas";
  doc.setFont("times", "bold");
  doc.setFontSize(25);
  doc.setTextColor(...NAVY);
  const titleLines = doc
    .splitTextToSize(title, contentW - 40)
    .slice(0, 2) as string[];
  for (const line of titleLines) {
    doc.text(line, pageW / 2, y, { align: "center" });
    y += 28;
  }
  y += 2;

  // Encabezado compacto para las páginas siguientes.
  const drawContinuationHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...GOLD_DARK);
    doc.text("L I S T A   D E   B O D A S", pageW / 2, 58, {
      align: "center",
      charSpace: 1.8,
    });
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    const shortTitle = (
      doc.splitTextToSize(title, contentW - 120) as string[]
    )[0] ?? title;
    doc.text(shortTitle, pageW / 2, 74, { align: "center" });
    drawOrnament(pageW / 2, 84, 92);
  };

  const fecha = fechaElegante(payload.eventDate);
  if (fecha) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.text(fecha, pageW / 2, y, { align: "center", charSpace: 1.7 });
    y += 16;
  }

  const notes = String(payload.notes ?? "").trim();
  if (notes) {
    doc.setFont("times", "italic");
    doc.setFontSize(8.4);
    doc.setTextColor(...MUTED);
    const noteLines = doc
      .splitTextToSize(notes, contentW - 110)
      .slice(0, 2) as string[];
    for (const line of noteLines) {
      doc.text(line, pageW / 2, y, { align: "center" });
      y += 11.5;
    }
  }

  y += 6;
  drawOrnament(pageW / 2, y, 110);
  y += 22;

  // ===== CONTADORES =====
  const items = payload.items;
  const totalContado = items.reduce(
    (sum, it) =>
      sum +
      (Number(it.priceContado) || 0) * (Number(it.quantity) || 1),
    0
  );
  const totalCotizado = items.reduce((sum, it) => sum + quoteTotalOf(it), 0);
  const asignados = items.filter((it) =>
    String(it.giverName ?? "").trim()
  ).length;
  const pendientes = items.length - asignados;

  const stats: { value: number; label: string }[] = [
    { value: items.length, label: "REGALOS" },
    { value: asignados, label: "ASIGNADOS" },
    { value: pendientes, label: "PENDIENTES" },
  ];
  const statsCx = pageW / 2;
  stats.forEach((stat, idx) => {
    const cx = statsCx + (idx - 1) * 116;
    doc.setFont("times", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...NAVY);
    doc.text(String(stat.value), cx, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.1);
    doc.setTextColor(...GOLD_DARK);
    doc.text(stat.label, cx, y + 10, { align: "center", charSpace: 1.5 });
    if (idx > 0) {
      doc.setDrawColor(...GOLD_SOFT);
      doc.setLineWidth(0.6);
      doc.line(cx - 58, y - 13, cx - 58, y + 8);
    }
  });
  y += 32;

  // ===== RÓTULO DE SECCIÓN =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GOLD_DARK);
  doc.text("REGALOS Y ENTREGANTES", M, y, { charSpace: 1.3 });
  const labelW = doc.getTextWidth("REGALOS Y ENTREGANTES") + 18 * 1.3 + 10;
  doc.setDrawColor(...GOLD_SOFT);
  doc.setLineWidth(0.6);
  doc.line(M + labelW + 8, y - 2.3, M + contentW, y - 2.3);
  y += 16;

  // ===== TARJETAS DE REGALOS (2 columnas) =====
  const gap = 12;
  const cardW = (contentW - gap) / 2;
  const cardH = 88;
  const rowGap = 10;
  const bottomLimit = pageH - 78;

  const drawCard = (it: WeddingListadoItem, idx: number, x: number, cy: number) => {
    doc.setFillColor(...PAPER);
    doc.setDrawColor(...GOLD_SOFT);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, cy, cardW, cardH, 7, 7, "FD");
    doc.setFillColor(...GOLD);
    doc.rect(x, cy + 6, 3, cardH - 12, "F");

    // Número de regalo
    doc.setFont("times", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...GOLD);
    doc.text(String(idx + 1).padStart(2, "0"), x + cardW - 11, cy + 16, {
      align: "right",
    });

    // Producto (hasta 2 líneas)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...INK);
    const nameLines = doc
      .splitTextToSize(it.name, cardW - 24 - 26)
      .slice(0, 2) as string[];
    let ny = cy + 18;
    for (const line of nameLines) {
      doc.text(line, x + 12, ny);
      ny += 10.4;
    }

    // SKU + cantidad
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(...MUTED);
    doc.text(
      `CANT. ${it.quantity}  ·  SKU ${it.sku}`,
      x + 12,
      cy + 40,
      { charSpace: 0.3 }
    );

    // Separador
    doc.setDrawColor(...GOLD_SOFT);
    doc.setLineWidth(0.5);
    doc.line(x + 12, cy + 48, x + cardW - 12, cy + 48);

    // Entregante
    const giver = String(it.giverName ?? "").trim();
    const contact = giverLine(it);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...GOLD_DARK);
    doc.text("ENTREGA", x + 12, cy + 59, { charSpace: 1.1 });

    if (giver) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.7);
      doc.setTextColor(...INK);
      const giverLines = doc
        .splitTextToSize(giver, cardW - 24 - 66)
        .slice(0, 1) as string[];
      doc.text(giverLines[0] ?? giver, x + 12, cy + 70);
      if (contact) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.3);
        doc.setTextColor(...MUTED);
        const contactLines = doc
          .splitTextToSize(contact, cardW - 24 - 66)
          .slice(0, 1) as string[];
        doc.text(contactLines[0] ?? contact, x + 12, cy + 79);
      }
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Pendiente de asignar", x + 12, cy + 70);
    }

    // Modalidad + valor (derecha)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...GOLD_DARK);
    const mode = quoteLabelOf(it);
    const modeLines = doc
      .splitTextToSize(mode, 82)
      .slice(0, 2) as string[];
    let my = cy + 59;
    for (const line of modeLines) {
      doc.text(line, x + cardW - 11, my, { align: "right", charSpace: 0.4 });
      my += 7.2;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(...NAVY);
    doc.text(formatPYG(quoteTotalOf(it)), x + cardW - 11, cy + 79, {
      align: "right",
    });
  };

  items.forEach((it, idx) => {
    const col = idx % 2;
    if (col === 0 && y + cardH > bottomLimit) {
      doc.addPage();
      paintPage();
      drawContinuationHeader();
      y = 102;
    }
    const x = M + col * (cardW + gap);
    drawCard(it, idx, x, y);
    if (col === 1 || idx === items.length - 1) {
      y += cardH + rowGap;
    }
  });

  // ===== TOTALES =====
  if (y + 86 > bottomLimit) {
    doc.addPage();
    paintPage();
    drawContinuationHeader();
    y = 102;
  }
  y += 2;
  drawOrnament(pageW / 2, y, 110);
  y += 16;

  const boxH = 64;
  const boxX = M + 30;
  const boxW = contentW - 60;
  doc.setFillColor(...PAPER);
  doc.setDrawColor(...GOLD_SOFT);
  doc.setLineWidth(0.7);
  doc.roundedRect(boxX, y, boxW, boxH, 8, 8, "FD");
  doc.setFillColor(...GOLD);
  doc.rect(boxX + 10, y, boxW - 20, 2.2, "F");

  const half = boxW / 2;
  doc.setDrawColor(...GOLD_SOFT);
  doc.setLineWidth(0.6);
  doc.line(boxX + half, y + 14, boxX + half, y + boxH - 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...GOLD_DARK);
  doc.text("TOTAL CONTADO", boxX + 22, y + 22, { charSpace: 1.3 });
  doc.text("TOTAL SEGÚN MODALIDAD", boxX + half + 22, y + 22, {
    charSpace: 1.3,
  });

  doc.setFont("times", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  doc.text(formatPYG(totalContado), boxX + 22, y + 46);
  doc.text(formatPYG(totalCotizado), boxX + half + 22, y + 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text(
    "Precio de contado de los regalos, sin opciones de financiación.",
    boxX + 22,
    y + 58
  );
  doc.text(
    "Suma de cada regalo en la modalidad elegida.",
    boxX + half + 22,
    y + 58
  );
  y += boxH + 18;

  // ===== PIE DE CADA PÁGINA =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD_SOFT);
    doc.setLineWidth(0.6);
    doc.line(M, pageH - 56, pageW - M, pageH - 56);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.9);
    doc.setTextColor(...GOLD_DARK);
    doc.text("VIZA HOME  ·  LISTA DE BODAS", M, pageH - 43, {
      charSpace: 1.2,
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    const fechaGen = now.toLocaleDateString("es-PY");
    doc.text(`Generado el ${fechaGen}`, pageW / 2, pageH - 43, {
      align: "center",
    });
    doc.text(`Página ${i} de ${totalPages}`, pageW - M, pageH - 43, {
      align: "right",
    });
  }

  return doc.output("arraybuffer");
}
