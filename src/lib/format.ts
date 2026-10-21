// Utilidades de formato VIZA HOME E.A.S
export function formatPYG(amount: number): string {
  // Formato Guaraníes (Gs) - moneda de Paraguay
  const rounded = Math.round(amount);
  return "Gs " + rounded.toLocaleString("es-PY");
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const CATEGORIES = [
  { value: "Todas", label: "Todas las categorías", icon: "🏠" },
  { value: "Muebles", label: "Muebles", icon: "🛋️", color: "amber" },
  { value: "Electrodomesticos", label: "Electrodomésticos", icon: "⚡", color: "sky" },
  { value: "Motos", label: "Motos", icon: "🏍️", color: "rose" },
  { value: "Otros", label: "Otros", icon: "📦", color: "stone" },
] as const;

export const CATEGORY_META: Record<string, { bg: string; text: string; ring: string }> = {
  Muebles: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  Electrodomesticos: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
  Motos: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
  },
  Otros: {
    bg: "bg-stone-100",
    text: "text-stone-700",
    ring: "ring-stone-200",
  },
};
