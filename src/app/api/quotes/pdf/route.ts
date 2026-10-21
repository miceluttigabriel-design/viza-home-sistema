import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

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

function generateQuoteNumber(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `VZH-${ymd}-${rnd}`;
}

// POST /api/quotes/pdf - genera PDF del presupuesto profesional
export async function POST(req: NextRequest) {
  try {
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
    const margin = 42; // 15mm
    const contentW = pageW - margin * 2;

    // Colores corporativos
    const COLOR_BLUE: [number, number, number] = [21, 87, 137]; // #155789
    const COLOR_GOLD: [number, number, number] = [217, 184, 107]; // #D9B86B
    const COLOR_DARK_BLUE: [number, number, number] = [13, 61, 94]; // #0d3d5e

    let y = 0;

    // ===== ENCABEZADO CON IDENTIDAD VIZA HOME =====
    // Fondo azul corporativo
    doc.setFillColor(...COLOR_BLUE);
    doc.rect(0, 0, pageW, 130, "F");

    // Banda dorada superior (acento)
    doc.setFillColor(...COLOR_GOLD);
    doc.rect(0, 0, pageW, 4, "F");

    // Onda decorativa con triángulos dorados en la base del header
    const waveY = 126;
    const triCount = 16;
    const triW = pageW / triCount;
    for (let i = 0; i < triCount; i++) {
      const x0 = i * triW;
      // Alternar triángulos hacia abajo (efecto onda)
      if (i % 2 === 0) {
        doc.setFillColor(...COLOR_BLUE);
        doc.triangle(x0, waveY, x0 + triW / 2, waveY + 8, x0 + triW, waveY, "F");
      } else {
        doc.setFillColor(...COLOR_GOLD);
        doc.triangle(x0, waveY, x0 + triW / 2, waveY + 6, x0 + triW, waveY, "F");
      }
    }

    // Ícono de grilla (2x2 cuadrados dorados) - reemplaza la "A" de VIZA
    const gridX = margin;
    const gridY = 36;
    const sqSize = 11;
    const sqGap = 3;
    doc.setFillColor(...COLOR_GOLD);
    // Cuadrado superior izquierdo
    doc.rect(gridX, gridY, sqSize, sqSize, "F");
    // Cuadrado superior derecho
    doc.rect(gridX + sqSize + sqGap, gridY, sqSize, sqSize, "F");
    // Cuadrado inferior izquierdo
    doc.rect(gridX, gridY + sqSize + sqGap, sqSize, sqSize, "F");
    // Cuadrado inferior derecho
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

    // Título PRESUPUESTO / DE VENTA (a la derecha)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...COLOR_GOLD);
    doc.text("PRESUPUESTO", pageW - margin, 56, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("DE VENTA", pageW - margin, 72, { align: "right" });

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
    // REGLA: La FECHA DE EMISIÓN usa la fecha Y hora EXACTA del momento
    // en que se genera el PDF (no la fecha de creación de la cotización).
    // El número de presupuesto (VZH-YYYYMMDD-XXXX) también usa la fecha actual.
    doc.text(formatDateTimeEs(new Date()), margin + 220, y + 28);

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

      const clienteLines: string[] = [];
      if (body.cliente.telefono) clienteLines.push(`Teléfono/WhatsApp: ${body.cliente.telefono}`);
      if (body.cliente.documento) clienteLines.push(`Documento: ${body.cliente.documento}`);
      clienteLines.forEach((line, idx) => {
        doc.text(line, margin, y + idx * 12);
      });
      y += Math.max(clienteLines.length * 12, 12);
    }

    // ===== TABLA DE PRODUCTOS =====
    y += 15;

    // Verificar salto de página
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
    doc.text("PRODUCTOS DE LA COTIZACIÓN", margin, y);
    doc.setDrawColor(217, 184, 107);
    doc.setLineWidth(2);
    doc.line(margin, y + 4, margin + 220, y + 4);

    y += 20;
    // REGLA: Si incluirPrecioContado === false, solo mostrar #, SKU, PRODUCTO, CANT.
    // Si incluirPrecioContado === true, mostrar todas las columnas + bloque TOTAL
    const incluirPrecioContado = body.incluirPrecioContado === true;
    const colN = 25;
    const colSku = 70;
    const colCant = 50;
    const colPU = 110;
    const colSub = 110;
    const colName = incluirPrecioContado
      ? contentW - colN - colSku - colCant - colPU - colSub
      : contentW - colN - colSku - colCant;

    // Header tabla
    doc.setFillColor(21, 87, 137);
    doc.rect(margin, y, contentW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    let xx = margin + 6;
    doc.text("#", xx, y + 16);
    xx += colN;
    doc.text("SKU", xx, y + 16);
    xx += colSku;
    doc.text("PRODUCTO", xx, y + 16);
    xx += colName;
    doc.text("CANT.", xx, y + 16);
    xx += colCant;
    if (incluirPrecioContado) {
      doc.text("P. CONTADO", xx, y + 16);
      xx += colPU;
      doc.text("SUBTOTAL", xx + colSub - 8, y + 16, { align: "right" });
    }

    y += 24;

    // Filas productos
    doc.setFontSize(9);
    body.items.forEach((it, idx) => {
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
      const nameLines = doc.splitTextToSize(it.name, colName - 6);
      doc.text(nameLines.slice(0, 2), xxx, y + 13);

      xxx += colName;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(28, 25, 23);
      doc.text(String(it.quantity), xxx, y + 13);

      // Solo mostrar P. CONTADO y SUBTOTAL si incluirPrecioContado es true
      if (incluirPrecioContado) {
        xxx += colCant;
        doc.setTextColor(28, 25, 23);
        doc.text(formatPYG(it.priceContado), xxx, y + 13);
        xxx += colPU;
        doc.setFont("helvetica", "bold");
        doc.text(formatPYG(it.subtotalContado), xxx + colSub - 8, y + 13, { align: "right" });
      }

      y += rowH;
    });

    // Solo mostrar bloque TOTAL CONTADO si incluirPrecioContado es true
    if (incluirPrecioContado) {
      ensureSpace(80);
      y += 10;
      const totalBoxW = 280;
      const totalBoxX = pageW - margin - totalBoxW;

      doc.setFillColor(250, 250, 249);
      doc.setDrawColor(214, 211, 209);
      doc.setLineWidth(1);
      doc.roundedRect(totalBoxX, y, totalBoxW, 60, 6, 6, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(68, 64, 60);
      doc.text("TOTAL CONTADO:", totalBoxX + 14, y + 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(28, 25, 23);
      doc.text(formatPYG(body.contadoOriginal), totalBoxX + totalBoxW - 14, y + 22, { align: "right" });

      if (body.contadoMarginPct > 0 && body.contadoAjustado !== body.contadoOriginal) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(217, 184, 107);
        doc.text("PRECIO FINAL CONTADO:", totalBoxX + 14, y + 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(13, 61, 94);
        doc.text(formatPYG(body.contadoAjustado), totalBoxX + totalBoxW - 14, y + 42, { align: "right" });
      }

      y += 80;
    } else {
      // Sin precios: solo avanzar Y un poco después de la tabla
      y += 10;
    }

    // ===== OPCIONES DE FINANCIACIÓN (PLANES) =====
    ensureSpace(120);

    // Título principal
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(21, 87, 137);
    doc.roundedRect(margin, y, contentW, 30, 4, 4, "F");
    doc.text("OPCIONES DE FINANCIACIÓN", margin + 14, y + 20);
    y += 40;

    // Columnas más anchas para evitar superposición
    const pColBadge = 90;   // Letra + Badge (CON/SIN ENTREGA)
    const pColCuotas = 140; // Texto de cuotas
    const pColValor = 160;  // Valor por cuota
    const pColTotal = contentW - pColBadge - pColCuotas - pColValor;

    const hayPlanesConEntrega = body.mostrarConEntrega !== false && body.planes && body.planes.length > 0;
    const hayPlanesSinEntrega = body.mostrarSinEntrega !== false && body.planesSinEntrega && body.planesSinEntrega.length > 0;

    if (!hayPlanesConEntrega && !hayPlanesSinEntrega) {
      ensureSpace(50);
      doc.setFillColor(249, 250, 249);
      doc.setDrawColor(231, 229, 228);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, contentW, 38, 4, 4, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(120, 113, 108);
      doc.text("CONSULTE OPCIONES DE FINANCIACIÓN", margin + contentW / 2, y + 22, { align: "center" });
      y += 46;
    } else {
      // Header de tabla
      doc.setFillColor(21, 87, 137);
      doc.rect(margin, y, contentW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      let pp = margin + 8;
      doc.text("PLAN", pp, y + 17);
      pp += pColBadge;
      doc.text("CUOTAS", pp, y + 17);
      pp += pColCuotas;
      doc.text("VALOR POR CUOTA", pp, y + 17);
      pp += pColValor;
      doc.text("TOTAL DEL PLAN", pp + pColTotal - 8, y + 17, { align: "right" });
      y += 26;

      const rowH = 32; // Altura generosa para evitar superposición
      let rowIdx = 0;

      // ===== CON ENTREGA (saltar si cuotas === 1) =====
      if (body.mostrarConEntrega !== false && body.planes) {
        body.planes.forEach((plan) => {
          if (plan.cuotas === 1) return;
          ensureSpace(rowH);
          if (rowIdx % 2 === 0) {
            doc.setFillColor(245, 245, 244);
            doc.rect(margin, y, contentW, rowH, "F");
          }
          // Columna 1: Letra + Badge
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(217, 184, 107);
          doc.text(plan.letra, pp2, y + 20);
          // Badge CON ENTREGA (caja con fondo verde)
          doc.setFillColor(40, 167, 69); // verde sólido
          doc.rect(pp2 + 16, y + 10, 65, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text("CON ENTREGA", pp2 + 19, y + 20);
          // Columna 2: Cuotas
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(28, 25, 23);
          doc.text(`1 ENTRADA + ${plan.cuotas - 1} CUOTA${plan.cuotas - 1 !== 1 ? "S" : ""}`, pp2, y + 20);
          // Columna 3: Valor por cuota
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(220, 53, 69); // rojo
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 20);
          // Columna 4: Total
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(21, 87, 137);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 20, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }

      // ===== SIN ENTREGA (misma tabla, no bloque separado) =====
      if (hayPlanesSinEntrega && body.planesSinEntrega) {
        body.planesSinEntrega.forEach((plan) => {
          ensureSpace(rowH);
          if (rowIdx % 2 === 0) {
            doc.setFillColor(255, 251, 235);
            doc.rect(margin, y, contentW, rowH, "F");
          }
          // Columna 1: Letra + Badge
          let pp2 = margin + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(217, 184, 107);
          doc.text(plan.letra, pp2, y + 20);
          // Badge SIN ENTREGA (caja con fondo dorado)
          doc.setFillColor(255, 193, 7); // dorado sólido
          doc.rect(pp2 + 16, y + 10, 65, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(28, 25, 23);
          doc.text("SIN ENTREGA", pp2 + 19, y + 20);
          // Columna 2: Cuotas
          pp2 += pColBadge;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(28, 25, 23);
          doc.text(plan.cuotas === 1 ? "1 PAGO" : `${plan.cuotas} CUOTAS`, pp2, y + 20);
          // Columna 3: Valor por cuota
          pp2 += pColCuotas;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(230, 126, 34); // naranja
          doc.text(formatPYG(plan.valorPorCuota), pp2, y + 20);
          // Columna 4: Total
          pp2 += pColValor;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(21, 87, 137);
          doc.text(formatPYG(plan.total), pp2 + pColTotal - 8, y + 20, { align: "right" });
          y += rowH;
          rowIdx++;
        });
      }
    }

    // NOTA ESPECIAL SIN ENTREGA ELIMINADA - no mostrar información técnica al cliente

    // ===== OBSERVACIONES =====
    if (body.cliente && body.cliente.observaciones && body.cliente.observaciones.trim()) {
      ensureSpace(80);
      y += 15;
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
      const obsLines = doc.splitTextToSize(body.cliente.observaciones, contentW - 20);
      doc.text(obsLines, margin, y);
      y += obsLines.length * 12;
    }

    // ===== FOOTER =====
    const footerH = 70;
    const footerY = pageH - footerH;

    // Fondo azul corporativo del footer
    doc.setFillColor(21, 87, 137);
    doc.rect(0, footerY, pageW, footerH, "F");

    // Banda dorada superior del footer
    doc.setFillColor(217, 184, 107);
    doc.rect(0, footerY, pageW, 3, "F");

    // Mini logo: grilla dorada + texto "VIZA home"
    const fGridX = margin;
    const fGridY = footerY + 12;
    const fSqSize = 6;
    const fSqGap = 1.5;
    doc.setFillColor(217, 184, 107);
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
    doc.setTextColor(217, 184, 107);
    doc.text(" home", fTxtX + fVizaW, footerY + 22);

    // Slogan
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(217, 184, 107);
    doc.text("Todo para tu hogar, en un solo lugar.", fTxtX, footerY + 32);

    // Información de contacto (texto plano, sin emojis)
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
    doc.text("VIZA HOME E.A.S · Muebles, Electrodomésticos y Motos", pageW - margin, footerY + 12, { align: "right" });
    doc.text("Presupuesto válido por 7 días desde la fecha de emisión.", pageW - margin, footerY + 22, { align: "right" });
    doc.text("¡Gracias por elegirnos!", pageW - margin, footerY + 32, { align: "right" });

    // Número de página si tiene múltiples páginas
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(217, 184, 107);
        doc.text(`Página ${i} de ${totalPages}`, pageW - margin, footerY + 64, { align: "right" });
      }
    }

    // Generar buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

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
