"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";
import type { PlanPedidoEspecial } from "@/lib/pedido-especial-calc";

// === PEDIDO ESPECIAL (Task 113, pedido del dueño) ===
// Estado del FORMULARIO del vendedor (lo que escribe: costo, proveedor,
// tipo de producto, descripción, plan). Se guarda PERSISTIDO por usuario
// (mismo patrón que el plan MAYORISTA) para que si el vendedor cambia de
// pestaña (CUOTA → SAFRA → PEDIDO ESPECIAL) no pierda lo que escribió.
//
// Task 113 v2 (todos los planes): `plan` ahora acepta TODOS los planes
// del sistema (contado / cuotas con-sin entrega / mayorista / safra /
// cheque) y se agregan los campos que cada plan necesita:
//   · fechaInicioPago  → CUOTAS SIN ENTREGA (días hasta la 1ª cuota)
//   · safraEntradaStr / safraMeses → SAFRA (entrada opcional + refuerzos)
//   · chequesCantidad / chequesFechas → CHEQUE (fechas editables)
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
  grupo: string; // GRUPO de la BASE (categoria) — selector principal
  tipoProducto: string; // "" = sin elegir (TIPO es OPCIONAL)
  descripcion: string; // descripción libre del producto pedido

  // === DATOS DEL CLIENTE (v8, pedido del dueño) ===
  clienteNombre: string;
  clienteTelefono: string;
  clienteDocumento: string;
  clienteObservaciones: string;

  // === Tipo de plan (Task 113 v2: TODOS los planes del sistema) ===
  plan: PlanPedidoEspecial;
  cuotas: number; // 1-30 (solo planes de cuotas)

  // === CUOTAS CON ENTREGA ===
  // Entrega inicial OPCIONAL en Gs (texto crudo del input). Vacío o 0 =
  // la 1ª cuota hace de entrega, como siempre. Si se carga un valor, la
  // entrega pasa a ser ese monto y el resto se reparte en las cuotas.
  entregaStr: string;

  // === CUOTAS SIN ENTREGA ===
  // Fecha de inicio de la 1ª cuota (ISO YYYY-MM-DD). 0-30 días = mismo
  // valor que CON ENTREGA; 31-60 días = recargo 3% (misma regla del
  // cotizador). Vacío = sin elegir.
  fechaInicioPago: string;

  // === SAFRA ===
  safraEntradaStr: string; // texto crudo de la entrada en Gs ("" = 0)
  safraMeses: number; // refuerzos mensuales 1-18

  // === CHEQUE ===
  chequesCantidad: number; // 1-20
  chequesFechas: string[]; // ISO YYYY-MM-DD (generadas a 30 días, editables)

  setModoCosto: (m: "usd" | "gs") => void;
  setCostoStr: (s: string) => void;
  setProveedor: (p: string) => void;
  setGrupo: (g: string) => void;
  setTipoProducto: (t: string) => void;
  setDescripcion: (d: string) => void;
  setClienteNombre: (s: string) => void;
  setClienteTelefono: (s: string) => void;
  setClienteDocumento: (s: string) => void;
  setClienteObservaciones: (s: string) => void;
  setPlan: (p: PlanPedidoEspecial) => void;
  setCuotas: (n: number) => void;
  setEntregaStr: (s: string) => void;
  setFechaInicioPago: (f: string) => void;
  setSafraEntradaStr: (s: string) => void;
  setSafraMeses: (n: number) => void;
  setChequesCantidad: (n: number) => void;
  setChequesFechas: (fechas: string[]) => void;
  setFechaCheque: (index: number, fecha: string) => void;
  clear: () => void;
}

const initial = {
  modoCosto: "usd" as const,
  costoStr: "",
  proveedor: "",
  grupo: "",
  tipoProducto: "",
  descripcion: "",
  clienteNombre: "",
  clienteTelefono: "",
  clienteDocumento: "",
  clienteObservaciones: "",
  plan: "contado" as PlanPedidoEspecial,
  cuotas: 1,
  entregaStr: "",
  fechaInicioPago: "",
  safraEntradaStr: "",
  safraMeses: 6,
  chequesCantidad: 3,
  chequesFechas: [] as string[],
};

// Campos que se guardan en localStorage (el resto son funciones/derivados)
type PedidoEspecialPersistedState = Pick<
  PedidoEspecialState,
  | "modoCosto"
  | "costoStr"
  | "proveedor"
  | "grupo"
  | "tipoProducto"
  | "descripcion"
  | "clienteNombre"
  | "clienteTelefono"
  | "clienteDocumento"
  | "clienteObservaciones"
  | "plan"
  | "cuotas"
  | "entregaStr"
  | "fechaInicioPago"
  | "safraEntradaStr"
  | "safraMeses"
  | "chequesCantidad"
  | "chequesFechas"
>;

