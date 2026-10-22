"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-scoped-storage";

// === HELPERS ===

// Parsea el campo SAFRA del Admin (string como "7", "4.5", "null") a número
// REGLA DE ORO: Solo LECTURA - no modifica la BD del Admin, solo lee.
function parseSafra(safra: string | null | undefined): number {
  if (!safra) return 0;
  if (safra === "null" || safra === "NULL") return 0;
  const n = parseFloat(safra);
  return isNaN(n) ? 0 : n;
}

// Suma N meses a una fecha ISO (YYYY-MM-DD). Devuelve YYYY-MM-DD.
function addMonths(isoDate: string, months: number): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Genera ID único simple
function genId(): string {
  return `r${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// === INTERFACES ===

export interface SafraProducto {
  id: string;
  sku: string;
  name: string;
  priceContado: number;
  // % SAFRA leído del Panel Admin (SOLO LECTURA - nunca se modifica en la BD)
  safraPct: number;
  quantity: number;
}

// Un pago manual hecho por el vendedor (entrada o refuerzo)
export interface PagoManual {
  id: string;        // ID único
  mes: number;       // 0 = entrada, 1-18 = refuerzos
  valor: number;     // monto en Gs
  concepto: string;  // descripción (default "Refuerzo Mes N")
}

// Cronograma generado mes a mes con interés sobre saldo restante
export interface FilaCronograma {
  mes: number;            // 0 = entrada, 1-18 = meses
  fecha: string;          // ISO date
  concepto: string;        // descripción del pago
  saldoInicial: number;   // saldo al inicio del mes (antes del pago)
  pago: number;            // monto del pago este mes (puede ser 0)
  interes: number;         // interés calculado sobre saldoInicial
  saldoFinal: number;      // saldo después del pago
}

export interface PlanSafraState {
  // === Productos ===
  productos: SafraProducto[];
  addProducto: (p: SafraProducto) => void;
  removeProducto: (id: string) => void;
  setProductoQuantity: (id: string, qty: number) => void;

  // === Cliente ===
  clienteNombre: string;
  clienteTelefono: string;
  clienteObservaciones: string;
  fechaEmision: string;
  setClienteField: (field: string, value: string) => void;

  // === Pago Inicial / Entrada (manual, el vendedor pone el valor) ===
  entradaValor: number;    // monto en Gs
  setEntradaValor: (v: number) => void;

  // === DESCUENTO POR CASCO (igual que en Cotización Normal) ===
  // El "Casco" es un descuento/bono que VIZA Home otorga al cliente.
  // Si cascoAplicado = true, el sistema OBLIGA a aplicar el descuento.
  // El descuento se resta del total de productos ANTES de calcular los
  // intereses/márgenes del Plan Safra (sobre el saldo restante).
  cascoAplicado: boolean;
  cascoValor: number;
  cascoDescripcion: string;
  setCascoAplicado: (v: boolean) => void;
  setCascoValor: (v: number) => void;
  setCascoDescripcion: (s: string) => void;

  // === Refuerzos (lista dinámica manual, el vendedor agrega cuantos quiera) ===
  refuerzos: PagoManual[];
  addRefuerzo: () => void;
  removeRefuerzo: (id: string) => void;
  setRefuerzoMes: (id: string, mes: number) => void;
  setRefuerzoValor: (id: string, valor: number) => void;

  // === Cronograma calculado en tiempo real ===
  cronograma: FilaCronograma[];
  totalContado: number;          // neto (después del casco) - base para intereses
  totalContadoBruto: number;     // bruto (sin casco) - para mostrar en PDF
  descuentoCasco: number;        // monto descontado por casco
  cascoError: boolean;            // true si casco activado pero inválido
  totalIntereses: number;
  totalPlan: number;          // totalContado + totalIntereses
  saldoFinal: number;         // después de todos los pagos
  totalPagado6Meses: number;  // suma de pagos en meses 0-6
  cumple50: boolean;          // si pagó >= 50% en 6 meses
  cuadra: boolean;            // si saldoFinal === 0 (exacto)
  faltanPara50: number;       // cuánto falta para cumplir el 50% en 6 meses
  totalPagos: number;          // suma de todos los pagos (entrada + refuerzos)

  // === Acciones ===
  calcularCronograma: () => void;
  clear: () => void;
}

// Cálculo del cronograma con la lógica "INTERÉS MENSUAL SOBRE SALDO RESTANTE":
//
// REGLA FINANCIERA:
// - El % Safra (leído del Admin, SOLO LECTURA) es la TASA DE INTERÉS MENSUAL
// - El interés se calcula mes a mes sobre el SALDO RESTANTE de ese mes
// - Si el cliente paga rápido, el saldo baja rápido, y por lo tanto PAGA
//   MENOS INTERESES (menos meses = menos interés)
// - El bucle itera del mes 1 al 18, deteniéndose si el saldo llega a 0
//
// PRINCIPIO: "Menos meses de financiación = Menos intereses a pagar"
//
// REGLA DE ORO: Solo LECTURA del SAFRA del Admin. No se modifica la BD.
function calcularCronogramaHelper(state: PlanSafraState): Partial<PlanSafraState> {
  const productos = state.productos || [];
  const entradaValor = Math.max(0, state.entradaValor || 0);
  const refuerzos = state.refuerzos || [];
  const fechaEmision = state.fechaEmision || new Date().toISOString().slice(0, 10);

  // === DESCUENTO POR CASCO ===
  // Si cascoAplicado es true pero cascoValor <= 0, hay un error (bloquear cálculo)
  // Si cascoValor > totalContado, también es inválido
  const cascoAplicado = state.cascoAplicado || false;
  const cascoValorRaw = state.cascoValor || 0;
  const cascoDescripcion = state.cascoDescripcion || "";

  // Total contado BRUTO (suma de priceContado * quantity, SIN descuento)
  const totalContadoBruto = productos.reduce(
    (sum, p) => sum + p.priceContado * p.quantity,
    0
  );

  // Validar casco
  const cascoValido = !cascoAplicado || (cascoValorRaw > 0 && cascoValorRaw <= totalContadoBruto);
  const descuentoCasco = cascoAplicado && cascoValido ? cascoValorRaw : 0;

  // Total contado NETO = bruto - descuento casco
  // Los intereses/márgenes del Plan Safra se calculan sobre este valor NETO
  // (NO sobre el total bruto). El descuento se resta ANTES de los intereses.
  const totalContado = Math.max(0, totalContadoBruto - descuentoCasco);

  // % SAFRA promedio ponderado por quantity (SOLO LECTURA)
  // Esta es la TASA DE INTERÉS MENSUAL que se aplica sobre el saldo restante
  const totalQuantity = productos.reduce((sum, p) => sum + p.quantity, 0);
  const safraPctPromedio = totalQuantity > 0
    ? productos.reduce((sum, p) => sum + p.safraPct * p.quantity, 0) / totalQuantity
    : 0;

  if (totalContado <= 0) {
    return {
      cronograma: [],
      totalContado: 0,
      totalContadoBruto,
      descuentoCasco,
      cascoError: cascoAplicado && !cascoValido,
      totalIntereses: 0,
      totalPlan: 0,
      saldoFinal: 0,
      totalPagado6Meses: 0,
      cumple50: true,
      cuadra: true,
      faltanPara50: 0,
      totalPagos: 0,
    };
  }

  // === INICIALIZACIÓN ===
  // El saldo arranca con el precio contado total
  let saldoActual = totalContado;
  let totalIntereses = 0;
  let totalPagado6Meses = 0;
  let totalPagos = 0;
  const cronograma: FilaCronograma[] = [];

  // === MES 0: ENTRADA / PAGO INICIAL ===
  // La entrada se descuenta del saldo ANTES de empezar a calcular intereses
  if (entradaValor > 0) {
    const saldoInicialMes0 = saldoActual; // = totalContado
    saldoActual -= entradaValor;
    totalPagado6Meses += entradaValor; // mes 0 cuenta para la regla del 50%
    totalPagos += entradaValor;
    cronograma.push({
      mes: 0,
      fecha: addMonths(fechaEmision, 0),
      concepto: "Entrada / Pago Inicial",
      saldoInicial: saldoInicialMes0,
      pago: entradaValor,
      interes: 0, // No hay interés en la entrada (es pago inicial)
      saldoFinal: Math.round(saldoActual),
    });
  }

  // === CONSTRUIR MAPA DE PAGOS POR MES (refuerzos, mes 1-18) ===
  // Suma todos los pagos de refuerzos que caen en el mismo mes
  const pagosPorMes: Record<number, number> = {};
  refuerzos.forEach((r) => {
    if (r.mes >= 1 && r.mes <= 18 && r.valor > 0) {
      pagosPorMes[r.mes] = (pagosPorMes[r.mes] || 0) + r.valor;
    }
  });

  // === ITERACIÓN MES A MES (1 a 18) ===
  // REGLA: Si el saldo llega a 0, se detiene el cálculo (menos meses = menos interés)
  for (let mes = 1; mes <= 18; mes++) {
    // Si el saldo ya es 0 o negativo, no se generan más intereses
    if (saldoActual <= 0) break;

    // 1. Saldo inicial de este mes (antes del pago)
    const saldoInicialMes = saldoActual;

    // 2. Calcular interés del mes sobre el saldo inicial
    // FÓRMULA: Interés = Saldo Restante * (% Safra / 100)
    const interesMes = saldoActual * (safraPctPromedio / 100);
    totalIntereses += interesMes;

    // 3. Buscar pagos de refuerzos en este mes
    const pagoMes = pagosPorMes[mes] || 0;

    // 4. Descontar pago del saldo
    saldoActual -= pagoMes;
    totalPagos += pagoMes;

    // 5. Validar regla del 50% en 6 meses (entrada ya sumada, + refuerzos mes 1-6)
    if (mes <= 6) {
      totalPagado6Meses += pagoMes;
    }

    // 6. Agregar fila al cronograma
    cronograma.push({
      mes,
      fecha: addMonths(fechaEmision, mes),
      concepto: pagoMes > 0 ? `Refuerzo Mes ${mes}` : "Solo interés (sin pago)",
      saldoInicial: Math.round(saldoInicialMes),
      pago: pagoMes,
      interes: Math.round(interesMes),
      saldoFinal: Math.round(saldoActual),
    });
  }

  // === VALIDACIONES ===
  // Regla del 50% en 6 meses (entrada + refuerzos mes 1-6 >= 50% del total contado)
  const cumple50 = totalPagado6Meses >= totalContado * 0.5;
  const faltanPara50 = Math.max(0, totalContado * 0.5 - totalPagado6Meses);
  // El plan "cuadra" si el saldo final es exactamente 0 (dentro de 1 Gs por redondeo)
  const cuadra = Math.abs(saldoActual) <= 1;

  return {
    cronograma,
    totalContado,           // neto (después del casco)
    totalContadoBruto,      // bruto (sin casco) - para mostrar en el PDF
    descuentoCasco,
    cascoError: cascoAplicado && !cascoValido,
    totalIntereses: Math.round(totalIntereses),
    totalPlan: Math.round(totalContado + totalIntereses),
    saldoFinal: Math.round(saldoActual), // puede ser negativo si se pasa
    totalPagado6Meses,
    cumple50,
    cuadra,
    faltanPara50: Math.round(faltanPara50),
    totalPagos,
  };
}

const initialCliente = {
  clienteNombre: "",
  clienteTelefono: "",
  clienteObservaciones: "",
  fechaEmision: new Date().toISOString().slice(0, 10),
};

export const usePlanSafraStore = create<PlanSafraState>()(
  persist(
    (set, get) => ({
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
        set({ [`cliente${field}`]: value } as Partial<PlanSafraState>),

      // --- Entrada ---
      entradaValor: 0,
      setEntradaValor: (v) => set({ entradaValor: Math.max(0, v) }),

      // --- Casco ---
      cascoAplicado: false,
      cascoValor: 0,
      cascoDescripcion: "",
      setCascoAplicado: (v) => set({ cascoAplicado: v }),
      setCascoValor: (v) => set({ cascoValor: Math.max(0, v) }),
      setCascoDescripcion: (s) => set({ cascoDescripcion: s }),

      // --- Refuerzos (lista dinámica manual) ---
      refuerzos: [],
      addRefuerzo: () =>
        set((state) => {
          // Siguiente mes sugerido: el último mes + 1, o 1 si está vacío
          const ultimoMes = state.refuerzos.length > 0
            ? Math.max(...state.refuerzos.map((r) => r.mes))
            : 0;
          const nuevoMes = Math.min(18, ultimoMes + 1);
          return {
            refuerzos: [
              ...state.refuerzos,
              { id: genId(), mes: nuevoMes, valor: 0, concepto: `Refuerzo Mes ${nuevoMes}` },
            ],
          };
        }),
      removeRefuerzo: (id) =>
        set((state) => ({
          refuerzos: state.refuerzos.filter((r) => r.id !== id),
        })),
      setRefuerzoMes: (id, mes) =>
        set((state) => ({
          refuerzos: state.refuerzos.map((r) =>
            r.id === id
              ? { ...r, mes: Math.max(1, Math.min(18, mes)), concepto: `Refuerzo Mes ${Math.max(1, Math.min(18, mes))}` }
              : r
          ),
        })),
      setRefuerzoValor: (id, valor) =>
        set((state) => ({
          refuerzos: state.refuerzos.map((r) =>
            r.id === id ? { ...r, valor: Math.max(0, valor) } : r
          ),
        })),

      // --- Cronograma y totales ---
      cronograma: [],
      totalContado: 0,
      totalContadoBruto: 0,
      descuentoCasco: 0,
      cascoError: false,
      totalIntereses: 0,
      totalPlan: 0,
      saldoFinal: 0,
      totalPagado6Meses: 0,
      cumple50: true,
      cuadra: true,
      faltanPara50: 0,
      totalPagos: 0,

      // --- Acciones ---
      calcularCronograma: () => {
        const state = get();
        const result = calcularCronogramaHelper(state);
        set(result);
      },

      clear: () =>
        set({
          productos: [],
          ...initialCliente,
          fechaEmision: new Date().toISOString().slice(0, 10),
          entradaValor: 0,
          cascoAplicado: false,
          cascoValor: 0,
          cascoDescripcion: "",
          refuerzos: [],
          cronograma: [],
          totalContado: 0,
          totalContadoBruto: 0,
          descuentoCasco: 0,
          cascoError: false,
          totalIntereses: 0,
          totalPlan: 0,
          saldoFinal: 0,
          totalPagado6Meses: 0,
          cumple50: true,
          cuadra: true,
          faltanPara50: 0,
          totalPagos: 0,
        }),
    }),
    {
      name: "viza-plan-safra",
      storage: userScopedStorage,
      partialize: (state) => ({
        productos: state.productos,
        clienteNombre: state.clienteNombre,
        clienteTelefono: state.clienteTelefono,
        clienteObservaciones: state.clienteObservaciones,
        fechaEmision: state.fechaEmision,
        entradaValor: state.entradaValor,
        cascoAplicado: state.cascoAplicado,
        cascoValor: state.cascoValor,
        cascoDescripcion: state.cascoDescripcion,
        refuerzos: state.refuerzos,
      }),
    }
  )
);

// Export del helper parseSafra para usar en el componente al leer productos
export { parseSafra };
