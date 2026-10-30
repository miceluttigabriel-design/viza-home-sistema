// ─── STOCK POR SUCURSAL para el BUSCADOR (Task 104, pedido del dueño) ───
// "en los productos que el vendedor consulte figure el stock por sucursal
//  nel buscador y esta informacion con base a código debe estirar del stock
//  general que creamos ala arriba... tipo 4 cuadritos ejemplo 1un katuete
//  1 un La Paloma 1 un Saltos... y el deposito general que esta en transito
//  no debe llevar en cuenta".
//
// La fuente de verdad es la MISMA tabla aparte "StockSucursal" del Stock
// General (Task 98): una fila por (productId, sucursal) con el saldo de la
// planilla del ERP (grid_inventario_stock_new). El vínculo es por Product.id
// (el importador ya lo matcheó por COD/sku), así que acá no se matchea nada
// de nuevo: solo se leen los saldos de los ids que ya salieron en la búsqueda.
//
// REGLA DEL DUEÑO: solo se muestran las 4 SUCURSALES DE VENTA
// (KATUETE / LA PALOMA / NUEVA ESPERANZA / SALTOS DEL GUAIRA). La fila
// "CENTRAL" del ERP es el DEPÓSITO general cuyo stock está EN TRÁNSITO
// (col. DEPOSITO = "TRANSITO" en la planilla) → queda FUERA a propósito.
// Cualquier valor raro futuro ("EN TRANSITO", etc.) también queda fuera:
// si no es una de las 4 sucursales de venta, no sale en los cuadritos.
//
// TABLA AUTO-GESTIONADA (mismo espíritu de siempre): si "StockSucursal"
// todavía no existe en la base, la lectura falla → devuelve mapa vacío y la
// respuesta de /api/products sale igual que siempre (sin cuadritos). NUNCA
// rompe la búsqueda del vendedor.
import { db } from "@/lib/db";
import { SUCURSALES_VIZA } from "@/lib/sucursal-usuario";

// Cuadrito que viaja en cada producto de /api/products:
//   { sucursal: "KATUETE", saldo: 3 } → "3un KATUETE" en el buscador.
export interface StockSucursalInfo {
  sucursal: string; // mayúsculas, igual que la planilla del ERP
  saldo: number; // entero (1.0000 → 1, igual que el Stock General)
}

// El ORDEN de los cuadritos es el orden oficial de las sucursales (el mismo
// del CRM): KATUETE, LA PALOMA, NUEVA ESPERANZA, SALTOS DEL GUAIRA.
const ORDEN_SUCURSALES: string[] = [...SUCURSALES_VIZA];
const ES_SUCURSAL_DE_VENTA = new Set<string>(ORDEN_SUCURSALES);

// Lote: saldos de las 4 sucursales de venta para una lista de Product.id.
// Devuelve Map productId → [{sucursal, saldo}, ...] (solo saldos > 0,
// ordenados por el orden oficial). Best-effort: ante cualquier error
// (tabla ausente, BD caída) devuelve el mapa vacío.
export async function stockPorSucursalDeIds(
  ids: string[]
): Promise<Map<string, StockSucursalInfo[]>> {
  const mapa = new Map<string, StockSucursalInfo[]>();
  if (!ids || ids.length === 0) return mapa;
  try {
    const filas = await db.stockSucursal.findMany({
      where: { productId: { in: ids }, saldo: { gt: 0 } },
      select: { productId: true, sucursal: true, saldo: true },
    });
    for (const f of filas) {
      const sucursal = String(f.sucursal || "").trim().toUpperCase();
      // Solo las 4 sucursales de venta: el DEPÓSITO general (CENTRAL, en
      // tránsito según el ERP) y cualquier otra etiqueta quedan fuera.
      if (!ES_SUCURSAL_DE_VENTA.has(sucursal)) continue;
      const saldo = Math.round(Number(f.saldo) || 0);
      if (saldo <= 0) continue;
      const lista = mapa.get(f.productId) ?? [];
      lista.push({ sucursal, saldo });
      mapa.set(f.productId, lista);
    }
    // Orden fijo de los cuadritos (KATUETE → LA PALOMA → NVA ESPERANZA → SALTOS)
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) =>
          ORDEN_SUCURSALES.indexOf(a.sucursal) -
          ORDEN_SUCURSALES.indexOf(b.sucursal)
      );
    }
  } catch {
    // Sin tabla / sin datos: la búsqueda sigue funcionando igual que siempre
    // (los productos salen sin cuadritos, cero rompimiento).
  }
  return mapa;
}
