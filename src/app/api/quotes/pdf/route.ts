import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nextSequentialQuoteNumber } from "../../../../lib/quote-number";
import { guardarQuoteEmitido } from "../../../../lib/guardar-quote";
import { db } from "../../../../lib/db";
import { leerHashtags } from "../../../../lib/producto-hashtag";
<<<<<<< HEAD
import { textoHashtagSinGs } from "../../../../lib/hashtag-formato";
=======
import { textoHashtag } from "../../../../lib/hashtag-formato";
>>>>>>> 3de7421f31d597e850acfe5b93b741e97b4f14eb
import { VIZA_LOGO_WORDMARK_PNG, VIZA_LOGO_WORDMARK_RATIO } from "../../../../lib/pdf/vizaLogo";

// Task 88 (pedido del dueño): el margen adicional del contado se muestra en
// el presupuesto como "VZH 3" (Viza Home + el número del margen, SIN el
// símbolo %). Acepta enteros y decimales: 3 → "3", 3.5 → "3,5" (coma es-PY).
const fmtMargenVzh = (pct: number): string => {
  const n = Number(pct) || 0;
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("es-PY", { maximumFractionDigits: 2 });
};

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
    hora?: string; // HH:MM:SS local del vendedor (momento de generar el PDF)
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
  // Entrega inicial personalizada (Gs) - fila destacada propia cuando > 0
  entregaPersonalizada?: number;
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

// ============================================================================
//  DISEÑO VISUAL DEL PDF (solo estilo). No toca datos ni reglas de negocio.
// ============================================================================
type RGB = [number, number, number];
const BLUE: RGB = [21, 87, 137]; // #155789  RAL 5005
const GOLD: RGB = [217, 184, 107]; // #D9B86B  RAL 1002
const DARK: RGB = [28, 37, 51];
const GREY: RGB = [107, 119, 133];
const LIGHT: RGB = [238, 243, 248];
const ZEBRA: RGB = [246, 248, 251];
const GOLD_LIGHT: RGB = [250, 243, 224];
const LINE: RGB = [216, 222, 230];
// Dorado oscuro para el texto del #HASHTAG bajo la descripción (Task 83).
const DORADO_TXT: RGB = [138, 109, 47]; // #8a6d2f

const VALIDEZ_DIAS = 10;
const FOOTER_H = 64;
const FOOTER_BOTTOM_GAP = 34; // distancia del borde inferior de la barra al fin de página
const FOOTER_RESERVE = FOOTER_H + FOOTER_BOTTOM_GAP + 14;

// Dibuja un path cerrado con curvas Bézier usando coordenadas absolutas.
type Seg = ["L", number, number] | ["C", number, number, number, number, number, number];
function fillPath(doc: jsPDF, start: [number, number], segs: Seg[], color: RGB) {
  let cx = start[0];
  let cy = start[1];
  const rel: number[][] = [];
  for (const s of segs) {
    if (s[0] === "L") {
      rel.push([s[1] - cx, s[2] - cy]);
      cx = s[1];
      cy = s[2];
    } else {
      rel.push([s[1] - cx, s[2] - cy, s[3] - cx, s[4] - cy, s[5] - cx, s[6] - cy]);
      cx = s[5];
      cy = s[6];
    }
  }
  doc.setFillColor(...color);
  doc.lines(rel, start[0], start[1], [1, 1], "F", true);
}

