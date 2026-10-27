"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUserScopedStorage } from "@/lib/user-scoped-storage";

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
  // === COSTO (INTERNO - SOLO VENDEDOR) ===
  // Costo UNITARIO de la BASE (cost = costProd). Solo para el cuadrito
  // "Costo de productos" de la pantalla; NUNCA se envía a ningún PDF.
  cost?: number;
}

// Un pago manual hecho por el vendedor (entrada o refuerzo)
export interface PagoManual {
  id: string;        // ID único
  mes: number;       // 0 = entrada, 1-18 = refuerzos (derivado de fecha)
  valor: number;     // monto en Gs (AUTO-CALCULADO en v2.0)
  concepto: string;  // descripción (default "Refuerzo Mes N")
  fecha?: string;    // ISO date (YYYY-MM-DD) - input del usuario (v2.0)
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
  clienteDocumento: string;
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

  // === DESCUENTO POR CHAPA (COD 100068) - mismo mecanismo que el casco ===
  // La chapa es un REGALO igual que el casco. El componente detecta el
  // producto por COD exacto (src/lib/producto-regalo.ts) y sincroniza acá
  // el valor (precio contado × cantidad); el cálculo lo resta del total
  // contado ANTES de los intereses. 0 = no hay chapa.
  chapaValor: number;
  setChapaValor: (v: number) => void;

  // === Refuerzos (lista dinámica manual, el vendedor agrega cuantos quiera) ===
  refuerzos: PagoManual[];
  addRefuerzo: () => void;
  removeRefuerzo: (id: string) => void;
  setRefuerzoMes: (id: string, mes: number) => void;
  setRefuerzoValor: (id: string, valor: number) => void;
  setRefuerzoFecha: (id: string, fecha: string) => void; // v2.0 - fecha deriva mes

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

// REDONDEO COMERCIAL SAFRA: los refuerzos y el pago final se redondean
// SIEMPRE al millar superior (Gs exacto, sin valores quebrados).
// Ej: 4.295.147 → 4.296.000. El cliente nunca paga de menos: el redondeo
// sube el total a lo sumo unos miles (el margen no baja).
const redondeoComercial = (v: number): number =>
  Math.ceil(Math.max(0, v) / 1000) * 1000;

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

  // Descuento por CHAPA (COD 100068, regalo igual que el casco):
  // el componente sincroniza el valor exacto; se limita al bruto por seguridad.
  const descuentoChapa = Math.min(
    Math.max(0, state.chapaValor || 0),
    totalContadoBruto
  );

