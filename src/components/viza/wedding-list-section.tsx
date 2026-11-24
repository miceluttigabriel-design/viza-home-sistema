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
  Plus,
  UserRound,
  Sparkles,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useCotizacionStore, type CotizacionItem } from "@/store/cotizacion";
import {
  useWeddingListFormStore,
  WEDDING_QUOTE_OPTIONS,
  clampCuotas,
  computeWeddingGift,
  isManualQuoteType,
  isWeddingQuoteType,
  normalizeWeddingItemMeta,
  type WeddingItemMeta,
  type WeddingQuoteType,
} from "@/store/wedding-list";
import { formatPYG } from "@/lib/format";

const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

/** Datos de la cotización ya calculada, que se incluyen en el PDF de bodas. */
export interface WeddingPdfData {
  planes: { letra: string; cuotas: number; valorPorCuota: number; total: number; entregaPersonalizada?: number }[];
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
  giverName: string | null;
  giverPhone: string | null;
  giverCi: string | null;
  quoteType: string;
  quoteCuotas: number;
  quotedAmount: number;
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
  /** Lleva el foco al buscador de productos para agregar otro regalo. */
  onAddGift?: () => void;
}

const inputClass =
  "w-full h-9 px-2.5 rounded-lg border border-stone-200 text-xs focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none";
const selectClass =
  "h-9 px-2 rounded-lg border border-stone-200 text-xs bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none";

