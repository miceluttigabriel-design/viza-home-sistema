"use client";

// ─── CUADRITOS DE STOCK POR SUCURSAL en el buscador (Task 104) ───
// Componente PRESENTACIÓN, solo lectura: recibe el stock por sucursal que ya
// viene de /api/products (campo "stockPorSucursal" de cada producto, sacado
// del Stock General Task 98) y pinta un cuadrito pequeño por sucursal:
//     [ 3un KATUETE ] [ 1un LA PALOMA ] [ 2un SALTOS ]
// El cuadrito de la sucursal DEL VENDEDOR logueado va resaltado en VERDE
// (sucursalMia) para que de un vistazo sepa si su sucursal tiene el producto.
// El DEPÓSITO general (CENTRAL / en tránsito) JAMÁS llega acá: el API ya lo
// excluye (ver src/lib/stock-por-sucursal.ts). Si no hay stock en sucursales
// no se pinta nada (fila igual que siempre).
import type { StockSucursalInfo } from "@/lib/stock-por-sucursal";

// Nombres cortos para que los cuadritos entren en una línea (el nombre
// completo se ve en el tooltip). Mismo criterio del dueño: "1 un Saltos".
const NOMBRE_CORTO: Record<string, string> = {
  KATUETE: "KATUETE",
  "LA PALOMA": "LA PALOMA",
  "NUEVA ESPERANZA": "NVA ESPERANZA",
  "SALTOS DEL GUAIRA": "SALTOS",
};

export function StockSucursalChips({
  stock,
  sucursalMia,
}: {
  stock?: StockSucursalInfo[] | null;
  sucursalMia?: string | null;
}) {
  if (!stock || stock.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {stock.map(({ sucursal, saldo }) => {
        const esMia = !!sucursalMia && sucursal === sucursalMia;
        return (
          <span
            key={sucursal}
            title={esMia ? `${sucursal} · TU SUCURSAL` : sucursal}
            className={
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 " +
              (esMia
                ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                : "bg-stone-100 text-stone-600 ring-stone-200")
            }
          >
            {saldo}un {NOMBRE_CORTO[sucursal] ?? sucursal}
          </span>
        );
      })}
    </div>
  );
}