  // Total contado NETO = bruto - descuento casco - descuento chapa
  // Los intereses/márgenes del Plan Safra se calculan sobre este valor NETO
  // (NO sobre el total bruto). El descuento se resta ANTES de los intereses.
  const totalContado = Math.max(
    0,
    totalContadoBruto - descuentoCasco - descuentoChapa
  );

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
      concepto: "ENTRADA",
      saldoInicial: saldoInicialMes0,
      pago: entradaValor,
      interes: 0, // No hay interés en la entrada (es pago inicial)
      saldoFinal: Math.round(saldoActual),
    });
  }

  // === CONSTRUIR MAPA DE PAGOS POR MES (refuerzos, mes 1-18) ===
  // v2.1: AUTO-CALCULAR valores de refuerzos con TWO-PASS para que el plan SIEMPRE CUADRE
  // PASADA 1: estimar valores (saldo + interés estimado) divididos entre refuerzos
  // PASADA 2 (después del loop): ajustar el último refuerzo para que saldoFinal = 0
  // REGLA: el total de refuerzos NUNCA excede el total del plan.
  // FIX v2.0.1: NO devolver refuerzos en el return para evitar loop infinito.
  const refuerzosCalculados = refuerzos.map(r => ({ ...r }));
  const maxMes = refuerzosCalculados.length > 0
    ? Math.max(...refuerzosCalculados.map(r => Math.max(1, Math.min(18, r.mes))))
    : 0;
  if (refuerzosCalculados.length > 0 && saldoActual > 0) {
    // Estimar interés (mitad del worst-case, más realista)
    const interesEstimado = saldoActual * (safraPctPromedio / 100) * maxMes * 0.5;
    const totalAPagar = saldoActual + interesEstimado;
    // REDONDEO COMERCIAL: cada refuerzo sale al millar superior
    // (ej: 4.295.147 → 4.296.000), sin valores quebrados.
    const valorPorRefuerzo = redondeoComercial(
      totalAPagar / refuerzosCalculados.length
    );
    // Asignar valores, el ÚLTIMO absorbe el remainder (también redondeado arriba)
    refuerzosCalculados.forEach((r, idx) => {
      if (idx === refuerzosCalculados.length - 1) {
        const sumaOtros = valorPorRefuerzo * (refuerzosCalculados.length - 1);
        r.valor = redondeoComercial(totalAPagar - sumaOtros);
      } else {
        r.valor = valorPorRefuerzo;
      }
    });
  }

  // Suma todos los pagos de refuerzos que caen en el mismo mes
  const pagosPorMes: Record<number, number> = {};
  refuerzosCalculados.forEach((r) => {
    if (r.mes >= 1 && r.mes <= 18 && r.valor > 0) {
      pagosPorMes[r.mes] = (pagosPorMes[r.mes] || 0) + r.valor;
    }
  });

  // === ITERACIÓN MES A MES (1 a 18) - PASADA 1 ===
  // v2.2: Mostrar cada refuerzo SEPARADO (incluso en el mismo mes)
  // v2.2: El último refuerzo se etiqueta como "PAGO FINAL"
  for (let mes = 1; mes <= 18; mes++) {
    if (saldoActual <= 0) break;
    const saldoInicialMes = saldoActual;
    const interesMes = saldoActual * (safraPctPromedio / 100);
    totalIntereses += interesMes;
    const refuerzosEnMes = refuerzosCalculados.filter(r => r.mes === mes && r.valor > 0);
    if (refuerzosEnMes.length > 0) {
      refuerzosEnMes.forEach((r, idx) => {
        const esUltimo = (r.mes === maxMes && idx === refuerzosEnMes.length - 1);
        saldoActual -= r.valor;
        totalPagos += r.valor;
        if (mes <= 6) { totalPagado6Meses += r.valor; }
        cronograma.push({
          mes,
          fecha: r.fecha || addMonths(fechaEmision, mes),
          concepto: esUltimo ? "PAGO FINAL" : `Refuerzo Mes ${mes}`,
          saldoInicial: Math.round(saldoInicialMes),
          pago: r.valor,
          interes: Math.round(interesMes),
          saldoFinal: Math.round(saldoActual),
        });
      });
    } else {
      cronograma.push({
        mes, fecha: addMonths(fechaEmision, mes),
        concepto: "Solo interés (sin pago)",
        saldoInicial: Math.round(saldoInicialMes), pago: 0,
        interes: Math.round(interesMes), saldoFinal: Math.round(saldoActual),
      });
    }
  }

  // === PASADA 2: AJUSTAR EL ÚLTIMO REFUERZO PARA QUE EL PLAN CUADRE ===
  // Si el saldoFinal no es 0, ajustar el refuerzo del mes más alto
  // para absorber la diferencia (positiva o negativa).
  // Esto garantiza que el plan SIEMPRE cuadra (saldoFinal = 0).
  if (refuerzosCalculados.length > 0 && Math.abs(saldoActual) > 1) {
    // Encontrar el refuerzo con el mes más alto (último pago)
    let lastIdx = 0;
    let lastMes = 0;
    refuerzosCalculados.forEach((r, i) => {
      if (r.mes > lastMes) { lastMes = r.mes; lastIdx = i; }
    });
    // Ajustar el valor del último refuerzo
    const ajuste = Math.round(saldoActual); // positivo = falta pagar, negativo = sobrepagó
    // REDONDEO COMERCIAL: el valor ajustado también sale al millar superior.
    // Puede quedar un saldo levemente negativo (se pagaron unos Gs de más
    // por el redondeo): jamás de menos. Eso es válido para el plan.
    refuerzosCalculados[lastIdx].valor = redondeoComercial(
      refuerzosCalculados[lastIdx].valor + ajuste
    );

    // Reconstruir pagosPorMes con valor ajustado
    const pagosPorMes2: Record<number, number> = {};
    refuerzosCalculados.forEach((r) => {
      if (r.mes >= 1 && r.mes <= 18 && r.valor > 0) {
        pagosPorMes2[r.mes] = (pagosPorMes2[r.mes] || 0) + r.valor;
      }
    });

    // Resetear estado para segunda pasada
    saldoActual = totalContado;
    if (entradaValor > 0) {
      saldoActual -= entradaValor;
    }
    totalIntereses = 0;
    totalPagado6Meses = entradaValor > 0 ? entradaValor : 0;
    totalPagos = entradaValor > 0 ? entradaValor : 0;
    cronograma.length = 0;

    // Re-agregar entrada al cronograma
    if (entradaValor > 0) {
      cronograma.push({
        mes: 0,
        fecha: addMonths(fechaEmision, 0),
        concepto: "ENTRADA",
        saldoInicial: Math.round(totalContado),
        pago: entradaValor,
        interes: 0,
        saldoFinal: Math.round(saldoActual),
      });
    }

    // Re-correr el loop con valores ajustados (v2.2: refuerzos separados + PAGO FINAL)
    for (let mes = 1; mes <= 18; mes++) {
      if (saldoActual <= 0) break;
      const saldoInicialMes = saldoActual;
      const interesMes = saldoActual * (safraPctPromedio / 100);
      totalIntereses += interesMes;
      const refuerzosEnMes2 = refuerzosCalculados.filter(r => r.mes === mes && r.valor > 0);
      if (refuerzosEnMes2.length > 0) {
        refuerzosEnMes2.forEach((r, idx) => {
          const esUltimo = (r.mes === maxMes && idx === refuerzosEnMes2.length - 1);
          saldoActual -= r.valor;
          totalPagos += r.valor;
          if (mes <= 6) { totalPagado6Meses += r.valor; }
          cronograma.push({
            mes,
            fecha: r.fecha || addMonths(fechaEmision, mes),
            concepto: esUltimo ? "PAGO FINAL" : `Refuerzo Mes ${mes}`,
            saldoInicial: Math.round(saldoInicialMes),
            pago: r.valor,
            interes: Math.round(interesMes),
            saldoFinal: Math.round(saldoActual),
          });
        });
      } else {
        cronograma.push({
          mes, fecha: addMonths(fechaEmision, mes),
          concepto: "Solo interés (sin pago)",
          saldoInicial: Math.round(saldoInicialMes), pago: 0,
          interes: Math.round(interesMes), saldoFinal: Math.round(saldoActual),
        });
      }
    }
  }

  // === VALIDACIONES ===
  // Regla del 50% en 6 meses (entrada + refuerzos mes 1-6 >= 50% del total contado)
  const cumple50 = totalPagado6Meses >= totalContado * 0.5;
  const faltanPara50 = Math.max(0, totalContado * 0.5 - totalPagado6Meses);
  // El plan "cuadra" si NO queda deuda pendiente (saldo <= 1 Gs).
  // Con el redondeo comercial hacia arriba puede quedar un saldo levemente
  // NEGATIVO (se pagaron unos Gs de más al redondear al millar): eso
  // también es válido. Lo que NO es válido es saldo positivo (falta pagar).
  const cuadra = saldoActual <= 1;

  // === PAGO FINAL COMERCIAL (REDONDEO AL MILLAR) ===
  // El panel y el PDF muestran el interés acumulado del plan sumado al
  // ÚLTIMO pago (PAGO FINAL). Ese valor final TAMBIÉN debe salir al millar
  // superior (ej: 1.470.000 capital + 36.640 interés = 1.506.640 →
  // 1.507.000), para no mostrar nunca Gs quebrados.
  // El Total del Plan pasa a ser la suma REAL de las filas mostradas:
  // entrada + refuerzos + pago final redondeado (con interés incluido).
  const filasConPago = cronograma.filter((f) => f.pago > 0);
  const ultimaFilaPago = filasConPago.length > 0
    ? filasConPago[filasConPago.length - 1]
    : null;
  // Si la única fila con pago es la ENTRADA (sin refuerzos), no se toca:
  // la entrada es valor cargado por el vendedor y se muestra exacta.
  const esEntradaUnica = filasConPago.length === 1 && ultimaFilaPago?.mes === 0;
  const aplicaRedondeoFinal = !!ultimaFilaPago && !esEntradaUnica;
  const interesesRedondeados = Math.round(totalIntereses);
  const pagoFinalCapital = aplicaRedondeoFinal ? ultimaFilaPago.pago : 0;
  const pagoFinalComercial = aplicaRedondeoFinal
    ? redondeoComercial(pagoFinalCapital + interesesRedondeados)
    : 0;

  return {
    // v2.0 FIX: NO devolver refuerzos aquí para evitar loop infinito
    cronograma,
    totalContado,           // neto (después del casco)
    totalContadoBruto,      // bruto (sin casco) - para mostrar en el PDF
    descuentoCasco,
    cascoError: cascoAplicado && !cascoValido,
    totalIntereses: Math.round(totalIntereses),
    // Total del Plan = suma de las filas COMERCIALES que se muestran en
    // pantalla y PDF (entrada + refuerzos + PAGO FINAL con interés, al
    // millar superior). Así el total SIEMPRE coincide con la suma de las
    // filas y el cliente nunca ve Gs quebrados. El redondeo solo puede
    // subir el total unos Gs (jamás de menos).
    totalPlan: Math.round(
      aplicaRedondeoFinal
        ? totalPagos - pagoFinalCapital + pagoFinalComercial
        : Math.max(totalContado + interesesRedondeados, totalPagos)
    ),
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
  clienteDocumento: "",
  clienteObservaciones: "",
  fechaEmision: new Date().toISOString().slice(0, 10),
};

