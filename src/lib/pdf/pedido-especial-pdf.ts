// ============================================================
// PEDIDO ESPECIAL — PDF DEL PRESUPUESTO GUARDADO (Task 113 v5)
//
// El dueño pidió: "el formato del plan que sale en el pedido especial
// quiero que salga IGUAL del presupuesto". O sea: el PDF del pedido
// especial tiene que verse como el PRESUPUESTO DE VENTA de siempre
// (src/app/api/quotes/pdf/route.ts) — MISMA estructura, MISMA tabla
// de financiación, MISMO cuadro de total:
//
//   1. PRODUCTOS DE LA COTIZACIÓN → tabla # | COD | PRODUCTO |
//      CANT. | P. CONTADO | SUBTOTAL + cuadro TOTAL CONTADO (azul con
//      banda dorada, igual que el presupuesto).
//   2. OPCIONES DE FINANCIACIÓN → la MISMA tabla del presupuesto
//      (PLAN · CUOTAS · VALOR POR CUOTA · TOTAL DEL PLAN) con la fila
//      del plan elegido: letra + etiqueta redondeada (CONTADO dorado /
//      CON ENTREGA azul / SIN ENTREGA dorado / MAYORISTA / SAFRA / CON
//      CHEQUE), primera fila con fondo dorado claro y cinta dorada.
//   3. Planes con calendario: SAFRA dibuja el CRONOGRAMA DE PAGOS
//      (igual que el PDF SAFRA del sistema) y CHEQUE su tabla de
//      cheques (igual que el PDF CON CHEQUE).
//   4. Al plan CONTADO no se le dibuja la sección de financiación
//      (misma regla "soloContado" del presupuesto: sería repetir el
//      TOTAL CONTADO de arriba).
//   5. Franja del VENDEDOR abajo de todo + barra de contacto VIZA en
//      TODAS las páginas + "Página i de n" (igual que el presupuesto).
//
// El PDF es para el CLIENTE: NO muestra costo, ni %, ni márgenes (eso
// es interno del vendedor) — solo producto, plan y valores a pagar.
//
// Función PURA (recibe la fila congelada del historial y devuelve el
// jsPDF doc): así la ruta solo autentica y la prueba de humo puede
// generar los 6 planes sin tocar la base ni la sesión.
// ============================================================
import { jsPDF } from "jspdf";
import {
  BLUE,
  DARK,
  GOLD,
  GOLD_LIGHT,
  GREY,
  LIGHT,
  LINE,
  ZEBRA,
  drawFooter,
  drawHeader,
  drawSectionTitle,
  drawVendedor,
  formatDateTimeEs,
  formatDateEs,
  formatPYG,
  yVendedorSobreFooter,
} from "./vizaPdfDesign";
import type {
  ChequeEspecial,
  FilaCronogramaEspecial,
} from "@/lib/pedido-especial-calc";

// Fila mínima que el PDF necesita (tal cual sale de la tabla
// PedidoEspecialPresupuesto, ya con el detalle parseado).
export interface FilaPedidoEspecialPdf {
  numero: string;
  vendedorEmail: string;
  vendedorNombre: string;
  sucursal: string;
  proveedor: string;
  tipoProducto: string;
  descripcion: string;
  plan: string;
  cuotas: number;
  valorContado: number;
  cuotaValor: number;
  valorTecnico: number;
  total: number;
  totalIntereses: number;
  createdAt: Date | string;
  detalle: {
    fechaInicioPago?: string;
    safraEntrada?: number;
    safraMeses?: number;
    cronograma?: FilaCronogramaEspecial[];
    cheques?: ChequeEspecial[];
  } | null;
}

// Nombre del plan en el PDF (igual que en la pantalla).
const PLANES_NOMBRE: Record<string, string> = {
  contado: "CONTADO",
  cuotas_con_entrega: "CUOTAS CON ENTREGA",
  cuotas_sin_entrega: "CUOTAS SIN ENTREGA",
  mayorista: "MAYORISTA",
  safra: "SAFRA",
  cheque: "CON CHEQUE",
};

// Fecha del refuerzo N del cronograma SAFRA: emisión + N meses
// (los refuerzos son MENSUALES, igual que el plan SAFRA real).
function fechaMes(emision: Date, mes: number): Date {
  return new Date(emision.getFullYear(), emision.getMonth() + mes, emision.getDate());
}

