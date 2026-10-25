"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

// === PLAN MAYORISTA ===
// Presupuesto MAYORISTA: usa el PRECIO TÉCNICO (valorTecnico) de la BASE.
// REGLA DE ORO: Solo LECTURA del campo VALOR TECNICO del Admin.
// NUNCA se modifica la BD del Admin, solo se lee para el cálculo en memoria.
// Solo se pueden agregar productos que tengan precio técnico cargado (> 0).

// === INTERFACES ===

export interface MayoristaProducto {
  id: string;
  sku: string;
  name: string;
  // PRECIO TÉCNICO (VALOR TECNICO de la BASE) - SOLO LECTURA
  priceTecnico: number;
  quantity: number;
  // === COSTO (INTERNO - SOLO VENDEDOR) ===
  // Costo UNITARIO de la BASE (cost = costProd). Solo para el cuadrito
  // "Costo de productos" de la pantalla; NUNCA se envía a ningún PDF
  // (el payload del PDF solo lleva sku/name/quantity/priceTecnico/subtotal).
  cost?: number;
}

export interface PlanMayoristaState {
  // === Productos ===
  productos: MayoristaProducto[];
  addProducto: (p: MayoristaProducto) => void;
  removeProducto: (id: string) => void;
  setProductoQuantity: (id: string, qty: number) => void;

  // === Cliente (opcional) ===
  clienteNombre: string;
  clienteTelefono: string;
  clienteDocumento: string;
  clienteObservaciones: string;
  setClienteField: (field: string, value: string) => void;

  // === Acciones ===
  clear: () => void;
}

const initialCliente = {
  clienteNombre: "",
  clienteTelefono: "",
  clienteDocumento: "",
  clienteObservaciones: "",
};

// Campos que se guardan en localStorage (el resto son funciones/derivados)
type PlanMayoristaPersistedState = Pick<
  PlanMayoristaState,
  | "productos"
  | "clienteNombre"
  | "clienteTelefono"
  | "clienteDocumento"
  | "clienteObservaciones"
>;

export const usePlanMayoristaStore = create<PlanMayoristaState>()(
  persist<PlanMayoristaState, [], [], PlanMayoristaPersistedState>(
    (set) => ({
      // --- Productos ---
      productos: [],
      addProducto: (p) =>
        set((state) => {
          const existing = state.productos.find((x) => x.id === p.id);
          if (existing) {
            return {
              productos: state.productos.map((x) =>
                x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x
              ),
            };
          }
          return { productos: [...state.productos, p] };
        }),
      removeProducto: (id) =>
        set((state) => ({
          productos: state.productos.filter((x) => x.id !== id),
        })),
      setProductoQuantity: (id, qty) =>
        set((state) => ({
          productos: state.productos
            .map((x) =>
              x.id === id ? { ...x, quantity: Math.max(1, qty) } : x
            )
            .filter((x) => x.quantity > 0),
        })),

      // --- Cliente ---
      ...initialCliente,
      setClienteField: (field, value) =>
        set({ [`cliente${field}`]: value } as Partial<PlanMayoristaState>),

      // --- Acciones ---
      clear: () =>
        set({
          productos: [],
          ...initialCliente,
        }),
    }),
    {
      name: "viza-plan-mayorista",
      storage: createUserScopedStorage<PlanMayoristaPersistedState>(),
      partialize: (state) => ({
        productos: state.productos,
        clienteNombre: state.clienteNombre,
        clienteTelefono: state.clienteTelefono,
        clienteDocumento: state.clienteDocumento,
        clienteObservaciones: state.clienteObservaciones,
      }),
    }
  )
);