// Campos que se guardan en localStorage (el resto son funciones/derivados)
type PlanSafraPersistedState = Pick<
  PlanSafraState,
  | "productos"
  | "clienteNombre"
  | "clienteTelefono"
  | "clienteDocumento"
  | "clienteObservaciones"
  | "fechaEmision"
  | "entradaValor"
  | "cascoAplicado"
  | "cascoValor"
  | "cascoDescripcion"
  | "chapaValor"
  | "refuerzos"
>;

export const usePlanSafraStore = create<PlanSafraState>()(
  persist<PlanSafraState, [], [], PlanSafraPersistedState>(
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

      // --- Chapa (COD 100068, regalo igual que el casco) ---
      chapaValor: 0,
      setChapaValor: (v) => set({ chapaValor: Math.max(0, v) }),

      // --- Refuerzos (v2.0: solo fecha, valor auto-calculado) ---
      refuerzos: [],
      addRefuerzo: () =>
        set((state) => {
          const ultimoMes = state.refuerzos.length > 0
            ? Math.max(...state.refuerzos.map((r) => r.mes))
            : 0;
          const nuevoMes = Math.min(18, ultimoMes + 1);
          const fechaBase = state.fechaEmision || new Date().toISOString().slice(0, 10);
          const nuevaFecha = addMonths(fechaBase, nuevoMes);
          return {
            refuerzos: [
              ...state.refuerzos,
              { id: genId(), mes: nuevoMes, valor: 0, concepto: `Refuerzo Mes ${nuevoMes}`, fecha: nuevaFecha },
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
      // v2.0: setRefuerzoFecha - usuario ingresa fecha, sistema deriva mes
      setRefuerzoFecha: (id, fecha) =>
        set((state) => {
          const fechaBase = state.fechaEmision || new Date().toISOString().slice(0, 10);
          const dBase = new Date(fechaBase + "T00:00:00");
          const dRefuerzo = new Date(fecha + "T00:00:00");
          let mesCalculado = (dRefuerzo.getFullYear() - dBase.getFullYear()) * 12 + (dRefuerzo.getMonth() - dBase.getMonth());
          if (dRefuerzo.getDate() < dBase.getDate()) { mesCalculado--; }
          mesCalculado = Math.max(1, Math.min(18, mesCalculado));
          return {
            refuerzos: state.refuerzos.map((r) =>
              r.id === id
                ? { ...r, fecha, mes: mesCalculado, concepto: `Refuerzo Mes ${mesCalculado}` }
                : r
            ),
          };
        }),

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
          chapaValor: 0,
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
      storage: createUserScopedStorage<PlanSafraPersistedState>(),
      partialize: (state) => ({
        productos: state.productos,
        clienteNombre: state.clienteNombre,
        clienteTelefono: state.clienteTelefono,
        clienteDocumento: state.clienteDocumento,
        clienteObservaciones: state.clienteObservaciones,
        fechaEmision: state.fechaEmision,
        entradaValor: state.entradaValor,
        cascoAplicado: state.cascoAplicado,
        cascoValor: state.cascoValor,
        cascoDescripcion: state.cascoDescripcion,
        chapaValor: state.chapaValor,
        refuerzos: state.refuerzos,
      }),
    }
  )
);

// Export del helper parseSafra para usar en el componente al leer productos
export { parseSafra };
