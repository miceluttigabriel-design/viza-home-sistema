"use client";

import { Plus, Check, Package } from "lucide-react";
import { useState } from "react";
import { useCartStore } from "@/store/cart";
import { formatPYG, CATEGORY_META } from "@/lib/format";
import { CategoryIcon } from "./header";

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  brand: string | null;
}

export function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const [added, setAdded] = useState(false);

  const inCart = items.find((i) => i.productId === product.id);
  const meta = CATEGORY_META[product.category] || CATEGORY_META.Muebles;

  const handleAdd = () => {
    addItem({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.imageUrl,
      category: product.category,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <article className="group bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-lg hover:shadow-stone-200/60 hover:border-stone-300 transition-all duration-200 flex flex-col">
      {/* Imagen */}
      <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-10 w-10 text-stone-300" />
          </div>
        )}
        {/* Badge categoría */}
        <span className={`absolute top-2 left-2 inline-flex items-center gap-1 ${meta.bg} ${meta.text} ring-1 ${meta.ring} rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide`}>
          <CategoryIcon category={product.category} />
          {product.category === "Electrodomesticos" ? "Electro" : product.category}
        </span>

      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm text-stone-900 line-clamp-2 leading-snug">
            {product.name}
          </h3>
        </div>
        <p className="text-xs text-stone-500 line-clamp-2 min-h-[2.5rem]">
          {product.description || "Producto VIZA HOME."}
        </p>

        <div className="flex items-center justify-between gap-2 text-[11px] text-stone-400 mt-1">
          <span className="font-mono">{product.sku}</span>
          {product.brand && <span className="font-medium">{product.brand}</span>}
        </div>

        {/* Precio y acción */}
        <div className="mt-2 pt-2 border-t border-stone-100 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase text-stone-400 font-medium tracking-wide">Precio</p>
            <p className="font-bold text-lg text-stone-900 leading-none">
              {formatPYG(product.price)}
            </p>
          </div>
          <button
            onClick={handleAdd}
            className={`h-10 px-3 rounded-xl flex items-center gap-1.5 font-semibold text-sm transition-all shadow-sm ${
              added
                ? "bg-emerald-500 text-white"
                : inCart
                ? "bg-stone-800 text-white hover:bg-stone-700"
                : "bg-rose-500 text-white hover:bg-rose-600"
            }`}
          >
            {added ? (
              <>
                <Check className="h-4 w-4" /> Agregado
              </>
            ) : inCart ? (
              <>
                <Plus className="h-4 w-4" /> +1 más
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Agregar
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
