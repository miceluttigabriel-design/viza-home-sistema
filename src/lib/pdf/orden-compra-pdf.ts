// ============================================================
// ORDEN DE COMPRA del PEDIDO ESPECIAL (Task 113 v7, pedido del dueño)
//
// "despues que el encargado vea APROBADO en el presupuesto… primer el
//  marca VERIFICADO OK y despues que el tenga la opcion de generar
//  ordem de compra de este presupuesto en especifico".
//
// Task 113 v7 (correcciones del dueño sobre la orden impresa):
//   · "en la orden de compra la validez tiene que ser de 30 dias… no es
//     Presupuesto es Orden de Compra y la validez es 30 dias" → caja
//     VÁLIDO HASTA = emisión + 30 días y el pie dice "Orden de Compra
//     válida por 30 días…" (los presupuestos siguen con sus 10).
//   · "Firma del Provedor no hace falta" → solo queda la firma del
//     encargado que verificó (con su correo).
//   · La franja VENDEDOR/SUCURSAL de ABAJO no va más: "esto en la parte
//     de abajo no debe salir… hay que salir alla arriba el nombre
//     completo del vendedor y su correo, también del encargado que está
//     verificando su nombre completo y su correo" → DATOS DEL PEDIDO
//     arriba muestra VENDEDOR + CORREO y ENCARGADO + CORREO.
//
// El PDF sale de la fila CONGELADA del historial (mismo espíritu del
// presupuesto del pedido especial: los números son siempre los mismos).
// Diseño VIZA de siempre:
//   · Encabezado con el MISMO drawHeader (título ORDEN DE COMPRA y caja
//     "N° ORDEN" con el número OC-01…).
//   · DATOS DEL PEDIDO: proveedor al que se le compra, tipo de producto,
//     sucursal que pide, vendedor (nombre + correo), encargado que
//     verificó (nombre + correo), presupuesto de referencia y el ID CTR
//     (el n° de crédito que el encargado verificó) en fila completa.
//   · PRODUCTOS A COMPRAR: tabla con DESCRIPCIÓN / CANT. / COSTO UNIT. /
//     TOTAL (el costo es el dato de la compra — la orden es para el
//     proveedor) + cuadro TOTAL A COMPRAR azul con banda dorada.
//   · FIRMA: encargado (quien verificó).
//   · Footer VIZA con la validez de 30 días en todas las páginas.
// Función PURA: la ruta solo autentica y numera; la prueba de humo
// genera el PDF sin tocar la base ni la sesión.
// ============================================================
import { jsPDF } from "jspdf";
import {
  BLUE,
  DARK,
  FOOTER_RESERVE,
  GOLD,
  GREY,
  LIGHT,
  LINE,
  VALIDEZ_DIAS_ORDEN,
  ZEBRA,
  drawFooter,
  drawHeader,
  drawSectionTitle,
  formatDateEs,
  formatDateTimeEs,
  formatPYG,
  textoValidezOrdenCompra,
} from "./vizaPdfDesign";

// Fila mínima que la orden necesita (tal cual sale de
// PedidoEspecialPresupuesto ya serializada).
export interface FilaOrdenCompraPdf {
  ordenNumero: string; // "OC-01"…
  numero: string; // presupuesto de referencia "ESPECIAL-XX"
  vendedorEmail: string;
  vendedorNombre: string;
  sucursal: string;
  proveedor: string;
  tipoProducto: string;
  descripcion: string;
  modoCosto: string; // "usd" | "gs"
  costoOriginal: number;
  costoGs: number;
  cambioUS: number;
  idCtr: string; // n° de crédito verificado
  verificadoPorNombre: string;
  verificadoPorEmail: string; // correo del encargado que verificó (v7)
  fechaVerificado: string | null;
  createdAt: Date | string;
}

