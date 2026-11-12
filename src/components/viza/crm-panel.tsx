"use client";

// ═══════════════════════════════════════════════════════════════════
// CRM · MÓDULO COMPLETO (Task 169, pedido del dueño)
//
// El CRM deja de ser un botón escondido en la Base / panel de ventas y pasa
// a ser un MÓDULO del ORQUESTADOR (cuadro debajo de COTIZADOR). Se abre como
// PÁGINA COMPLETA y tiene TRES alcances, siempre definidos por el servidor:
//
//   · "general"  → SUPREMO / ADMIN / VIP:
//       ranking de todas las sucursales, filtros por sucursal, por plan
//       (incluye PEDIDO ESPECIAL) y por período.
//   · "sucursal" → ESPECIAL (los 4 encargados):
//       ranking SOLO de SU sucursal, solo lectura.
//   · "personal" → COMÚN:
//       SOLO lo que él mismo emitió (total, aprobados y por plan). El
//       servidor recorta los datos: aunque alguien fuerce la vista, nunca
//       recibe datos de otro usuario.
//
// Task 170 (pedido del dueño): el CRM se consulta por PERÍODO (por defecto el
// MES PASADO) y el historial de pedidos especiales que estaba debajo del
// ranking se reemplazó por el filtro PEDIDO ESPECIAL.
//
// El ranking se refresca solo cada 5 segundos y al volver a la ventana,
// igual que el CRM del panel (Task 168): el presupuesto emitido aparece de
// inmediato sin cerrar y volver a abrir.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

const AZUL = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

interface CrmUser {
  email: string;
  name?: string | null;
  role: string;
}

type ModoCrm = "general" | "sucursal" | "personal";

interface CrmFila {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  sucursal: string;
  total: number;
  aprobadas: number;
  porPlan?: {
    CUOTA: number;
    CONTADO: number;
    MAYORISTA: number;
    SAFRA: number;
    CHEQUE: number;
    // Task 170: cantidad de PEDIDOS ESPECIALES del usuario en el período.
    ESPECIAL: number;
  };
  ultimo: string | null;
}

interface CrmPanelProps {
  user: CrmUser;
  modo: ModoCrm;
  puedeAsignar?: boolean;
  soloLectura?: boolean;
  onVolver: () => void;
}

const CRM_PLANES = [
  "TODOS",
  "CUOTA",
  "CONTADO",
  "MAYORISTA",
  "SAFRA",
  "CHEQUE",
  "ESPECIAL",
] as const;

