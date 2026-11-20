import { jsPDF } from "jspdf";
import {
  VIZA_LOGO_WORDMARK_PNG,
  VIZA_LOGO_WORDMARK_RATIO,
} from "./vizaLogo";
import { formatPYG, SUCURSALES_LINEA } from "./vizaPdfDesign";
import { VIZA_FLORAL_BR_PNG, VIZA_FLORAL_TL_PNG } from "./weddingFloral";

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

// Colores del presupuesto VIZA HOME (azul + dorado).
const CREAM: RGB = [252, 251, 247];
const PAPER: RGB = [255, 255, 255];
const GOLD: RGB = [217, 184, 107];
const GOLD_DARK: RGB = [138, 106, 31];
const GOLD_SOFT: RGB = [236, 224, 190];
const CARD_LINE: RGB = [214, 224, 235];
const NAVY: RGB = [21, 87, 137];
const INK: RGB = [28, 37, 51];
const MUTED: RGB = [107, 119, 133];
const BLUE_SOFT: RGB = [238, 243, 248];

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
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 46;
  const contentW = pageW - M * 2;
  const now = new Date();

  const paintPage = (first = true) => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1);
    doc.rect(24, 24, pageW - 48, pageH - 48);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.rect(30, 30, pageW - 60, pageH - 60);
    // Ramos de flores en las esquinas (grandes en la 1ª página, chicos en el resto)
    const fs = first ? 215 : 130;
    doc.addImage(VIZA_FLORAL_TL_PNG, "PNG", 0, 0, fs, fs, "viza-floral-tl");
    doc.addImage(VIZA_FLORAL_BR_PNG, "PNG", pageW - fs, pageH - fs, fs, fs, "viza-floral-br");
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

  let y = 44;

  // ===== MEMBRETE (igual al del presupuesto: logo + "home" + eslogan) =====
  const logoH = 30;
  const logoW = logoH * VIZA_LOGO_WORDMARK_RATIO;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  const homeW = doc.getTextWidth("home");
  const headX = (pageW - (logoW + 5 + homeW)) / 2;
  doc.addImage(VIZA_LOGO_WORDMARK_PNG, "PNG", headX, y, logoW, logoH);
  doc.setTextColor(...GOLD);
  doc.text("home", headX + logoW + 5, y + logoH - 1);
  doc.setFontSize(7.4);
  const s1 = "Todo para tu hogar";
  const s2 = ", en un solo lugar.";
  const sw = doc.getTextWidth(s1) + doc.getTextWidth(s2);
  doc.setTextColor(...GOLD);
  doc.text(s1, (pageW - sw) / 2, y + logoH + 12);
  doc.setTextColor(...NAVY);
  doc.text(s2, (pageW - sw) / 2 + doc.getTextWidth(s1), y + logoH + 12);
  y += logoH + 26;

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

  y += 4;
  drawOrnament(pageW / 2, y, 110);
  y += 18;

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
  y += 26;

  // ===== RÓTULO DE SECCIÓN =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...NAVY);
  doc.text("REGALOS Y ENTREGANTES", M, y, { charSpace: 1.3 });
  const labelW = doc.getTextWidth("REGALOS Y ENTREGANTES") + 18 * 1.3 + 10;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(M + labelW + 8, y - 2.3, M + contentW, y - 2.3);
  y += 16;

  // ===== TARJETAS DE REGALOS (2 columnas) =====
  const gap = 12;
  const cardW = (contentW - gap) / 2;
  const cardH = 88;
  const rowGap = 8;
  const bottomLimit = pageH - 108;

  const drawCard = (it: WeddingListadoItem, idx: number, x: number, cy: number) => {
    doc.setFillColor(...PAPER);
    doc.setDrawColor(...CARD_LINE);
    doc.setLineWidth(0.7);
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

    // Modalidad + valor (derecha).
    // El plan de cuotas es información privada: el listado NO lo muestra.
    const rawMode = quoteLabelOf(it);
    const hidePlan =
      String(it.quoteType ?? "").toLowerCase() === "cuota" ||
      /CUOTA|PLAN/i.test(rawMode);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...NAVY);
    const modeLines = doc
      .splitTextToSize(rawMode, 82)
      .slice(0, 2) as string[];
    let my = cy + 59;
    if (!hidePlan) {
      for (const line of modeLines) {
        doc.text(line, x + cardW - 11, my, { align: "right", charSpace: 0.4 });
        my += 7.2;
      }
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
      paintPage(false);
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
    paintPage(false);
    drawContinuationHeader();
    y = 102;
  }
  y += 4;

  const boxH = 66;
  const boxX = M + 30;
  const boxW = contentW - 60;
  doc.setFillColor(...GOLD);
  doc.roundedRect(boxX, y + 3, boxW, boxH, 9, 9, "F");
  doc.setFillColor(...NAVY);
  doc.roundedRect(boxX, y, boxW, boxH, 9, 9, "F");

  const half = boxW / 2;
  doc.setDrawColor(70, 125, 170);
  doc.setLineWidth(0.6);
  doc.line(boxX + half, y + 14, boxX + half, y + boxH - 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.4);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL CONTADO", boxX + 22, y + 22, { charSpace: 1.3 });
  doc.text("TOTAL SEGÚN MODALIDAD", boxX + half + 22, y + 22, {
    charSpace: 1.3,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(formatPYG(totalContado), boxX + 22, y + 44);
  doc.text(formatPYG(totalCotizado), boxX + half + 22, y + 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(205, 220, 235);
  doc.text(
    "Precio de contado de los regalos, sin opciones de financiación.",
    boxX + 22,
    y + 57
  );
  doc.text(
    "Suma de cada regalo en la modalidad elegida.",
    boxX + half + 22,
    y + 57
  );
  y += boxH + 18;

  // ===== PIE DE CADA PÁGINA (datos de VIZA HOME, igual al presupuesto) =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const bx = M;
    const bw = contentW;
    const bh = 46;
    const by = pageH - 40 - bh;

    // Sucursales encima de la barra
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(...NAVY);
    doc.text(SUCURSALES_LINEA, pageW / 2, by - 7, { align: "center" });

    const split = bw * 0.5;
    doc.setFillColor(...GOLD);
    doc.roundedRect(bx, by, bw, bh, 10, 10, "F");
    doc.setFillColor(...NAVY);
    doc.roundedRect(bx, by, split + 12, bh, 10, 10, "F");
    doc.setFillColor(...GOLD);
    doc.rect(bx + split, by, 12, bh, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(255, 255, 255);
    doc.text("VENTAS ONLINE", bx + 16, by + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.text("WhatsApp: (0987) 700 707", bx + 16, by + 27);
    doc.text("ventas.online@viza.com.py", bx + 16, by + 38);

    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text("SEGUINOS", bx + split + 18, by + 15);
    doc.text("VISITANOS", bx + split + 128, by + 15);
    doc.setFontSize(7.4);
    doc.text("Facebook · Instagram", bx + split + 18, by + 27);
    doc.text("@vizahome", bx + split + 18, by + 38);
    doc.text("www.viza.com.py", bx + split + 128, by + 27);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    const fechaGen = now.toLocaleDateString("es-PY");
    doc.text(
      `Viza E.A.S (Viza Home)  ·  Lista de Bodas  ·  Generado el ${fechaGen}  ·  Página ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 34,
      { align: "center" }
    );
  }

  return doc.output("arraybuffer");
}