// Ola superior (estilo de marca): coordenadas diseñadas sobre un lienzo de 1223 x 202
// y escaladas al ancho de la página, así siempre queda pegada al borde superior/derecho.
const WAVE_LIGHT_GOLD: RGB = [224, 192, 128];
function drawWave(doc: jsPDF, pageW: number) {
  const k = pageW / 1223;
  const P = (x: number, y: number): [number, number] => [x * k, y * k];
  const C = (a: number, b: number, c: number, d: number, e: number, f: number): Seg => [
    "C", a * k, b * k, c * k, d * k, e * k, f * k,
  ];
  const L = (x: number, y: number): Seg => ["L", x * k, y * k];

  // 1) Dorado (banda diagonal que asoma debajo del azul)
  fillPath(doc, P(557, 0), [
    L(557, 40),
    C(740, 95, 930, 150, 1060, 172),
    C(1120, 182, 1180, 192, 1223, 202),
    L(1223, 0),
  ], GOLD);

  // 1b) Dorado claro en la esquina inferior derecha (queda debajo del azul, sin costuras)
  fillPath(doc, P(1100, 100), [
    L(1223, 100),
    L(1223, 202),
    C(1180, 192, 1130, 183, 1100, 177),
  ], WAVE_LIGHT_GOLD);

  // 2) Azul (forma principal, borde inferior ondulado y esquina inferior derecha redondeada)
  fillPath(doc, P(180, 0), [
    C(300, 15, 400, 42, 490, 42),
    C(570, 42, 630, 25, 700, 25),
    C(800, 25, 930, 65, 1010, 110),
    C(1060, 150, 1100, 176, 1140, 168),
    C(1190, 160, 1215, 125, 1223, 98),
    L(1223, 0),
  ], BLUE);
}

function drawHeader(doc: jsPDF, pageW: number, margin: number, contentW: number, quoteNumber: string, emision: Date, fmtDT: (d: Date) => string, fmtD: (d: Date) => string) {
  drawWave(doc, pageW);

  // Logo (wordmark real) + "home" dorado + eslogan bicolor
  const lh = 40;
  const lw = lh * VIZA_LOGO_WORDMARK_RATIO;
  doc.addImage(VIZA_LOGO_WORDMARK_PNG, "PNG", margin, 34, lw, lh);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...GOLD);
  doc.text("home", margin + lw + 6, 73);

  doc.setFontSize(8.5);
  const s1 = "Todo para tu hogar";
  doc.setTextColor(...GOLD);
  doc.text(s1, margin, 88);
  doc.setTextColor(...BLUE);
  doc.text(", en un solo lugar.", margin + doc.getTextWidth(s1), 88);

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...BLUE);
  doc.text("PRESUPUESTO", margin, 150);
  const tw = doc.getTextWidth("PRESUPUESTO");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("DE VENTA", margin + tw + 8, 150);
  doc.setFillColor(...GOLD);
  doc.rect(margin, 160, 48, 2.5, "F");

  // 3 cajas: N° / EMISIÓN / VÁLIDO HASTA
  const gap = 10;
  const bw = (contentW - gap * 2) / 3;
  const by = 173;
  const bh = 42;
  const validez = new Date(emision);
  validez.setDate(validez.getDate() + VALIDEZ_DIAS);
  const boxes: [string, string][] = [
    ["N° PRESUPUESTO", quoteNumber],
    ["FECHA DE EMISIÓN", fmtDT(emision)],
    ["VÁLIDO HASTA", fmtD(validez)],
  ];
  boxes.forEach(([label, value], i) => {
    const x = margin + i * (bw + gap);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, by, bw, bh, 8, 8, "F");
    doc.setFillColor(...BLUE);
    doc.rect(x, by + 10, 3, bh - 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...GREY);
    doc.text(label, x + 14, by + 15);
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text(value, x + 14, by + 33);
  });
  return by + bh; // y inferior del encabezado
}

