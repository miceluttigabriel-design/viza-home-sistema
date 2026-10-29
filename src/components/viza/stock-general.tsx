"use client";

// ═══════════════════════════════════════════════════════════════════
// TASK 91 — STOCK GENERAL (cuadro azul del Orquestador)
// Vista de inventario SOLO LECTURA para el supremo:
//   · Tarjetas de resumen (usa GET /api/stats que YA existía)
//   · Stock por sub-grupo (clic filtra la tabla)
//   · Tabla buscable + ordenable + paginada (usa GET /api/products que
//     YA existía — la misma que lee la BASE; cero APIs nuevas)
// NADA se edita acá: para cambiar un producto, LA BASE (como siempre).
// No toca la base de datos, no toca registros, no agrega endpoints.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Layers,
  Tags,
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

const AZUL = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface StockGeneralProps {
  user: AppUser;
  onGoOrquestador: () => void;
  onGoBase: () => void;
  onGoSales: () => void;
}

interface StatsResp {
  totalProducts: number;
  totalStock: number;
  byCategory: Array<{ category: string | null; count: number; stock: number }>;
  recentQuotes: number;
}

interface ProdFila {
  id: number;
  sku: string;
  name: string | null;
  category: string | null;
  subGrupo?: string | null;
  stock: number;
}

type OrdenOpt = "stock-asc" | "stock-desc" | "name-asc" | "sku-asc" | "sku-desc";

const ORDENES: Array<{ id: OrdenOpt; label: string; sort: string; dir: string }> = [
  { id: "stock-asc", label: "Menor stock primero", sort: "stock", dir: "asc" },
  { id: "stock-desc", label: "Mayor stock primero", sort: "stock", dir: "desc" },
  { id: "name-asc", label: "A → Z (descripción)", sort: "name", dir: "asc" },
  { id: "sku-asc", label: "COD ↑ (número)", sort: "sku", dir: "asc" },
  { id: "sku-desc", label: "COD ↓ (número)", sort: "sku", dir: "desc" },
];

const PAGE_SIZE = 50;

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-PY").format(n);
}

