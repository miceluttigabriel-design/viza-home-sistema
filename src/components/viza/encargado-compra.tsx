"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
// Task 161: import ESTÁTICO del PDF. Antes era `import()` dinámico y en
// producción fallaba con "Failed to load chunk": el navegador pedía un
// chunk que ya no existía después de un deploy. Así viaja en el mismo
// bundle y el PDF siempre se puede generar.
import {
  generarPdfCompra,
  nombreArchivoPdfCompra,
} from "@/lib/pdf/compra-encargado-pdf";
import type {
  AnalisisCompraIA,
  FilaCompra,
  PlanCompra,
  PrioridadCompra,
} from "@/lib/encargado-compra";

const AZUL = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

interface EncargadoCompraProps {
  open: boolean;
  onClose: () => void;
  // Pedido del dueño: además de la ventana (modal), el módulo puede abrirse
  // como PÁGINA COMPLETA, igual que STOCK GENERAL: solo el módulo en pantalla
  // y el botón para volver al ORQUESTADOR.
  modo?: "modal" | "pagina";
}

function fmtNum(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("es-PY");
}

function hora(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function colorHex(nombre: string): string {
  const n = String(nombre || "").toUpperCase();
  if (/(NEGRO|PRETO|BLACK)/.test(n)) return "#111827";
  if (/(BLANCO|BRANCO|WHITE)/.test(n)) return "#f8fafc";
  if (/(AZUL|BLUE)/.test(n)) return "#2563eb";
  if (/(ROJO|VERMELHO|RED)/.test(n)) return "#dc2626";
  if (/(VERDE|GREEN)/.test(n)) return "#16a34a";
  if (/(AMARILLO|AMARELO|YELLOW)/.test(n)) return "#eab308";
  if (/(GRIS|CINZA|GREY|GRAY)/.test(n)) return "#6b7280";
  if (/(MARRON|MARROM|BROWN|CAFE)/.test(n)) return "#92400e";
  if (/(ROSA|PINK)/.test(n)) return "#ec4899";
  if (/(VIOLETA|PURPLE|ROXO|LILA)/.test(n)) return "#7c3aed";
  if (/(NARANJA|LARANJA|ORANGE)/.test(n)) return "#ea580c";
  if (/(BEIGE|CREME|CREMA|MARFIL)/.test(n)) return "#d6c7a1";
  if (/(DORADO|OURO|GOLD|ORO)/.test(n)) return DORADO;
  if (/(PLATA|PRATA|SILVER|PLATEADO)/.test(n)) return "#94a3b8";
  if (/(CELESTE|TURQUESA)/.test(n)) return "#38bdf8";
  if (/(VINOTINTO|BORDO|BURDEO)/.test(n)) return "#7f1d1d";
  return "#cbd5e1";
}

function PuntoColor({ nombre }: { nombre: string }) {
  const claro = /BLANCO|BRANCO|WHITE|BEIGE|CREME|CREMA/i.test(nombre);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
          claro ? "border border-stone-300" : ""
        }`}
        style={{ background: colorHex(nombre) }}
      />
      <span className="truncate">{nombre}</span>
    </span>
  );
}

function ChipColores({ colores, color }: { colores: string[]; color: string | null }) {
  if (!colores || colores.length === 0) {
    return <span className="text-stone-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {colores.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-stone-100 text-stone-700"
          title={color || c}
        >
          <PuntoColor nombre={c} />
        </span>
      ))}
    </div>
  );
}

function BadgePrioridad({ p }: { p: PrioridadCompra }) {
  const estilos =
    p === "ALTA"
      ? "bg-red-50 text-red-700 ring-red-200"
      : p === "MEDIA"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-stone-100 text-stone-600 ring-stone-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ring-1 ${estilos}`}>
      {p}
    </span>
  );
}

interface GrupoCompra {
  proveedor: string;
  filas: FilaCompra[];
}

