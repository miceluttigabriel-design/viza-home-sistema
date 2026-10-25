"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

export interface CotizacionItem {
  productId: string;
  sku: string;
  name: string;
  // Precios pre-calculados del Excel BASE (leídos de la BD del Admin, SOLO LECTURA)
  priceContado: number; // BG - Valor Al Contado
  price1: number; // BH - Valor Cuota 1 (1 pago)
  price2: number; // BI - Valor Cuota 2 (por cuota)
  price3: number;
  price4: number;
  price5: number;
  price6: number;
  price7: number;
  price8: number;
  price9: number;
  price10: number;
  price11: number;
  price12: number;
  price13: number;
  price14: number;
  price15: number;
  price16: number;
  price17: number;
  price18: number;
  price19: number;
  price20: number;
  price21: number;
  price22: number;
  price23: number;
  price24: number;
  price25: number;
  price26: number;
  price27: number;
  price28: number;
  price29: number;
  price30: number;
  // Márgenes leídos de la BD del Admin (SOLO LECTURA - NO se modifican en la BD)
  // Se usan para recalcular cuotas en "SIN ENTREGA INICIAL" (31-60 días)
  // aplicando el 3% sobre el precio contado antes del cálculo de márgenes.
  marginContado: number; // % de margen del precio contado
  marginC1: number;
  marginC2: number;
  marginC3: number;
  marginC4: number;
  marginC5: number;
  marginC6: number;
  marginC7: number;
  marginC8: number;
  marginC9: number;
  marginC10: number;
  marginC11: number;
  marginC12: number;
  marginC13: number;
  marginC14: number;
  marginC15: number;
  marginC16: number;
  marginC17: number;
  marginC18: number;
  marginC19: number;
  marginC20: number;
  marginC21: number;
  marginC22: number;
  marginC23: number;
  marginC24: number;
  marginC25: number;
  marginC26: number;
  marginC27: number;
  marginC28: number;
  marginC29: number;
  marginC30: number;
  quantity: number;
  // === COSTO (INTERNO - SOLO VENDEDOR) ===
  // Costo UNITARIO de la BASE (campo cost = costProd). Se usa SOLO para el
  // cuadrito "Costo de productos" de la pantalla. NUNCA se envía en ningún
  // payload de PDF ni se guarda en la BD (los PDFs solo llevan sku/name/
  // quantity/precios). Opcional: items viejos guardados antes de esta
  // versión no lo tienen y muestran "—" en el cuadrito.
  cost?: number;
}

export interface PlanCuotas {
  id: string; // identificador único
  cuotas: number; // 1 a 30
  valorPorCuota: number; // calculado
  total: number; // calculado = valorPorCuota × cuotas
  calculado: boolean; // si ya fue calculado o no
}

export interface ClienteData {
  nombre: string;
  telefono: string;
  documento: string;
  observaciones: string;
  fecha: string; // ISO date
}

// Tipo de entrega: con entrega inicial (valores base) o sin entrega inicial (con interés diferido)
export type TipoEntrega = "con_entrega" | "sin_entrega";

interface CotizacionState {
  items: CotizacionItem[];
  planes: PlanCuotas[]; // múltiples planes de cuotas
  contadoMarginPct: number; // % adicional al contado
  cliente: ClienteData;
  // Indica si el precio de contado se incluye como "Plan A" en el presupuesto
  incluirContadoEnPresupuesto: boolean;
  // Si true, muestra la columna "P. CONTADO" en el PDF (precio unitario)
  // Por defecto false (no muestra precio unitario, solo subtotal)
  incluirPrecioContado: boolean;
  // Tipo de entrega: con o sin entrega inicial
  tipoEntrega: TipoEntrega; // default "con_entrega"
  // Fecha de inicio de la primera cuota (ISO date) para sin_entrega
  fechaInicioPago: string; // default "" (vacío)

  // === DESCUENTO POR CASCO ===
  // El "Casco" es un descuento/bono que Viza Home otorga al cliente.
  // Si cascoAplicado = true, el sistema OBLIGA a aplicar el descuento.
  // El descuento se resta del subtotal ANTES de calcular las cuotas/márgenes.
  cascoAplicado: boolean;        // checkbox "¿Aplicar descuento por casco?"
  cascoValor: number;             // monto del descuento en Gs
  cascoDescripcion: string;        // ej: "Casco Moto 110cc"

  addItem: (item: CotizacionItem) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;

  addPlan: () => void;
  removePlan: (id: string) => void;
  updatePlanCuotas: (id: string, cuotas: number) => void;
  clearPlanes: () => void;

