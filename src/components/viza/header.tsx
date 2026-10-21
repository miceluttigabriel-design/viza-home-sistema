"use client";

import { Sofa, Zap, Bike, Search, ShoppingCart, Sparkles } from "lucide-react";
import { useCartStore } from "@/store/cart";

interface HeaderProps {
  search: string;
  setSearch: (v: string) => void;
  onOpenCart: () => void;
}

export function Header({ search, setSearch, onOpenCart }: HeaderProps) {
  const itemCount = useCartStore((s) => s.getItemCount());

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Fila superior: logo + acciones */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-rose-600 flex items-center justify-center shadow-md shadow-rose-200">
              <Sparkles className="h-6 w-6 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="font-bold text-xl text-stone-900 leading-none tracking-tight">
                VIZA HOME <span className="text-rose-600">E.A.S</span>
              </h1>
              <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                Muebles · Electros · Motos · Panel de Ventas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCart}
              className="relative h-11 px-4 sm:px-5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Mi Presupuesto</span>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Fila inferior: buscador gigante */}
        <div className="pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre, SKU o marca... ej: heladera, sofá, moto 110cc"
              className="w-full h-12 pl-12 pr-4 rounded-xl bg-stone-100 border border-stone-200 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all text-sm sm:text-base placeholder:text-stone-400"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

export function CategoryPill({
  active,
  onClick,
  icon,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: "amber" | "sky" | "rose" | "stone";
}) {
  const colorMap: Record<string, { on: string; off: string }> = {
    amber: { on: "bg-amber-500 text-white border-amber-500 shadow-amber-200", off: "hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300" },
    sky: { on: "bg-sky-500 text-white border-sky-500 shadow-sky-200", off: "hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300" },
    rose: { on: "bg-rose-500 text-white border-rose-500 shadow-rose-200", off: "hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300" },
    stone: { on: "bg-stone-900 text-white border-stone-900 shadow-stone-300", off: "hover:bg-stone-100 hover:text-stone-900 hover:border-stone-400" },
  };
  const c = colorMap[color];
  return (
    <button
      onClick={onClick}
      className={`h-10 sm:h-11 px-4 sm:px-5 rounded-xl border font-semibold text-sm flex items-center gap-2 transition-all shadow-sm ${
        active ? c.on : `bg-white text-stone-700 border-stone-200 ${c.off}`
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="hidden xs:inline sm:inline">{label}</span>
    </button>
  );
}

export function CategoryIcon({ category }: { category: string }) {
  if (category === "Muebles") return <Sofa className="h-4 w-4" />;
  if (category === "Electrodomesticos") return <Zap className="h-4 w-4" />;
  if (category === "Motos") return <Bike className="h-4 w-4" />;
  return <Sofa className="h-4 w-4" />;
}
