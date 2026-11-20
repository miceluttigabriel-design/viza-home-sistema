"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";
import {
  emptyWeddingItemMeta,
  normalizeWeddingItemMeta,
  type WeddingItemMeta,
} from "@/lib/wedding-list";

/**
 * Estado del formulario de "LISTA DE BODAS" dentro del cotizador.
 *
 * Los PRODUCTOS no viven acá: se usan los mismos items del carrito
 * (`useCotizacionStore`) para que el vendedor pueda armar la lista y cotizar
 * al mismo tiempo. Acá se guardan los datos del título de los novios, la
 * referencia a la lista guardada que se está editando y los datos de cada
 * regalo (quién lo entrega y bajo qué modalidad se cotiza).
 */

export type {
  WeddingQuoteType,
  WeddingItemMeta,
} from "@/lib/wedding-list";
export {
  WEDDING_QUOTE_OPTIONS,
  weddingQuoteLabel,
  isWeddingQuoteType,
  isManualQuoteType,
  clampCuotas,
  emptyWeddingItemMeta,
  normalizeWeddingItemMeta,
  parseGsInput,
  computeWeddingGift,
  type WeddingGiftValues,
} from "@/lib/wedding-list";

interface WeddingListFormState {
  title: string;
  eventDate: string;
  notes: string;
  // id de la lista guardada en BD que se está editando (null = nueva lista)
  loadedListId: string | null;
  // Datos de cada regalo, indexados por productId del carrito.
  itemMeta: Record<string, WeddingItemMeta>;

  setField: (field: "title" | "eventDate" | "notes", value: string) => void;
  setLoadedListId: (id: string | null) => void;
  setItemMeta: (productId: string, patch: Partial<WeddingItemMeta>) => void;
  setItemMetaMap: (map: Record<string, WeddingItemMeta>) => void;
  removeItemMeta: (productId: string) => void;
  clearForm: () => void;
}

const initial = {
  title: "",
  eventDate: "",
  notes: "",
  loadedListId: null as string | null,
  itemMeta: {} as Record<string, WeddingItemMeta>,
};

export const useWeddingListFormStore = create<WeddingListFormState>()(
  persist(
    (set) => ({
      ...initial,

      setField: (field, value) => set({ [field]: value } as Partial<WeddingListFormState>),
      setLoadedListId: (id) => set({ loadedListId: id }),
      setItemMeta: (productId, patch) =>
        set((state) => {
          const current = state.itemMeta[productId] ?? emptyWeddingItemMeta;
          const next = normalizeWeddingItemMeta({ ...current, ...patch });
          return { itemMeta: { ...state.itemMeta, [productId]: next } };
        }),
      setItemMetaMap: (map) =>
        set({
          itemMeta: Object.fromEntries(
            Object.entries(map ?? {}).map(([id, meta]) => [id, normalizeWeddingItemMeta(meta)])
          ),
        }),
      removeItemMeta: (productId) =>
        set((state) => {
          const next = { ...state.itemMeta };
          delete next[productId];
          return { itemMeta: next };
        }),
      clearForm: () => set({ ...initial, itemMeta: {} }),
    }),
    {
      name: "viza-wedding-list-form-storage",
      storage: createUserScopedStorage<WeddingListFormState>(),
    }
  )
);
