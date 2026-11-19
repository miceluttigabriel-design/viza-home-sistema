"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

/**
 * Estado del formulario de "LISTA DE BODAS" dentro del cotizador.
 *
 * Los PRODUCTOS no viven acá: se usan los mismos items del carrito
 * (`useCotizacionStore`) para que el vendedor pueda armar la lista y cotizar
 * al mismo tiempo. Acá solo se guardan los datos del título de los novios y
 * la referencia a la lista guardada que se está editando, de modo que no se
 * pierdan al recargar la página.
 */
interface WeddingListFormState {
  title: string;
  eventDate: string;
  notes: string;
  // id de la lista guardada en BD que se está editando (null = nueva lista)
  loadedListId: string | null;

  setField: (field: "title" | "eventDate" | "notes", value: string) => void;
  setLoadedListId: (id: string | null) => void;
  clearForm: () => void;
}

const initial = {
  title: "",
  eventDate: "",
  notes: "",
  loadedListId: null as string | null,
};

export const useWeddingListFormStore = create<WeddingListFormState>()(
  persist(
    (set) => ({
      ...initial,

      setField: (field, value) => set({ [field]: value } as Partial<WeddingListFormState>),
      setLoadedListId: (id) => set({ loadedListId: id }),
      clearForm: () => set({ ...initial }),
    }),
    {
      name: "viza-wedding-list-form-storage",
      storage: createUserScopedStorage<WeddingListFormState>(),
    }
  )
);
