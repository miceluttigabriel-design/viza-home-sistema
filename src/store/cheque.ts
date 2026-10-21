"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-scoped-storage";

function parseSafra(safra: string | null | undefined): number {
  if (!safra) return 0;
  if (safra === "null" || safra === "NULL") return 0;
  const n = parseFloat(safra);
  return isNaN(n) ? 0 : n;
}

function addDays(isoDate: string, days: number): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function redondeoComercial(valor: number): number {
  return Math.ceil(valor / 1000) * 1000;
}

function detectarTipo(productos: ChequeProducto[]): { tipo: string; tasa: number } {
  // Detectar motos EXCLUSIVAMENTE por las marcas KENTON y SUZUKI
  // (no por la palabra "MOTO" porque "BICI MOTO" no es una moto)
  const esMoto = productos.some(p => {
    const texto = p.name.toUpperCase();
    return texto.includes("KENTON") || texto.includes("SUZUKI");
  });
  return { tipo: esMoto ? "MOTO" : "GENERAL", tasa: esMoto ? 0.015 : 0.03 };
}

export interface ChequeProducto {
  id: string; sku: string; name: string; priceContado: number; safraPct: number; quantity: number;
}

export interface ChequeResultado {
  numero: number;
  fecha: string;
  valor: number;
}

export interface ChequeState {
  productos: ChequeProducto[];
  addProducto: (p: ChequeProducto) => void;
  removeProducto: (id: string) => void;
  setProductoQuantity: (id: string, qty: number) => void;

  clienteNombre: string;
  clienteTelefono: string;
  clienteObservaciones: string;
  fechaEmision: string;
  setClienteField: (field: string, value: string) => void;

  cantidadCheques: number;
  setCantidadCheques: (n: number) => void;
  fechasCheques: string[];
  setFechaCheque: (index: number, fecha: string) => void;
  generarCampos: () => void;

  resultados: ChequeResultado[];
  totalPagar: number;
  totalContadoBruto: number;
  descuentoCasco: number;
  baseCalculo: number;
  calcular: () => void;
  clear: () => void;
}

function calcularHelper(state: ChequeState): Partial<ChequeState> {
  const productos = state.productos || [];
  const fechasCheques = state.fechasCheques || [];
  const fechaEmision = state.fechaEmision || new Date().toISOString().slice(0, 10);

  const { tipo, tasa } = detectarTipo(productos);
  const totalContadoBruto = productos.reduce((s, p) => s + p.priceContado * p.quantity, 0);
  const cascoEnCarrito = productos.find(p => p.name.toUpperCase().includes("CASCO"));
  const descuentoCasco = cascoEnCarrito ? cascoEnCarrito.priceContado * cascoEnCarrito.quantity : 0;
  const baseCalculo = Math.max(0, totalContadoBruto - descuentoCasco);

  if (baseCalculo <= 0 || fechasCheques.length === 0) {
    return { resultados: [], totalPagar: 0, totalContadoBruto, descuentoCasco, baseCalculo };
  }

  const fechasOrdenadas = [...fechasCheques].filter(f => f).sort((a, b) => a.localeCompare(b));
  const cantidad = fechasOrdenadas.length;

  // Parsear fecha de emisión (local, sin UTC)
  const [ey, em, ed] = fechaEmision.split("-").map(Number);
  const fechaEmisionDate = new Date(ey, em - 1, ed);

  // 1. Calcular el plazo promedio en meses (suma de meses de cada cheque / cantidad)
  let totalMeses = 0;
  for (let i = 0; i < cantidad; i++) {
    const [cy, cm, cd] = fechasOrdenadas[i].split("-").map(Number);
    const fechaChequeDate = new Date(cy, cm - 1, cd);
    const diasDesdeEmision = Math.ceil(
      (fechaChequeDate.getTime() - fechaEmisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    totalMeses += diasDesdeEmision / 30;
  }
  const plazoPromedioMeses = totalMeses / cantidad;

  // 2. Calcular interés total sobre toda la base por el plazo promedio
  const interesTotal = baseCalculo * tasa * plazoPromedioMeses;

  // 3. Total a pagar = base + interés total
  const totalBruto = baseCalculo + interesTotal;

  // 4. Valor por cheque = total / cantidad, redondeado al millar superior
  const valorPorCheque = redondeoComercial(totalBruto / cantidad);

  // 5. Total real (puede ajustarse por el redondeo)
  const totalPagar = valorPorCheque * cantidad;

  // 6. Todos los cheques tienen el MISMO valor
  const resultados: ChequeResultado[] = fechasOrdenadas.map((fecha, i) => ({
    numero: i + 1,
    fecha: fecha,
    valor: valorPorCheque,
  }));

  return { resultados, totalPagar, totalContadoBruto, descuentoCasco, baseCalculo };
}

const initialCliente = {
  clienteNombre: "", clienteTelefono: "", clienteObservaciones: "",
  fechaEmision: new Date().toISOString().slice(0, 10),
};

export const useChequeStore = create<ChequeState>()(
  persist(
    (set) => ({
      productos: [],
      addProducto: (p) => set((s) => {
        const ex = s.productos.find(x => x.id === p.id);
        if (ex) return { productos: s.productos.map(x => x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x) };
        return { productos: [...s.productos, p] };
      }),
      removeProducto: (id) => set((s) => ({ productos: s.productos.filter(x => x.id !== id) })),
      setProductoQuantity: (id, qty) => set((s) => ({ productos: s.productos.map(x => x.id === id ? { ...x, quantity: Math.max(1, qty) } : x).filter(x => x.quantity > 0) })),

      ...initialCliente,
      setClienteField: (field, value) => set({ [`cliente${field}`]: value } as Partial<ChequeState>),

      cantidadCheques: 3,
      setCantidadCheques: (n) => set({ cantidadCheques: Math.max(1, Math.min(20, n)) }),
      fechasCheques: [],
      setFechaCheque: (index, fecha) => set((s) => {
        const nuevas = [...s.fechasCheques];
        nuevas[index] = fecha;
        return { fechasCheques: nuevas };
      }),
      generarCampos: () => set((s) => {
        const fechaBase = s.fechaEmision || new Date().toISOString().slice(0, 10);
        const nuevas = Array.from({ length: s.cantidadCheques }, (_, i) => addDays(fechaBase, 30 * (i + 1)));
        return { fechasCheques: nuevas, resultados: [], totalPagar: 0 };
      }),

      resultados: [],
      totalPagar: 0,
      totalContadoBruto: 0,
      descuentoCasco: 0,
      baseCalculo: 0,
      calcular: () => set((s) => calcularHelper(s)),
      clear: () => set({
        productos: [], ...initialCliente, fechaEmision: new Date().toISOString().slice(0, 10),
        cantidadCheques: 3, fechasCheques: [],
        resultados: [], totalPagar: 0, totalContadoBruto: 0, descuentoCasco: 0, baseCalculo: 0,
      }),
    }),
    {
      name: "viza-plan-cheque",
      storage: userScopedStorage,
      partialize: (s) => ({
        productos: s.productos, clienteNombre: s.clienteNombre, clienteTelefono: s.clienteTelefono,
        clienteObservaciones: s.clienteObservaciones, fechaEmision: s.fechaEmision,
        cantidadCheques: s.cantidadCheques, fechasCheques: s.fechasCheques,
      }),
    }
  )
);

export { parseSafra, addDays, redondeoComercial };
