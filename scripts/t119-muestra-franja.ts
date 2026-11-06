// Muestra visual Task 119: franja de sucursales con los helpers REALES
// (drawHeader compartido + drawSucursalesTop), mismo margen 42 de los routes.
import { jsPDF } from "jspdf";
import {
  drawHeader,
  drawSucursalesTop,
  formatDateEs,
  formatDateTimeEs,
} from "../src/lib/pdf/vizaPdfDesign";
import { writeFileSync, mkdirSync } from "fs";

mkdirSync("muestras-t119", { recursive: true });

// ── 1) Presupuesto CUOTA: route propio llama drawSucursalesTop(margin, contentW, 130)
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;
  drawSucursalesTop(doc, margin, contentW, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(28, 37, 51);
  doc.text("PRESUPUESTO DE VENTA", margin, 130);
  writeFileSync("muestras-t119/franja-presupuesto-cuota.pdf", Buffer.from(doc.output("arraybuffer")));
}
// ── 2) drawHeader COMPARTIDO (SAFRA / CHEQUE / MAYORISTA / ORDEN DE COMPRA)
{
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;
  drawHeader(
    doc, pageW, margin, contentW,
    "OC-001", // orden de compra: mismo drawHeader
    "PEDIDO ESPECIAL",
    new Date("2026-11-06T10:00:00"),
    (d) => formatDateTimeEs(d),
    (d) => formatDateEs(d),
    "ORDEN DE COMPRA",
    "N° ORDEN DE COMPRA",
    30
  );
  writeFileSync("muestras-t119/franja-orden-compra.pdf", Buffer.from(doc.output("arraybuffer")));
}
console.log("OK muestras-t119/");