export function buildPedidoEspecialPdf(fila: FilaPedidoEspecialPdf): jsPDF {
  const plan = String(fila.plan || "contado");
  const esPlanContado = plan === "contado";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;

  const emision = new Date(fila.createdAt);
  if (isNaN(emision.getTime())) emision.setTime(Date.now());

  // ── Encabezado VIZA (el mismo del resto de los presupuestos) ──
  const headerBottom = drawHeader(
    doc,
    pageW,
    margin,
    contentW,
    fila.numero,
    "PEDIDO ESPECIAL",
    emision,
    formatDateTimeEs,
    formatDateEs
  );

  // Franja del vendedor + barra de contacto reservadas abajo (igual
  // que el presupuesto: el contenido NUNCA pasa de ahí).
  const yVend = yVendedorSobreFooter(pageH);
  const yLimite = yVend - 14;

  let y = headerBottom + 22;
  const ensureSpace = (min: number) => {
    if (y + min > yLimite) {
      doc.addPage();
      y = 56;
    }
  };

  // ═══ 1) PRODUCTOS DE LA COTIZACIÓN (igual que el presupuesto) ═══
  drawSectionTitle(doc, "PRODUCTOS DE LA COTIZACIÓN", margin, y, contentW);
  y += 14;

  const colN = 22;
  const colSku = 58;
  const colCant = 46;
  const colPU = 100;
  const colSub = 100;
  const colName = contentW - colN - colSku - colCant - colPU - colSub;

  // Header de la tabla (azul, mismas columnas del presupuesto).
  doc.setFillColor(...BLUE);
  doc.rect(margin, y, contentW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  let xx = margin + 8;
  doc.text("#", xx, y + 14.5);
  xx += colN;
  doc.text("COD", xx, y + 14.5);
  xx += colSku;
  doc.text("PRODUCTO", xx, y + 14.5);
  xx += colName;
  doc.text("CANT.", xx, y + 14.5);
  xx += colCant;
  doc.text("P. CONTADO", xx, y + 14.5);
  doc.text("SUBTOTAL", margin + contentW - 10, y + 14.5, { align: "right" });
  y += 22;

  // UNA fila: el producto del pedido especial (sin SKU de la BASE:
  // el COD es "PEDIDO" y la cantidad es 1).
  const rowH = 26;
  ensureSpace(rowH + 4);
  doc.setFillColor(...ZEBRA);
  doc.rect(margin, y, contentW, rowH, "F");
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);

  let xxx = margin + 8;
  doc.setTextColor(...GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("1", xxx, y + 11.5);
  xxx += colN;
  doc.text("PEDIDO", xxx, y + 11.5);
  xxx += colSku;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const nameLines = doc.splitTextToSize(
    (fila.descripcion || "—").toUpperCase(),
    colName - 6
  ) as string[];
  doc.text(nameLines.slice(0, 2), xxx, y + 11.5);
  xxx += colName;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("1", xxx + 6, y + 11.5);
  xxx += colCant;
  doc.setTextColor(...DARK);
  doc.text(formatPYG(fila.valorContado), xxx, y + 11.5);
  xxx += colPU;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(formatPYG(fila.valorContado), margin + contentW - 10, y + 11.5, {
    align: "right",
  });
  y += rowH;

  // Cuadro TOTAL CONTADO (idéntico al del presupuesto: azul + banda
  // dorada abajo, valor a la derecha).
  ensureSpace(70);
  y += 8;
  const totalBoxW = 280;
  const totalBoxX = pageW - margin - totalBoxW;
  const totalBoxH = 28;
  doc.setFillColor(...BLUE);
  doc.rect(totalBoxX, y, totalBoxW, totalBoxH, "F");
  doc.setFillColor(...GOLD);
  doc.rect(totalBoxX, y + totalBoxH, totalBoxW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL CONTADO", totalBoxX + 14, y + 17.5);
  doc.setFontSize(12);
  doc.text(formatPYG(fila.valorContado), totalBoxX + totalBoxW - 14, y + 17.5, {
    align: "right",
  });
  y += totalBoxH + 2 + 16;

  // ═══ 2) OPCIONES DE FINANCIACIÓN (la MISMA tabla del presupuesto) ═══
  // Al CONTADO no va: el TOTAL CONTADO de arriba ya ES el total (misma
  // regla "soloContado" del presupuesto de siempre).
  if (!esPlanContado) {
    ensureSpace(120);
    drawSectionTitle(doc, "OPCIONES DE FINANCIACIÓN", margin, y, contentW);
    y += 14;

    const pColBadge = 100;
    const pColCuotas = 140;
    const pColValor = 150;

    // Header de la tabla (PLAN · CUOTAS · VALOR POR CUOTA · TOTAL DEL PLAN).
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    let pp = margin + 10;
    doc.text("PLAN", pp, y + 14.5);
    pp += pColBadge;
    doc.text("CUOTAS", pp, y + 14.5);
    pp += pColCuotas;
    doc.text("VALOR POR CUOTA", pp, y + 14.5);
    doc.text("TOTAL DEL PLAN", margin + contentW - 10, y + 14.5, { align: "right" });
    y += 22;

    // Fila única del plan elegido — primera fila: fondo dorado claro +
    // cinta dorada a la izquierda (exactamente como el presupuesto).
    const rowPH = 27;
    ensureSpace(rowPH);
    doc.setFillColor(...GOLD_LIGHT);
    doc.rect(margin, y, contentW, rowPH, "F");
    doc.setFillColor(...GOLD);
    doc.rect(margin, y, 3, rowPH, "F");
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(margin, y + rowPH, margin + contentW, y + rowPH);

    // Etiqueta redondeada del plan (mismo píldora del presupuesto:
    // 70 × 13.5, esquinas 6.75, texto 6.8 bold centrado).
    const badge = (label: string, fill: [number, number, number], text: [number, number, number]) => {
      doc.setFillColor(...fill);
      doc.roundedRect(margin + 10 + 16, y + 7.5, 70, 13.5, 6.75, 6.75, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(...text);
      doc.text(label, margin + 10 + 16 + 35, y + 17, { align: "center" });
    };

    // Texto de la columna CUOTAS + valor de la columna VALOR POR CUOTA.
    const cheques = fila.detalle?.cheques || [];
    const cronograma = fila.detalle?.cronograma || [];
    const nCuotas = Math.max(1, Math.floor(fila.cuotas || 1));
    const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

    let textoCuotas = "";
    let valorPorCuota = 0;
    if (plan === "cuotas_con_entrega") {
      badge("CON ENTREGA", BLUE, [255, 255, 255]);
      textoCuotas =
        nCuotas === 1
          ? "1 ENTRADA"
          : `1 ENTRADA + ${nCuotas - 1} ${plural(nCuotas - 1, "CUOTA", "CUOTAS")}`;
      valorPorCuota = fila.cuotaValor;
    } else if (plan === "cuotas_sin_entrega") {
      badge("SIN ENTREGA", GOLD, BLUE);
      textoCuotas = `${nCuotas} ${plural(nCuotas, "CUOTA", "CUOTAS")}`;
      valorPorCuota = fila.cuotaValor;
    } else if (plan === "mayorista") {
      badge("MAYORISTA", BLUE, [255, 255, 255]);
      textoCuotas = "1 PAGO";
      valorPorCuota = fila.valorTecnico;
    } else if (plan === "safra") {
      badge("SAFRA", BLUE, [255, 255, 255]);
      const entrada = Math.max(0, fila.detalle?.safraEntrada || 0);
      const meses = Math.max(1, Math.floor(fila.detalle?.safraMeses || nCuotas || 1));
      textoCuotas =
        entrada > 0
          ? `ENTRADA + ${meses} ${plural(meses, "REFUERZO", "REFUERZOS")}`
          : `${meses} ${plural(meses, "REFUERZO", "REFUERZOS")}`;
      // Valor típico del refuerzo (el primero pagado; el PAGO FINAL sale
      // con su interés en el cronograma de abajo).
      const primerRefuerzo = cronograma.find((f) => f.mes >= 1 && f.pago > 0);
      valorPorCuota = primerRefuerzo ? primerRefuerzo.pagoMostrado || primerRefuerzo.pago : 0;
    } else if (plan === "cheque") {
      badge("CON CHEQUE", GOLD, BLUE);
      const nCheques = cheques.length || nCuotas;
      textoCuotas = `${nCheques} ${plural(nCheques, "CHEQUE", "CHEQUES")}`;
      valorPorCuota = cheques[0]?.valor || 0;
    } else {
      badge(PLANES_NOMBRE[plan] || plan.toUpperCase(), BLUE, [255, 255, 255]);
      textoCuotas = "1 PAGO";
      valorPorCuota = fila.total;
    }

    // Letra del plan (A) + textos de la fila, mismo estilo del presupuesto.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...BLUE);
    doc.text("A", margin + 10, y + 17.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(textoCuotas, margin + 10 + pColBadge, y + 17.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...BLUE);
    doc.text(formatPYG(valorPorCuota), margin + 10 + pColBadge + pColCuotas, y + 17.5);
    doc.setTextColor(...DARK);
    doc.text(formatPYG(fila.total), margin + contentW - 10, y + 17.5, { align: "right" });
    y += rowPH;

    // ═══ 2b) SAFRA: CRONOGRAMA DE PAGOS — CONFORME EL PANEL ═══
    // Task 113 v6 (pedido del dueño: "la parte de cálculos de abajo
    // necesito que salga conforme el panel mismo"): la tabla del PDF
    // muestra LAS MISMAS COLUMNAS que la pantalla del plan SAFRA:
    // MES · CONCEPTO · PAGO · INTERÉS DEL MES · SALDO (+ FECHA DE PAGO,
    // que en papel le sirve al cliente) y la MISMA fila final
    // "Total del plan: X + Y interés". Los números salen del desglose
    // congelado — exactamente los que vio el vendedor en la pantalla.
    if (plan === "safra" && cronograma.length > 0) {
      ensureSpace(60);
      y += 12;
      // Banner azul redondeado (mismo del PDF SAFRA del sistema).
      doc.setFillColor(...BLUE);
      doc.roundedRect(margin, y, contentW, 28, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("CRONOGRAMA DE PAGOS", margin + 14, y + 18);
      y += 36;

      const cColN = 34;
      const cColConcepto = 132;
      const cColFecha = 92;
      const cColPago = 88;
      const cColInteres = 84;
      // (La columna SALDO ocupa lo que queda de la tabla, a la derecha.)

      doc.setFillColor(...BLUE);
      doc.rect(margin, y, contentW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      let cc = margin + 6;
      doc.text("MES", cc, y + 14);
      cc += cColN;
      doc.text("CONCEPTO", cc, y + 14);
      cc += cColConcepto;
      doc.text("FECHA DE PAGO", cc, y + 14);
      cc += cColFecha;
      doc.text("PAGO", cc, y + 14, { align: "right" });
      cc += cColPago;
      doc.text("INTERÉS DEL MES", cc, y + 14, { align: "right" });
      doc.text("SALDO", margin + contentW - 6, y + 14, { align: "right" });
      y += 22;

      let rowIdx = 0;
      // Filas con pago real (igual que el PDF SAFRA: solo pagos > 0) y
      // la ÚLTIMA siempre es el PAGO FINAL (ahí se cobra el interés del
      // plan, ya incluido en pagoMostrado) — aunque el plan haya
      // cuadrado antes de los meses elegidos y el cálculo la haya
      // dejado con el rótulo genérico "Refuerzo".
      const filasPago = cronograma.filter((f) => f.pago > 0 || f.pagoMostrado > 0);
      const ultimaIdx = filasPago.length - 1;
      filasPago.forEach((f, idxPago) => {
          const esEntrada = f.mes === 0;
          const esPagoFinal = idxPago === ultimaIdx;
          const rowC = 26;
          ensureSpace(rowC + 28);
          if (esEntrada || esPagoFinal) {
            // Destacado dorado para la ENTRADA y el PAGO FINAL (igual
            // que el cronograma del plan en pantalla).
            doc.setFillColor(254, 243, 199);
            doc.rect(margin, y, contentW, rowC, "F");
          } else if (rowIdx % 2 === 0) {
            doc.setFillColor(245, 245, 244);
            doc.rect(margin, y, contentW, rowC, "F");
          }
          let cp = margin + 6;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...GOLD);
          doc.text(String(rowIdx + 1), cp, y + 16);
          cp += cColN;
          doc.setFontSize(9.5);
          doc.setTextColor(28, 25, 23);
          doc.text(
            esEntrada
              ? "ENTRADA INICIAL"
              : esPagoFinal
                ? "PAGO FINAL"
                : String(f.concepto || "REFUERZO").toUpperCase(),
            cp,
            y + 16
          );
          cp += cColConcepto;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(120, 113, 108);
          doc.text(formatDateEs(fechaMes(emision, f.mes)), cp, y + 16);
          cp += cColFecha;
          // PAGO / INTERÉS / SALDO — las mismas columnas del panel.
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...DARK);
          doc.text(
            formatPYG(f.pagoMostrado > 0 ? f.pagoMostrado : f.pago),
            cp + cColPago,
            y + 16,
            { align: "right" }
          );
          cp += cColPago;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(180, 83, 9);
          doc.text(formatPYG(f.interes), cp + cColInteres, y + 16, {
            align: "right",
          });
          doc.setTextColor(120, 113, 108);
          doc.text(
            formatPYG(Math.max(0, f.saldoFinal)),
            margin + contentW - 6,
            y + 16,
            { align: "right" }
          );
          y += rowC;
          rowIdx += 1;
        });

      // Fila final IGUAL QUE EL PANEL: "Total del plan:" + total +
      // "+ intereses" (los mismos números del cuadro de abajo).
      ensureSpace(26);
      doc.setFillColor(245, 245, 244);
      doc.rect(margin, y, contentW, 24, "F");
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.7);
      doc.line(margin, y + 24, margin + contentW, y + 24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      const xTotalPlan = margin + 6 + cColN + cColConcepto + cColFecha;
      doc.text("TOTAL DEL PLAN:", xTotalPlan, y + 15.5, { align: "right" });
      doc.setFontSize(10);
      doc.setTextColor(...BLUE);
      doc.text(formatPYG(fila.total), xTotalPlan + cColPago, y + 15.5, {
        align: "right",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.text(
        `+ ${formatPYG(fila.totalIntereses || 0)} interés`,
        xTotalPlan + cColPago + cColInteres,
        y + 15.5,
        { align: "right" }
      );
      y += 24;
      y += 6;
    }

    // ═══ 2c) CHEQUE: tabla de cheques (igual que el PDF CON CHEQUE) ═══
    if (plan === "cheque" && cheques.length > 0) {
      ensureSpace(60);
      y += 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...DARK);
      doc.text("PLAN CON CHEQUE", margin, y);
      y += 18;

      const chColN = 90;
      const chColFecha = 170;
      const chColValor = contentW - chColN - chColFecha;

      doc.setFillColor(...BLUE);
      doc.rect(margin, y, contentW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("N° CHEQUE", margin + 10, y + 14);
      doc.text("FECHA DE VENCIMIENTO", margin + chColN, y + 14);
      doc.text("VALOR DEL CHEQUE", margin + contentW - 10, y + 14, { align: "right" });
      y += 22;

      cheques.forEach((c, i) => {
        const rowC = 24;
        ensureSpace(rowC);
        if (i % 2 === 0) {
          doc.setFillColor(...ZEBRA);
          doc.rect(margin, y, contentW, rowC, "F");
        }
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, y + rowC, margin + contentW, y + rowC);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...DARK);
        doc.text(String(c.numero), margin + 10, y + 15);
        doc.text(formatDateEs(c.fecha), margin + chColN, y + 15);
        doc.setFont("helvetica", "bold");
        doc.text(
          formatPYG(c.valor),
          margin + contentW - 10,
          y + 15,
          { align: "right" }
        );
        y += rowC;
      });
      y += 8;
    }

    // ═══ Cuadro del TOTAL DEL PLAN (azul + banda dorada, como el
    // cuadro de TOTAL DEL PLAN SAFRA / TOTAL A PAGAR del sistema) ═══
    ensureSpace(80);
    y += 8;
    const sumBoxW = 320;
    const sumBoxH = 56;
    const sumBoxX = pageW - margin - sumBoxW;
    doc.setFillColor(...BLUE);
    doc.roundedRect(sumBoxX, y, sumBoxW, sumBoxH, 6, 6, "F");
    doc.setFillColor(...GOLD);
    doc.rect(sumBoxX, y, sumBoxW, 3, "F");

    const totalLabel =
      plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega"
        ? "TOTAL DEL PLAN:"
        : plan === "mayorista"
          ? "TOTAL MAYORISTA:"
          : plan === "safra"
            ? "TOTAL DEL PLAN SAFRA:"
            : "TOTAL A PAGAR:";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(217, 184, 107);
    doc.text(totalLabel, sumBoxX + 14, y + 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatPYG(fila.total), sumBoxX + sumBoxW - 14, y + 25, { align: "right" });

    // Aclaración chica bajo el cuadro (los × cuota, sin internals).
    const nota =
      plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega"
        ? `${nCuotas} ${plural(nCuotas, "cuota", "cuotas")} de ${formatPYG(fila.cuotaValor)}`
        : plan === "cheque"
          ? `${cheques.length || nCuotas} ${plural(cheques.length || nCuotas, "cheque", "cheques")} de ${formatPYG(cheques[0]?.valor || 0)}`
          : plan === "safra" && (fila.totalIntereses || 0) > 0
            ? `Incluye ${formatPYG(fila.totalIntereses)} de intereses`
            : "";
    if (nota) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      doc.text(nota, sumBoxX + 14, y + 44);
    }
  }

  // ═══ 3) Franja del VENDEDOR + FOOTER en todas las páginas ═══
  // Igual que el presupuesto: la franja abajo de todo, encima de la
  // barra de contacto; el footer se dibuja en TODAS las páginas con
  // su "Página i de n".
  drawVendedor(doc, margin, yVend, contentW, {
    nombre: fila.vendedorNombre || fila.vendedorEmail,
    sucursal: fila.sucursal || undefined,
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, pageW, pageH, margin, contentW, "Pedido Especial");
    if (totalPages > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 8, {
        align: "right",
      });
    }
  }

  return doc;
}
