"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
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
  Sparkles,
  TrendingDown,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AnalisisEncargadoIA,
  FilaEncargado,
  PlanEncargado,
} from "@/lib/encargado-distribucion";

const AZUL = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

interface EncargadoDistribucionProps {
  open: boolean;
  onClose: () => void;
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

interface GrupoFilas {
  grupo: string;
  filas: FilaEncargado[];
}

export function EncargadoDistribucion({
  open,
  onClose,
}: EncargadoDistribucionProps) {
  const [plan, setPlan] = useState<PlanEncargado | null>(null);
  const [ia, setIa] = useState<AnalisisEncargadoIA | null>(null);
  const [cargando, setCargando] = useState(false);
  const [iaCargando, setIaCargando] = useState(false);
  const [pdfCargando, setPdfCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"plan" | "analisis">("plan");
  const [vigilando, setVigilando] = useState(true);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sucursalFiltro, setSucursalFiltro] = useState("");
  const enCurso = useRef(false);

  const analizar = useCallback(async (conIA: boolean) => {
    if (enCurso.current) return;
    enCurso.current = true;
    if (conIA) setIaCargando(true);
    else setCargando(true);

    try {
      const res = await fetch(
        `/api/stock/encargado${conIA ? "" : "?ia=0"}`,
        { method: "POST", cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      if (data?.plan) setPlan(data.plan as PlanEncargado);
      if (conIA) setIa((data?.ia ?? null) as AnalisisEncargadoIA | null);
      setUltima(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "No se pudo analizar el stock.");
    } finally {
      enCurso.current = false;
      setCargando(false);
      setIaCargando(false);
    }
  }, []);

  // Al abrir: análisis completo con IA (y guarda el historial de ventas).
  useEffect(() => {
    if (!open) return;
    setTab("plan");
    void analizar(true);
  }, [open, analizar]);

  // Vigilancia: recalcula el plan cada 90 s sin volver a llamar a la IA ni
  // resetear el historial de ventas.
  useEffect(() => {
    if (!open || !vigilando) return;
    const id = setInterval(() => void analizar(false), 90_000);
    return () => clearInterval(id);
  }, [open, vigilando, analizar]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (plan?.filas ?? []).filter((f) => {
      if (
        sucursalFiltro &&
        f.origen !== sucursalFiltro &&
        f.destino !== sucursalFiltro
      ) {
        return false;
      }
      if (!q) return true;
      return [f.sku, f.producto, f.color, f.tipo, f.origen, f.destino, f.marca]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [plan, busqueda, sucursalFiltro]);

  const grupos = useMemo<GrupoFilas[]>(() => {
    const mapa = new Map<string, FilaEncargado[]>();
    for (const f of filasFiltradas) {
      const tipo = String(f.tipo || "SIN TIPO").toUpperCase();
      const color = String(f.color || "SIN COLOR").toUpperCase();
      const clave = color === "SIN COLOR" ? `TIPO: ${tipo}` : `TIPO: ${tipo} · COLOR: ${color}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(f);
    }
    return Array.from(mapa.entries()).map(([grupo, filas]) => ({ grupo, filas }));
  }, [filasFiltradas]);

  const descargarPdf = async () => {
    if (!plan) return;
    setPdfCargando(true);
    try {
      const { generarPdfEncargado, nombreArchivoPdfEncargado } = await import(
        "@/lib/pdf/distribucion-encargado-pdf"
      );
      const doc = generarPdfEncargado(plan, ia);
      doc.save(nombreArchivoPdfEncargado(plan));
      toast.success("PDF del Encargado generado");
    } catch (e) {
      toast.error(`PDF: ${(e as Error).message}`);
    } finally {
      setPdfCargando(false);
    }
  };

  if (!open) return null;

  const resumen = plan?.resumen;
  const sinTransferencias = !!plan && plan.filas.length === 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* ─── Cabecera ─── */}
        <div
          className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: `linear-gradient(135deg, ${AZUL} 0%, #155789 100%)` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(217,184,107,0.16)",
                border: "1px solid rgba(217,184,107,0.5)",
              }}
            >
              <BrainCircuit className="h-5 w-5" style={{ color: DORADO }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                ENCARGADO DE DISTRIBUCIÓN
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-sky-200/90">
                IA · Stock de las 4 sucursales · solo transferencias internas
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
                  : "Sin API key de NVIDIA: análisis determinístico"
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
                  ? "bg-sky-400/15 text-sky-200"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  vigilando ? "bg-sky-300 animate-pulse" : "bg-slate-400"
                }`}
              />
              {vigilando ? "VIGILANDO" : "EN PAUSA"}
            </span>
            <button
              onClick={() => void descargarPdf()}
              disabled={!plan || pdfCargando}
              className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 flex items-center gap-1.5 transition-colors"
              title="Exportar el relatorio completo en PDF (por código, color y destino)"
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
                ["plan", "PLAN", plan?.filas.length ?? 0],
                ["analisis", "ANÁLISIS IA", 0],
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
                    style={{ background: "rgba(21,87,137,0.1)", color: AZUL }}
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

          {!plan && cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-9 w-9 animate-spin text-sky-600" />
              <p className="text-sm font-bold text-stone-600">
                El Encargado está leyendo la Base y el Stock General…
              </p>
              <p className="text-[11px] text-stone-400">
                Analizando tipo, color, stock por sucursal y ventas recientes.
              </p>
            </div>
          )}

          {/* ═════════ PLAN ═════════ */}
          {plan && tab === "plan" && (
            <>
              {resumen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    {
                      label: "TRANSFERENCIAS",
                      value: fmtNum(resumen.transferencias),
                      color: AZUL,
                    },
                    {
                      label: "UNIDADES A MOVER",
                      value: fmtNum(resumen.unidades),
                      color: AZUL,
                    },
                    {
                      label: "CÓDIGOS",
                      value: fmtNum(resumen.productos),
                      color: AZUL,
                    },
                    {
                      label: "FALTANTE SIN COBERTURA",
                      value: fmtNum(resumen.faltanteNoCubierto),
                      color:
                        resumen.faltanteNoCubierto > 0 ? "#b45309" : "#15803d",
                    },
                    {
                      label: "SUCURSALES",
                      value: fmtNum(plan.sucursales.length),
                      color: AZUL,
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className="rounded-xl bg-stone-50 border border-stone-200 p-2.5 text-center"
                    >
                      <p className="text-[8px] font-black tracking-widest text-stone-400 uppercase">
                        {c.label}
                      </p>
                      <p
                        className="text-lg font-black tabular-nums"
                        style={{ color: c.color }}
                      >
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
                      AVISOS DEL ENCARGADO
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

              {/* Balance por sucursal */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-[11px] font-black tracking-widest text-stone-500 uppercase">
                    Balance por sucursal
                  </h3>
                  <span className="text-[9px] font-bold text-stone-400">
                    {plan.modo === "IDEAL"
                      ? "Objetivo: Stock Ideal"
                      : plan.modo === "PROPORCIONAL"
                        ? "Objetivo: equilibrio proporcional"
                        : "Objetivo: ideal + proporcional"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                  {plan.balance.map((b) => {
                    const pct =
                      b.objetivo > 0
                        ? Math.min(100, Math.round((b.saldoDespues / b.objetivo) * 100))
                        : 100;
                    const pareado = Math.abs(b.saldoDespues - b.objetivo) <= 1;
                    return (
                      <div
                        key={b.sucursal}
                        className="rounded-xl border border-stone-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] font-black text-stone-700 truncate">
                            {b.sucursal}
                          </p>
                          <span
                            className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                              b.faltanteNoCubierto > 0
                                ? "bg-amber-100 text-amber-700"
                                : pareado
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {b.faltanteNoCubierto > 0
                              ? `FALTA ${fmtNum(b.faltanteNoCubierto)}`
                              : pareado
                                ? "PAREADO"
                                : "AJUSTANDO"}
                          </span>
                        </div>
                        <div className="flex items-end gap-1.5 mt-1.5">
                          <p className="text-xl font-black tabular-nums" style={{ color: AZUL }}>
                            {fmtNum(b.saldoDespues)}
                          </p>
                          <p className="text-[9px] font-bold text-stone-400 mb-1">
                            / objetivo {fmtNum(b.objetivo)}
                          </p>
                        </div>
                        <div className="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background:
                                b.faltanteNoCubierto > 0
                                  ? "#f59e0b"
                                  : `linear-gradient(90deg, ${AZUL}, #3b9be0)`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[8.5px] font-bold text-stone-500">
                          <span>hoy {fmtNum(b.saldoActual)}</span>
                          <span className="text-emerald-700">+{fmtNum(b.entradas)}</span>
                          <span className="text-red-600">-{fmtNum(b.salidas)}</span>
                        </div>
                        {b.vendidoReciente > 0 && (
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-1.5 py-0.5 text-[8px] font-black">
                            <TrendingDown className="h-2.5 w-2.5" />
                            {fmtNum(b.vendidoReciente)} vendidos desde el último análisis
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Filtros */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por COD, producto, color, tipo, origen o destino…"
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <select
                  value={sucursalFiltro}
                  onChange={(e) => setSucursalFiltro(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">TODAS LAS SUCURSALES</option>
                  {plan.sucursales.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-bold text-stone-400">
                  {fmtNum(filasFiltradas.length)} transferencia(s)
                </span>
              </div>

              {/* Tabla de transferencias */}
              {filasFiltradas.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-black text-emerald-800">
                    {sinTransferencias
                      ? "Las sucursales están pareadas"
                      : "Sin transferencias para ese filtro"}
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    {sinTransferencias
                      ? "No hace falta mover mercadería entre sucursales en este momento."
                      : "Probá con otra búsqueda o quitá el filtro de sucursal."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-stone-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">COD</th>
                          <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">PRODUCTO</th>
                          <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">COLOR</th>
                          <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-emerald-600">ORIGEN</th>
                          <th className="px-1 py-2" />
                          <th className="text-left px-3 py-2 text-[8px] font-black tracking-widest text-sky-600">DESTINO</th>
                          <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">CANT.</th>
                          <th className="text-right px-3 py-2 text-[8px] font-black tracking-widest text-stone-500">HOY → QUEDA</th>
                        </tr>
                      </thead>
                      {grupos.map(({ grupo, filas }) => (
                        <tbody key={grupo}>
                          <tr>
                            <td
                              colSpan={8}
                              className="px-3 py-1.5 text-[9px] font-black tracking-wide text-stone-600 bg-amber-50/70 border-y border-amber-100"
                            >
                              {grupo}
                            </td>
                          </tr>
                          {filas.map((f, i) => (
                            <tr
                              key={`${f.sku}-${f.origen}-${f.destino}-${i}`}
                              className="border-b border-stone-100 hover:bg-sky-50/40"
                            >
                              <td className="px-3 py-2 font-mono font-bold text-stone-800 whitespace-nowrap">
                                {f.sku}
                              </td>
                              <td className="px-3 py-2">
                                <div className="text-stone-700 font-semibold max-w-[230px] truncate" title={f.producto}>
                                  {f.producto}
                                </div>
                                {(f.marca || f.categoria) && (
                                  <div className="text-[8px] text-stone-400 font-medium truncate max-w-[230px]">
                                    {[f.marca, f.categoria].filter(Boolean).join(" · ")}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <ChipColores colores={f.colores} color={f.color} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-bold text-emerald-700 whitespace-nowrap">{f.origen}</div>
                                <div className="text-[8px] text-stone-400 font-medium whitespace-nowrap">
                                  tiene {fmtNum(f.origenSaldo)} · objetivo {fmtNum(f.origenObjetivo)}
                                </div>
                              </td>
                              <td className="px-1 py-2 text-center text-stone-300">
                                <ArrowLeftRight className="h-3.5 w-3.5 inline" />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-bold text-sky-700 whitespace-nowrap">{f.destino}</div>
                                <div className="text-[8px] text-stone-400 font-medium whitespace-nowrap">
                                  tiene {fmtNum(f.destinoSaldo)} · objetivo {fmtNum(f.destinoObjetivo)}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span
                                  className="inline-block min-w-[2.8rem] px-2.5 py-1 rounded-lg font-black text-sm tabular-nums"
                                  style={{ background: "rgba(21,87,137,0.08)", color: AZUL }}
                                >
                                  {fmtNum(f.cantidad)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="text-[8px] font-bold text-emerald-700 whitespace-nowrap">
                                  ORIG. {fmtNum(f.origenSaldo)} → {fmtNum(f.origenDespues)}
                                </div>
                                <div className="text-[8px] font-bold text-sky-700 whitespace-nowrap">
                                  DEST. {fmtNum(f.destinoSaldo)} → {fmtNum(f.destinoDespues)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[9px] text-stone-400 font-medium leading-relaxed">
                Regla: se mueve solo el excedente del origen y solo lo que le falta al destino.
                El objetivo sale del Stock Ideal cuando existe; si no, se reparte el stock de las 4
                sucursales de forma proporcional, con un ajuste suave por las ventas detectadas desde
                el último análisis. CENTRAL solo repone lo que las sucursales no pueden cubrir.
                Nada se mueve solo: este plan y el PDF los ejecuta el equipo.
              </p>
            </>
          )}

          {/* ═════════ ANÁLISIS IA ═════════ */}
          {plan && tab === "analisis" && (
            <>
              {iaCargando && (
                <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                  <p className="text-xs font-bold text-sky-800">
                    La IA está interpretando el plan del Encargado…
                  </p>
                </div>
              )}

              {ia ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(21,87,137,0.08)" }}
                      >
                        <Sparkles className="h-4 w-4" style={{ color: AZUL }} />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-stone-800">
                          {ia.activa ? "ANÁLISIS CON IA" : "ANÁLISIS DETERMINÍSTICO"}
                        </p>
                        <p className="text-[9px] font-bold text-stone-400">
                          {ia.activa
                            ? `${ia.modelo || "NVIDIA NIM"} · el plan lo calcula el motor del sistema`
                            : "Sin NVIDIA_API_KEY: mismas cifras, redactadas por el motor local"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => void analizar(true)}
                      disabled={iaCargando}
                      className="h-8 px-3 rounded-lg text-[10px] font-black text-white disabled:opacity-40 flex items-center gap-1.5"
                      style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO}, ${DORADO})`, color: AZUL }}
                    >
                      {iaCargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                      VOLVER A ANALIZAR CON IA
                    </button>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase mb-1">
                      Resumen del Encargado
                    </p>
                    <p className="text-sm text-stone-700 leading-relaxed">{ia.resumen}</p>
                    {ia.mensaje && (
                      <p className="text-xs text-stone-500 font-medium leading-relaxed mt-2">{ia.mensaje}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                      <p className="text-[9px] font-black tracking-widest text-sky-700 uppercase mb-2">
                        Prioridades
                      </p>
                      {ia.prioridades.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Sin prioridades críticas.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ia.prioridades.map((p) => (
                            <li key={p} className="text-[10px] text-sky-900 font-medium leading-snug flex gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-sky-600" />
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
                            <li key={a} className="text-[10px] text-amber-900 font-medium leading-snug flex gap-1.5">
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
                        <p className="text-[10px] text-stone-400">Sin transferencias recomendadas.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ia.recomendaciones.map((r) => (
                            <li key={r} className="text-[10px] text-emerald-900 font-medium leading-snug flex gap-1.5">
                              <ArrowLeftRight className="h-3 w-3 shrink-0 mt-0.5 text-emerald-600" />
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
                      ANALIZAR CON IA
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
            <Warehouse className="h-3.5 w-3.5" />
            Solo transferencias entre sucursales · sin compras a proveedores
            <span className="hidden sm:inline">· Última revisión: {hora(ultima)}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setVigilando((v) => !v)}
              className={`h-8 px-2.5 rounded-lg text-[9px] font-black flex items-center gap-1.5 border transition-colors ${
                vigilando
                  ? "border-sky-200 bg-sky-50 text-sky-700"
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
              title="Recalcular el plan con el stock de ahora"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
              ACTUALIZAR
            </button>

            <button
              onClick={() => void analizar(true)}
              disabled={iaCargando}
              className="h-8 px-2.5 rounded-lg text-[9px] font-black disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO}, ${DORADO})`, color: AZUL }}
              title="Interpretar el plan con NVIDIA NIM"
            >
              {iaCargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
              ANALIZAR CON IA
            </button>

            <button
              onClick={() => void descargarPdf()}
              disabled={!plan || pdfCargando}
              className="h-8 px-2.5 rounded-lg text-[9px] font-black text-white disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
              title="Descargar el PDF completo por código, color y destino"
            >
              {pdfCargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
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
