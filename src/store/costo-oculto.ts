"use client";

// === OJITO DEL COSTO (Task 114, pedido del dueño) ===
//
// "quiero que este ojito del costo funcione para ocultar el costo también
//  y mostrar… el vendedor necesita ver el costo solo que hay veces que el
//  cliente está encima de él y acaba viendo el costo también".
//
// Estado GLOBAL y CHICO del cuadro "COSTO DE PRODUCTOS · SOLO VENDEDOR":
//   · oculto = false → los montos se ven (como siempre).
//   · oculto = true  → los montos salen "Gs •••••" (nombres de productos
//     siguen, que no son secreto).
//
// Es un store zustand con persist para que:
//   · los 4 cuadros de la pantalla (CUOTA / SAFRA / CHEQUE / MAYORISTA)
//     se oculten y muestren JUNTOS con un solo clic (son el mismo
//     componente CostoInterno repetido),
//   · la preferencia quede guardada por USUARIO (createUserScopedStorage,
//     mismo aislamiento del carrito): si el vendedor lo dejó oculto y
//     recarga o vuelve mañana, arranca oculto — el cliente no ve nada.
//
// SOLO VISUAL: no toca stores de cotización, ni cálculos, ni PDFs (el
// costo sigue sin salir en ningún PDF, igual que siempre).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

interface CostoOcultoState {
  oculto: boolean;
  toggleOculto: () => void;
}

export const useCostoOcultoStore = create<CostoOcultoState>()(
  persist(
    (set) => ({
      oculto: false, // por defecto SE VE (el vendedor trabaja con el costo)
      toggleOculto: () => set((s) => ({ oculto: !s.oculto })),
    }),
    {
      name: "viza-costo-oculto",
      storage: createUserScopedStorage<CostoOcultoState>(),
    }
  )
);

// Máscara de los montos cuando el costo está oculto: mismo formato que
// formatPYG ("Gs 95.000") pero ilegible de lado.
export const COSTO_OCULTO_TXT = "Gs •••••";
