"use client";

// ═══════════════════════════════════════════════════════════════════
// TASK 98 — STOCK GENERAL · FILTRO POR SUCURSAL + IMPORTAR INVENTARIO
// (pedido del dueño: "tenemos que hacer um filtro para poder ver por
// sucursal... lo que esta Central es nuestro deposito Central y los
// otros son por cada sucursal... tenemos que dividir bien... y un buton
// para importar adentro el inventario de stock")
//
//   · FILTRO POR SUCURSAL: pills TODAS / CENTRAL (depósito central) /
//     cada sucursal (KATUETE, NUEVA ESPERANZA, SALTOS DEL GUAIRA, LA
//     PALOMA...). Las cards, el gráfico por sub-grupo y la tabla
//     responden al filtro activo.
//   · IMPORTAR INVENTARIO: mismo motor de importación de siempre
//     (preview → confirmar → apply). El apply de la Task 98 divide el
//     saldo POR SUCURSAL (tabla aparte StockSucursal) además del stock
//     global de siempre. Antes de confirmar, el dueño ve CUÁNTAS filas,
//     SKUs y unidades caen en cada sucursal.
//   · Vista SOLO LECTURA igual que siempre: para editar un producto, LA
//     BASE. Nada se edita desde acá; la importación es la MISMA de la
//     BASE (mismas reglas de costos protegidos, márgenes automáticas…).
//
// Datos: UN endpoint nuevo (GET /api/stock/general) alimenta TODO
// (cards + pills + gráfico + tabla) para que nada se desincronice.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Layers,
  Tags,
  Building2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  Check,
  Warehouse,
  X,
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

// ─── Respuesta de GET /api/stock/general (Task 98) ───
interface SucursalResumen {
  nombre: string;
  productos: number;
  unidades: number;
}

interface StatsResp {
  totalProducts: number;
  totalStock: number;
  bySubgrupo: Array<{ category: string | null; count: number; stock: number }>;
}

interface DatosResp {
  ok: boolean;
  sucursal: string | null;
  sucursales: SucursalResumen[];
  stats: StatsResp;
  rows: ProdFila[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  error?: string;
}

interface ProdFila {
  id: string;
  sku: string;
  name: string | null;
  category: string | null;
  subGrupo?: string | null;
  stock: number;
}

// ─── Vista previa de la importación (mismo motor que LA BASE + Task 98) ───
interface PreviewSucursal {
  nombre: string;
  filas: number;
  skus: number;
  unidades: number;
}

interface PreviewNuevo {
  sku: string;
  name: string | null;
  referencia: string | null;
  subGrupo: string | null;
  stock: number;
  costProd: number | null;
  margenAuto: number | null;
  margenFuente: string | null;
  safraAuto: string | null;
}

interface PreviewActualizado {
  sku: string;
  nameActual: string | null;
  stockActual: number;
  stockNuevo: number;
  costoActual: number | null;
  costoNuevo: number | null;
  costoProtegido: boolean;
}

interface ImportPreview {
  ok: boolean;
  totalFilas: number;
  codigosUnicos: number;
  nuevosCount: number;
  actualizadosCount: number;
  nuevos: PreviewNuevo[];
  actualizados: PreviewActualizado[];
  stockPorSucursal?: Record<string, Record<string, number>>;
  sucursales?: PreviewSucursal[];
  errores: string[];
}

interface ImportResult {
  creados: number;
  actualizados: number;
  conCostoActualizado?: number;
  sucursales?: {
    ok: boolean;
    filasGuardadas: number;
    productosTocados: number;
    sucursales: number;
  } | null;
  errores: string[];
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
  const esSupremo = user.role === "supremo_admin";

  // ═══ Datos de la vista (un solo endpoint para cards + pills + gráfico + tabla) ═══
  const [sucursalSel, setSucursalSel] = useState<string | null>(null); // null = TODAS
  const [sucursales, setSucursales] = useState<SucursalResumen[]>([]);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [datosError, setDatosError] = useState(false);

