"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCartStore } from "@/store/cart";
import { formatPYG } from "@/lib/format";
import { Trash2, Plus, Minus, FileText, X, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const {
    items,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    vendorName,
    notes,
    discountPercent,
    taxRate,
    setField,
    removeItem,
    setQuantity,
    clear,
    getSubtotal,
    getDiscountAmount,
    getTaxAmount,
    getTotal,
  } = useCartStore();

  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const subtotal = getSubtotal();
  const discountAmt = getDiscountAmount();
  const taxAmt = getTaxAmount();
  const total = getTotal();

  const handleSaveQuote = async () => {
    if (!customerName.trim()) {
      toast.error("Ingresá el nombre del cliente");
      return;
    }
    if (items.length === 0) {
      toast.error("No hay productos en el presupuesto");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          customerAddress,
          vendorName,
          notes,
          discountPercent,
          taxRate,
          items: items.map((it) => ({
            productId: it.productId,
            productName: it.name,
            productSku: it.sku,
            quantity: it.quantity,
            unitPrice: it.price,
            subtotal: it.price * it.quantity,
          })),
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      toast.success(`Presupuesto guardado: ${data.quote.quoteNumber}`);
    } catch {
      toast.error("No se pudo guardar el presupuesto");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!customerName.trim()) {
      toast.error("Ingresá el nombre del cliente para generar el PDF");
      return;
    }
    if (items.length === 0) {
      toast.error("El presupuesto está vacío");
      return;
    }
    setGeneratingPdf(true);

    try {
      const payload = {
        customer: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress,
        },
        vendor: vendorName || "Vendedor VIZA",
        notes,
        discountPercent,
        taxRate,
        items: items.map((it) => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.price,
          subtotal: it.price * it.quantity,
        })),
        subtotal,
        discountAmt,
        taxAmt,
        total,
      };

      const res = await fetch("/api/quotes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al generar PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VIZA-Presupuesto-${customerName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("PDF generado correctamente");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isEmpty = items.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col bg-white">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-stone-200 bg-gradient-to-r from-rose-500 to-amber-500 text-white">
          <SheetTitle className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Presupuesto de Venta
          </SheetTitle>
          <SheetDescription className="text-rose-50">
            Armá el presupuesto del cliente y exportalo a PDF con un click.
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-stone-400 p-8">
            <ShoppingCart className="h-12 w-12" />
            <p className="font-medium text-stone-500">Tu presupuesto está vacío</p>
            <p className="text-sm text-stone-400 text-center max-w-xs">
              Agregá productos desde el catálogo tocando el botón <span className="font-semibold text-rose-500">Agregar</span> en cualquier tarjeta.
            </p>
          </div>
        ) : (
          <>
            {/* Items scroll */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.map((it) => (
                <div
                  key={it.productId}
                  className="flex gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.imageUrl || ""}
                    alt={it.name}
                    className="h-16 w-16 rounded-lg object-cover bg-stone-200 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-stone-900 line-clamp-1">
                          {it.name}
                        </h4>
                        <p className="text-[11px] text-stone-500 font-mono">{it.sku}</p>
                      </div>
                      <button
                        onClick={() => removeItem(it.productId)}
                        className="shrink-0 h-7 w-7 rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center transition-colors"
                        aria-label="Quitar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-white rounded-lg border border-stone-200 p-0.5">
                        <button
                          onClick={() => setQuantity(it.productId, it.quantity - 1)}
                          className="h-7 w-7 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-600"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center font-semibold text-sm tabular-nums">
                          {it.quantity}
                        </span>
                        <button
                          onClick={() => setQuantity(it.productId, it.quantity + 1)}
                          className="h-7 w-7 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-600"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-stone-400">{formatPYG(it.price)} c/u</p>
                        <p className="font-bold text-sm text-stone-900">
                          {formatPYG(it.price * it.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Datos del cliente */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                <h4 className="font-semibold text-sm text-stone-900">Datos del cliente</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="Nombre y apellido *" value={customerName} onChange={(v) => setField("customerName", v)} placeholder="Juan Pérez" />
                  <Field label="Teléfono" value={customerPhone} onChange={(v) => setField("customerPhone", v)} placeholder="+598 99 123 456" />
                  <Field label="Email" value={customerEmail} onChange={(v) => setField("customerEmail", v)} placeholder="cliente@email.com" />
                  <Field label="Vendedor" value={vendorName} onChange={(v) => setField("vendorName", v)} placeholder="Tu nombre" />
                </div>
                <Field label="Dirección" value={customerAddress} onChange={(v) => setField("customerAddress", v)} placeholder="Calle y número, ciudad" />
                <Field label="Notas / observaciones" value={notes} onChange={(v) => setField("notes", v)} placeholder="Forma de pago, plazo de entrega, etc." textarea />
              </div>

              {/* Descuentos y ajustes */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                <h4 className="font-semibold text-sm text-stone-900">Ajustes de precio</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] uppercase font-semibold text-stone-500">Descuento (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={discountPercent}
                      onChange={(e) => setField("discountPercent", Number(e.target.value))}
                      className="w-full h-9 px-2 mt-0.5 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase font-semibold text-stone-500">IVA (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={taxRate}
                      onChange={(e) => setField("taxRate", Number(e.target.value))}
                      className="w-full h-9 px-2 mt-0.5 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer: totales y acciones */}
            <div className="border-t border-stone-200 bg-stone-50 px-5 py-4 space-y-3">
              <div className="space-y-1 text-sm">
                <Row label="Subtotal" value={formatPYG(subtotal)} />
                {discountAmt > 0 && (
                  <Row label={`Descuento (${discountPercent}%)`} value={`- ${formatPYG(discountAmt)}`} color="text-rose-600" />
                )}
                {taxAmt > 0 && (
                  <Row label={`IVA (${taxRate}%)`} value={formatPYG(taxAmt)} />
                )}
                <div className="flex items-center justify-between pt-2 border-t border-stone-200 mt-2">
                  <span className="font-bold text-base text-stone-900">Total</span>
                  <span className="font-bold text-xl text-rose-600 tabular-nums">
                    {formatPYG(total)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleSaveQuote}
                  disabled={saving}
                  className="h-11 rounded-xl bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={generatingPdf}
                  className="h-11 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-200"
                >
                  <FileText className="h-4 w-4" />
                  {generatingPdf ? "Generando..." : "Exportar PDF"}
                </button>
              </div>

              <button
                onClick={() => {
                  if (confirm("¿Vaciar presupuesto? Se perderán los items cargados.")) {
                    clear();
                    toast.success("Presupuesto vaciado");
                  }
                }}
                className="w-full h-9 rounded-lg text-xs font-medium text-stone-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Vaciar presupuesto
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase font-semibold text-stone-500">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 px-2 mt-0.5 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
        />
      )}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-stone-600">{label}</span>
      <span className={`font-semibold tabular-nums ${color || "text-stone-900"}`}>{value}</span>
    </div>
  );
}
