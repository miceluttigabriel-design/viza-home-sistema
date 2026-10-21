"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-scoped-storage";

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  category: string;
}

interface CartState {
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  vendorName: string;
  notes: string;
  discountPercent: number;
  taxRate: number;

  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;
  clear: () => void;
  setField: (field: keyof CartState, value: string | number) => void;

  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerAddress: "",
      vendorName: "",
      notes: "",
      discountPercent: 0,
      taxRate: 0,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      setQuantity: (productId, qty) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i
            )
            .filter((i) => i.quantity > 0),
        })),

      clear: () =>
        set({
          items: [],
          customerName: "",
          customerPhone: "",
          customerEmail: "",
          customerAddress: "",
          vendorName: "",
          notes: "",
          discountPercent: 0,
          taxRate: 0,
        }),

      setField: (field, value) => set({ [field]: value } as Partial<CartState>),

      getSubtotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      getDiscountAmount: () => {
        const sub = get().getSubtotal();
        return (sub * (get().discountPercent || 0)) / 100;
      },
      getTaxAmount: () => {
        const sub = get().getSubtotal();
        const disc = get().getDiscountAmount();
        return ((sub - disc) * (get().taxRate || 0)) / 100;
      },
      getTotal: () => {
        const sub = get().getSubtotal();
        const disc = get().getDiscountAmount();
        const tax = get().getTaxAmount();
        return sub - disc + tax;
      },
      getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "viza-cart-storage",
      storage: userScopedStorage,
    }
  )
);