export function buildOrdenCompraPdf(fila: FilaOrdenCompraPdf): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;

  const emision = new Date(fila.createdAt);
  if (isNaN(emision.getTime())) emision.setTime(Date.now());

  // ── Encabezado VIZA (título ORDEN DE COMPRA + caja N° ORDEN) ──
  // v7: VÁLIDO HASTA conforme 30 días (la orden no es un presupuesto).
  const headerBottom = drawHeader(
    doc,
    pageW,
    margin,
    contentW,
    fila.ordenNumero || "OC",
    "",
    emision,
    formatDateTimeEs,
    formatDateEs,
    "ORDEN DE COMPRA",
    "N° ORDEN",
    VALIDEZ_DIAS_ORDEN
  );

  const yLimite = pageH - FOOTER_RESERVE - 6;
  let y = headerBottom + 20;

  // ═══ 1) DATOS DEL PEDIDO (mismo estilo de DATOS DEL CLIENTE) ═══
  // v7: arriba quedan el VENDEDOR (nombre completo + correo) y el
  // ENCARGADO que verificó (nombre completo + correo); la franja de
  // abajo ya no existe.
  drawSectionTitle(doc, "DATOS DEL PEDIDO", margin, y, contentW);
  y += 12;

  const boxH = 128;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, y, contentW, boxH, 6, 6, "F");
  doc.setFillColor(...GOLD);
  doc.rect(margin, y + 7, 3, boxH - 14, "F");

  const colX1 = margin + 16;
  const colX2 = margin + contentW * 0.52;
  // Dos columnas × cuatro filas + el ID CTR en fila completa (protagonista,
  // es el n° de crédito que el encargado verificó).
  const paresDatos: [string, string][] = [
    ["PROVEEDOR", (fila.proveedor || "—").toUpperCase()],
    ["TIPO DE PRODUCTO", (fila.tipoProducto || "—").toUpperCase()],
    ["SUCURSAL QUE PIDE", (fila.sucursal || "—").toUpperCase()],
    ["PRESUPUESTO", fila.numero || "—"],
    ["VENDEDOR", (fila.vendedorNombre || fila.vendedorEmail || "—").toUpperCase()],
    ["CORREO DEL VENDEDOR", fila.vendedorEmail || "—"],
    [
      "ENCARGADO QUE VERIFICÓ",
      (fila.verificadoPorNombre || "—").toUpperCase(),
    ],
    ["CORREO DEL ENCARGADO", fila.verificadoPorEmail || "—"],
  ];
  const rowYs = [y + 20, y + 44, y + 68, y + 92];
  paresDatos.forEach(([label, value], i) => {
    const cx = i % 2 === 0 ? colX1 : colX2;
    const cy = rowYs[Math.floor(i / 2)];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(label, cx, cy - 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(value.slice(0, 45), cx, cy + 4);
  });
  // ID CTR en fila completa (label arriba, valor grande debajo).
  const yCtr = y + 116;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...GREY);
  doc.text("ID CTR (N° DE CRÉDITO)", colX1, yCtr - 6);
  doc.setFontSize(10.5);
  doc.setTextColor(...BLUE);
  doc.text((fila.idCtr || "—").slice(0, 60), colX1, yCtr + 6);
  y += boxH + 18;

  // ═══ 2) PRODUCTOS A COMPRAR (tabla azul de la casa) ═══
  drawSectionTitle(doc, "PRODUCTOS A COMPRAR", margin, y, contentW);
  y += 14;

  const colN = 24;
  const colCant = 46;
  const colCosto = 100;
  const colTotal = 100;
  const colName = contentW - colN - colCant - colCosto - colTotal;

  doc.setFillColor(...BLUE);
  doc.rect(margin, y, contentW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  let xx = margin + 8;
  doc.text("#", xx, y + 14.5);
  xx += colN;
  doc.text("DESCRIPCIÓN", xx, y + 14.5);
  xx += colName;
  doc.text("CANT.", xx, y + 14.5);
  xx += colCant;
  doc.text("COSTO UNIT.", xx, y + 14.5);
  doc.text("TOTAL", margin + contentW - 10, y + 14.5, { align: "right" });
  y += 22;

  const rowH = 26;
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
  doc.text(formatPYG(fila.costoGs), xxx, y + 11.5);
  xxx += colCosto;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(formatPYG(fila.costoGs), margin + contentW - 10, y + 11.5, {
    align: "right",
  });
  y += rowH;

  // ═══ 3) TOTAL A COMPRAR (cuadro azul + banda dorada) ═══
  y += 8;
  const totalBoxW = 280;
  const totalBoxH = 28;
  const totalBoxX = pageW - margin - totalBoxW;
  doc.setFillColor(...BLUE);
  doc.rect(totalBoxX, y, totalBoxW, totalBoxH, "F");
  doc.setFillColor(...GOLD);
  doc.rect(totalBoxX, y + totalBoxH, totalBoxW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL A COMPRAR", totalBoxX + 14, y + 17.5);
  doc.setFontSize(12);
  doc.text(formatPYG(fila.costoGs), totalBoxX + totalBoxW - 14, y + 17.5, {
    align: "right",
  });
  y += totalBoxH + 2 + 14;

  // Nota del costo original (si el vendedor lo puso en US$).
  if (String(fila.modoCosto) === "usd" && Number(fila.costoOriginal) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(
      `Costo original: US$ ${Number(fila.costoOriginal).toLocaleString("es-PY")} · cambio aplicado US$ 1 = Gs ${Number(fila.cambioUS || 0).toLocaleString("es-PY")}`,
      totalBoxX + 14,
      y + 2
    );
  }

  // ═══ 4) FIRMA (v7: SOLO el encargado que verificó — "Firma del
  //     Provedor no hace falta") ═══
  // Anclada abajo del todo, encima del pie (como una orden real); si el
  // contenido bajara más de lo esperado, no pisa el footer.
  const yFirmas = Math.min(Math.max(y + 30, yLimite - 105), yLimite - 40);
  const firmaW = 280;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(margin, yFirmas + 24, margin + firmaW, yFirmas + 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...GREY);
  doc.text("VERIFICADO POR (ENCARGADO)", margin, yFirmas + 34);
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(
    (fila.verificadoPorNombre || "Encargado de sucursal").toUpperCase().slice(0, 42),
    margin,
    yFirmas + 44
  );
  if (fila.verificadoPorEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(fila.verificadoPorEmail.slice(0, 45), margin, yFirmas + 55);
  }
  if (fila.fechaVerificado) {
    const fv = new Date(fila.fechaVerificado);
    if (!isNaN(fv.getTime())) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.text(`Verificado el ${formatDateEs(fv)}`, margin, yFirmas + 70);
    }
  }

  // ═══ 5) FOOTER en todas las páginas (v7: validez de ORDEN = 30 días) ═══
  drawFooter(doc, pageW, pageH, margin, contentW, "Orden de Compra", textoValidezOrdenCompra());

  return doc;
}
