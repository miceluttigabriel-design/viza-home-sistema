// ─── PEDIDO ESPECIAL — IMPRIMIR PRESUPUESTO GUARDADO (Task 113 v5) ───
//
// El dueño pidió: "después de guardar presupuesto que él tenga la opción
// de IMPRIMIR PRESUPUESTO, el que él guardó" y "el formato del plan que
// sale en el pedido especial quiero que salga IGUAL del presupuesto".
//
// POST /api/pedido-especial/presupuestos/pdf  { id }
//   → arma el PDF del presupuesto GUARDADO (con su número ESPECIAL-XX y
//     el valor congelado de la base) con el MISMO formato del
//     PRESUPUESTO DE VENTA: tabla de productos + TOTAL CONTADO +
//     OPCIONES DE FINANCIACIÓN (PLAN · CUOTAS · VALOR POR CUOTA · TOTAL
//     DEL PLAN) + cronograma/cheques para SAFRA/CHEQUE. Todo el dibujo
//     vive en src/lib/pdf/pedido-especial-pdf.ts (función pura).
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
import { db } from "@/lib/db";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
import { buildPedidoEspecialPdf } from "@/lib/pdf/pedido-especial-pdf";
import type {
  ChequeEspecial,
  FilaCronogramaEspecial,
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

    // El PDF completo (productos + financiación + cronograma) se dibuja
    // en la lib compartida: mismo formato del presupuesto de siempre.
    const doc = buildPedidoEspecialPdf({
      numero: fila.numero,
      vendedorEmail: fila.vendedorEmail,
      vendedorNombre: fila.vendedorNombre,
      sucursal: fila.sucursal,
      proveedor: fila.proveedor,
      tipoProducto: fila.tipoProducto,
      descripcion: fila.descripcion,
      plan: fila.plan,
      cuotas: fila.cuotas,
      valorContado: fila.valorContado,
      cuotaValor: fila.cuotaValor,
      valorTecnico: fila.valorTecnico,
      total: fila.total,
      totalIntereses: fila.totalIntereses,
      createdAt: fila.createdAt,
      detalle,
    });

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
