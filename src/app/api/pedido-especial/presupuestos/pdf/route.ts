// ─── PEDIDO ESPECIAL — IMPRIMIR PRESUPUESTO GUARDADO (Task 113 v4) ───
//
// El dueño pidió: "después de guardar presupuesto que él tenga la opción
// de IMPRIMIR PRESUPUESTO, el que él guardó".
//
// POST /api/pedido-especial/presupuestos/pdf  { id }
//   → arma el PDF del presupuesto GUARDADO (con su número ESPECIAL-XX y
//     el valor congelado de la base), con el MISMO diseño VIZA de los
//     demás presupuestos (logo + wave + cajas N°/FECHA/VÁLIDO + franja
//     del vendedor + barra de contacto).
//
// QUIÉN PUEDE IMPRIMIR (mismo alcance del historial):
//   · el VENDEDOR que lo generó (sus propios presupuestos),
//   · el ENCARGADO de sucursal (los de SU sucursal),
//   · admin / supremo_admin (todos).
//
// El PDF es el presupuesto para el CLIENTE: NO muestra costo ni % (eso
// es interno del vendedor) — solo producto, plan y valores a pagar.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsPDF } from "jspdf";
import { db } from "@/lib/db";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
import {
  BLUE,
  DARK,
  GOLD,
  GREY,
  LIGHT,
  LINE,
  ZEBRA,
  drawFooter,
  drawHeader,
  drawVendedor,
  yVendedorSobreFooter,
  formatPYG,
  formatDateEs,
  formatDateTimeEs,
} from "@/lib/pdf/vizaPdfDesign";
import {
  NOMBRE_PLAN,
  type PlanPedidoEspecial,
  type FilaCronogramaEspecial,
  type ChequeEspecial,
} from "@/lib/pedido-especial-calc";

interface DetallePdf {
  fechaInicioPago?: string;
  safraEntrada?: number;
  safraMeses?: number;
  cronograma?: FilaCronogramaEspecial[];
  cheques?: ChequeEspecial[];
}

interface FilaPdf {
  id: string;
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
  detalle: string;
  createdAt: Date;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    const esAdmin = role === "admin" || role === "supremo_admin";
    const email = (session.user?.email || "").trim().toLowerCase();
    const sucursalEncargado = esAdmin ? null : (ENCARGADOS_SUCURSAL[email] ?? null);

    const body = await req.json().catch(() => null);
    const id = String((body as any)?.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el presupuesto." }, { status: 400 });
    }

    const fila = (await db.pedidoEspecialPresupuesto.findUnique({ where: { id } })) as
      | (FilaPdf & { detalle: string })
      | null;
    if (!fila) {
      return NextResponse.json({ error: "Presupuesto no encontrado." }, { status: 404 });
    }

    // Alcance del historial: dueño del presupuesto, encargado de SU
    // sucursal o admin. El resto: sin acceso (404, no filtramos datos).
    const esDueno = fila.vendedorEmail === email;
    const esSucursalPropia = !!sucursalEncargado && fila.sucursal === sucursalEncargado;
    if (!esDueno && !esAdmin && !esSucursalPropia) {
      return NextResponse.json({ error: "Presupuesto no encontrado." }, { status: 404 });
    }

    let detalle: DetallePdf = {};
    try {
      if (fila.detalle) detalle = JSON.parse(fila.detalle) as DetallePdf;
    } catch {
      detalle = {};
    }

    const plan = String(fila.plan) as PlanPedidoEspecial;
    const nombrePlan = NOMBRE_PLAN[plan] || String(fila.plan).toUpperCase();
    const emision = new Date(fila.createdAt);
    if (isNaN(emision.getTime())) emision.setTime(Date.now());

    // ── Documento (A4 vertical, mismo esqueleto del resto) ──
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentW = pageW - margin * 2;

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

    // Franja del vendedor + barra de contacto reservadas abajo.
    const yVend = yVendedorSobreFooter(pageH);
    const yLimite = yVend - 14;

    let y = headerBottom + 22;
    const ensureSpace = (min: number) => {
      if (y + min > yLimite) {
        doc.addPage();
        y = 56;
      }
    };

