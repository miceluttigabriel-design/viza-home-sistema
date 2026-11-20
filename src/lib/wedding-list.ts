// Utilidades compartidas de la LISTA DE BODAS.
// Se usan en el cliente (formulario y PDF) y en el servidor (API y PDF)
// para que la normalización y el cálculo de cada regalo sean idénticos.

export type WeddingQuoteType =
  | "contado"
  | "cuota"
  | "mayorista"
  | "safra"
  | "cheque"
  | "especial";

export const WEDDING_QUOTE_OPTIONS: { value: WeddingQuoteType; label: string }[] = [
  { value: "contado", label: "SOLO CONTADO" },
  { value: "cuota", label: "PLAN CUOTA" },
  { value: "mayorista", label: "MAYORISTA" },
  { value: "safra", label: "SAFRA" },
  { value: "cheque", label: "CHEQUE" },
  { value: "especial", label: "ESPECIAL" },
];

// Modalidades que no se calculan con la tabla de precios del producto:
// el vendedor cotiza en el módulo correspondiente y carga el total a mano.
export const WEDDING_MANUAL_QUOTE_TYPES: WeddingQuoteType[] = [
  "mayorista",
  "safra",
  "cheque",
  "especial",
];

export function isWeddingQuoteType(value: unknown): value is WeddingQuoteType {
  return (
    value === "contado" ||
    value === "cuota" ||
    value === "mayorista" ||
    value === "safra" ||
    value === "cheque" ||
    value === "especial"
  );
}

export function weddingQuoteLabel(type: WeddingQuoteType): string {
  return WEDDING_QUOTE_OPTIONS.find((o) => o.value === type)?.label ?? "SOLO CONTADO";
}

export function isManualQuoteType(type: WeddingQuoteType): boolean {
  return WEDDING_MANUAL_QUOTE_TYPES.includes(type);
}

export function clampCuotas(n: unknown): number {
  const value = Math.floor(Number(n) || 0);
  if (value < 1) return 1;
  if (value > 30) return 30;
  return value;
}

/** Datos del entregante + modalidad de cotización de UN regalo. */
export interface WeddingItemMeta {
  giverName: string;
  giverPhone: string;
  giverCi: string;
  quoteType: WeddingQuoteType;
  // 1-30; solo se usa cuando quoteType === "cuota"
  quoteCuotas: number;
  // Total cotizado a mano para mayorista/safra/cheque/especial (texto crudo
  // del input, sin formatear). Vacío = usar el precio de contado.
  manualAmount: string;
}

export const emptyWeddingItemMeta: WeddingItemMeta = {
  giverName: "",
  giverPhone: "",
  giverCi: "",
  quoteType: "contado",
  quoteCuotas: 12,
  manualAmount: "",
};

/** Normaliza datos viejos o incompletos (localStorage / BD). */
export function normalizeWeddingItemMeta(raw: unknown): WeddingItemMeta {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    giverName: String(data.giverName ?? ""),
    giverPhone: String(data.giverPhone ?? ""),
    giverCi: String(data.giverCi ?? ""),
    quoteType: isWeddingQuoteType(data.quoteType) ? data.quoteType : "contado",
    quoteCuotas: clampCuotas(data.quoteCuotas ?? 12),
    manualAmount: String(data.manualAmount ?? ""),
  };
}

/** Monto escrito en Gs: acepta "1.500.000", "1,500,000" o "1500000". */
export function parseGsInput(raw: unknown): number {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export interface WeddingQuoteItemLike {
  priceContado: number;
  quantity: number;
}

export interface WeddingGiftValues {
  // Cantidad de pagos (1 = un solo pago / contado)
  cuotas: number;
  // Valor de cada pago (o el total cuando cuotas = 1)
  perCuota: number;
  // Total del regalo según la modalidad elegida
  total: number;
  // Etiqueta corta para mostrar en pantalla y en el PDF
  modeLabel: string;
  // Si ya tiene una persona asignada
  assigned: boolean;
}

export function computeWeddingGift(
  item: WeddingQuoteItemLike,
  meta: WeddingItemMeta
): WeddingGiftValues {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const cashTotal = (Number(item.priceContado) || 0) * qty;
  const assigned = meta.giverName.trim().length > 0;

  if (meta.quoteType === "contado") {
    return {
      cuotas: 1,
      perCuota: cashTotal,
      total: cashTotal,
      modeLabel: "SOLO CONTADO",
      assigned,
    };
  }

  if (meta.quoteType === "cuota") {
    const n = clampCuotas(meta.quoteCuotas);
    const key = n === 1 ? "price1" : `price${n}`;
    const prices = item as unknown as Record<string, unknown>;
    const unit = Number(prices[key]) || Number(item.priceContado) || 0;
    const perCuota = unit * qty;
    return {
      cuotas: n,
      perCuota,
      total: perCuota * n,
      modeLabel: n === 1 ? "PLAN 1 PAGO" : `PLAN ${n} CUOTAS`,
      assigned,
    };
  }

  const manual = parseGsInput(meta.manualAmount);
  const total = manual > 0 ? manual : cashTotal;
  return {
    cuotas: 1,
    perCuota: total,
    total,
    modeLabel: weddingQuoteLabel(meta.quoteType),
    assigned,
  };
}