function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number, w: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BLUE);
  doc.text(text, x, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(x, y + 5, x + w, y + 5);
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, margin: number, contentW: number) {
  const x = margin;
  const h = FOOTER_H;
  const y = pageH - FOOTER_BOTTOM_GAP - h;
  const split = contentW * 0.5;
  // Barra: dorado de fondo + azul a la izquierda (esquinas redondeadas)
  doc.setFillColor(...GOLD);
  doc.roundedRect(x, y, contentW, h, 12, 12, "F");
  doc.setFillColor(...BLUE);
  doc.roundedRect(x, y, split + 14, h, 12, 12, "F");
  doc.setFillColor(...GOLD);
  doc.rect(x + split, y, 14, h, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text("VENTAS ONLINE", x + 18, y + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("WhatsApp: (0987) 700 707", x + 18, y + 34);
  doc.text("ventas.online@viza.com.py", x + 18, y + 47);

  doc.setTextColor(...BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("SEGUINOS", x + split + 18, y + 19);
  doc.text("VISITÁNOS", x + split + 135, y + 19);
  doc.setFontSize(8);
  doc.text("Facebook · Instagram", x + split + 18, y + 34);
  doc.text("@vizahome", x + split + 18, y + 47);
  doc.text("www.viza.com.py", x + split + 135, y + 34);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...GREY);
  doc.text(
    `Viza E.A.S (Viza Home) Presupuesto válido por ${VALIDEZ_DIAS} días desde la fecha de emisión.`,
    pageW / 2,
    pageH - 20,
    { align: "center" }
  );
}
// POST /api/quotes/pdf - genera PDF del presupuesto profesional
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body: PdfPayload = await req.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: "El presupuesto no tiene productos" }, { status: 400 });
    }

    // === BLOQUEO DE SEGURIDAD: EL CASCO ES UN REGALO OBLIGATORIO ===
    // REGLA DE NEGOCIO: Si el vendedor marcó "Aplicar descuento por casco",
    // DEBE ingresar el valor del descuento. El sistema NO permite generar el PDF
    // si el casco está activado pero el descuento no fue aplicado.
    // El casco es un regalo de VIZA Home y DEBE figurar como descuento en el PDF.
    if (body.cascoAplicado && (!body.cascoValor || body.cascoValor <= 0)) {
      return NextResponse.json(
        {
          error:
            "BLOQUEO DE SEGURIDAD: No se puede generar el PDF. El casco es un regalo de Viza Home y es OBLIGATORIO aplicar el valor del descuento del casco. Complete el valor del descuento o desmarque el casco.",
        },
        { status: 400 }
      );
    }
    // Validación adicional: el valor del casco no puede ser mayor al total de productos
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
    const margin = 42;
    const contentW = pageW - margin * 2;

    // ===== ENCABEZADO (solo página 1) =====
    const now = parseFechaEmision(body.cliente?.fecha, body.cliente?.hora) ?? new Date();
    // N° SECUENCIAL por (plan PRESUPUESTO, usuario): PRESUPUESTO-01, 02 ...
    // (Task 78: el número se captura en una variable para registrar la
    // EMISIÓN en la base y que el CRM la contabilice — mismo número
    // impreso en el PDF = mismo número en el ranking por plan.)
    const quoteNumberPresupuesto = await nextSequentialQuoteNumber("PRESUPUESTO", (session.user as any)?.id);
    const headerBottom = drawHeader(
      doc,
      pageW,
      margin,
      contentW,
      quoteNumberPresupuesto,
      now,
      formatDateTimeEs,
      formatDateEs
    );

    let y = headerBottom + 26;

    // Salto de página respetando el espacio de la barra del footer
    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - FOOTER_RESERVE) {
        doc.addPage();
        y = 60;
      }
    };

    // ===== DATOS DEL CLIENTE (si hay) =====
    if (body.cliente && body.cliente.nombre) {
      drawSectionTitle(doc, "DATOS DEL CLIENTE", margin, y, contentW);
      y += 14;
      const hasTel = !!body.cliente.telefono;
      const hasDoc = !!body.cliente.documento;
      const boxH = 40;
      doc.setFillColor(...LIGHT);
      doc.rect(margin, y, contentW, boxH, "F");
      const cols: [string, string, number][] = [["CLIENTE", body.cliente.nombre, margin + 12]];
      const c2 = margin + contentW * 0.5;
      const c3 = margin + contentW * 0.75;
      if (hasDoc) cols.push(["DOCUMENTO", body.cliente.documento, c2]);
      if (hasTel) cols.push(["TELÉFONO / WHATSAPP", body.cliente.telefono, hasDoc ? c3 : c2]);
      cols.forEach(([label, value, cx], i) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.setTextColor(...GREY);
        doc.text(label, cx, y + 15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...DARK);
        const maxW = i === 0 ? contentW * 0.5 - 20 : contentW * 0.25 - 10;
        doc.text(doc.splitTextToSize(value, maxW)[0], cx, y + 29);
      });
      y += boxH + 20;
    }

    // ===== TABLA DE PRODUCTOS =====
    ensureSpace(180);
    drawSectionTitle(doc, "PRODUCTOS DE LA COTIZACIÓN", margin, y, contentW);
    y += 14;

    // REGLA: Si incluirPrecioContado === false, solo mostrar #, SKU, PRODUCTO, CANT.
    // Si incluirPrecioContado === true, mostrar todas las columnas + bloque TOTAL
    const incluirPrecioContado = body.incluirPrecioContado === true;

    // === MARGEN SOBRE PRECIO CONTADO ===
    // Si el vendedor aplicó un margen % sobre el contado, el PDF muestra el
    // precio YA CON MARGEN en P.CONTADO y SUBTOTAL. Así el cliente ve UN
    // solo valor coherente en todo el presupuesto (nunca el precio "sin
    // margen" junto a un precio final distinto).
    const ajusteContado =
      body.contadoMarginPct > 0 &&
      body.contadoAjustado !== body.contadoOriginal &&
      body.contadoOriginal > 0;
    const factorContado = ajusteContado
      ? body.contadoAjustado / body.contadoOriginal
      : 1;
    let itemsConMargen: PdfItem[] = body.items;
    if (ajusteContado) {
      itemsConMargen = body.items.map((it) => {
        const p = Math.round(it.priceContado * factorContado);
        return { ...it, priceContado: p, subtotalContado: p * it.quantity };
      });
      // Ajuste fino: la diferencia de redondeo (± pocos Gs) se reparte en el
      // item de mayor subtotal para que la suma de la columna sea EXACTAMENTE
      // el precio final con margen (contadoAjustado).
      const sumaConMargen = itemsConMargen.reduce(
        (s, it) => s + it.subtotalContado,
        0
      );
      const difRedondeo = Math.round(body.contadoAjustado) - sumaConMargen;
      if (difRedondeo !== 0 && itemsConMargen.length > 0) {
        const maxSub = Math.max(
          ...itemsConMargen.map((it) => it.subtotalContado)
        );
        let yaAjustado = false;
        itemsConMargen = itemsConMargen.map((it) => {
          if (!yaAjustado && it.subtotalContado === maxSub) {
            yaAjustado = true;
            const nuevoSub = it.subtotalContado + difRedondeo;
            const nuevoPrecio =
              it.quantity === 1 ? nuevoSub : Math.round(nuevoSub / it.quantity);
            return {
              ...it,
              priceContado: nuevoPrecio,
              subtotalContado: nuevoSub,
            };
          }
          return it;
        });
      }
    }
    // #HASHTAG por producto (Task 83, pedido del dueño): se lee DIRECTO de
    // la base por sku (tabla aparte ProductHashtag) y se dibuja DEBAJO de la
