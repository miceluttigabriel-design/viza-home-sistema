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

import { useState } from "react";
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
  // Regalo (CASCO / CHAPA): no se financia, así que no recibe valor base.
  esRegalo?: boolean;
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
//
// Task 153/154/156 (pedido del dueño): además del COSTO, el vendedor ve el
// VALOR BASE de cada producto. Sale de la misma cuenta de la planilla CRED
// CALCULO (entrada + crédito sin interés) y depende de la CANTIDAD DE CUOTAS.
// Task 156: se calcula PRODUCTO POR PRODUCTO con su costo + margen del plan,
// así NINGUNA línea queda por debajo de su costo. En CUOTA, sales-panel manda
// el mapa ya calculado (`porItem`). En SAFRA / CHEQUE / MAYORISTA se sigue
// repartiendo la base total por costo (como la planilla), porque ahí la base
// es el total sin interés del plan. Es SOLO de pantalla, igual que el costo:
// nunca viaja al PDF ni a la BD.
//
// Si el vendedor tiene varios planes, elige arriba el plan (A, B…) y el valor
// base se recalcula para ESE plan.

export interface CostoBasePlan {
  key: string;
  label: string;
  valorBase: number;
  // Task 155: valor base YA CALCULADO POR ÍTEM (key = key del producto).
  // Si viene, se usa tal cual (el total es la suma de estos valores). Si no
  // viene (SAFRA / CHEQUE / MAYORISTA), se reparte valorBase por costo como
  // siempre.
  porItem?: Record<string, number> | null;
}

// Reparte el valor base total entre las líneas CON costo, igual que la
// planilla: ROUND(costo_linea / costo_total × valor_base_total, -3) y la
// primera línea absorbe el resto para que la suma sea exacta.
function repartirValorBase(
  items: CostoInternoItem[],
  baseTotal: number
): Map<string, number> {
  const repartido = new Map<string, number>();
  const conCosto = items.filter(
    (it) => (it.cost ?? 0) > 0 && it.quantity > 0 && !it.esRegalo
  );
  if (conCosto.length === 0 || baseTotal <= 0) return repartido;

  const totalCosto = conCosto.reduce(
    (sum, it) => sum + (it.cost ?? 0) * it.quantity,
    0
  );
  if (totalCosto <= 0) return repartido;

  // Desde la segunda línea: redondeo al millar (Math.round, igual que la
  // planilla para valores positivos).
  let sumaResto = 0;
  for (let i = 1; i < conCosto.length; i++) {
    const it = conCosto[i];
    const valor =
      Math.round(
        (((it.cost ?? 0) * it.quantity) / totalCosto) * baseTotal / 1000
      ) * 1000;
    const seguro = Math.max(0, valor);
    repartido.set(it.key, seguro);
    sumaResto += seguro;
  }

  // La PRIMERA línea con costo cierra la cuenta (absorbe el redondeo).
  const primera = conCosto[0];
  repartido.set(primera.key, Math.max(0, Math.round(baseTotal) - sumaResto));

  return repartido;
}