export function WeddingListSection({
  pdfData,
  onItemsLoaded,
  onAddGift,
}: WeddingListSectionProps) {
  const items = useCotizacionStore((s) => s.items);
  const setItems = useCotizacionStore((s) => s.setItems);
  const removeItem = useCotizacionStore((s) => s.removeItem);

  const {
    title,
    eventDate,
    notes,
    loadedListId,
    itemMeta,
    setField,
    setLoadedListId,
    setItemMeta,
    setItemMetaMap,
    removeItemMeta,
    clearForm,
  } = useWeddingListFormStore();

  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingListado, setGeneratingListado] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Cada fila de la tabla: el producto del carrito + los datos del regalo.
  const rows = items.map((item) => {
    const meta = itemMeta[item.productId] ?? normalizeWeddingItemMeta(null);
    const values = computeWeddingGift(item, meta);
    return { item, meta, values };
  });

  const totalContado = rows.reduce(
    (sum, r) => sum + r.item.priceContado * r.item.quantity,
    0
  );
  const totalCotizado = rows.reduce((sum, r) => sum + r.values.total, 0);
  const asignados = rows.filter((r) => r.meta.giverName.trim()).length;

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

  const guardarLista = async (asNew: boolean) => {
    if (!title.trim()) {
      toast.error("Escribí el título de los novios (ej: Juan & María)");
      return;
    }
    if (items.length === 0) {
      toast.error("Agregá productos al carrito para guardar la lista");
      return;
    }
    const setBusy = asNew ? setSavingCopy : setSaving;
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        eventDate,
        notes,
        items: rows.map(({ item, meta, values }) => ({
          ...item,
          giverName: meta.giverName.trim(),
          giverPhone: meta.giverPhone.trim(),
          giverCi: meta.giverCi.trim(),
          quoteType: meta.quoteType,
          quoteCuotas: values.cuotas,
          quotedAmount: values.total,
          manualAmount: meta.manualAmount,
        })),
      };
      // Si estoy editando una lista guardada, GUARDAR actualiza esa misma.
      // GUARDAR COMO NUEVA siempre crea una lista aparte con el presupuesto actual.
      const actualizar = Boolean(loadedListId) && !asNew;
      const res = await fetch("/api/wedding-lists", {
        method: actualizar ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          actualizar ? { id: loadedListId, ...payload } : payload
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setLoadedListId(data.list.id);
      toast.success(
        actualizar
          ? "Lista de bodas actualizada con los regalos y entregantes"
          : asNew
            ? "Nueva lista de bodas guardada a partir de este presupuesto"
            : "Lista de bodas guardada con éxito"
      );
      await fetchLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la lista");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => void guardarLista(false);
  const handleGuardarComoNueva = () => void guardarLista(true);

  // Descarga un PDF ya generado por la API.
  const descargarPdf = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const nombreNovios = () =>
    (title.trim() || "Novios")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");

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
        items: rows.map(({ item, meta, values }) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          priceContado: item.priceContado,
          subtotalContado: item.priceContado * item.quantity,
          giverName: meta.giverName.trim(),
          giverPhone: meta.giverPhone.trim(),
          giverCi: meta.giverCi.trim(),
          quoteType: meta.quoteType,
          quoteCuotas: values.cuotas,
          quoteLabel: values.modeLabel,
          quotedUnit: values.perCuota,
          quotedTotal: values.total,
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
      descargarPdf(await res.blob(), `VIZA-ListaBodas-${nombreNovios()}.pdf`);
      toast.success("PDF de la lista de bodas generado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  // LISTADO: misma tabla de regalos y entregantes, con un diseño distinto.
  // A propósito NO incluye las opciones de financiación del presupuesto.
  const handleGenerarListado = async () => {
    if (items.length === 0) {
      toast.error("No hay productos en la lista para generar el listado");
      return;
    }
    setGeneratingListado(true);
    try {
      const payload = {
        title: title.trim() || "Lista de Bodas",
        eventDate,
        notes,
        items: rows.map(({ item, meta }) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          giverName: meta.giverName.trim(),
          giverPhone: meta.giverPhone.trim(),
          giverCi: meta.giverCi.trim(),
        })),
      };
      const res = await fetch("/api/wedding-lists/listado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al generar el listado");
      }
      descargarPdf(await res.blob(), `VIZA-ListadoBodas-${nombreNovios()}.pdf`);
      toast.success("Listado de regalos generado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el listado");
    } finally {
      setGeneratingListado(false);
    }
  };

  const handleCargar = (list: SavedList) => {
    try {
      const restaurados = list.items
        .map((it) => JSON.parse(it.data) as CotizacionItem)
        .filter((it) => it && it.productId && typeof it.priceContado === "number");
      if (restaurados.length === 0) throw new Error("sin items válidos");

      const metaMap: Record<string, WeddingItemMeta> = {};
      for (const saved of list.items) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(saved.data) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        const quoteType: WeddingQuoteType = isWeddingQuoteType(saved.quoteType)
          ? saved.quoteType
          : isWeddingQuoteType(parsed.quoteType)
            ? parsed.quoteType
            : "contado";
        const manualSaved =
          String(parsed.manualAmount ?? "").replace(/[^\d]/g, "") ||
          (isManualQuoteType(quoteType) && Number(saved.quotedAmount) > 0
            ? String(Math.round(Number(saved.quotedAmount)))
            : "");
        metaMap[saved.productId] = normalizeWeddingItemMeta({
          giverName: saved.giverName ?? parsed.giverName ?? "",
          giverPhone: saved.giverPhone ?? parsed.giverPhone ?? "",
          giverCi: saved.giverCi ?? parsed.giverCi ?? "",
          quoteType,
          quoteCuotas: saved.quoteCuotas || parsed.quoteCuotas || 12,
          manualAmount: manualSaved,
        });
      }

      setItems(restaurados);
      setItemMetaMap(metaMap);
      setField("title", list.title);
      setField("eventDate", list.eventDate ?? "");
      setField("notes", list.notes ?? "");
      setLoadedListId(list.id);
      setShowSaved(false);
      onItemsLoaded();
      toast.success(`Lista "${list.title}" cargada con sus regalos y entregantes`);
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

  const handleQuitarRegalo = (productId: string) => {
    removeItem(productId);
    removeItemMeta(productId);
    onItemsLoaded();
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
        Agregá los productos con el buscador y completá quién entrega cada regalo. Podés
        cotizar cada regalo <strong>solo contado</strong> o con <strong>cualquier plan</strong>{" "}
        (cuotas, mayorista, safra, cheque o especial) y guardar todo junto con el título de
        los novios.
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

      {/* ===== TABLA DE REGALOS Y ENTREGANTES ===== */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wide flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" />
            TABLA DE REGALOS Y ENTREGANTES
          </p>
          {onAddGift && (
            <button
              onClick={onAddGift}
              className="h-8 px-3 rounded-lg border border-stone-300 bg-white text-stone-600 hover:text-rose-600 hover:border-rose-400 font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              AGREGAR REGALO
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-stone-500">
              Todavía no hay regalos en la lista
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Agregá productos con el buscador de arriba para armar la tabla.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ item, meta, values }, idx) => (
              <div
                key={item.productId}
                className="rounded-xl border border-stone-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                      Regalo {idx + 1} · {item.sku} · Cant. {item.quantity}
                    </p>
                    <p className="font-semibold text-stone-900 text-sm leading-snug">
                      {item.name}
                    </p>
                  </div>
                  <button
                    onClick={() => handleQuitarRegalo(item.productId)}
                    className="h-7 w-7 shrink-0 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors"
                    title="Quitar este regalo de la lista"
                    aria-label={`Quitar ${item.name} de la lista`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={meta.giverName}
                    onChange={(e) => setItemMeta(item.productId, { giverName: e.target.value })}
                    placeholder="Nombre de quien regala"
                    aria-label={`Nombre de quien regala ${item.name}`}
                    className={inputClass}
                  />
                  <input
                    type="tel"
                    value={meta.giverPhone}
                    onChange={(e) => setItemMeta(item.productId, { giverPhone: e.target.value })}
                    placeholder="Teléfono / WhatsApp"
                    aria-label={`Teléfono de quien regala ${item.name}`}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={meta.giverCi}
                    onChange={(e) => setItemMeta(item.productId, { giverCi: e.target.value })}
                    placeholder="CI (opcional)"
                    aria-label={`CI de quien regala ${item.name}`}
                    className={inputClass}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                    <span className="block mb-1">Modalidad</span>
                    <select
                      value={meta.quoteType}
                      onChange={(e) =>
                        setItemMeta(item.productId, {
                          quoteType: e.target.value as WeddingQuoteType,
                        })
                      }
                      className={selectClass}
                      aria-label={`Modalidad de cotización de ${item.name}`}
                    >
                      {WEDDING_QUOTE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {meta.quoteType === "cuota" && (
                    <label className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                      <span className="block mb-1">Cuotas / pagos</span>
                      <select
                        value={meta.quoteCuotas}
                        onChange={(e) =>
                          setItemMeta(item.productId, {
                            quoteCuotas: clampCuotas(e.target.value),
                          })
                        }
                        className={selectClass}
                        aria-label={`Cantidad de cuotas de ${item.name}`}
                      >
                        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "1 pago" : `${n} cuotas`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {isManualQuoteType(meta.quoteType) && (
                    <label className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                      <span className="block mb-1">Total cotizado (Gs)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={meta.manualAmount}
                        onChange={(e) =>
                          setItemMeta(item.productId, { manualAmount: e.target.value })
                        }
                        placeholder={String(Math.round(item.priceContado * item.quantity))}
                        className={`${selectClass} w-36`}
                        aria-label={`Total cotizado de ${item.name}`}
                      />
                    </label>
                  )}

                  <div className="ml-auto text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                      {values.modeLabel}
                    </p>
                    {values.cuotas > 1 ? (
                      <>
                        <p className="text-sm font-bold text-stone-900 tabular-nums">
                          {formatPYG(values.perCuota)}{" "}
                          <span className="text-[10px] font-normal">× {values.cuotas}</span>
                        </p>
                        <p className="text-[10px] font-semibold text-stone-500 tabular-nums">
                          Total: {formatPYG(values.total)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-stone-900 tabular-nums">
                        {formatPYG(values.total)}
                      </p>
                    )}
                    {!values.assigned && (
                      <p className="text-[9px] font-bold text-amber-600 uppercase">
                        Sin asignar
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== RESUMEN ===== */}
      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[9px] uppercase font-semibold text-stone-400 tracking-wide">
              Regalos
            </p>
            <p className="font-bold text-stone-900 text-sm tabular-nums mt-0.5">
              {rows.length}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-semibold text-stone-400 tracking-wide">
              Asignados
            </p>
            <p className="font-bold text-stone-900 text-sm tabular-nums mt-0.5">
              {asignados} de {rows.length}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-semibold text-stone-400 tracking-wide">
              Total contado
            </p>
            <p className="font-bold text-stone-900 text-sm tabular-nums mt-0.5">
              {formatPYG(totalContado)}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-semibold text-stone-400 tracking-wide">
              Según modalidad
            </p>
            <p className="font-bold text-stone-900 text-sm tabular-nums mt-0.5">
              {formatPYG(totalCotizado)}
            </p>
          </div>
        </div>
        {loadedListId && (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              onClick={handleGuardarComoNueva}
              disabled={savingCopy || saving || items.length === 0 || !title.trim()}
              className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Crea una lista nueva con este presupuesto sin pisar la lista original"
            >
              {savingCopy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              GUARDAR COMO NUEVA
            </button>
            <button
              onClick={handleNueva}
              className="h-9 px-3 rounded-lg border border-stone-300 bg-white text-stone-600 hover:text-rose-600 hover:border-rose-400 font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Nueva lista
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={handleSave}
          disabled={saving || savingCopy || items.length === 0 || !title.trim()}
          className="h-11 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-105"
          style={{
            backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`,
            color: AZUL_OSCURO,
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {loadedListId ? "ACTUALIZAR LISTA" : "GUARDAR LISTA"}
        </button>
        <button
          onClick={() => setShowSaved((v) => !v)}
          className="h-11 rounded-xl border-2 border-stone-200 bg-white text-stone-600 hover:border-stone-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          GUARDADAS ({savedLists.length})
        </button>
      </div>

      {/* Documentos: presupuesto completo (con financiación) y listado elegante. */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={handleGenerarPDF}
          disabled={generatingPdf || items.length === 0}
          className="h-12 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-all hover:brightness-110"
          style={{ backgroundColor: AZUL_OSCURO }}
        >
          {generatingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          GENERAR PRESUPUESTO
        </button>
        <button
          onClick={handleGenerarListado}
          disabled={generatingListado || items.length === 0}
          className="h-12 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundImage: `linear-gradient(120deg, #f6e8c6 0%, ${DORADO} 58%, ${DORADO_OSCURO} 100%)`,
            color: AZUL_OSCURO,
            border: "1px solid rgba(255,255,255,0.65)",
            boxShadow: "0 8px 20px -9px rgba(184, 152, 83, 0.65)",
          }}
        >
          {generatingListado ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          GENERAR LISTADO
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-stone-400 text-center">
        El listado muestra solo los regalos y entregantes, con un diseño especial:
        sin modalidades, sin planes y sin valores.
      </p>

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
                  (s, it) =>
                    s + (Number(it.quotedAmount) || Number(it.subtotal) || 0),
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
                        {fecha} · {list.items.length} regalo
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