  setContadoMarginPct: (pct: number) => void;
  setIncluirContadoEnPresupuesto: (value: boolean) => void;
  setIncluirPrecioContado: (value: boolean) => void;
  setTipoEntrega: (tipo: TipoEntrega) => void;
  setFechaInicioPago: (fecha: string) => void;
  setClienteField: (field: keyof Omit<ClienteData, "fecha">, value: string) => void;
  setCascoAplicado: (v: boolean) => void;
  setCascoValor: (v: number) => void;
  setCascoDescripcion: (s: string) => void;
  clear: () => void;
}

// Helper para obtener el precio por cuota N de un item
export function getItemPriceN(item: CotizacionItem, n: number): number {
  if (n === 0) return item.priceContado;
  if (n === 1) return item.price1;
  const key = `price${n}` as keyof CotizacionItem;
  return Number((item as any)[key]) || 0;
}

const initialCliente: ClienteData = {
  nombre: "",
  telefono: "",
  documento: "",
  observaciones: "",
  fecha: new Date().toISOString().slice(0, 10),
};

let planIdCounter = 0;
function genId() {
  planIdCounter += 1;
  return `plan-${Date.now()}-${planIdCounter}`;
}

export const useCotizacionStore = create<CotizacionState>()(
  persist(
    (set) => ({
      items: [],
      planes: [], // arranca vacío - el vendedor agrega los planes que quiera
      contadoMarginPct: 0,
      cliente: initialCliente,
      incluirContadoEnPresupuesto: true,
      incluirPrecioContado: false, // Por defecto NO muestra precio unitario
      tipoEntrega: "con_entrega",
      fechaInicioPago: "",
      // Casco (descuento) - por defecto desactivado
      cascoAplicado: false,
      cascoValor: 0,
      cascoDescripcion: "",

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
              // Marcar todos los planes como no calculados (datos viejos)
              planes: state.planes.map((p) => ({ ...p, calculado: false })),
            };
          }
          return {
            items: [...state.items, item],
            planes: state.planes.map((p) => ({ ...p, calculado: false })),
          };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
          planes: state.planes.map((p) => ({ ...p, calculado: false })),
        })),

      setQuantity: (productId, qty) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i
            )
            .filter((i) => i.quantity > 0),
          planes: state.planes.map((p) => ({ ...p, calculado: false })),
        })),

      addPlan: () =>
        set((state) => {
          // Buscar la primera cantidad de cuotas no usada, empezando por 1
          // Si todas están usadas, usar 1 (que será duplicado)
          let cuotasDefault = 1;
          for (let n = 1; n <= 30; n++) {
            if (!state.planes.some((p) => p.cuotas === n)) {
              cuotasDefault = n;
              break;
            }
          }
          const newPlan: PlanCuotas = {
            id: genId(),
            cuotas: cuotasDefault,
            valorPorCuota: 0,
            total: 0,
            calculado: false,
          };
          return { planes: [...state.planes, newPlan] };
        }),

      removePlan: (id) =>
        set((state) => ({
          planes: state.planes.filter((p) => p.id !== id),
        })),

      updatePlanCuotas: (id, cuotas) =>
        set((state) => ({
          planes: state.planes.map((p) =>
            p.id === id ? { ...p, cuotas, calculado: false } : p
          ),
        })),

      clearPlanes: () => set({ planes: [] }),

      setContadoMarginPct: (pct) => set({ contadoMarginPct: pct }),

      setIncluirContadoEnPresupuesto: (value) =>
        set({ incluirContadoEnPresupuesto: value }),

      setIncluirPrecioContado: (value) =>
        set({ incluirPrecioContado: value }),

      setTipoEntrega: (tipo) => set({ tipoEntrega: tipo }),

      setFechaInicioPago: (fecha) => set({ fechaInicioPago: fecha }),

      setCascoAplicado: (v) => set({ cascoAplicado: v }),

      setCascoValor: (v) => set({ cascoValor: Math.max(0, v) }),

      setCascoDescripcion: (s) => set({ cascoDescripcion: s }),

      setClienteField: (field, value) =>
        set((state) => ({
          cliente: { ...state.cliente, [field]: value },
        })),

      clear: () =>
        set({
          items: [],
          planes: [],
          contadoMarginPct: 0,
          cliente: { ...initialCliente, fecha: new Date().toISOString().slice(0, 10) },
          incluirContadoEnPresupuesto: true,
          incluirPrecioContado: false,
          tipoEntrega: "con_entrega",
          fechaInicioPago: "",
          cascoAplicado: false,
          cascoValor: 0,
          cascoDescripcion: "",
        }),
    }),
    { name: "viza-cotizacion-storage", storage: createUserScopedStorage<CotizacionState>() }
  )
);
