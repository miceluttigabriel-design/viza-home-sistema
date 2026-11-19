"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Heart,
  Save,
  FileText,
  FolderOpen,
  Trash2,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useCotizacionStore, type CotizacionItem } from "@/store/cotizacion";
import { useWeddingListFormStore } from "@/store/wedding-list";
import { formatPYG } from "@/lib/format";

const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

/** Datos de la cotización ya calculada, que se incluyen en el PDF de bodas. */
export interface WeddingPdfData {
  planes: { letra: string; cuotas: number; valorPorCuota: number; total: number }[];
  planesSinEntrega:
    | { letra: string; cuotas: number; valorPorCuota: number; total: number; fechas: string[] }[]
    | null;
  mostrarConEntrega: boolean;
  mostrarSinEntrega: boolean;
  contadoOriginal: number;
  contadoAjustado: number;
  contadoMarginPct: number;
}

interface SavedItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  data: string;
}

interface SavedList {
  id: string;
  title: string;
  eventDate: string | null;
  notes: string | null;
  vendorName: string;
  createdAt: string;
  items: SavedItem[];
}

interface WeddingListSectionProps {
  pdfData: WeddingPdfData;
  /** Avisa al panel que los items cambiaron para invalidar cálculos previos. */
  onItemsLoaded: () => void;
}

