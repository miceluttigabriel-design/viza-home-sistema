import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  analizarCompraConIA,
  analisisCompraRespaldo,
  iaConfigurada,
} from "@/lib/encargado-ia";
import { calcularPlanCompra } from "@/lib/encargado-compra";
import { guardarSnapshot } from "@/lib/encargado-historial";
import { cargarDatosEncargado } from "@/lib/encargado-datos";
import { puedeUsarEncargadoCompra } from "@/lib/acceso-encargado-compra";

// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTO DE COMPRA — API (Task 161)
//
// POST /api/stock/compra          → analiza + IA + guarda historial
// POST /api/stock/compra?ia=0     → solo recalcula (sin IA ni historial,
//                                   para el refresco automático)
//
// Analiza la NECESIDAD DE COMPRA de la red: stock de las 4 sucursales +
// CENTRAL + ventas detectadas. NO genera órdenes de compra ni compra a
// proveedores: solo recomienda y alimenta el PDF. Habilitado para el
// supremo y para los usuarios de src/lib/acceso-encargado-compra.ts.
// ═══════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function responder(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role || "";
    const email = (session.user as any)?.email || "";
    // Pedido del dueño: el módulo sigue siendo del supremo, pero también lo
    // usan los ADMIN habilitados (baltazar@viza.com.py y viza@viza.com.py —
    // lista única en src/lib/acceso-encargado-compra.ts). Cualquier otro
    // usuario recibe 403, aunque sea admin.
    if (!puedeUsarEncargadoCompra(email, role)) {
      return NextResponse.json(
        {
          error:
            "El Departamento de Compra está habilitado solo para el supremo y los usuarios autorizados",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conIA = searchParams.get("ia") !== "0";

    // Historial PROPIO de la compra (no se pisa con el de distribución).
    const { nodos, productos, saldosPorProducto } = await cargarDatosEncargado(
      "compra"
    );

    if (productos.length === 0) {
      const plan = calcularPlanCompra({ nodos, productos: [] });
      const ia = conIA
        ? analisisCompraRespaldo(
            plan,
            "Todavía no hay stock por sucursal. Importá la planilla del ERP para activar al Departamento de Compra."
          )
        : null;
      return NextResponse.json({
        ok: true,
        plan,
        ia,
        iaConfigurada: iaConfigurada(),
        historialActualizado: false,
      });
    }

    const plan = calcularPlanCompra({
      nodos,
      productos,
      generadoEn: new Date().toISOString(),
    });

    // La foto se guarda SOLO en el análisis explícito: así el refresco
    // automático no borra las ventas detectadas.
    let historialActualizado = false;
    if (conIA) {
      const actual = new Map<string, Map<string, number>>();
      for (const [productId, porNodo] of saldosPorProducto) {
        actual.set(productId, new Map(porNodo));
      }
      const guardado = await guardarSnapshot("compra", actual);
      historialActualizado = guardado.ok;
      if (!guardado.ok) {
        console.warn(
          "[ENCARGADO COMPRA] No se pudo guardar el historial:",
          guardado.errores.join(" | ")
        );
      }
    }

    const ia = conIA ? await analizarCompraConIA(plan) : null;

    return NextResponse.json({
      ok: true,
      plan,
      ia,
      iaConfigurada: iaConfigurada(),
      historialActualizado,
    });
  } catch (error: any) {
    console.error("Error en /api/stock/compra:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Error al calcular la necesidad de compra del Encargado",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return responder(req);
}

export async function POST(req: NextRequest) {
  return responder(req);
}
