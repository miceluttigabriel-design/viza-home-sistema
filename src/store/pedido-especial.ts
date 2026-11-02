"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

// === PEDIDO ESPECIAL (Task 113, pedido del dueño) ===
// Estado del FORMULARIO del vendedor (lo que escribe: costo, proveedor,
// tipo de producto, descripción, plan). Se guarda PERSISTIDO por usuario
// (mismo patrón que el plan MAYORISTA) para que si el vendedor cambia de
// pestaña (CUOTA → SAFRA → PEDIDO ESPECIAL) no pierda lo que escribió.
//
// Los % NO viven acá: vienen SIEMPRE de la Base del admin
// (GET /api/pedido-especial/config) — el vendedor no los toca.
// El RESULTADO del cálculo tampoco se persiste: se calcula en vivo con
// los % vigentes de la Base (si el admin cambia un %, la pantalla
// recalcula sola con el valor nuevo).

export interface PedidoEspecialState {
  // === Costo (directo, como pidió el dueño) ===
  modoCosto: "usd" | "gs";
  costoStr: string; // texto crudo del input (se parsea al calcular)

  // === Selecciones ===
  proveedor: string; // "" = sin elegir
  tipoProducto: string; // "" = sin elegir
  descripcion: string; // descripción libre del producto pedido

  // === Tipo de plan (el dueño confirmó: contado o cuotas) ===
  plan: "contado" | "cuotas";
  cuotas: number; // 1-30 (solo si plan = "cuotas")

  setModoCosto: (m: "usd" | "gs") => void;
  setCostoStr: (s: string) => void;
  setProveedor: (p: string) => void;
  setTipoProducto: (t: string) => void;
  setDescripcion: (d: string) => void;
  setPlan: (p: "contado" | "cuotas") => void;
  setCuotas: (n: number) => void;
  clear: () => void;
}

const initial = {
  modoCosto: "usd" as const,
  costoStr: "",
  proveedor: "",
  tipoProducto: "",
  descripcion: "",
  plan: "contado" as const,
  cuotas: 1,
};

// Campos que se guardan en localStorage (el resto son funciones/derivados)
type PedidoEspecialPersistedState = Pick<
  PedidoEspecialState,
  | "modoCosto"
  | "costoStr"
  | "proveedor"
  | "tipoProducto"
  | "descripcion"
  | "plan"
  | "cuotas"
>;

export const usePedidoEspecialStore = create<PedidoEspecialState>()(
  persist<PedidoEspecialState, [], [], PedidoEspecialPersistedState>(
    (set) => ({
      ...initial,
      setModoCosto: (m) => set({ modoCosto: m }),
      setCostoStr: (s) => set({ costoStr: s }),
      setProveedor: (p) =>
        // Si cambia el proveedor, el tipo elegido puede no existir en la
        // lista nueva → se limpia para obligar a re-elegir.
        set((state) => ({
          proveedor: p,
          tipoProducto: p === state.proveedor ? state.tipoProducto : "",
        })),
      setTipoProducto: (t) => set({ tipoProducto: t }),
      setDescripcion: (d) => set({ descripcion: d }),
      setPlan: (p) => set({ plan: p }),
      setCuotas: (n) => set({ cuotas: Math.max(1, Math.min(30, Math.floor(n || 1))) }),
      clear: () => set({ ...initial }),
    }),
    {
      name: "viza-pedido-especial",
      storage: createUserScopedStorage<PedidoEspecialPersistedState>(),
      partialize: (state) => ({
        modoCosto: state.modoCosto,
        costoStr: state.costoStr,
        proveedor: state.proveedor,
        tipoProducto: state.tipoProducto,
        descripcion: state.descripcion,
        plan: state.plan,
        cuotas: state.cuotas,
      }),
    }
  )
);