    // Título de sección con la línea dorada (mismo estilo del resto).
    const tituloSeccion = (texto: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...BLUE);
      doc.text(texto, margin, y);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(1.2);
      doc.line(margin, y + 5, margin + contentW, y + 5);
    };

    // ── PRODUCTO (lo que se vende) ──
    tituloSeccion("PRODUCTO");
    y += 20;
    const cajaH = 64;
    doc.setFillColor(...LIGHT);
    doc.roundedRect(margin, y, contentW, cajaH, 8, 8, "F");
    doc.setFillColor(...GOLD);
    doc.rect(margin, y + 8, 3, cajaH - 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...DARK);
    const descLineas = doc.splitTextToSize(
      (fila.descripcion || "—").toUpperCase(),
      contentW - 40
    ) as string[];
    doc.text(descLineas.slice(0, 2), margin + 16, y + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GREY);
    doc.text(
      `Proveedor: ${fila.proveedor}   ·   Tipo: ${fila.tipoProducto}`,
      margin + 16,
      y + cajaH - 14
    );
    y += cajaH + 22;

    // ── PLAN DE PAGOS ──
    ensureSpace(120);
    tituloSeccion(`PLAN ${nombrePlan}`);
    y += 22;

    const lineaParam = (etiqueta: string, valor: string) => {
      ensureSpace(20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...GREY);
      doc.text(etiqueta, margin + 2, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(valor, margin + contentW - 2, y, { align: "right" });
      y += 19;
    };

    // Datos por plan (sin costo, sin %: el presupuesto es para el cliente).
    if (plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega") {
      lineaParam("Cantidad de cuotas", String(fila.cuotas));
      lineaParam("Valor de cada cuota", formatPYG(fila.cuotaValor));
      if (plan === "cuotas_sin_entrega" && detalle.fechaInicioPago) {
        lineaParam("Inicio de pago", formatDateEs(detalle.fechaInicioPago));
      }
    } else if (plan === "safra") {
      if ((detalle.safraEntrada ?? 0) > 0) {
        lineaParam("Entrada", formatPYG(detalle.safraEntrada || 0));
      }
      lineaParam(
        "Refuerzos mensuales",
        `${detalle.safraMeses || fila.cuotas || 1} ${(detalle.safraMeses || fila.cuotas || 1) === 1 ? "mes" : "meses"}`
      );
    } else if (plan === "cheque") {
      lineaParam("Cantidad de cheques", String(detalle.cheques?.length || fila.cuotas || 0));
    }

    // Tabla del cronograma SAFRA (MES · CONCEPTO · PAGO — igual que el plan real).
    if (plan === "safra" && detalle.cronograma && detalle.cronograma.length > 0) {
      ensureSpace(40);
      const colsX = {
        mes: margin + 10,
        concepto: margin + 60,
        pago: margin + contentW - 10,
      };
      doc.setFillColor(...BLUE);
      doc.roundedRect(margin, y, contentW, 22, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text("MES", colsX.mes, y + 14);
      doc.text("CONCEPTO", colsX.concepto, y + 14);
      doc.text("PAGO", colsX.pago, y + 14, { align: "right" });
      y += 22;

      detalle.cronograma.forEach((f, i) => {
        const rowH = 20;
        ensureSpace(rowH + 8);
        if (i % 2 === 0) {
          doc.setFillColor(...ZEBRA);
          doc.rect(margin, y, contentW, rowH, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(String(f.mes), colsX.mes, y + 13);
        doc.setFont("helvetica", "bold");
        doc.text(f.concepto, colsX.concepto, y + 13);
        doc.text(formatPYG(f.pagoMostrado), colsX.pago, y + 13, { align: "right" });
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        y += rowH;
      });
      y += 14;
    }

    // Tabla de CHEQUES (N° · VENCIMIENTO · VALOR — igual que el plan real).
    if (plan === "cheque" && detalle.cheques && detalle.cheques.length > 0) {
      ensureSpace(40);
      const colsX = {
        num: margin + 10,
        venc: margin + 120,
        valor: margin + contentW - 10,
      };
      doc.setFillColor(...BLUE);
      doc.roundedRect(margin, y, contentW, 22, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text("N° CHEQUE", colsX.num, y + 14);
      doc.text("VENCIMIENTO", colsX.venc, y + 14);
      doc.text("VALOR", colsX.valor, y + 14, { align: "right" });
      y += 22;

      detalle.cheques.forEach((c, i) => {
        const rowH = 20;
        ensureSpace(rowH + 8);
        if (i % 2 === 0) {
          doc.setFillColor(...ZEBRA);
          doc.rect(margin, y, contentW, rowH, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(String(c.numero), colsX.num, y + 13);
        doc.text(formatDateEs(c.fecha), colsX.venc, y + 13);
        doc.setFont("helvetica", "bold");
        doc.text(formatPYG(c.valor), colsX.valor, y + 13, { align: "right" });
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        y += rowH;
      });
      y += 14;
    }

    // ── CUADRO DEL TOTAL (azul + banda dorada, como el resto) ──
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
      plan === "contado"
        ? "VALOR AL CONTADO:"
        : plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega"
          ? "TOTAL DEL PLAN:"
          : plan === "mayorista"
            ? "TOTAL MAYORISTA (VALOR TÉCNICO):"
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

    // Aclaración chica bajo el cuadro (solo lo necesario, sin internals).
    const nota =
      plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega"
        ? `${fila.cuotas} cuotas de ${formatPYG(fila.cuotaValor)}`
        : plan === "cheque"
          ? `${detalle.cheques?.length || fila.cuotas} cheques de ${formatPYG(detalle.cheques?.[0]?.valor || 0)}`
          : plan === "safra" && (fila.totalIntereses ?? 0) > 0
            ? `Incluye ${formatPYG(fila.totalIntereses)} de intereses`
            : "";
    if (nota) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      doc.text(nota, sumBoxX + 14, y + 44);
    }

    // ── VENDEDOR (franja abajo de todo) + FOOTER VIZA ──
    drawVendedor(doc, margin, yVend, contentW, {
      nombre: fila.vendedorNombre || fila.vendedorEmail,
      sucursal: fila.sucursal || undefined,
    });
    drawFooter(doc, pageW, pageH, margin, contentW, "Pedido Especial");

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const nombreArchivo = `VIZA-Pedido-Especial-${String(fila.numero || "").replace(/[^\w.-]/g, "")}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF Pedido Especial:", error);
    return NextResponse.json(
      { error: "No se pudo generar el PDF del presupuesto." },
      { status: 500 }
    );
  }
}
