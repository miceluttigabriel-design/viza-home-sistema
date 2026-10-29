// POST /api/products/gasto-adm/preview
//
// PREVIEW del botón "GASTOS ADM 1%" (Task 96, pedido del dueño): cuenta lo
// que va a pasar ANTES de aplicar, sin modificar NADA.
//   · aActualizar → productos que NO tienen 1% y lo van a recibir
//     (recalculando Costo Prod. y precios con las fórmulas de siempre).
//   · yaIgual → productos que YA están exactamente en 1% (no se tocan).
//   · excluidos → TRANSPORTERS de CHACOMER/KENTON (la excepción del dueño:
//     ni el botón ni los defaults los tocan), con lista de muestra
//     (SKU + nombre) para que el dueño VERIFIQUE a quiénes quedará fuera.
//
// SOLO LECTURA. Solo supremo_admin (misma regla que las operaciones
// globales de la base: borrar todo, importar márgenes/stock, cambiar tasa).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  GASTO_ADM_DEFAULT,
  yaEsGastoAdmDefault,
  esTransporterChacomerKenton,
} from "@/lib/gasto-adm";

// Lista de muestra de excluidos (para el modal): suficiente para verificar
// la excepción sin mandar miles de nombres.
const MUESTRA_EXCLUIDOS = 200;

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo supremo_admin puede usar esta función" },
        { status: 403 }
      );
    }

    // Lectura liviana: solo lo que el clasificador necesita.
    const productos = await db.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        fabricante: true,
        marca: true,
        modelo: true,
        admPct: true,
      },
    });

    let aActualizar = 0;
    let yaIgual = 0;
    let excluidos = 0;
    const excluidosLista: Array<{ sku: string; name: string }> = [];

    for (const p of productos) {
      if (esTransporterChacomerKenton(p)) {
        excluidos++;
        if (excluidosLista.length < MUESTRA_EXCLUIDOS) {
          excluidosLista.push({ sku: p.sku, name: p.name });
        }
        continue;
      }
      if (yaEsGastoAdmDefault(p.admPct)) yaIgual++;
      else aActualizar++;
    }

    return NextResponse.json({
      ok: true,
      total: productos.length,
      aActualizar,
      yaIgual,
      excluidos,
      excluidosLista,
      gastoAdm: GASTO_ADM_DEFAULT, // 0.01 = 1% (informativo para el modal)
    });
  } catch (error) {
    console.error("Error en gasto-adm/preview:", error);
    return NextResponse.json(
      { error: "Error al preparar el resumen del GASTOS ADM 1%" },
      { status: 500 }
    );
  }
}