export function WeddingListSection({ pdfData, onItemsLoaded }: WeddingListSectionProps) {
  const items = useCotizacionStore((s) => s.items);
  const setItems = useCotizacionStore((s) => s.setItems);

  const {
    title,
    eventDate,
    notes,
    loadedListId,
    setField,
    setLoadedListId,
    clearForm,
  } = useWeddingListFormStore();

  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const total = items.reduce((sum, i) => sum + i.priceContado * i.quantity, 0);

  const fetchLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const res = await fetch("/api/wedding-lists", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setSavedLists(data.lists ?? []);
    } catch {
      // silencioso: no bloquea el cotizador si falla la carga
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    void fetchLists();
  }, [fetchLists]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Escribí el título de los novios (ej: Juan & María)");
      return;
    }
    if (items.length === 0) {
      toast.error("Agregá productos al carrito para guardar la lista");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        eventDate,
        notes,
        items,
      };
      const res = await fetch("/api/wedding-lists", {
        method: loadedListId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loadedListId ? { id: loadedListId, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setLoadedListId(data.list.id);
      toast.success(
        loadedListId ? "Lista de bodas actualizada" : "Lista de bodas guardada con éxito"
      );
      await fetchLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la lista");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerarPDF = async () => {
    if (items.length === 0) {
      toast.error("No hay productos en la lista para generar el PDF");
      return;
    }
    setGeneratingPdf(true);
    try {
      const payload = {
        title: title.trim() || "Lista de Bodas",
        eventDate,
        notes,
        items: items.map((it) => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          priceContado: it.priceContado,
          subtotalContado: it.priceContado * it.quantity,
        })),
        contadoOriginal: pdfData.contadoOriginal,
        contadoAjustado: pdfData.contadoAjustado,
        contadoMarginPct: pdfData.contadoMarginPct,
        planes: pdfData.planes,
        planesSinEntrega: pdfData.planesSinEntrega,
        mostrarConEntrega: pdfData.mostrarConEntrega,
        mostrarSinEntrega: pdfData.mostrarSinEntrega,
      };
      const res = await fetch("/api/wedding-lists/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al generar el PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nombre = (title.trim() || "Novios")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\w-]/g, "");
      a.download = `VIZA-ListaBodas-${nombre}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF de la lista de bodas generado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleCargar = (list: SavedList) => {
    try {
      const restaurados = list.items
        .map((it) => JSON.parse(it.data) as CotizacionItem)
        .filter((it) => it && it.productId && typeof it.priceContado === "number");
      if (restaurados.length === 0) throw new Error("sin items válidos");
      setItems(restaurados);
      setField("title", list.title);
      setField("eventDate", list.eventDate ?? "");
      setField("notes", list.notes ?? "");
      setLoadedListId(list.id);
      setShowSaved(false);
      onItemsLoaded();
      toast.success(`Lista "${list.title}" cargada en la cotización`);
    } catch {
      toast.error("No se pudo cargar la lista guardada");
    }
  };

  const handleEliminar = async (list: SavedList) => {
    if (!confirm(`¿Borrar la lista de bodas "${list.title}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(list.id);
    try {
      const res = await fetch(
        `/api/wedding-lists?id=${encodeURIComponent(list.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al borrar");
      }
      if (loadedListId === list.id) setLoadedListId(null);
      toast.success("Lista borrada");
      await fetchLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar la lista");
    } finally {
      setDeletingId(null);
    }
  };

  const handleNueva = () => {
    clearForm();
    toast.success("Lista nueva lista para armar");
  };

  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"
          style={{ color: AZUL }}
        >
          <Heart className="h-4 w-4" />
          LISTA DE BODAS
        </h2>
        <span
          className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded"
          style={{
            backgroundColor: loadedListId ? "#fef3c7" : "#f5f5f4",
            color: loadedListId ? "#b45309" : "#78716c",
          }}
        >
          {loadedListId ? "Editando guardada" : "Nueva lista"}
        </span>
      </div>

      <p className="text-[11px] text-stone-500 mb-3">
        Usá los mismos productos del carrito: armá la lista, cotizala y guardala con el
        título de los novios para recuperarla después.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
            Título de los novios <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="Ej: Juan Pérez & María López"
            className="w-full h-10 px-3 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
            Fecha del evento (opcional)
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setField("eventDate", e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
          Observaciones (opcional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Detalles de la boda, forma de entrega, etc."
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none resize-none"
        />
      </div>

      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase font-semibold text-stone-400 tracking-wide">
            Productos en la lista
          </p>
          <p className="font-bold text-stone-900 text-sm tabular-nums mt-0.5">
            {items.length} producto{items.length !== 1 ? "s" : ""} · {formatPYG(total)}
          </p>
        </div>
        {loadedListId && (
          <button
            onClick={handleNueva}
            className="h-9 px-3 rounded-lg border border-stone-300 bg-white text-stone-600 hover:text-rose-600 hover:border-rose-400 font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nueva lista
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={handleSave}
          disabled={saving || items.length === 0 || !title.trim()}
          className="h-11 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-105"
          style={{
            backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`,
            color: AZUL_OSCURO,
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          GUARDAR LISTA
        </button>
        <button
          onClick={handleGenerarPDF}
          disabled={generatingPdf || items.length === 0}
          className="h-11 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-all hover:brightness-110"
          style={{ backgroundColor: AZUL_OSCURO }}
        >
          {generatingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          PDF DE BODAS
        </button>
        <button
          onClick={() => setShowSaved((v) => !v)}
          className="h-11 rounded-xl border-2 border-stone-200 bg-white text-stone-600 hover:border-stone-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          GUARDADAS ({savedLists.length})
        </button>
      </div>

      {showSaved && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wide mb-2">
            Listas de bodas guardadas
          </p>
          {loadingLists ? (
            <p className="text-xs text-stone-500 py-2">Cargando...</p>
          ) : savedLists.length === 0 ? (
            <p className="text-xs text-stone-500 py-2">
              Todavía no hay listas guardadas.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {savedLists.map((list) => {
                const listTotal = list.items.reduce(
                  (s, it) => s + Number(it.subtotal || 0),
                  0
                );
                const fecha = list.createdAt
                  ? new Date(list.createdAt).toLocaleDateString("es-PY")
                  : "";
                return (
                  <div
                    key={list.id}
                    className="rounded-lg border border-stone-200 bg-white p-3 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-stone-900 truncate">
                        {list.title}
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {fecha} · {list.items.length} producto
                        {list.items.length !== 1 ? "s" : ""} · {formatPYG(listTotal)}
                        {list.eventDate ? ` · Evento: ${list.eventDate}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCargar(list)}
                        className="h-8 px-3 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors hover:brightness-110"
                        style={{ backgroundColor: AZUL }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Cargar
                      </button>
                      <button
                        onClick={() => handleEliminar(list)}
                        disabled={deletingId === list.id}
                        className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Borrar lista"
                        aria-label="Borrar lista"
                      >
                        {deletingId === list.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
