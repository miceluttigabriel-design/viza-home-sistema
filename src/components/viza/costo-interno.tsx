"use client";

// === CUADRO DE COSTOS INTERNO (SOLO VENDEDOR) ===
// Muestra el COSTO de cada producto agregado a la cotización para que el
// vendedor pueda armar el crédito con los números reales.
//
// Task 114 (pedido del dueño): el OJITO ahora FUNCIONA. "quiero que este
// ojito del costo funcione para ocultar el costo también y mostrar… hay
// veces que el cliente está encima de él y acaba viendo el costo".
//   · Clic en el ojito → los montos salen "Gs •••••" (nombres quedan, que
//     no son secreto) y el icono cambia a ojo tachado.
//   · Otro clic → vuelven a verse.
//   · La preferencia queda guardada POR USUARIO (store costo-oculto) y los
//     4 cuadros de la pantalla (CUOTA / SAFRA / CHEQUE / MAYORISTA) se
//     ocultan/muestran JUNTOS, porque son este mismo componente.
//
// REGLA DE ORO: Este cuadro es SOLO DE PANTALLA. El costo se guarda apenas
// como un campo extra en los stores locales (zustand/localStorage del
// vendedor) y NUNCA se incluye en el payload de ningún PDF ni se guarda en
// la BD: las rutas de PDF (mayorista-pdf / safra-pdf / cheque-pdf / quotes/pdf)
// solo reciben sku, name, quantity y precios, así que el costo no puede
// aparecer en ningún presupuesto "de ningún modo". El ojito es SOLO VISUAL:
// no toca cálculos, ni stores de cotización, ni PDFs.

import { Eye, EyeOff } from "lucide-react";
import { formatPYG } from "@/lib/format";
import {
  COSTO_OCULTO_TXT,
  useCostoOcultoStore,
} from "@/store/costo-oculto";

// === Colores del cuadrito (paleta de la marca VIZA) ===
// Fondo AZUL del logo (#155789) — el mismo azul de los cuadros de totales
// y del encabezado de las tablas de productos.
const COSTO_BG = "#155789"; // AZUL VIZA
const COSTO_BORDER = "#0d3d5e"; // azul oscuro de la marca (borde dashed)
const COSTO_TXT = "#ffffff"; // blanco (nombres de productos / etiqueta total)
const COSTO_VALOR = "#e5cb8a"; // dorado claro de la marca (valores de costo)
const COSTO_TOTAL = "#ffffff"; // total en blanco, destaca sobre el azul
const COSTO_NOTA = "rgba(255,255,255,0.75)"; // nota semitransparente

export interface CostoInternoItem {
  key: string;
  name: string;
  quantity: number;
  // Costo UNITARIO del producto (campo cost/costProd de la BASE).
  // undefined/0 = producto sin costo cargado → se muestra "—".
  cost?: number;
}

// Lee el costo del producto que devuelve /api/products.
// El campo oficial es `cost` (espejo de costProd en la BASE); si viniera
// vacío pero costProd tuviera valor, se usa costProd como fallback.
// Si no hay ninguno, devuelve 0 (la fila mostrará "—").
export function extractCosto(product: unknown): number {
  const p = (product ?? {}) as { cost?: unknown; costProd?: unknown };
  const c = Number(p.cost);
  if (Number.isFinite(c) && c > 0) return c;
  const cp = Number(p.costProd);
  if (Number.isFinite(cp) && cp > 0) return cp;
  return 0;
}

