// ─── PEDIDO ESPECIAL — ORDEN DE COMPRA (Task 113 v6, pedido del dueño) ───
//
// "despues que el encargado vea APROBADO en el presupuesto quiero que
//  tenga la opcion de el generar ORDEN DE COMPRA de este presupuesto en
//  especifico amigo ok primer el marca VERIFICADO OK y despues que el
//  tenga la opcion de generar ordem de compra"
//
// POST /api/pedido-especial/presupuestos/orden  { id }
//   1. Chequea que el presupuesto esté VERIFICADO (el encargado primero
//      lo marca VERIFICADO; si aún está APROBADO la API lo manda atrás
//      con el aviso).
//   2. Le da número de orden OC-01, OC-02… (QuoteSequence plan "OC",
//      cuenta por usuario) y lo deja guardado en la fila (ordenGenerada
//      / ordenNumero / ordenFecha) — si la vuelve a pedir, sale SIEMPRE
//      la misma orden con el mismo número (idempotente).
//   3. Arma el PDF con la lib src/lib/pdf/orden-compra-pdf.ts (diseño
//      VIZA: encabezado de siempre, datos del pedido, producto a comprar
//      con su COSTO, total, ID CTR y firmas).
//
// QUIÉN PUEDE (mismo permiso que VERIFICAR):
//   · el ENCARGADO de la sucursal del presupuesto,
//   · admin / supremo_admin (la excepción de siempre).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
import { generarOrdenPresupuesto } from "@/lib/pedido-especial-presupuestos";
import { buildOrdenCompraPdf } from "@/lib/pdf/orden-compra-pdf";

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

    // Marca la orden (número OC-XX + fecha) con el MISMO permiso de
    // VERIFICAR; devuelve la fila actualizada o el error para el usuario.
    const r = await generarOrdenPresupuesto(id, {
      id: String((session.user as any)?.id || ""),
      email,
      esAdmin,
      sucursalEncargado,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }

    // El PDF de la orden se arma SIEMPRE desde la fila congelada (los
    // valores del historial no cambian: la orden es idéntica cada vez).
    const p = r.presupuesto;
    const doc = buildOrdenCompraPdf({
      ordenNumero: p.ordenNumero,
      numero: p.numero,
      vendedorEmail: p.vendedorEmail,
      vendedorNombre: p.vendedorNombre,
      sucursal: p.sucursal,
      proveedor: p.proveedor,
      tipoProducto: p.tipoProducto,
      descripcion: p.descripcion,
      modoCosto: p.modoCosto,
      costoOriginal: p.costoOriginal,
      costoGs: p.costoGs,
      cambioUS: p.cambioUS,
      idCtr: p.idCtr,
      verificadoPorNombre: p.verificadoPorNombre,
      verificadoPorEmail: p.verificadoPorEmail,
      fechaVerificado: p.fechaVerificado,
      createdAt: p.createdAt,
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const nombreArchivo = `VIZA-Orden-Compra-${String(p.ordenNumero || p.numero).replace(/[^\w.-]/g, "")}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (error) {
    console.error("Error generando ORDEN DE COMPRA:", error);
    return NextResponse.json(
      { error: "No se pudo generar la orden de compra." },
      { status: 500 }
    );
  }
}