  // ─── Tabla ───
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [orden, setOrden] = useState<OrdenOpt>("stock-asc");
  const [subgrupo, setSubgrupo] = useState<string | null>(null); // null = todos
  const [page, setPage] = useState(1);
  const [filas, setFilas] = useState<ProdFila[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Arranca true: la primera carga la hace el effect de abajo y termina acá.
  // Los siguientes TRUE los ponen los handlers que disparan cada recarga
  // (búsqueda, orden, página, sub-grupo, sucursal) — NUNCA dentro del effect (lint).
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
  const cargarDatos = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort: ordenActual.sort,
        dir: ordenActual.dir,
      });
      if (busquedaAplicada) params.set("search", busquedaAplicada);
      if (subgrupo) params.set("subgrupo", subgrupo);
      if (sucursalSel) params.set("sucursal", sucursalSel);
      const res = await fetch(`/api/stock/general?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DatosResp;
      setSucursales(Array.isArray(data.sucursales) ? data.sucursales : []);
      setStats(data.stats ?? null);
      setFilas(Array.isArray(data.rows) ? data.rows : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setDatosError(false);
    } catch {
      setStats(null);
      setFilas([]);
      setTotal(0);
      setTotalPages(1);
      setDatosError(true);
    } finally {
      setCargando(false);
    }
  }, [page, ordenActual, busquedaAplicada, subgrupo, sucursalSel]);

  // Patrón del propio admin-panel (fetchProducts): la llamada se hace vía
  // setTimeout(0) para que NINGÚN setState corra síncrono dentro del effect
  // (react-hooks/set-state-in-effect — misma regla del baseline).
  useEffect(() => {
    const t = setTimeout(() => cargarDatos(), 0);
    return () => clearTimeout(t);
  }, [cargarDatos]);

  const maxStockCat = stats?.bySubgrupo?.reduce((m, c) => Math.max(m, c.stock), 0) ?? 0;
  const inicial = (user.name || user.email).charAt(0).toUpperCase();

  // ═══ IMPORTAR INVENTARIO (mismo motor que LA BASE, con reparto por sucursal) ═══
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const abrirImport = () => {
    setImportOpen(true);
    setImportPreview(null);
    setImportResult(null);
    setImportLoading(false);
    setImportApplying(false);
    fileInputRef.current?.click();
  };

  const onArchivoElegido = async (file: File) => {
    setImportOpen(true);
    setImportLoading(true);
    setImportPreview(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/products/import-stock/preview", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as ImportPreview & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      setImportPreview(data);
    } catch (error) {
      console.error("Error import preview (Stock General):", error);
      alert(`Error al leer el inventario: ${(error as Error).message}`);
      setImportOpen(false);
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmarImport = async () => {
    if (!importPreview) return;
    setImportApplying(true);
    try {
      const res = await fetch("/api/products/import-stock/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuevos: importPreview.nuevos ?? [],
          actualizados: importPreview.actualizados ?? [],
          // Task 98: reparto del saldo por SUCURSAL (CENTRAL = depósito central)
          stockPorSucursal: importPreview.stockPorSucursal || {},
        }),
      });
      // Leer SIEMPRE como texto primero (misma garantía que LA BASE: si el
      // servidor responde HTML de timeout, se ve un mensaje claro).
      const text = await res.text();
      let data: ImportResult & { error?: string };
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
        throw new Error(
          `El servidor respondió con estado ${res.status} pero no devolvió JSON. ` +
          `Probablemente timeout (muchos productos). Primeros caracteres: "${preview || "(respuesta vacía)"}".`
        );
      }
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      setImportResult(data);
      // Recargar la vista completa (cards + pills + tabla) con el inventario nuevo
      setCargando(true);
      const t = setTimeout(() => cargarDatos(), 0);
      void t;
    } catch (error) {
      console.error("Error apply (Stock General):", error);
      alert(`Error al aplicar la importación: ${(error as Error).message}`);
    } finally {
      setImportApplying(false);
    }
  };

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
            {esSupremo && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onArchivoElegido(file);
                  }}
                />
                <button
                  onClick={abrirImport}
                  className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-110 shrink-0 text-white"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                  title="Importar planilla de inventario del ERP (stock + sucursales + nuevos productos)"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>IMPORTAR INVENTARIO</span>
                </button>
              </>
            )}
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
          Vista de consulta · para editar un producto, andá a LA BASE · la importación divide el inventario POR SUCURSAL (CENTRAL = depósito central).
        </p>

        {/* ─── FILTRO POR SUCURSAL (Task 98) ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-black text-stone-700 tracking-wide flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-sky-600" />
              SUCURSALES
              <span className="text-[10px] font-bold text-stone-400 normal-case tracking-normal hidden sm:inline">
                · clic para ver el inventario de cada una
              </span>
            </h2>
            <button
              onClick={() => {
                setCargando(true);
                const t = setTimeout(() => cargarDatos(), 0);
                void t;
              }}
              className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-sky-600 hover:border-sky-200 transition-colors shrink-0"
              title="Refrescar todo"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Pill TODAS (sin filtro = stock global de siempre) */}
            <button
              onClick={() => { setSucursalSel(null); setPage(1); setSubgrupo(null); setCargando(true); }}
              className={`h-9 px-4 rounded-xl text-xs font-black tracking-wide transition-colors ring-1 ${
                sucursalSel === null
                  ? "text-white ring-transparent shadow-sm"
                  : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
              }`}
              style={sucursalSel === null ? { backgroundColor: AZUL } : undefined}
              title="Todo el inventario (stock general de siempre)"
            >
              TODAS
            </button>

            {sucursales.map((s) => {
              const activa = sucursalSel === s.nombre;
              const esCentral = s.nombre === "CENTRAL";
              return (
                <button
                  key={s.nombre}
                  onClick={() => {
                    // Clic de nuevo → volver a TODAS (misma conducta que el gráfico)
                    setSucursalSel(activa ? null : s.nombre);
                    setPage(1);
                    setSubgrupo(null);
                    setCargando(true);
                  }}
                  className={`h-9 pl-3 pr-3.5 rounded-xl text-xs font-bold transition-colors ring-1 flex items-center gap-2 ${
                    activa
                      ? "text-white ring-transparent shadow-sm"
                      : esCentral
                      ? "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100"
                      : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
                  }`}
                  style={activa ? { backgroundColor: esCentral ? "#92610c" : AZUL } : undefined}
                  title={
                    esCentral
                      ? "CENTRAL · Depósito central del inventario"
                      : `Ver solo el stock de la sucursal ${s.nombre}`
                  }
                >
                  {esCentral && <Warehouse className="h-3.5 w-3.5" />}
                  <span>{s.nombre}</span>
                  {esCentral && (
                    <span
                      className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-full ${
                        activa ? "bg-white/20 text-white" : "bg-amber-200/70 text-amber-900"
                      }`}
                    >
                      DEPÓSITO
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full ${
                      activa ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {fmtNum(s.unidades)} u
                  </span>
                </button>
              );
            })}

            {sucursales.length === 0 && (
              <p className="text-[11px] text-stone-400 font-medium self-center">
                Todavía no hay sucursales cargadas. Usá IMPORTAR INVENTARIO con la planilla del ERP (columna SUCURSAL) para activar este filtro.
              </p>
            )}
          </div>
        </div>

        {/* ─── Tarjetas de resumen (responden al filtro de sucursal) ─── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Productos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : stats ? fmtNum(stats.totalProducts) : "…"}
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
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">
                  Unidades{sucursalSel ? " · sucursal" : ""}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : stats ? fmtNum(stats.totalStock) : "…"}
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
                  {datosError ? "—" : stats ? fmtNum(stats.bySubgrupo?.length ?? 0) : "…"}
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
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Sucursales con stock</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : fmtNum(sucursales.length)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Stock por sub-grupo ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-700 tracking-wide">
              STOCK POR SUB-GRUPO
              {sucursalSel && (
                <span className="ml-2 text-[10px] font-black text-sky-700 bg-sky-50 ring-1 ring-sky-200 rounded-full px-2 py-0.5 align-middle">
                  {sucursalSel}
                </span>
              )}
            </h2>
          </div>
          {datosError ? (
            <p className="text-xs text-red-500 font-medium">No se pudo cargar el resumen. Probá refrescar.</p>
          ) : !stats ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (stats.bySubgrupo?.length ?? 0) === 0 ? (
            <p className="text-xs text-stone-400">
              {sucursalSel
                ? `Sin stock de "${sucursalSel}" en el inventario importado.`
                : "Sin sub-grupos cargados todavía."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {stats.bySubgrupo.map((c) => (
                <button
                  key={c.category ?? "__sin__"}
                  onClick={() => {
                    // Clic en el sub-grupo → filtra la tabla de abajo (solo lectura)
                    setSubgrupo(subgrupo === c.category ? null : c.category);
                    setPage(1);
                    setCargando(true);
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors text-left ${
                    subgrupo === c.category ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-stone-50"
                  }`}
                  title={subgrupo === c.category ? "Quitar filtro de este sub-grupo" : "Ver este sub-grupo en la tabla"}
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

          {/* Filtros activos (sucursal y/o sub-grupo) */}
          {(sucursalSel || subgrupo) && (
            <div className="px-4 sm:px-5 pb-2 flex flex-wrap items-center gap-2">
              {sucursalSel && (
                <span className="text-[11px] font-bold text-white rounded-full px-2.5 py-1 flex items-center gap-1.5" style={{ backgroundColor: AZUL }}>
                  {sucursalSel === "CENTRAL" ? "CENTRAL · DEPÓSITO" : sucursalSel}
                  <button
                    onClick={() => { setSucursalSel(null); setPage(1); setCargando(true); }}
                    className="font-black text-white/80 hover:text-white"
                    title="Quitar filtro de sucursal"
                  >
                    ×
                  </button>
                </span>
              )}
              {subgrupo && (
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 ring-1 ring-sky-200 rounded-full px-2.5 py-1">
                  {subgrupo}
                  <button
                    onClick={() => { setSubgrupo(null); setPage(1); setCargando(true); }}
                    className="ml-1.5 font-black text-sky-500 hover:text-sky-700"
                    title="Quitar filtro"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-y border-stone-200">
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-20">COD</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400">DESCRIPCION</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-40 hidden md:table-cell">SUB-GRUPO</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black tracking-widest text-stone-400 w-24">
                    {sucursalSel ? "SALDO" : "STOCK"}
                  </th>
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
                      {busquedaAplicada || subgrupo || sucursalSel
                        ? "Ningún producto coincide con los filtros."
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
              {fmtNum(total)} productos{sucursalSel ? ` en ${sucursalSel}` : ""} · página {page} de {fmtNum(totalPages)}
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

      {/* ═══ MODAL: IMPORTAR INVENTARIO (mismo motor que LA BASE + sucursales) ═══ */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Título */}
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#e7e5e4" }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: AZUL }}>
                <Upload className="h-5 w-5" />
                IMPORTAR INVENTARIO
              </h3>
              <button
                onClick={() => { if (!importLoading && !importApplying) setImportOpen(false); }}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {importLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-sm text-stone-500 font-medium">Procesando el inventario del ERP…</p>
                </div>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="rounded-xl p-4 border border-emerald-200 bg-emerald-50">
                    <p className="text-sm font-black text-emerald-800 mb-1">Importación completa</p>
                    <p className="text-xs text-emerald-700">
                      {importResult.creados} productos nuevos · {importResult.actualizados} actualizados
                      {typeof importResult.conCostoActualizado === "number" && importResult.conCostoActualizado > 0
                        ? ` · ${importResult.conCostoActualizado} con costo nuevo`
                        : ""}
                    </p>
                    {importResult.sucursales && (
                      <p className="text-xs text-emerald-700 mt-1.5 font-semibold">
                        Stock por sucursal: {fmtNum(importResult.sucursales.filasGuardadas)} movimientos de{" "}
                        {fmtNum(importResult.sucursales.productosTocados)} productos en{" "}
                        {importResult.sucursales.sucursales} sucursales guardados.
                      </p>
                    )}
                  </div>
                  {importResult.errores.length > 0 && (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800 mb-1">Advertencias</p>
                      <ul className="text-[10px] text-amber-700 space-y-0.5">
                        {importResult.errores.slice(0, 10).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {importPreview && !importResult && (
                <div className="space-y-4">
                  {/* Resumen general */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Filas leídas</p>
                      <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(importPreview.totalFilas)}</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Códigos únicos</p>
                      <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(importPreview.codigosUnicos)}</p>
                    </div>
                    <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-sky-500 uppercase">Nuevos</p>
                      <p className="text-lg font-black text-sky-700 tabular-nums">{fmtNum(importPreview.nuevosCount)}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-emerald-500 uppercase">Actualizados</p>
                      <p className="text-lg font-black text-emerald-700 tabular-nums">{fmtNum(importPreview.actualizadosCount)}</p>
                    </div>
                  </div>

                  {/* ─── Reparto por sucursal (Task 98: "dividir bien") ─── */}
                  {importPreview.sucursales && importPreview.sucursales.length > 0 ? (
                    <div className="rounded-xl border border-stone-200 overflow-hidden">
                      <p className="text-[10px] font-black tracking-widest text-stone-500 px-3 pt-3 pb-1.5 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-sky-600" />
                        CÓMO SE DIVIDE EL INVENTARIO POR SUCURSAL
                        <span className="text-stone-400 font-bold normal-case tracking-normal">
                          (CENTRAL = depósito central)
                        </span>
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-stone-50 border-y border-stone-200">
                            <th className="text-left px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">SUCURSAL</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">FILAS</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">PRODUCTOS</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">UNIDADES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.sucursales.map((s) => {
                            const esCentral = s.nombre === "CENTRAL";
                            return (
                              <tr key={s.nombre} className="border-b border-stone-100">
                                <td className="px-3 py-1.5 font-bold text-stone-700 flex items-center gap-1.5">
                                  {esCentral && <Warehouse className="h-3 w-3 text-amber-600" />}
                                  {s.nombre}
                                  {esCentral && (
                                    <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                      DEPÓSITO
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">{fmtNum(s.filas)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">{fmtNum(s.skus)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-stone-700">{fmtNum(s.unidades)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800">
                        Esta planilla no trae la columna SUCURSAL: se actualizará solo el stock general de siempre.
                      </p>
                    </div>
                  )}

                  {/* Errores del preview */}
                  {importPreview.errores.length > 0 && (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800 mb-1">Advertencias</p>
                      <ul className="text-[10px] text-amber-700 space-y-0.5">
                        {importPreview.errores.slice(0, 10).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!importLoading && !importResult && !importPreview && (
                <div className="text-center py-12 text-stone-500 text-sm">
                  No se pudo procesar el archivo. Cerrá y probá de nuevo.
                </div>
              )}
            </div>

            {/* Footer del modal con botones */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "#e7e5e4" }}>
              {!importResult && (
                <>
                  <button
                    onClick={() => setImportOpen(false)}
                    className="h-9 px-4 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
                    disabled={importLoading || importApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void confirmarImport()}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                    disabled={
                      importLoading ||
                      importApplying ||
                      !importPreview ||
                      (importPreview?.nuevosCount === 0 && importPreview?.actualizadosCount === 0)
                    }
                  >
                    {importApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Aplicando…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        CONFIRMAR IMPORTACIÓN
                      </>
                    )}
                  </button>
                </>
              )}
              {importResult && (
                <button
                  onClick={() => setImportOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