// Migración v0 → v1 (Task 113 v2): el plan "cuotas" de la versión anterior
// pasa a ser "cuotas_con_entrega" (mismo cálculo) + defaults de los campos
// nuevos, para que el vendedor no pierda lo que tenía escrito.
function migrarV1(persisted: unknown): PedidoEspecialPersistedState {
  const p = { ...initial, ...(persisted as object) } as PedidoEspecialPersistedState;
  if ((p as { plan?: string }).plan === "cuotas") {
    (p as { plan: PlanPedidoEspecial }).plan = "cuotas_con_entrega";
  }
  if (!p.fechaInicioPago) p.fechaInicioPago = "";
  if (typeof p.entregaStr !== "string") p.entregaStr = "";
  if (!p.safraEntradaStr) p.safraEntradaStr = "";
  if (!Number.isFinite(p.safraMeses) || p.safraMeses < 1) p.safraMeses = 6;
  if (!Number.isFinite(p.chequesCantidad) || p.chequesCantidad < 1) p.chequesCantidad = 3;
  if (!Array.isArray(p.chequesFechas)) p.chequesFechas = [];
  // v2: GRUPO + datos del cliente (defaults para no perder nada).
  if (typeof p.grupo !== "string") p.grupo = "";
  if (typeof p.clienteNombre !== "string") p.clienteNombre = "";
  if (typeof p.clienteTelefono !== "string") p.clienteTelefono = "";
  if (typeof p.clienteDocumento !== "string") p.clienteDocumento = "";
  if (typeof p.clienteObservaciones !== "string") p.clienteObservaciones = "";
  return p;
}

export const usePedidoEspecialStore = create<PedidoEspecialState>()(
  persist<PedidoEspecialState, [], [], PedidoEspecialPersistedState>(
    (set) => ({
      ...initial,
      setModoCosto: (m) => set({ modoCosto: m }),
      setCostoStr: (s) => set({ costoStr: s }),
      setProveedor: (p) =>
        // Si cambia el proveedor, el grupo/tipo elegidos pueden no existir
        // en la lista nueva → se limpian para obligar a re-elegir.
        set((state) => ({
          proveedor: p,
          grupo: p === state.proveedor ? state.grupo : "",
          tipoProducto: p === state.proveedor ? state.tipoProducto : "",
        })),
      setGrupo: (g) => set({ grupo: g }),
      setTipoProducto: (t) => set({ tipoProducto: t }),
      setDescripcion: (d) => set({ descripcion: d }),
      setClienteNombre: (s) => set({ clienteNombre: String(s ?? "") }),
      setClienteTelefono: (s) => set({ clienteTelefono: String(s ?? "") }),
      setClienteDocumento: (s) => set({ clienteDocumento: String(s ?? "") }),
      setClienteObservaciones: (s) => set({ clienteObservaciones: String(s ?? "") }),
      setPlan: (p) => set({ plan: p }),
      setCuotas: (n) => set({ cuotas: Math.max(1, Math.min(30, Math.floor(n || 1))) }),
      setEntregaStr: (s) => set({ entregaStr: String(s ?? "") }),
      setFechaInicioPago: (f) => set({ fechaInicioPago: f }),
      setSafraEntradaStr: (s) => set({ safraEntradaStr: s }),
      setSafraMeses: (n) => set({ safraMeses: Math.max(1, Math.min(18, Math.floor(n || 1))) }),
      setChequesCantidad: (n) =>
        set({ chequesCantidad: Math.max(1, Math.min(20, Math.floor(n || 1))) }),
      setChequesFechas: (fechas) =>
        set({ chequesFechas: fechas.map((f) => String(f || "").slice(0, 10)) }),
      setFechaCheque: (index, fecha) =>
        set((state) => {
          const nuevas = [...state.chequesFechas];
          if (index >= 0 && index < nuevas.length) nuevas[index] = String(fecha || "").slice(0, 10);
          return { chequesFechas: nuevas };
        }),
      clear: () => set({ ...initial }),
    }),
    {
      name: "viza-pedido-especial",
      storage: createUserScopedStorage<PedidoEspecialPersistedState>(),
      version: 2,
      migrate: migrarV1,
      partialize: (state) => ({
        modoCosto: state.modoCosto,
        costoStr: state.costoStr,
        proveedor: state.proveedor,
        grupo: state.grupo,
        tipoProducto: state.tipoProducto,
        descripcion: state.descripcion,
        clienteNombre: state.clienteNombre,
        clienteTelefono: state.clienteTelefono,
        clienteDocumento: state.clienteDocumento,
        clienteObservaciones: state.clienteObservaciones,
        plan: state.plan,
        cuotas: state.cuotas,
        entregaStr: state.entregaStr,
        fechaInicioPago: state.fechaInicioPago,
        safraEntradaStr: state.safraEntradaStr,
        safraMeses: state.safraMeses,
        chequesCantidad: state.chequesCantidad,
        chequesFechas: state.chequesFechas,
      }),
    }
  )
);