// ─── Período de consulta (Task 170) ───
// El CRM arranca mostrando el MES PASADO (pedido del dueño) y permite elegir
// cualquier rango de fechas. Las fechas viajan como YYYY-MM-DD.
const pad2 = (n: number) => String(n).padStart(2, "0");
const fechaInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const rangoMes = (offset: number): { desde: string; hasta: string } => {
  const hoy = new Date();
  const ini = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + offset + 1, 0);
  return { desde: fechaInput(ini), hasta: fechaInput(fin) };
};
const fmtFechaInput = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y.slice(2)}`;
};

const fmtFechaCorta = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

const medalStyle = (pos: number): { bg: string; fg: string } | null =>
  pos === 1
    ? { bg: "#FFD700", fg: "#6b5200" }
    : pos === 2
      ? { bg: "#C0C0C0", fg: "#3f3f3f" }
      : pos === 3
        ? { bg: "#CD7F32", fg: "#fff7ed" }
        : null;

function ValorPlan(fila: CrmFila, plan: string): number {
  return plan === "TODOS"
    ? fila.total
    : (fila.porPlan?.[plan as keyof NonNullable<CrmFila["porPlan"]>] ?? 0);
}

// Etiqueta visible del filtro: el valor interno "ESPECIAL" se muestra como
// "PEDIDO ESPECIAL" (pedido del dueño).
const labelPlan = (p: string) => (p === "ESPECIAL" ? "PEDIDO ESPECIAL" : p);

function Chip({
  activo,
  children,
  onClick,
}: {
  activo: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
        activo
          ? "text-white"
          : "bg-white text-stone-600 hover:bg-stone-200 border border-stone-200"
      }`}
      style={
        activo
          ? { background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)` }
          : undefined
      }
    >
      {children}
    </button>
  );
}

export function CrmPanel({
  user,
  modo,
  puedeAsignar = false,
  soloLectura = false,
  onVolver,
}: CrmPanelProps) {
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [ranking, setRanking] = useState<CrmFila[]>([]);
  const [sucursales, setSucursales] = useState<string[]>([]);
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [vistaSucursal, setVistaSucursal] = useState<string>("");
  const [filtro, setFiltro] = useState<string>("GENERAL");
  const [plan, setPlan] = useState<string>("TODOS");
  const [guardandoSuc, setGuardandoSuc] = useState<string | null>(null);
  // Task 170: período de consulta. Por defecto, el MES PASADO.
  const [fechas, setFechas] = useState(() => rangoMes(-1));
  const [preset, setPreset] = useState<"MES_PASADO" | "MES_ACTUAL" | "TODO" | "OTRO">(
    "MES_PASADO"
  );
  const { desde, hasta } = fechas;

  const cargar = useCallback(async (silent = false) => {
    if (silent) setRefrescando(true);
    else setCargando(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      const qs = params.toString();
      const res = await fetch(`/api/crm/ranking${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`);
      setRanking(Array.isArray(data?.ranking) ? data.ranking : []);
      setSucursales(Array.isArray(data?.sucursales) ? data.sucursales : []);
      setTotalGeneral(Number(data?.totalGeneral) || 0);
      setVistaSucursal(
        typeof data?.vistaSucursal === "string" ? data.vistaSucursal : ""
      );
    } catch (error) {
      if (!silent) toast.error(`CRM: ${(error as Error).message}`);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [desde, hasta]);

  // Cambia el período con los atajos (mes pasado / mes actual / todo).
  const aplicarPreset = useCallback(
    (nuevo: "MES_PASADO" | "MES_ACTUAL" | "TODO") => {
      setPreset(nuevo);
      setFechas(
        nuevo === "TODO"
          ? { desde: "", hasta: "" }
          : rangoMes(nuevo === "MES_PASADO" ? -1 : 0)
      );
    },
    []
  );

  // Carga inicial.
  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  // Refresco inmediato: cada 5 s y al volver a la ventana.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (!guardandoSuc) void cargar(true);
    }, 5000);
    const alVolver = () => {
      if (!guardandoSuc) void cargar(true);
    };
    window.addEventListener("focus", alVolver);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("focus", alVolver);
    };
  }, [guardandoSuc, cargar]);

  const guardarSucursal = useCallback(async (email: string, sucursal: string) => {
    setGuardandoSuc(email);
    try {
      const res = await fetch("/api/crm/sucursal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: email, sucursal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`);
      setRanking((prev) =>
        prev.map((f) =>
          f.email.toLowerCase() === email.toLowerCase()
            ? { ...f, sucursal: sucursal || "SIN SUCURSAL" }
            : f
        )
      );
      toast.success(
        sucursal ? `Sucursal asignada: ${sucursal}` : "Asignación de sucursal quitada"
      );
    } catch (error) {
      toast.error(`CRM: ${(error as Error).message}`);
    } finally {
      setGuardandoSuc(null);
    }
  }, []);

  const filtros = useMemo(
    () =>
      modo === "general"
        ? ["GENERAL", ...sucursales.filter((s) => s !== "CENTRAL")]
        : [],
    [modo, sucursales]
  );

  const filas = useMemo(() => {
    return [...ranking]
      .filter((f) => modo !== "general" || filtro === "GENERAL" || f.sucursal === filtro)
      .filter((f) => plan === "TODOS" || ValorPlan(f, plan) > 0)
      .sort(
        (a, b) =>
          ValorPlan(b, plan) - ValorPlan(a, plan) ||
          b.total - a.total ||
          a.name.localeCompare(b.name, "es")
      );
  }, [ranking, modo, filtro, plan]);

  const sumaVista = filas.reduce((acc, f) => acc + ValorPlan(f, plan), 0);
  const aprobadasVista = filas.reduce((acc, f) => acc + f.aprobadas, 0);
  const totalHeader =
    plan === "TODOS"
      ? totalGeneral
      : ranking.reduce((acc, f) => acc + ValorPlan(f, plan), 0);

  // En modo personal el servidor ya devolvió SOLO la fila del usuario.
  const miFila = filas[0] ?? null;
  const sucursalTitulo =
    modo === "general"
      ? filtro === "GENERAL"
        ? "GENERAL (todas las sucursales)"
        : filtro
      : modo === "sucursal"
        ? vistaSucursal || miFila?.sucursal || "MI SUCURSAL"
        : "MI ACTIVIDAD";
  const etiquetaPeriodo =
    !desde && !hasta
      ? "TODO EL HISTÓRICO"
      : `${fmtFechaInput(desde)} al ${fmtFechaInput(hasta)}`;

  return (
    <div className="min-h-screen bg-stone-100">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-30 backdrop-blur shadow-md" style={{ backgroundColor: AZUL }}>
        <div
          className="h-1.5 w-full"
          style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})` }}
        />
        <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onVolver}
              className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`,
                color: AZUL,
              }}
              title="Volver al Orquestador"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ORQUESTADOR</span>
            </button>
            <BarChart3 className="h-5 w-5 text-white shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none truncate">
                CRM · PRESUPUESTOS
              </h1>
              <p className="text-[10px] uppercase tracking-widest font-bold mt-1 truncate" style={{ color: DORADO }}>
                {modo === "general"
                  ? "Ranking general y por sucursal"
                  : modo === "sucursal"
                    ? "Ranking de mi sucursal"
                    : "Solo mis presupuestos"}
                {" · "}
                {etiquetaPeriodo}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold whitespace-nowrap">
              TOTAL EMITIDOS: {totalHeader}
              {plan !== "TODOS" ? ` · ${labelPlan(plan)}` : ""}
            </span>
            <button
              onClick={() => void cargar(true)}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Actualizar ahora"
              aria-label="Actualizar ahora"
            >
              <RefreshCw className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
            </button>
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`,
                color: AZUL,
              }}
              title={user.name || user.email}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* ─── Filtros por sucursal (solo CRM general) ─── */}
        {modo === "general" && filtros.length > 1 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 flex flex-wrap gap-1.5">
            {filtros.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltro(s)}
                className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                  filtro === s
                    ? "text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
                style={
                  filtro === s
                    ? { background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }
                    : undefined
                }
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ─── Filtro por PERÍODO (Task 170, pedido del dueño) ─── */}
        {/* Arranca en el MES PASADO y permite cualquier rango de fechas para
            consultar cuántos presupuestos se emitieron en cada mes. */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mr-1">
            PERÍODO:
          </span>
          <Chip
            activo={preset === "MES_PASADO"}
            onClick={() => aplicarPreset("MES_PASADO")}
          >
            MES PASADO
          </Chip>
          <Chip
            activo={preset === "MES_ACTUAL"}
            onClick={() => aplicarPreset("MES_ACTUAL")}
          >
            MES ACTUAL
          </Chip>
          <Chip activo={preset === "TODO"} onClick={() => aplicarPreset("TODO")}>
            TODO
          </Chip>
          <span className="mx-1 hidden sm:block h-5 w-px bg-stone-200" aria-hidden="true" />
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
            DESDE
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setPreset("OTRO");
                setFechas((f) => ({ ...f, desde: e.target.value }));
              }}
              className="h-7 px-2 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-700 focus:border-[#1e6ba8] focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
            HASTA
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setPreset("OTRO");
                setFechas((f) => ({ ...f, hasta: e.target.value }));
              }}
              className="h-7 px-2 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-700 focus:border-[#1e6ba8] focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </label>
          <span className="text-[11px] font-bold text-stone-500 ml-auto">
            TOTAL DEL PERÍODO: {totalGeneral}
          </span>
        </div>

        {/* ─── Filtro por tipo de plan ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mr-1">
            Tipo de PLAN:
          </span>
          {CRM_PLANES.map((pl) => (
            <Chip key={pl} activo={plan === pl} onClick={() => setPlan(pl)}>
              {labelPlan(pl)}
            </Chip>
          ))}
        </div>

        {/* ─── Modo PERSONAL: solo el conteo propio ─── */}
        {modo === "personal" ? (
          <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center gap-2">
              <Trophy className="h-4 w-4" style={{ color: DORADO_OSCURO }} />
              <h2 className="text-sm font-black text-stone-700 uppercase tracking-wide">
                Mis presupuestos emitidos
              </h2>
            </div>
            {cargando ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#155789]" />
                <p className="text-sm text-stone-600 font-medium">Cargando tus presupuestos…</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5">
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                      Emitidos
                    </p>
                    <p className="text-3xl font-black text-stone-800 mt-1">
                      {miFila ? ValorPlan(miFila, plan) : 0}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">
                      {plan === "TODOS" ? "Todos los planes" : `Plan ${labelPlan(plan)}`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                      Aprobados
                    </p>
                    <p className="text-3xl font-black text-green-700 mt-1">
                      {miFila?.aprobadas ?? 0}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">Presupuestos aprobados</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                      Último
                    </p>
                    <p className="text-3xl font-black text-stone-800 mt-1">
                      {fmtFechaCorta(miFila?.ultimo ?? null)}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">Fecha del último emitido</p>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">
                    Desglose por plan
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    {(["CUOTA", "CONTADO", "MAYORISTA", "SAFRA", "CHEQUE", "ESPECIAL"] as const).map(
                      (p) => (
                        <div
                          key={p}
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                            {p}
                          </p>
                          <p className="text-lg font-black text-stone-700">
                            {miFila?.porPlan?.[p] ?? 0}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {!miFila && (
                  <p className="px-5 pb-5 text-xs text-stone-400">
                    Todavía no registrás presupuestos emitidos. Cuando emitas uno,
                    aparece acá automáticamente.
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
          /* ─── Modo GENERAL / SUCURSAL: tabla del ranking ─── */
          <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="flex-1 overflow-auto">
              {cargando ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-9 w-9 animate-spin text-[#155789]" />
                  <p className="text-sm text-stone-600 font-medium">Calculando ranking…</p>
                </div>
              ) : filas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
                  <BarChart3 className="h-10 w-10 text-stone-300" />
                  <p className="text-sm font-semibold text-stone-600">
                    Sin datos para {modo === "general" ? sucursalTitulo : "tu sucursal"}
                  </p>
                  <p className="text-xs text-stone-400 max-w-sm">
                    El ranking cuenta los presupuestos emitidos. Cuando se emitan,
                    aparecen acá solos.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-stone-100 border-b border-stone-200">
                    <tr className="text-[11px] uppercase tracking-wide text-stone-500">
                      <th className="px-3 py-2 text-left w-12">Pos</th>
                      <th className="px-3 py-2 text-left">Usuario</th>
                      {modo === "general" && (
                        <th className="px-3 py-2 text-left w-[220px]">Sucursal</th>
                      )}
                      <th className="px-3 py-2 text-center w-24">Emitidos</th>
                      <th className="px-3 py-2 text-center w-24">Aprobadas</th>
                      <th className="px-3 py-2 text-center w-20">Último</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => {
                      const pos = i + 1;
                      const medal = medalStyle(pos);
                      return (
                        <tr key={f.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                          <td className="px-3 py-2">
                            {medal ? (
                              <span
                                className="inline-flex items-center justify-center h-6 w-8 rounded-lg text-xs font-bold shadow-sm"
                                style={{ background: medal.bg, color: medal.fg }}
                                title={`${pos}° del ranking`}
                              >
                                {pos}°
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center h-6 w-8 text-xs font-semibold text-stone-400">
                                {pos}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-stone-800 truncate flex items-center gap-1.5">
                              {f.name}
                              {!f.active && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-500 shrink-0">
                                  INACTIVO
                                </span>
                              )}
                              {f.role === "supremo_admin" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0d3d5e] text-white shrink-0">
                                  SUPREMO
                                </span>
                              )}
                              {f.role === "admin" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1e6ba8] text-white shrink-0">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">{f.email}</div>
                          </td>
                          {modo === "general" && (
                            <td className="px-3 py-2">
                              {puedeAsignar && !soloLectura ? (
                                <select
                                  value={f.sucursal === "SIN SUCURSAL" ? "" : f.sucursal}
                                  onChange={(e) =>
                                    void guardarSucursal(f.email, e.target.value)
                                  }
                                  disabled={guardandoSuc === f.email}
                                  className="w-full h-7 px-2 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-700 focus:border-[#1e6ba8] focus:ring-2 focus:ring-blue-100 outline-none disabled:opacity-50"
                                  title="Asignar sucursal del usuario"
                                >
                                  <option value="">— NINGUNA —</option>
                                  {sucursales.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs font-semibold text-stone-600">
                                  {f.sucursal}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center">
                            <span className="text-base font-extrabold text-stone-800">
                              {ValorPlan(f, plan)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`text-sm font-bold ${
                                f.aprobadas > 0 ? "text-green-700" : "text-stone-300"
                              }`}
                            >
                              {f.aprobadas}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-stone-500">
                            {fmtFechaCorta(f.ultimo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ─── Pie: resumen de la vista ─── */}
        <div className="px-1 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span className="font-bold text-stone-700">
            {sucursalTitulo}
            {" · "}
            {etiquetaPeriodo}
            {plan !== "TODOS" ? ` · Plan ${labelPlan(plan)}` : ""}
          </span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              {aprobadasVista} aprobada{aprobadasVista !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-stone-400" />
              {sumaVista} emitido{sumaVista !== 1 ? "s" : ""}
              {modo !== "personal"
                ? ` · ${filas.length} usuario${filas.length !== 1 ? "s" : ""}`
                : ""}
            </span>
          </span>
        </div>
      </main>
    </div>
  );
}