export function CostoInterno({
  items,
  baseTotal,
  basePlanes,
}: {
  items: CostoInternoItem[];
  // Valor base total del plan (precio de contado / base a financiar). Si no
  // llega o vale 0, el cuadrito se muestra EXACTAMENTE como antes (solo costo).
  baseTotal?: number;
  // Valor base de cada plan calculado (depende de la cantidad de cuotas).
  // Si llega, se muestra un selector compacto y manda el plan elegido.
  basePlanes?: CostoBasePlan[];
}) {
  // Task 114: ojito funcional — estado compartido por los 4 cuadros.
  const oculto = useCostoOcultoStore((s) => s.oculto);
  const toggleOculto = useCostoOcultoStore((s) => s.toggleOculto);
  // Task 154: plan elegido para ver el valor base (A, B, …).
  const [planElegido, setPlanElegido] = useState<string | null>(null);

  if (items.length === 0) return null;

  const totalCosto = items.reduce(
    (sum, it) => sum + (it.cost ?? 0) * it.quantity,
    0
  );
  const haySinCosto = items.some((it) => (it.cost ?? 0) <= 0);
  const planesValidos = (basePlanes ?? []).filter((p) => p.valorBase > 0);
  // Si el plan manda `basePlanes` (CUOTA), NO se cae al contado cuando ningún
  // plan tiene base válida: se muestra sin base antes que un número debajo del
  // costo. SAFRA/CHEQUE/MAYORISTA no mandan `basePlanes` y siguen usando
  // `baseTotal` como siempre.
  const usaPlanes = basePlanes !== undefined;
  const planActivo =
    planesValidos.find((p) => p.key === planElegido) ?? planesValidos[0] ?? null;
  const baseTotalEfectivo = planActivo
    ? planActivo.valorBase
    : usaPlanes
      ? 0
      : (baseTotal ?? 0);
  // Task 155: si el plan trae el valor base POR ÍTEM ya calculado, se usa esa
  // mapa (cada producto tiene su propia base: costo + margen del plan) y NO se
  // reparte un total global. Así ningún ítem queda por debajo de su costo por
  // culpa de un total viejo/incompleto.
  const porItemPlan = planActivo?.porItem ?? null;
  const tienePorItem =
    !!porItemPlan &&
    Object.values(porItemPlan).some((v) => Number(v) > 0);
  const mostrarBase =
    (baseTotalEfectivo > 0 || tienePorItem) &&
    items.some((it) => (it.cost ?? 0) > 0 && !it.esRegalo);
  const basePorItem = (() => {
    if (!mostrarBase) return new Map<string, number>();
    if (porItemPlan) {
      const m = new Map<string, number>();
      for (const [k, v] of Object.entries(porItemPlan)) {
        const n = Math.max(0, Math.round(Number(v) || 0));
        if (n > 0) m.set(k, n);
      }
      return m;
    }
    return repartirValorBase(items, baseTotalEfectivo);
  })();
  const totalBase = mostrarBase
    ? items.reduce((sum, it) => sum + (basePorItem.get(it.key) ?? 0), 0)
    : 0;
  const grid = mostrarBase
    ? "grid-cols-[minmax(0,1fr)_auto_auto]"
    : "grid-cols-[minmax(0,1fr)_auto]";

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
            {oculto
              ? "Costo y valor base ocultos · clic para ver"
              : mostrarBase
                ? "Costo y valor base · solo vendedor"
                : "Costo de productos · solo vendedor"}
          </span>
        </button>
        <span
          className="text-[9px] font-bold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
          style={{ color: COSTO_BG, backgroundColor: COSTO_VALOR }}
        >
          No sale en el PDF
        </span>
      </div>

      {/* Selector compacto del plan (solo si hay más de un plan calculado):
          el valor base CAMBIA con la cantidad de cuotas. */}
      {planesValidos.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <span
            className="text-[9px] font-bold uppercase tracking-wide"
            style={{ color: COSTO_NOTA }}
          >
            Valor base del plan:
          </span>
          {planesValidos.map((p) => {
            const activo = planActivo?.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlanElegido(p.key)}
                aria-pressed={activo}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors"
                style={
                  activo
                    ? {
                        backgroundColor: COSTO_VALOR,
                        color: COSTO_BG,
                        borderColor: COSTO_VALOR,
                      }
                    : {
                        color: COSTO_TXT,
                        borderColor: "rgba(255,255,255,0.35)",
                      }
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {planesValidos.length === 1 && (
        <p className="text-[9px] font-semibold mb-1" style={{ color: COSTO_NOTA }}>
          Valor base del plan {planActivo?.label} · calculado por producto
          (costo + margen del plan)
        </p>
      )}

      {/* Encabezado de columnas: Producto · Costo · Valor base */}
      <div
        className={`grid ${grid} items-center gap-x-2 sm:gap-x-3 pb-1 text-[9px] font-bold uppercase tracking-wide`}
        style={{ color: COSTO_NOTA }}
      >
        <span className="truncate">Producto</span>
        <span className="text-right">Costo</span>
        {mostrarBase && <span className="text-right">Valor base</span>}
      </div>

      {/* Una fila por producto: nombre ×cantidad → costo y valor base */}
      <div className="space-y-1">
        {items.map((it) => {
          const base = basePorItem.get(it.key) ?? 0;
          return (
            <div
              key={it.key}
              className={`grid ${grid} items-center gap-x-2 sm:gap-x-3 text-xs`}
            >
              <span className="truncate" style={{ color: COSTO_TXT }}>
                {it.name}
                <span className="opacity-60"> ×{it.quantity}</span>
              </span>
              <span
                className="text-right font-semibold tabular-nums whitespace-nowrap"
                style={{ color: COSTO_TXT }}
              >
                {oculto
                  ? COSTO_OCULTO_TXT
                  : (it.cost ?? 0) > 0
                    ? formatPYG((it.cost ?? 0) * it.quantity)
                    : "—"}
              </span>
              {mostrarBase && (
                <span
                  className="text-right font-semibold tabular-nums whitespace-nowrap"
                  style={{ color: COSTO_VALOR }}
                >
                  {oculto
                    ? COSTO_OCULTO_TXT
                    : base > 0
                      ? formatPYG(base)
                      : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Totales: costo y valor base (lo que el vendedor usa para el crédito) */}
      <div
        className={`grid ${grid} items-center gap-x-2 sm:gap-x-3 mt-2 pt-2 border-t`}
        style={{ borderColor: "rgba(255,255,255,0.3)" }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: COSTO_TXT }}
        >
          Totales
        </span>
        <span
          className="text-right font-extrabold text-sm tabular-nums whitespace-nowrap"
          style={{ color: COSTO_TOTAL }}
        >
          {oculto ? COSTO_OCULTO_TXT : formatPYG(totalCosto)}
        </span>
        {mostrarBase && (
          <span
            className="text-right font-extrabold text-sm tabular-nums whitespace-nowrap"
            style={{ color: COSTO_VALOR }}
          >
            {oculto ? COSTO_OCULTO_TXT : formatPYG(totalBase)}
          </span>
        )}
      </div>

      {haySinCosto && (
        <p className="text-[9px] mt-1.5" style={{ color: COSTO_NOTA }}>
          — = producto sin costo cargado en la BASE (se carga en el Panel
          Admin). Los productos viejos guardados antes de esta versión también
          muestran — hasta que se vuelvan a agregar.
        </p>
      )}
      {mostrarBase && (
        <p className="text-[9px] mt-1" style={{ color: COSTO_NOTA }}>
          Valor base = base del plan según la cantidad de cuotas (como la
          planilla CRED CALCULO: entrada + crédito sin interés), calculada
          PRODUCTO POR PRODUCTO con su costo + margen del plan (nunca queda por
          debajo del costo).
        </p>
      )}
      {mostrarBase &&
        items.some(
          (it) =>
            (it.cost ?? 0) > 0 &&
            !it.esRegalo &&
            (basePorItem.get(it.key) ?? 0) <= 0
        ) && (
          <p className="text-[9px] mt-0.5" style={{ color: COSTO_NOTA }}>
            — en valor base = producto sin margen/precio suficiente para esa
            cantidad de cuotas (se carga en el Panel Admin).
          </p>
        )}
    </div>
  );
}