function stockBadgeCls(stock: number): string {
  if (stock <= 0) return "bg-red-100 text-red-700 ring-red-200";
  if (stock <= 5) return "bg-amber-100 text-amber-700 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

export function StockGeneral({ user, onGoOrquestador, onGoBase, onGoSales }: StockGeneralProps) {
  // ── Stats del inventario (GET /api/stats existente) ──
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [statsError, setStatsError] = useState(false);

  // Nota lint (react-hooks/set-state-in-effect): ningún setState corre
  // SÍNCRONO acá — todo ocurre después del await, así el effect no dispara
  // renders en cascada (misma regla que ya marca los 5 errores viejos).
  const cargarStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatsResp;
      setStats(data);
      setStatsError(false);
    } catch {
      setStatsError(true);
    }
  }, []);

  // Patrón del propio admin-panel (fetchProducts): la llamada se hace vía
  // setTimeout(0) para que NINGÚN setState corra síncrono dentro del effect
  // (react-hooks/set-state-in-effect — misma regla del baseline).
  useEffect(() => {
    const t = setTimeout(() => cargarStats(), 0);
    return () => clearTimeout(t);
  }, [cargarStats]);

  // ── Tabla de productos (GET /api/products existente) ──
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [orden, setOrden] = useState<OrdenOpt>("stock-asc");
  const [categoria, setCategoria] = useState<string | null>(null); // null = todas
  const [page, setPage] = useState(1);
  const [filas, setFilas] = useState<ProdFila[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Arranca true: la primera carga la hace el effect de abajo y termina acá.
  // Los siguientes TRUE los ponen los handlers que disparan cada recarga
  // (búsqueda, orden, página, sub-grupo) — NUNCA dentro del effect (lint).
  const [cargando, setCargando] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda con debounce (no golpea el servidor por cada tecla)
  const onBusquedaChange = (v: string) => {
    setBusqueda(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBusquedaAplicada(v.trim());
      setPage(1);
      setCargando(true);
    }, 350);
  };

  const ordenActual = ORDENES.find((o) => o.id === orden) ?? ORDENES[0];

  // Nota lint (react-hooks/set-state-in-effect): el primer setState de acá
  // ocurre SIEMPRE después del await fetch — nada síncrono en el effect.
  const cargarFilas = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort: ordenActual.sort,
        dir: ordenActual.dir,
      });
      if (busquedaAplicada) params.set("search", busquedaAplicada);
      if (categoria) params.set("category", categoria);
      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFilas(Array.isArray(data.products) ? data.products : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
    } catch {
      setFilas([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setCargando(false);
    }
  }, [page, ordenActual, busquedaAplicada, categoria]);

  useEffect(() => {
    const t = setTimeout(() => cargarFilas(), 0);
    return () => clearTimeout(t);
  }, [cargarFilas]);

  const maxStockCat = stats?.byCategory?.reduce((m, c) => Math.max(m, c.stock), 0) ?? 0;
  const inicial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-stone-100">
      {/* ─── Header (mismo lenguaje visual que los demás paneles) ─── */}
      <header className="sticky top-0 z-30 backdrop-blur shadow-md" style={{ backgroundColor: AZUL }}>
        <div className="h-1.5 w-full" style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})` }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={onGoOrquestador}
              className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95 shrink-0"
              style={{ backgroundColor: "#FFFFFF", color: AZUL }}
              title="Volver al Orquestador (solo supremo)"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ORQUESTADOR</span>
            </button>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight px-1">STOCK GENERAL</h1>
            <span
              className="hidden md:flex items-center gap-1.5 text-[9px] font-black tracking-widest px-2 py-1 rounded-full"
              style={{ background: "rgba(34,197,94,0.18)", color: "#4ade80" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              SYSTEM ONLINE
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onGoBase}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center transition-colors border border-transparent hover:brightness-95 shrink-0"
              style={{ backgroundColor: DORADO, color: AZUL }}
              title="Ir a LA BASE (editar productos)"
            >
              <span>BASE</span>
            </button>
            <button
              onClick={onGoSales}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center transition-colors border border-transparent hover:brightness-95 shrink-0"
              style={{ backgroundColor: DORADO, color: AZUL }}
              title="Ir al COTIZADOR (panel de ventas)"
            >
              <span>COTIZADOR</span>
            </button>
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`, color: AZUL }}
              title={`${user.name || user.email} · SUPREMO`}
            >
              {inicial}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Aviso de solo lectura */}
        <p className="text-[11px] text-stone-500 font-medium">
          Vista SOLO LECTURA · para editar un producto, andá a LA BASE (nada se modifica desde acá).
        </p>

        {/* ─── Tarjetas de resumen ─── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Productos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {statsError ? "—" : stats ? fmtNum(stats.totalProducts) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Boxes className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Unidades en stock</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {statsError ? "—" : stats ? fmtNum(stats.totalStock) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Sub-grupos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {statsError ? "—" : stats ? fmtNum(stats.byCategory?.length ?? 0) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Tags className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Presupuestos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {statsError ? "—" : stats ? fmtNum(stats.recentQuotes) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Stock por sub-grupo ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-700 tracking-wide">STOCK POR SUB-GRUPO</h2>
            <button
              onClick={cargarStats}
              className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-sky-600 hover:border-sky-200 transition-colors"
              title="Refrescar resumen"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {statsError ? (
            <p className="text-xs text-red-500 font-medium">No se pudo cargar el resumen. Probá refrescar.</p>
          ) : !stats ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (stats.byCategory?.length ?? 0) === 0 ? (
            <p className="text-xs text-stone-400">Sin sub-grupos cargados todavía.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {stats.byCategory.map((c) => (
                <button
                  key={c.category ?? "__sin__"}
                  onClick={() => {
                    // Clic en el sub-grupo → filtra la tabla de abajo (solo lectura)
                    setCategoria(categoria === c.category ? null : c.category);
                    setPage(1);
                    setCargando(true);
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors text-left ${
                    categoria === c.category ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-stone-50"
                  }`}
                  title={categoria === c.category ? "Quitar filtro de este sub-grupo" : "Ver este sub-grupo en la tabla"}
                >
                  <span className="text-xs font-semibold text-stone-600 w-40 sm:w-56 truncate shrink-0">
                    {c.category || "Sin sub-grupo"}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxStockCat > 0 ? Math.max(2, Math.round((c.stock / maxStockCat) * 100)) : 0}%`,
                        background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500 w-24 text-right shrink-0 tabular-nums">
                    {fmtNum(c.stock)} u · {fmtNum(c.count)} pr
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Tabla de stock ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => onBusquedaChange(e.target.value)}
                placeholder="Buscar por descripción, COD, marca…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
              />
            </div>
            <select
              value={orden}
              onChange={(e) => {
                setOrden(e.target.value as OrdenOpt);
                setPage(1);
                setCargando(true);
              }}
              className="h-10 px-3 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Filtro activo por sub-grupo */}
          {categoria && (
            <div className="px-4 sm:px-5 pb-2 flex items-center gap-2">
              <span className="text-[11px] font-bold text-sky-700 bg-sky-50 ring-1 ring-sky-200 rounded-full px-2.5 py-1">
                {categoria}
                <button
                  onClick={() => { setCategoria(null); setPage(1); setCargando(true); }}
                  className="ml-1.5 font-black text-sky-500 hover:text-sky-700"
                  title="Quitar filtro"
                >
                  ×
                </button>
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-y border-stone-200">
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-20">COD</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400">DESCRIPCION</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-40 hidden md:table-cell">SUB-GRUPO</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-24">STOCK</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10">
                      <div className="flex items-center justify-center gap-2 text-stone-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…
                      </div>
                    </td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-stone-400 text-sm">
                      {busquedaAplicada || categoria
                        ? "Ningún producto coincide con la búsqueda."
                        : "Sin productos en la base todavía."}
                    </td>
                  </tr>
                ) : (
                  filas.map((p) => (
                    <tr key={p.id} className="border-b border-stone-100 hover:bg-sky-50/40 transition-colors">
                      <td className="px-4 py-2 font-bold text-stone-600 tabular-nums">{p.sku}</td>
                      <td className="px-4 py-2 text-stone-700 truncate max-w-[340px]" title={p.name ?? ""}>
                        {p.name || "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-500 text-xs hidden md:table-cell">
                        {p.subGrupo || p.category || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-block min-w-12 text-center text-xs font-black px-2 py-0.5 rounded-full ring-1 ${stockBadgeCls(p.stock)} tabular-nums`}>
                          {fmtNum(p.stock)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-stone-200 bg-stone-50/60">
            <p className="text-[11px] text-stone-500 font-medium tabular-nums">
              {fmtNum(total)} productos · página {page} de {fmtNum(totalPages)}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setPage((p) => Math.max(1, p - 1)); setCargando(true); }}
                disabled={page <= 1 || cargando}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setCargando(true); }}
                disabled={page >= totalPages || cargando}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
