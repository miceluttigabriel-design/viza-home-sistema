// POST /api/products/gasto-adm/preview
//
// PREVIEW del botón único "% ADD + GASTOS ADM 1%" (Task 96/96b, pedido del
// dueño): cuenta lo que va a pasar ANTES de aplicar, sin modificar NADA.
//   · aActualizar → productos que van a recibir el 1% (recalculando Costo
//     Prod. y precios con las fórmulas de siempre).
//   · yaIgual → productos que YA están exactamente en 1% (no se tocan).
//   · conAddPropio → productos con % ADD PROPIO (planilla VALOR ADD o carga
//     a mano, ej. refuerzos SAFRA): su % ADD se RESPETA (no se pisa con el
//     1%); solo reciben el GASTOS ADM 1% si les falta. Lista de muestra
//     para que el dueño los VERIFIQUE antes de aplicar.
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
  PCT_ADD_DEFAULT,
  yaEsGastoAdmDefault,
  yaEsAddPctDefault,
  tieneAddPctPropio,
  esTransporterChacomerKenton,
} from "@/lib/gasto-adm";

// Listas de muestra (para el modal): suficiente para verificar la excepción
// y los % ADD propios sin mandar miles de nombres.
const MUESTRA_EXCLUIDOS = 200;
const MUESTRA_ADD_PROPIO = 200;

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
        addPct: true,
      },
    });

    let aActualizar = 0;
    let yaIgual = 0;
    let excluidos = 0;
    let conAddPropio = 0;
    const excluidosLista: Array<{ sku: string; name: string }> = [];
    const addPropioLista: Array<{ sku: string; name: string; addPct: number }> = [];

    for (const p of productos) {
      if (esTransporterChacomerKenton(p)) {
        excluidos++;
        if (excluidosLista.length < MUESTRA_EXCLUIDOS) {
          excluidosLista.push({ sku: p.sku, name: p.name });
        }
        continue;
      }
      const addPropio = tieneAddPctPropio(p.addPct);
      if (addPropio) {
        conAddPropio++; // su % ADD propio se RESPETA (no se pisa con 1%)
        if (addPropioLista.length < MUESTRA_ADD_PROPIO) {
          addPropioLista.push({ sku: p.sku, name: p.name, addPct: p.addPct as number });
        }
      }
      // Va a recibir algo si le falta el GASTOS ADM 1% o si su % ADD está
      // vacío (null/0). Con % ADD propio y ADM ya en 1% → nada que hacer.
      const necesitaAdd = !addPropio && !yaEsAddPctDefault(p.addPct);
      if (!yaEsGastoAdmDefault(p.admPct) || necesitaAdd) aActualizar++;
      else yaIgual++;
    }

    return NextResponse.json({
      ok: true,
      total: productos.length,
      aActualizar,
      yaIgual,
      excluidos,
      excluidosLista,
      conAddPropio,
      addPropioLista,
      gastoAdm: GASTO_ADM_DEFAULT, // 0.01 = 1% (informativo para el modal)
      pctAdd: PCT_ADD_DEFAULT,     // 0.01 = 1% (informativo para el modal)
    });
  } catch (error) {
    console.error("Error en gasto-adm/preview:", error);
    return NextResponse.json(
      { error: "Error al preparar el resumen del GASTOS ADM 1%" },
      { status: 500 }
    );
  }
}