<<<<<<< HEAD
    // descripción: "# 200" (el valor 200.000 de la base en miles, sin los
=======
    // descripción: "# 200 GS" (el valor 200.000 de la base en miles, sin los
>>>>>>> 3de7421f31d597e850acfe5b93b741e97b4f14eb
    // ceros). Si la lectura falla, el PDF sale igual sin el hashtag.
    const hashtagPorSku = new Map<string, string>();
    try {
      const skusHashtag = Array.from(
        new Set(itemsConMargen.map((it) => (it.sku || "").trim()).filter(Boolean))
      );
      if (skusHashtag.length > 0) {
        const prodsHashtag = await db.product.findMany({
          where: { sku: { in: skusHashtag } },
          select: { id: true, sku: true },
        });
        const idPorSku = new Map(prodsHashtag.map((p) => [p.sku, p.id]));
        const mapaHashtags = await leerHashtags(Array.from(idPorSku.values()));
        for (const [sku, id] of idPorSku) {
          const h = mapaHashtags.get(id);
<<<<<<< HEAD
          const txt = textoHashtagSinGs(h?.valor ?? null); // Task 88B: sin "GS"
=======
          const txt = textoHashtag(h?.valor ?? null);
>>>>>>> 3de7421f31d597e850acfe5b93b741e97b4f14eb
          if (txt) hashtagPorSku.set(sku, txt);
        }
      }
    } catch {
      // sin hashtag en el PDF si falla — el resto del presupuesto sale igual
    }

    const colN = 25;
    const colSku = 70;
    const colCant = 50;
    const colPU = 110;
    const colSub = 110;
    const colName = incluirPrecioContado
      ? contentW - colN - colSku - colCant - colPU - colSub
      : contentW - colN - colSku - colCant;

    // Header tabla
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    let xx = margin + 8;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("COD", xx, y + 16);
    xx += colSku;
    doc.text("PRODUCTO", xx, y + 16);
    xx += colName;
    doc.text("CANT.", xx, y + 16);
    xx += colCant;
    if (incluirPrecioContado) {
      doc.text("P. CONTADO", xx, y + 16);
      xx += colPU;
      doc.text("SUBTOTAL", margin + contentW - 10, y + 16, { align: "right" });
    }
    y += 24;

    // Filas productos (con margen aplicado al P.CONTADO si corresponde)
    itemsConMargen.forEach((it, idx) => {
      // #HASHTAG (Task 83): si el producto tiene, la fila crece 30→40 para
      // que el hashtag entre bien abajo de la descripción sin pisar nada.
      const hashtagTxt = hashtagPorSku.get((it.sku || "").trim()) || "";
      const rowH = hashtagTxt ? 40 : 30;
      ensureSpace(rowH + 4);
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);

      let xxx = margin + 8;
      doc.setTextColor(...GREY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(idx + 1), xxx, y + 13);
      xxx += colN;
      doc.text(it.sku, xxx, y + 13);

      xxx += colSku;
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const nameLines = doc.splitTextToSize(it.name, colName - 6);
      doc.text(nameLines.slice(0, 2), xxx, y + 13);
<<<<<<< HEAD
      // #HASHTAG bien abajo de la descripción (Task 83): "# 200" en dorado.
=======
      // #HASHTAG bien abajo de la descripción (Task 83): "# 200 GS" en dorado.
>>>>>>> 3de7421f31d597e850acfe5b93b741e97b4f14eb
      if (hashtagTxt) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...DORADO_TXT);
        doc.text(hashtagTxt, xxx, y + 13 + nameLines.length * 9.5 + 1.5);
        doc.setTextColor(...DARK); // restaurar para cant./precios de la misma fila
      }

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(String(it.quantity), xxx + 6, y + 13);

      if (incluirPrecioContado) {
        xxx += colCant;
        doc.setTextColor(...DARK);
        doc.text(formatPYG(it.priceContado), xxx, y + 13);
        xxx += colPU;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BLUE);
        doc.text(formatPYG(it.subtotalContado), margin + contentW - 10, y + 13, { align: "right" });
      }
      y += rowH;
    });

    // Bloque TOTAL CONTADO (solo si incluirPrecioContado)
    if (incluirPrecioContado) {
      ensureSpace(70);
      y += 10;
      const totalBoxW = 280;
      const totalBoxX = pageW - margin - totalBoxW;
      // UNA SOLA FILA: el TOTAL CONTADO ya muestra el precio final (con el
      // margen incluido cuando el vendedor lo aplicó). No se duplica la misma
      // información con una segunda fila "PRECIO FINAL CONTADO".
      // Task 88 (pedido del dueño): si hay margen adicional, la caja crece
      // (32→44) para que entre la línea "VZH 3" debajo de la etiqueta.
      const boxH = ajusteContado ? 44 : 32;

      doc.setFillColor(...BLUE);
      doc.rect(totalBoxX, y, totalBoxW, boxH, "F");
      doc.setFillColor(...GOLD);
      doc.rect(totalBoxX, y + boxH, totalBoxW, 3, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text("TOTAL CONTADO", totalBoxX + 14, y + 20);
      doc.setFontSize(12);
      // Con margen aplicado el TOTAL muestra el precio final (mismo valor que
      // P.CONTADO y SUBTOTAL de los productos arriba).
      doc.text(
        formatPYG(ajusteContado ? body.contadoAjustado : body.contadoOriginal),
        totalBoxX + totalBoxW - 14,
        y + 20,
        { align: "right" }
      );
      // Task 88 (pedido del dueño): el margen adicional aplicado al contado
      // sale como "VZH 3" (Viza Home + el número, SIN el símbolo %) justo
      // debajo de la etiqueta TOTAL CONTADO, en dorado sobre el azul. Si no
      // hay margen, no sale nada (caja normal de siempre).
      if (ajusteContado) {
        doc.setFontSize(8);
        doc.setTextColor(...GOLD);
        doc.text(
          `VZH ${fmtMargenVzh(body.contadoMarginPct)}`,
          totalBoxX + 14,
          y + 34
        );
      }

      y += boxH + 3 + 22;
    } else {
      y += 18;
    }

    // ===== OPCIONES DE FINANCIACIÓN (PLANES) =====
    // Planes de financiación = los de cuotas > 1. El plan "Contado"
    // (cuotas === 1) se muestra como fila propia de la tabla (opción A),
    // también cuando el presupuesto se genera SOLO con el contado.
    const planesFin = (body.planes || []).filter((p) => p.cuotas > 1);
    const hayContado = (body.planes || []).some((p) => p.cuotas === 1);
    const hayPlanesConEntrega = body.mostrarConEntrega !== false && planesFin.length > 0;
    const hayPlanesSinEntrega = body.mostrarSinEntrega !== false && body.planesSinEntrega && body.planesSinEntrega.length > 0;

    // CONTADO SOLO: si la única opción es el "Plan A: Contado" (sin ningún
    // plan de cuotas), NO se dibuja la sección "OPCIONES DE FINANCIACIÓN":
    // sería repetir el mismo valor que ya muestra el TOTAL CONTADO de arriba.
    const soloContado =
      hayContado && planesFin.length === 0 && !hayPlanesSinEntrega;

    if (!soloContado) {
      ensureSpace(120);
      drawSectionTitle(doc, "OPCIONES DE FINANCIACIÓN", margin, y, contentW);
      y += 14;

      const pColBadge = 100;
      const pColCuotas = 140;
      const pColValor = 150;
      const pColTotal = contentW - pColBadge - pColCuotas - pColValor;

      if (!hayPlanesConEntrega && !hayPlanesSinEntrega && !hayContado) {
      ensureSpace(50);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(margin, y, contentW, 38, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...GREY);
      doc.text("CONSULTE OPCIONES DE FINANCIACIÓN", margin + contentW / 2, y + 23, { align: "center" });
      y += 46;
    } else {
      // Header de tabla
      doc.setFillColor(...BLUE);
      doc.rect(margin, y, contentW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      let pp = margin + 10;
      doc.text("PLAN", pp, y + 17);
      pp += pColBadge;
      doc.text("CUOTAS", pp, y + 17);
      pp += pColCuotas;
      doc.text("VALOR POR CUOTA", pp, y + 17);
      pp += pColValor;
      doc.text("TOTAL DEL PLAN", margin + contentW - 10, y + 17, { align: "right" });
      y += 26;

      const rowH = 32;
      let rowIdx = 0;

      // Estilo común de fila (fondo + cinta dorada en la primera)
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

      // ===== CON ENTREGA + FILA CONTADO (opción A, también contado solo) =====
      if ((body.mostrarConEntrega !== false && planesFin.length > 0) || hayContado) {
        // === ENTREGA INICIAL PERSONALIZADA: fila destacada propia ===
        // Si el vendedor definió una entrega inicial distinta a la 1ª cuota
        // estándar, se muestra como fila propia arriba de los planes, y cada
        // plan muestra solo las cuotas restantes (el total de cada plan ya
        // viene ajustado: entrega + cuotas = total estándar ± redondeo Gs).
        const entregaInicial = Math.max(
          0,
          Math.round(body.entregaPersonalizada || 0)
        );
        if (entregaInicial > 0) {
          ensureSpace(rowH);
          rowBase();
          let ppE = margin + 10;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(...BLUE);
          doc.text("E", ppE, y + 20);
          ppE += pColBadge;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(...DARK);
          doc.text("ENTREGA INICIAL", ppE, y + 20);
          ppE += pColCuotas;
          ppE += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...DARK);
          doc.text(
            formatPYG(entregaInicial),
            margin + contentW - 10,
            y + 20,
            { align: "right" }
          );
          y += rowH;
          rowIdx++;
        }
        body.planes.forEach((plan) => {
          // === FILA CONTADO (cuotas === 1) ===
          // Se muestra siempre que el vendedor incluya el contado en el
          // presupuesto (incluido el caso SOLO CONTADO, sin planes).
          if (plan.cuotas === 1) {
            ensureSpace(rowH);
            rowBase();
            let ppC = margin + 10;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(...BLUE);
            doc.text(plan.letra, ppC, y + 20);
            badge(ppC, "CONTADO", GOLD, BLUE);
            ppC += pColBadge;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.5);
            doc.setTextColor(...DARK);
            doc.text("Contado", ppC, y + 20);
            ppC += pColCuotas;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(...BLUE);
            doc.text(formatPYG(plan.valorPorCuota), ppC, y + 20);
            ppC += pColValor;
            doc.setTextColor(...DARK);
            doc.text(formatPYG(plan.total), margin + contentW - 10, y + 20, { align: "right" });
            y += rowH;
            rowIdx++;
            return;
          }
          ensureSpace(rowH);
          rowBase();
          let pp2 = margin + 10;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(...BLUE);
          doc.text(plan.letra, pp2, y + 20);
          badge(pp2, "CON ENTREGA", BLUE, [255, 255, 255]);
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...DARK);
          doc.text(
            entregaInicial > 0
              ? `${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`
              : `1 ENTRADA + ${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`,
            pp2,
            y + 20
          );
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 20);
          pp2 += pColValor;
          doc.setTextColor(...DARK);
          doc.text(formatPYG(plan.total), margin + contentW - 10, y + 20, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }

      // ===== SIN ENTREGA (misma tabla, no bloque separado) =====
      if (hayPlanesSinEntrega && body.planesSinEntrega) {
        body.planesSinEntrega.forEach((plan) => {
          ensureSpace(rowH);
          rowBase();
          let pp2 = margin + 10;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(...BLUE);
          doc.text(plan.letra, pp2, y + 20);
          badge(pp2, "SIN ENTREGA", GOLD, BLUE);
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...DARK);
          doc.text(plan.cuotas === 1 ? "1 PAGO" : `${plan.cuotas} CUOTAS`, pp2, y + 20);
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...BLUE);
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 20);
          pp2 += pColValor;
          doc.setTextColor(...DARK);
          doc.text(formatPYG(plan.total), margin + contentW - 10, y + 20, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }
    }
    } // fin if (!soloContado)

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones && body.cliente.observaciones.trim()) {
      ensureSpace(80);
      y += 22;
      drawSectionTitle(doc, "OBSERVACIONES", margin, y, contentW);
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GREY);
      const obsLines = doc.splitTextToSize(body.cliente.observaciones, contentW - 20);
      doc.text(obsLines, margin, y);
      y += obsLines.length * 12;
    }

    // ===== FOOTER (en todas las páginas) + numeración =====
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc, pageW, pageH, margin, contentW);
      if (totalPages > 1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
      }
    }

    // Generar buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // REGISTRO DE EMISIÓN (Task 78, pedido del dueño): queda en la base
    // para que el CRM contabilice el presupuesto CUOTA emitido. Este es el
    // flujo principal del panel de ventas (plan A/B/C): antes NUNCA se
    // guardaba y por eso el CRM no contaba estos presupuestos.
    // Best-effort: si falla, el PDF sale igual (nunca rompe la emisión).
    await guardarQuoteEmitido({
      plan: "PRESUPUESTO",
      quoteNumber: quoteNumberPresupuesto,
      userId: (session.user as any)?.id,
      customerName: body.cliente?.nombre,
      customerPhone: body.cliente?.telefono,
      notes: body.cliente?.observaciones,
      subtotal: body.contadoOriginal,
      discount: body.cascoValor ?? 0,
      total: body.contadoAjustado ?? body.contadoOriginal ?? 0,
    });

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
