import { db } from "@/lib/db";

// ============================================================
// REGISTRO DE PRESUPUESTOS EMITIDOS (pedido del dueño, Task 78)
// ============================================================
// Antes SOLO el guardado del carrito (POST /api/quotes) creaba una
// fila en la tabla Quote. Los PDFs (PRESUPUESTO normal, MAYORISTA,
// SAFRA y CON CHEQUE) generaban su número secuencial pero NUNCA
// guardaban nada en la base → el CRM no los contabilizaba y el dueño
// veía que "los vendedores emitieron presupuestos y no se cuentan".
//
// Esta función guarda la EMISIÓN como fila Quote (sin items: el CRM
// solo necesita quién emitió, cuándo y de qué plan) para que el
// ranking del CRM la cuente SIEMPRE.
//
// · El quoteNumber es el MISMO número secuencial que sale impreso en
//   el PDF (PRESUPUESTO-XX / MAYOR-XX / SAFRA-XX / CHEQUE-XX): así el
//   ranking por plan coincide 1 a 1 con los números que ve el
//   vendedor en los papeles.
// · Es BEST-EFFORT: si el guardado falla (red, duplicado, etc.) el
//   PDF sale igual — NUNCA se rompe la emisión del presupuesto por
//   culpa del registro. El error queda en los logs del servidor.
// · status "emitida": el ranking cuenta TODOS los quotes como
//   "emitidos" (total) y sigue mostrando "aprobadas" aparte, igual
//   que siempre. Ningún otro código filtra por status (verificado).
export async function guardarQuoteEmitido(params: {
  plan: string; // "PRESUPUESTO" | "MAYOR" | "SAFRA" | "CHEQUE"
  quoteNumber: string;
  userId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  subtotal?: number;
  discount?: number;
  total?: number;
}): Promise<void> {
  try {
    await db.quote.create({
      data: {
        quoteNumber: params.quoteNumber,
        customerName: (params.customerName || "").trim() || "SIN NOMBRE",
        customerPhone: params.customerPhone || null,
        notes: params.notes || null,
        subtotal: Number(params.subtotal) || 0,
        discount: Number(params.discount) || 0,
        taxRate: 0,
        total: Number(params.total) || 0,
        status: "emitida",
        userId: params.userId || null,
      },
    });
  } catch (error) {
    // Best-effort: el presupuesto ya se emitió (el PDF sale igual).
    console.error(
      `[CRM] No se pudo registrar la emisión ${params.quoteNumber}:`,
      error
    );
  }
}