export function EncargadoCompra({ open, onClose, modo = "modal" }: EncargadoCompraProps) {
  const [plan, setPlan] = useState<PlanCompra | null>(null);
  const [ia, setIa] = useState<AnalisisCompraIA | null>(null);
  const [cargando, setCargando] = useState(false);
  const [iaCargando, setIaCargando] = useState(false);
  const [pdfCargando, setPdfCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"necesidades" | "proveedores" | "analisis">(
    "necesidades"
  );
  const [vigilando, setVigilando] = useState(true);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [proveedorFiltro, setProveedorFiltro] = useState("");
  const enCurso = useRef(false);

  const analizar = useCallback(async (conIA: boolean) => {
    if (enCurso.current) return;
    enCurso.current = true;
    if (conIA) setIaCargando(true);
    else setCargando(true);

    try {
      const res = await fetch(`/api/stock/compra${conIA ? "" : "?ia=0"}`, {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      if (data?.plan) setPlan(data.plan as PlanCompra);
      if (conIA) setIa((data?.ia ?? null) as AnalisisCompraIA | null);
      setUltima(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "No se pudo analizar la necesidad de compra.");
    } finally {
      enCurso.current = false;
      setCargando(false);
      setIaCargando(false);
    }
  }, []);

  // Al abrir: análisis completo con IA (y guarda la foto del stock).
  useEffect(() => {
    if (!open) return;
    setTab("necesidades");
    void analizar(true);
  }, [open, analizar]);

  // Vigilancia: recalcula cada 90 s sin IA ni historial.
  useEffect(() => {
    if (!open || !vigilando) return;
    const id = setInterval(() => void analizar(false), 90_000);
    return () => clearInterval(id);
  }, [open, vigilando, analizar]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (plan?.filas ?? []).filter((f) => {
      if (proveedorFiltro && f.proveedor !== proveedorFiltro) return false;
      if (!q) return true;
      return [f.sku, f.producto, f.color, f.tipo, f.proveedor, f.marca, f.categoria]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [plan, busqueda, proveedorFiltro]);

  const grupos = useMemo<GrupoCompra[]>(() => {
    const mapa = new Map<string, FilaCompra[]>();
    for (const f of filasFiltradas) {
      const p = f.proveedor || "SIN PROVEEDOR";
      if (!mapa.has(p)) mapa.set(p, []);
      mapa.get(p)!.push(f);
    }
    return Array.from(mapa.entries()).map(([proveedor, filas]) => ({
      proveedor,
      filas,
    }));
  }, [filasFiltradas]);

  const descargarPdf = async () => {
    if (!plan) return;
    setPdfCargando(true);
    try {
      const doc = generarPdfCompra(plan, ia);
      doc.save(nombreArchivoPdfCompra(plan));
      toast.success("PDF del Encargado de Compra generado");
    } catch (e) {
      toast.error(`PDF: ${(e as Error).message}`);
    } finally {
      setPdfCargando(false);
    }
  };

  if (!open) return null;

  const resumen = plan?.resumen;
  const sinCompras = !!plan && plan.filas.length === 0;

  const esPagina = modo === "pagina";

  return (
    <div
      className={
        esPagina
          ? "min-h-screen bg-stone-100 flex flex-col"
          : "fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      }
    >
      <div
        className={
          esPagina
            ? "bg-white w-full min-h-screen flex flex-col overflow-hidden"
            : "bg-white rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[96vh] flex flex-col overflow-hidden"
        }
      >
        {/* ─── Cabecera ─── */}
        <div
          className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: "linear-gradient(135deg, #0e7490 0%, #155e75 100%)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Página completa (pedido del dueño): mismo botón de vuelta que
                STOCK GENERAL, para regresar al ORQUESTADOR. */}
            {esPagina && (
              <button
                onClick={onClose}
                className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95 shrink-0"
                style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`, color: AZUL }}
                title="Volver al Orquestador"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ORQUESTADOR</span>
              </button>
            )}
            <div
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(217,184,107,0.16)",
                border: "1px solid rgba(217,184,107,0.5)",
              }}
            >
              <ShoppingCart className="h-5 w-5" style={{ color: DORADO }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                ENCARGADO DE COMPRA
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-cyan-200/90">
                Solo SELECCIONADOS · desde COD 100.000
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black tracking-widest ${
                ia?.activa
                  ? "bg-emerald-400/15 text-emerald-300"
                  : "bg-amber-400/15 text-amber-200"
              }`}
              title={
                ia?.activa
                  ? "NVIDIA NIM conectado"
                  : "Modo respaldo: análisis determinístico"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  ia?.activa ? "bg-emerald-400" : "bg-amber-300"
                }`}
              />
              {ia?.activa ? "IA ACTIVA" : "MODO RESPALDO"}
            </span>
            <span
              className={`hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black tracking-widest ${
                vigilando
                  ? "bg-cyan-400/15 text-cyan-100"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  vigilando ? "bg-cyan-300 animate-pulse" : "bg-slate-400"
                }`}
              />
              {vigilando ? "VIGILANDO" : "EN PAUSA"}
            </span>
            <button
              onClick={() => void descargarPdf()}
              disabled={!plan || pdfCargando}
              className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 flex items-center gap-1.5 transition-colors"
              title="Exportar la necesidad de compra en PDF"
            >
              {pdfCargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="text-[9px] font-black tracking-widest">EXPORTAR PDF</span>
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <div className="px-4 sm:px-6 pt-3 border-b border-stone-200">
          <div className="flex items-center gap-1 w-fit rounded-xl bg-stone-100 p-1">
            {(
              [
                ["necesidades", "NECESIDADES", plan?.filas.length ?? 0],
                ["proveedores", "PROVEEDORES", plan?.proveedores.length ?? 0],
                ["analisis", "ANÁLISIS", 0],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`h-8 px-3 rounded-lg text-[10px] font-black tracking-wide transition-colors flex items-center gap-1.5 ${
                  tab === id
                    ? "bg-white text-stone-800 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[8px] font-black"
                    style={{ background: "rgba(14,116,144,0.1)", color: "#0e7490" }}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Cuerpo ─── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-xl p-3 border border-red-200 bg-red-50 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-800">{error}</p>
            </div>
          )}

          {!plan && (cargando || iaCargando) && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-9 w-9 animate-spin text-cyan-600" />
              <p className="text-sm font-bold text-stone-600">
                El Encargado de Compra está analizando la red…
              </p>
              <p className="text-[11px] text-stone-400">
                Leyendo stock por sucursal, CENTRAL, tipo, color y ventas detectadas.
              </p>
            </div>
          )}

          {/* ═════════ NECESIDADES ═════════ */}
          {plan && tab === "necesidades" && (
            <>
              {resumen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    {
                      label: "CÓDIGOS A COMPRAR",
                      value: fmtNum(resumen.productos),
                      color: AZUL,
                    },
                    {
                      label: "UNIDADES",
                      value: fmtNum(resumen.unidades),
                      color: AZUL,
                    },
                    {
                      label: "PROVEEDORES",
                      value: fmtNum(resumen.proveedores),
                      color: AZUL,
                    },
                    {
                      label: "PRIORIDAD ALTA",
                      value: fmtNum(resumen.prioridadAlta),
                      color: resumen.prioridadAlta > 0 ? "#b45309" : "#15803d",
                    },
                    {
                      label: "VENTAS DETECTADAS",
                      value: fmtNum(resumen.unidadesVendidas),
                      color: resumen.unidadesVendidas > 0 ? AZUL : "#6b7280",
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className="rounded-xl bg-stone-50 border border-stone-200 p-2.5 text-center"
                    >
                      <p className="text-[8px] font-black tracking-widest text-stone-400 uppercase">
                        {c.label}
                      </p>
                      <p className="text-lg font-black tabular-nums" style={{ color: c.color }}>
                        {c.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {plan.alertas.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    <p className="text-[10px] font-black tracking-widest text-amber-800">
                      AVISOS DEL ENCARGADO DE COMPRA
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {plan.alertas.slice(0, 4).map((a) => (
                      <li
                        key={a}
                        className="text-[10px] text-amber-800 font-medium leading-snug"
                      >
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Filtros */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por COD, producto, color, tipo, proveedor o marca…"
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  />
                </div>
                <select
                  value={proveedorFiltro}
                  onChange={(e) => setProveedorFiltro(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="">TODOS LOS PROVEEDORES</option>
                  {plan.proveedores.map((p) => (
                    <option key={p.proveedor} value={p.proveedor}>
                      {p.proveedor}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-bold text-stone-400">
                  {fmtNum(filasFiltradas.length)} código(s) ·{" "}
                  {fmtNum(filasFiltradas.reduce((acc, f) => acc + f.compra, 0))} u
                </span>
              </div>

              {filasFiltradas.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-black text-emerald-800">
                    {sinCompras
                      ? "Sin necesidad de compra"
                      : "Sin resultados para ese filtro"}
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    {sinCompras
                      ? "La red está cubierta con el stock actual y las transferencias internas."
                      : "Probá con otra búsqueda o quitá el filtro de proveedor."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {grupos.map(({ proveedor, filas }) => (
                    <div
                      key={proveedor}
                      className="rounded-xl border border-stone-200 overflow-hidden"
                    >
                      <div className="px-3 py-2 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-amber-700" />
                          <p className="text-[10px] font-black tracking-wide text-stone-700">
                            PROVEEDOR: {proveedor}
                          </p>
                        </div>
                        <p className="text-[9px] font-black text-amber-700">
                          {fmtNum(filas.length)} código(s) ·{" "}
                          {fmtNum(filas.reduce((acc, f) => acc + f.compra, 0))} unidad(es)
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-stone-50 border-b border-stone-200">
                              <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">COD</th>
                              <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">PRODUCTO</th>
                              <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">COLOR</th>
                              <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">STOCK RED</th>
                              <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">CENTRAL</th>
                              <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">OBJETIVO</th>
                              <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-cyan-700">COMPRAR</th>
                              <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">VENDIDO</th>
                              <th className="text-center px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">PRIOR.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filas.map((f, i) => (
                              <tr
                                key={`${f.sku}-${i}`}
                                className="border-b border-stone-100 hover:bg-cyan-50/40"
                              >
                                <td className="px-3 py-2 font-mono font-bold text-stone-800 whitespace-nowrap">
                                  {f.sku}
                                </td>
                                <td className="px-3 py-2">
                                  <div
                                    className="text-stone-700 font-semibold max-w-[240px] truncate"
                                    title={f.producto}
                                  >
                                    {f.producto}
                                  </div>
                                  {(f.tipo || f.marca) && (
                                    <div className="text-[8px] text-stone-400 font-medium truncate max-w-[240px]">
                                      {[f.tipo, f.marca].filter(Boolean).join(" · ")}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <ChipColores colores={f.colores} color={f.color} />
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                                  {fmtNum(f.stockSucursales)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                                  {fmtNum(f.central)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                                  {fmtNum(f.objetivoRed)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className="inline-block min-w-[2.8rem] px-2.5 py-1 rounded-lg font-black text-sm tabular-nums bg-cyan-50 text-cyan-800">
                                    {fmtNum(f.compra)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {f.vendidoRed > 0 ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-black text-red-700"
                                      title={f.detalle
                                        .filter((d) => d.vendido > 0)
                                        .map(
                                          (d) =>
                                            `${d.sucursal}: ${d.saldo + d.vendido} -> ${d.saldo} (vendió ${d.vendido})`
                                        )
                                        .join(" · ")}
                                    >
                                      <TrendingDown className="h-2.5 w-2.5" />
                                      {fmtNum(f.vendidoRed)}
                                    </span>
                                  ) : (
                                    <span className="text-stone-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <BadgePrioridad p={f.prioridad} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[9px] text-stone-400 font-medium leading-relaxed">
                Regla: solo productos SELECCIONADOS (etiqueta verde de la Base) y códigos desde
                100.000. Cada sucursal necesita al menos 1 unidad; primero se usa CENTRAL y las
                transferencias internas. Sin Stock Ideal, el objetivo es 1 por sucursal o lo vendido
                si fue mayor. El VENDIDO sale de la baja real del stock entre análisis (aunque la
                sucursal quede en 0). Nada se compra solo: este plan y el PDF los decide el dueño.
              </p>
            </>
          )}

          {/* ═════════ PROVEEDORES ═════════ */}
          {plan && tab === "proveedores" && (
            <>
              {plan.proveedores.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-black text-emerald-800">Sin compras por proveedor</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    No hay necesidad de compra en este momento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {plan.proveedores.map((p) => (
                    <button
                      key={p.proveedor}
                      onClick={() => {
                        setProveedorFiltro(p.proveedor);
                        setTab("necesidades");
                      }}
                      className="text-left rounded-xl border border-stone-200 bg-white p-3 hover:border-cyan-300 hover:bg-cyan-50/30 transition-colors"
                      title={`Ver los códigos de ${p.proveedor}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Truck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                          <p className="text-[11px] font-black text-stone-800 truncate">
                            {p.proveedor}
                          </p>
                        </div>
                        {p.prioritarios > 0 && (
                          <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[8px] font-black text-red-700">
                            {p.prioritarios} ALTA
                          </span>
                        )}
                      </div>
                      <div className="flex items-end gap-2 mt-2">
                        <p className="text-2xl font-black tabular-nums" style={{ color: AZUL }}>
                          {fmtNum(p.unidades)}
                        </p>
                        <p className="text-[9px] font-bold text-stone-400 mb-1">
                          unidad(es) · {fmtNum(p.productos)} código(s)
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═════════ ANÁLISIS IA ═════════ */}
          {plan && tab === "analisis" && (
            <>
              {iaCargando && (
                <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                  <p className="text-xs font-bold text-cyan-800">
                    La IA está interpretando la necesidad de compra…
                  </p>
                </div>
              )}

              {ia ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-[11px] font-black text-stone-800">
                          {ia.activa ? "ANÁLISIS CON IA" : "ANÁLISIS DETERMINÍSTICO"}
                        </p>
                        {ia.activa && (
                          <p className="text-[9px] font-bold text-stone-400">
                            {`${ia.modelo || "NVIDIA NIM"} · las cantidades las calcula el motor del sistema`}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void analizar(true)}
                      disabled={iaCargando}
                      className="h-8 px-3 rounded-lg text-[10px] font-black text-white disabled:opacity-40 flex items-center gap-1.5"
                      style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO}, ${DORADO})`, color: AZUL }}
                    >
                      {iaCargando ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BrainCircuit className="h-3.5 w-3.5" />
                      )}
                      VOLVER A ANALIZAR
                    </button>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase mb-1">
                      Resumen del Encargado de Compra
                    </p>
                    <p className="text-sm text-stone-700 leading-relaxed">{ia.resumen}</p>
                    {ia.mensaje && (
                      <p className="text-xs text-stone-500 font-medium leading-relaxed mt-2">
                        {ia.mensaje}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
                      <p className="text-[9px] font-black tracking-widest text-cyan-700 uppercase mb-2">
                        Prioridades
                      </p>
                      {ia.prioridades.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Sin prioridades críticas.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ia.prioridades.map((p) => (
                            <li
                              key={p}
                              className="text-[10px] text-cyan-900 font-medium leading-snug flex gap-1.5"
                            >
                              <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-cyan-600" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-[9px] font-black tracking-widest text-amber-700 uppercase mb-2">
                        Alertas
                      </p>
                      {ia.alertas.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Sin alertas.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ia.alertas.map((a) => (
                            <li
                              key={a}
                              className="text-[10px] text-amber-900 font-medium leading-snug flex gap-1.5"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="text-[9px] font-black tracking-widest text-emerald-700 uppercase mb-2">
                        Recomendaciones
                      </p>
                      {ia.recomendaciones.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Sin compras recomendadas.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ia.recomendaciones.map((r) => (
                            <li
                              key={r}
                              className="text-[10px] text-emerald-900 font-medium leading-snug flex gap-1.5"
                            >
                              <Package className="h-3 w-3 shrink-0 mt-0.5 text-emerald-600" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {ia.error && (
                    <p className="text-[9px] text-stone-400 font-medium">
                      Nota técnica: {ia.error}
                    </p>
                  )}
                </>
              ) : (
                !iaCargando && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
                    <BrainCircuit className="h-7 w-7 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm font-black text-stone-600">Sin análisis todavía</p>
                    <button
                      onClick={() => void analizar(true)}
                      className="mt-3 h-9 px-4 rounded-xl text-xs font-black"
                      style={{ background: DORADO, color: AZUL }}
                    >
                      ANALIZAR
                    </button>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* ─── Pie ─── */}
        <div className="px-4 sm:px-6 py-3 border-t border-stone-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[9px] font-bold text-stone-400">
            <ShoppingCart className="h-3.5 w-3.5" />
            Solo recomendación · sin orden de compra
            <span className="hidden sm:inline">· Última revisión: {hora(ultima)}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setVigilando((v) => !v)}
              className={`h-8 px-2.5 rounded-lg text-[9px] font-black flex items-center gap-1.5 border transition-colors ${
                vigilando
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-stone-200 bg-white text-stone-500"
              }`}
              title="Vigilancia automática cada 90 segundos"
            >
              {vigilando ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {vigilando ? "VIGILANDO" : "PAUSADO"}
            </button>

            <button
              onClick={() => void analizar(false)}
              disabled={cargando}
              className="h-8 px-2.5 rounded-lg border border-stone-200 text-[9px] font-black text-stone-600 hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1.5"
              title="Recalcular la necesidad de compra con el stock de ahora"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
              ACTUALIZAR
            </button>

            <button
              onClick={() => void analizar(true)}
              disabled={iaCargando}
              className="h-8 px-2.5 rounded-lg text-[9px] font-black disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO}, ${DORADO})`, color: AZUL }}
              title="Analizar la necesidad de compra"
            >
              {iaCargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BrainCircuit className="h-3.5 w-3.5" />
              )}
              ANALIZAR
            </button>

            <button
              onClick={() => void descargarPdf()}
              disabled={!plan || pdfCargando}
              className="h-8 px-2.5 rounded-lg text-[9px] font-black text-white disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #0e7490 0%, #155e75 100%)" }}
              title="Descargar el PDF de necesidad de compra"
            >
              {pdfCargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              EXPORTAR PDF
            </button>

            <button
              onClick={onClose}
              className="h-8 px-2.5 rounded-lg border border-stone-200 text-[9px] font-black text-stone-600 hover:bg-stone-50"
            >
              CERRAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
