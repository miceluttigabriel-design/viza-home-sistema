// ═══════════════════════════════════════════════════════════════════
// ENCARGADOS · CARGA DE DATOS COMPARTIDA (Task 160/161)
//
// Una sola función server-side arma la entrada que necesitan el
// ENCARGADO DE DISTRIBUCIÓN y el ENCARGADO DE COMPRA:
//   · nodos = CENTRAL + las 4 sucursales (+ lo que haya en StockSucursal)
//   · saldo real por producto/sucursal (incluye filas en 0)
//   · STOCK IDEAL por producto/sucursal (si está configurado)
//   · CORES (colores) de la Base
//   · ventas detectadas = bajada del saldo desde el último análisis
//
// Así los dos encargados miran EXACTAMENTE la misma foto del stock y no
// pueden desincronizarse. No escribe nada: solo lectura.
// ═══════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { leerSucursalesStock } from "@/lib/stock-sucursal";
import { leerIdeales, productIdsConIdeal } from "@/lib/stock-ideal";
import { leerCores } from "@/lib/producto-cores";
import {
  ordenarSucursales,
  parsearColores,
  SUCURSALES_BALANCE,
  DEPOSITO_CENTRAL,
  type EntradaProductoEncargado,
} from "@/lib/encargado-distribucion";
import { leerHistorial, type HistorialTipo } from "@/lib/encargado-historial";

export interface DatosEncargado {
  nodos: string[];
  productos: EntradaProductoEncargado[];
  /** saldo por producto/nodo tal cual vino de StockSucursal */
  saldosPorProducto: Map<string, Map<string, number>>;
}

function normalizarNodo(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase();
}

export async function cargarDatosEncargado(
  tipoHistorial: HistorialTipo = "distribucion"
): Promise<DatosEncargado> {
  // ── Nodos oficiales + lo que exista en la tabla ──
  const resumenSucursales = await leerSucursalesStock();
  const nodos = ordenarSucursales([
    DEPOSITO_CENTRAL,
    ...SUCURSALES_BALANCE,
    ...resumenSucursales.map((s) => s.nombre),
  ]);

  // ── Saldos reales (incluye filas en 0 para detectar la caída) ──
  let filasStock: Array<{ productId: string; sucursal: string; saldo: number }> = [];
  try {
    filasStock = await db.stockSucursal.findMany({
      select: { productId: true, sucursal: true, saldo: true },
    });
  } catch {
    filasStock = [];
  }

  const saldosPorProducto = new Map<string, Map<string, number>>();
  for (const f of filasStock) {
    const sucursal = normalizarNodo(f.sucursal);
    if (!sucursal) continue;
    const saldo = Math.max(0, Math.round(Number(f.saldo) || 0));
    let porNodo = saldosPorProducto.get(f.productId);
    if (!porNodo) {
      porNodo = new Map<string, number>();
      saldosPorProducto.set(f.productId, porNodo);
    }
    porNodo.set(sucursal, saldo);
  }

  // ── Productos: los que tienen stock + los que tienen ideal ──
  const idsConIdeal = await productIdsConIdeal();
  const ids = Array.from(
    new Set<string>([...saldosPorProducto.keys(), ...idsConIdeal])
  );

  if (ids.length === 0) {
    return { nodos, productos: [], saldosPorProducto };
  }

  const [productosDb, coresMap, idealesMap, historial] = await Promise.all([
    db.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        name: true,
        tipo: true,
        categoria: true,
        marca: true,
        fabricante: true,
        etiquetaColor: true,
        modelo: true,
      },
    }),
    leerCores(ids),
    leerIdeales(ids),
    leerHistorial(tipoHistorial),
  ]);

  const productos: EntradaProductoEncargado[] = productosDb.map((p) => {
    const porNodo = saldosPorProducto.get(p.id);
    const idealesProducto = idealesMap.get(p.id);
    const historialProducto = historial.get(p.id);

    const saldos: Record<string, number> = {};
    const ideales: Record<string, number> = {};
    const vendido: Record<string, number> = {};

    for (const nodo of nodos) {
      const saldoNodo = Math.max(0, Math.round(porNodo?.get(nodo) ?? 0));
      saldos[nodo] = saldoNodo;

      const idealNodo = idealesProducto?.get(nodo) ?? 0;
      if (idealNodo > 0) ideales[nodo] = Math.round(idealNodo);

      // Bajada desde el último análisis explícito = venta / consumo.
      const previo = historialProducto?.get(nodo)?.saldoPrevio;
      vendido[nodo] =
        typeof previo === "number"
          ? Math.max(0, Math.round(previo) - saldoNodo)
          : 0;
    }

    const cores = coresMap.get(p.id) ?? null;

    return {
      id: p.id,
      sku: p.sku,
      nombre: p.name,
      tipo: p.tipo,
      categoria: p.categoria,
      marca: p.marca,
      proveedor: p.fabricante,
      // La etiqueta VERDE de la Base es la que el dueño llama SELECCIONADO.
      seleccionado: String(p.etiquetaColor || "").toLowerCase() === "verde",
      modelo: p.modelo,
      colores: parsearColores(cores),
      colorLegacy: cores,
      saldos,
      ideales,
      vendido,
    };
  });

  return { nodos, productos, saldosPorProducto };
}