// === Deteccion de productos "AIRES" (aire acondicionado) ===
// Un producto es AIRE si su DESCRIPCION (name), GRUPO (categoria) o
// SUB-GRUPO (subGrupo) contiene la palabra completa "AIRE" o "AIRES".
// Se normaliza mayusculas/minusculas y acentos, y se exige palabra completa:
// "AIRE ACONDICIONADO SPLIT ..." da true; "AIREADOR ..." da false.
function normalizarTexto(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function esProductoAire(product: unknown): boolean {
  const p = (product ?? {}) as {
    name?: unknown;
    categoria?: unknown;
    subGrupo?: unknown;
  };
  const rex = /\bAIRES?\b/;
  const textos = [p.name, p.categoria, p.subGrupo];
  for (const t of textos) {
    if (typeof t === "string" && rex.test(normalizarTexto(t))) return true;
  }
  return false;
}

// Costo para la opcion MAYORISTA del panel de ventas (a pedido del usuario):
// - Productos AIRES: SIEMPRE el COSTO GS (costGs, col G de la BASE) y NUNCA
//   el COSTO PROD. Si el aire no tiene COSTO GS cargado, la fila muestra
//   "—" (no se cae al costo prod de ningun modo).
// - Resto de las lineas de productos: mismo criterio de siempre
//   (extractCosto: cost/costoProd).
export function extractCostoMayorista(product: unknown): number {
  if (esProductoAire(product)) {
    const p = (product ?? {}) as { costGs?: unknown };
    const g = Number(p.costGs);
    return Number.isFinite(g) && g > 0 ? g : 0;
  }
  return extractCosto(product);
}

// Cuadrito compacto que se muestra al final de la sección PRODUCTOS de cada
// opción de cotización (CUOTA / SAFRA / CHEQUE / MAYORISTA).
// Devuelve null si no hay productos, para no ocupar espacio.
export function CostoInterno({ items }: { items: CostoInternoItem[] }) {
  // Task 114: ojito funcional — estado compartido por los 4 cuadros.
  const oculto = useCostoOcultoStore((s) => s.oculto);
  const toggleOculto = useCostoOcultoStore((s) => s.toggleOculto);

  if (items.length === 0) return null;

  const totalCosto = items.reduce(
    (sum, it) => sum + (it.cost ?? 0) * it.quantity,
    0
  );
  const haySinCosto = items.some((it) => (it.cost ?? 0) <= 0);

  return (
    <div
      className="mt-3 rounded-xl border-2 border-dashed p-3"
      style={{ borderColor: COSTO_BORDER, backgroundColor: COSTO_BG }}
    >
      {/* Encabezado — el ojito + el título son el BOTÓN de ocultar/mostrar
          (Task 114): área de toque grande, funciona en celular también. */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={toggleOculto}
          aria-pressed={oculto}
          aria-label={
            oculto
              ? "Mostrar el costo de los productos"
              : "Ocultar el costo de los productos"
          }
          title={
            oculto
              ? "Mostrar el costo (clic)"
              : "Ocultar el costo — ideal si hay un cliente al lado (clic)"
          }
          className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ color: COSTO_VALOR }}
        >
          {oculto ? (
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Eye className="h-3.5 w-3.5 shrink-0" />
          )}
          <span
            className="text-[10px] font-bold uppercase tracking-wide truncate"
            style={{ color: COSTO_VALOR }}
          >
            {oculto ? "Costo oculto · clic para ver" : "Costo de productos · solo vendedor"}
          </span>
        </button>
        <span
          className="text-[9px] font-bold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
          style={{ color: COSTO_BG, backgroundColor: COSTO_VALOR }}
        >
          No sale en el PDF
        </span>
      </div>

      {/* Una fila por producto: nombre ×cantidad → costo (unitario × cantidad) */}
      <div className="space-y-1">
        {items.map((it) => (
          <div
            key={it.key}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="truncate" style={{ color: COSTO_TXT }}>
              {it.name}
              <span className="opacity-60"> ×{it.quantity}</span>
            </span>
            <span
              className="font-semibold tabular-nums whitespace-nowrap"
              style={{ color: COSTO_VALOR }}
            >
              {oculto
                ? COSTO_OCULTO_TXT
                : (it.cost ?? 0) > 0
                  ? formatPYG((it.cost ?? 0) * it.quantity)
                  : "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Total del costo (lo que el vendedor necesita para armar el crédito) */}
      <div
        className="flex items-center justify-between gap-3 mt-2 pt-2 border-t"
        style={{ borderColor: "rgba(255,255,255,0.3)" }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: COSTO_TXT }}
        >
          Costo total
        </span>
        <span
          className="font-extrabold text-sm tabular-nums"
          style={{ color: COSTO_TOTAL }}
        >
          {oculto ? COSTO_OCULTO_TXT : formatPYG(totalCosto)}
        </span>
      </div>

      {haySinCosto && (
        <p className="text-[9px] mt-1.5" style={{ color: COSTO_NOTA }}>
          — = producto sin costo cargado en la BASE (se carga en el Panel
          Admin). Los productos viejos guardados antes de esta versión también
          muestran — hasta que se vuelvan a agregar.
        </p>
      )}
    </div>
  );
}
