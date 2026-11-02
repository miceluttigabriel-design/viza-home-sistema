"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Coins,
  DollarSign,
  Store,
  Tag,
  FileText,
  Trash2,
  RefreshCw,
  Info,
  Calendar,
  Landmark,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import { usePedidoEspecialStore } from "@/store/pedido-especial";
import {
  calcularPedidoEspecial,
  esTipoMoto,
  generarFechasCheques,
  diasDesdeEmision,
  diasHastaFecha,
  NOMBRE_PLAN,
  type PlanPedidoEspecial,
} from "@/lib/pedido-especial-calc";
import type { CombinacionPedidoEspecial } from "@/lib/pedido-especial";
import { formatPYG } from "@/lib/format";

// === PEDIDO ESPECIAL (Task 113, pedido del dueño) ===
// Pantalla del VENDEDOR dentro del panel del cotizador:
//   1. Pone el COSTO (en US$ o en Gs — el US$ se convierte con la tasa
//      activa de la Base).
//   2. Selecciona el PROVEEDOR — lista ESTIRADA de la BASE (columna
//      FABRICANTE = "PROVEEDORES", Task 113 v2: "de ahí tiene que
//      estirar… no hace falta que yo importe nada").
//   3. Selecciona el TIPO DE PRODUCTO — lista ESTIRADA de la BASE
//      (columna TIPO = "TIPO PRODUCTO"), filtrada por el proveedor.
//   4. Escribe la DESCRIPCIÓN del producto.
//   5. Elige el TIPO DE PLAN: TODOS los planes de VIZA (Task 113 v2,
//      pedido del dueño: "hay que agregar todos los planes que tenemos
//      incluso si es con entrega o sin entrega… los cálculos siguen la
//      lógica de cada tipo de plan"):
//        CONTADO · CUOTAS CON ENTREGA · CUOTAS SIN ENTREGA ·
//        MAYORISTA · SAFRA · CHEQUE.
//      Cada uno calcula con LA MISMA lógica que ya usa el sistema
//      (márgenes por tramos de la BASE, recargo 3% sin entrega 31-60
//      días, valor técnico del MAYORISTA, interés mensual sobre saldo
//      del SAFRA, tasa 1.5%/3% mensual del CHEQUE).
// SOLO CÁLCULO (confirmado por el dueño): no genera PDF, no guarda en
// la BD, no toca el CRM — el resultado se ve en pantalla, uno por vez.
// El vendedor NO ve ni escribe los %: vienen SIEMPRE de la Base del
// admin, como el precio de la BASE en el cotizador de siempre.

// === VIZA home brand palette (la de todos los planes) ===
const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_CLARO = "#e5cb8a";

interface CombinacionApi {
  id: string;
  proveedor: string;
  tipoProducto: string;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number;
  pctSafra: number;
}

interface CatalogoApi {
  proveedores: string[];
  tiposPorProveedor: Record<string, string[]>;
  tipos: string[];
}

const CATALOGO_VACIO: CatalogoApi = { proveedores: [], tiposPorProveedor: {}, tipos: [] };

// Los 6 planes, en el orden en que se muestran (todos los de VIZA).
const PLANES: PlanPedidoEspecial[] = [
  "contado",
  "cuotas_con_entrega",
  "cuotas_sin_entrega",
  "mayorista",
  "safra",
  "cheque",
];

// Parseo tolerante del costo (mismo espíritu que la TASA DE CAMBIO):
//   "1500000" → 1500000 · "1.500.000" → 1500000 (miles)
//   "2500,5"  → 2500.5  · "1.500,50"  → 1500.5
function parseCosto(s: string): number | null {
  const limpio = String(s || "").trim().replace(/\s/g, "");
  if (!limpio) return null;
  let normalizado = limpio;
  if (limpio.includes(",")) {
    // Con coma decimal: los puntos son miles → fuera puntos, coma → punto.
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    // Solo puntos con grupos de 3: miles ("1.500.000").
    normalizado = limpio.replace(/\./g, "");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Fecha de HOY en ISO local (YYYY-MM-DD), sin UTC — misma mecánica del
// panel de ventas (emisionHoy): el servidor vive en UTC, el vendedor no.
function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "2026-05-12" → "12/05/2026" (para mostrar fechas de cheques/cuotas).
function fechaCorta(iso: string): string {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function PlanEspecial() {
  const {
    modoCosto,
    costoStr,
    proveedor,
    tipoProducto,
    descripcion,
    plan,
    cuotas,
    fechaInicioPago,
    safraEntradaStr,
    safraMeses,
    chequesCantidad,
    chequesFechas,
    setModoCosto,
    setCostoStr,
    setProveedor,
    setTipoProducto,
    setDescripcion,
    setPlan,
    setCuotas,
    setFechaInicioPago,
    setSafraEntradaStr,
    setSafraMeses,
    setChequesCantidad,
    setChequesFechas,
    setFechaCheque,
    clear,
  } = usePedidoEspecialStore();

  // === Config de la Base (%) + CATÁLOGO de la Base (proveedores y tipos
  // estirados de las columnas FABRICANTE y TIPO de Product) + tasa ===
  const [combinaciones, setCombinaciones] = useState<CombinacionApi[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoApi>(CATALOGO_VACIO);
  const [cambioUS, setCambioUS] = useState(6000);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const hoy = useMemo(() => hoyISO(), []);

  const cargarConfig = async () => {
    setCargandoConfig(true);
    try {
      // % cargados por el admin (Base del PEDIDO ESPECIAL).
      const resCfg = await fetch("/api/pedido-especial/config");
      const dataCfg = await resCfg.json().catch(() => ({}));
      setCombinaciones(Array.isArray(dataCfg.combinaciones) ? dataCfg.combinaciones : []);
      // Catálogo de la BASE: TODOS los proveedores (FABRICANTE) y tipos
      // (TIPO) que existen en los productos — pedido del dueño (v2).
      const resCat = await fetch("/api/pedido-especial/catalogo");
      const dataCat = await resCat.json().catch(() => ({}));
      setCatalogo({
        proveedores: Array.isArray(dataCat.proveedores) ? dataCat.proveedores : [],
        tiposPorProveedor:
          dataCat.tiposPorProveedor && typeof dataCat.tiposPorProveedor === "object"
            ? dataCat.tiposPorProveedor
            : {},
        tipos: Array.isArray(dataCat.tipos) ? dataCat.tipos : [],
      });
      const resTasa = await fetch("/api/config-cambio");
      const dataTasa = await resTasa.json().catch(() => ({}));
      const us = Number(dataTasa?.tasas?.cambioUS);
      if (Number.isFinite(us) && us > 0) setCambioUS(us);
    } catch {
      // silent: la UI muestra "sin combinaciones" y la tasa default
    } finally {
      setCargandoConfig(false);
    }
  };

  useEffect(() => {
    cargarConfig();
  }, []);

  // === Listas de PROVEEDOR y TIPO — ESTIRADAS DE LA BASE ===
  // Si el catálogo de la BASE todavía no cargó (o falla), respaldo con las
  // combinaciones que ya tienen % (así la pantalla NUNCA queda inutilizable).
  const proveedores = useMemo(() => {
    if (catalogo.proveedores.length > 0) return catalogo.proveedores;
    return Array.from(new Set(combinaciones.map((c) => c.proveedor)));
  }, [catalogo, combinaciones]);

  const tiposDelProveedor = useMemo(() => {
    if (proveedor && catalogo.tiposPorProveedor[proveedor]?.length) {
      return catalogo.tiposPorProveedor[proveedor];
    }
    // Respaldo 1: todos los tipos de la BASE. Respaldo 2: los de la config.
    if (catalogo.tipos.length > 0) return catalogo.tipos;
    return Array.from(
      new Set(
        combinaciones
          .filter((c) => c.proveedor === proveedor)
          .map((c) => c.tipoProducto)
      )
    );
  }, [catalogo, proveedor, combinaciones]);

  const combinacionElegida = useMemo(
    () =>
      combinaciones.find(
        (c) => c.proveedor === proveedor && c.tipoProducto === tipoProducto
      ) || null,
    [combinaciones, proveedor, tipoProducto]
  );

  // ¿Cuántas combinaciones tienen % cargados? (aviso chico en pantalla)
  const conPorcentaje = combinaciones.length;

  // === Parámetros específicos del plan elegido ===
  const esMoto = useMemo(() => esTipoMoto(tipoProducto), [tipoProducto]);
  const diasSinEntrega = useMemo(() => diasHastaFecha(fechaInicioPago), [fechaInicioPago]);
  const safraEntrada = useMemo(() => parseCosto(safraEntradaStr) || 0, [safraEntradaStr]);

  // === Cálculo EN VIVO (recalcula solo si el admin cambia un %) ===
  const costo = parseCosto(costoStr);
  const resultado = useMemo(() => {
    if (!costo) return null;
    return calcularPedidoEspecial({
      costo,
      modoCosto,
      cambioUS,
      pctContado: combinacionElegida?.pctContado ?? 0,
      pct1A6: combinacionElegida?.pct1A6 ?? 0,
      pct7A13: combinacionElegida?.pct7A13 ?? 0,
      pct14A30: combinacionElegida?.pct14A30 ?? 0,
      pctTecnico: combinacionElegida?.pctTecnico ?? 0,
      pctSafra: combinacionElegida?.pctSafra ?? 0,
      plan,
      cuotas,
      diasSinEntrega,
      safraEntrada,
      safraMeses,
      chequesCantidad,
      chequesFechas,
      esMoto,
      fechaEmision: hoy,
    });
  }, [
    costo,
    combinacionElegida,
    modoCosto,
    cambioUS,
    plan,
    cuotas,
    diasSinEntrega,
    safraEntrada,
    safraMeses,
    chequesCantidad,
    chequesFechas,
    esMoto,
    hoy,
  ]);

  // Resultado VÁLIDO para mostrar (cheque necesita sus fechas; safra su
  // cronograma; el resto el número principal).
  const resultadoOk = useMemo(() => {
    if (!resultado) return null;
    if (plan === "cheque" && resultado.cheques.length === 0) return null;
    if (plan === "safra" && resultado.cronograma.length === 0) return null;
    return resultado;
  }, [resultado, plan]);

  // Qué falta para poder calcular (hint en pantalla, nada bloqueante).
  const faltantes: string[] = [];
  if (!costo) faltantes.push("el costo");
  if (!proveedor) faltantes.push("el proveedor");
  if (!tipoProducto) faltantes.push("el tipo de producto");
  if (!descripcion.trim()) faltantes.push("la descripción");
  if (costo && proveedor && tipoProducto && !combinacionElegida) {
    faltantes.push(
      "los % de esta combinación (el admin los carga en Panel Admin → Base → PEDIDO ESPECIAL; apretá ACTUALIZAR después de cargarlos)"
    );
  }
  if (plan === "cuotas_sin_entrega") {
    if (!fechaInicioPago) faltantes.push("la fecha de inicio de pago");
    else if (diasSinEntrega !== null && diasSinEntrega < 0)
      faltantes.push("una fecha de inicio de pago que no sea pasada");
    else if (diasSinEntrega !== null && diasSinEntrega > 60)
      faltantes.push(`una fecha de inicio dentro de los 60 días (elegiste ${diasSinEntrega} días)`);
  }
  if (plan === "safra" && safraEntrada > 0 && resultado && resultado.valorContado > 0 && safraEntrada >= resultado.valorContado) {
    faltantes.push("una ENTRADA menor al valor al contado del plan");
  }
  if (plan === "cheque") {
    const validas = chequesFechas.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).length;
    if (validas < chequesCantidad)
      faltantes.push(`las fechas de los ${chequesCantidad} cheques (botón GENERAR FECHAS)`);
    else {
      const fuera = chequesFechas.some((f) => {
        const d = diasDesdeEmision(f, hoy);
        return d === null || d > 180;
      });
      if (fuera) faltantes.push("fechas de cheques dentro de los 180 días desde hoy");
    }
  }

  const handleLimpiar = () => {
    if (
      !costoStr &&
      !proveedor &&
      !tipoProducto &&
      !descripcion &&
      !fechaInicioPago &&
      !safraEntradaStr &&
      chequesFechas.length === 0 &&
      !resultadoOk
    )
      return;
    clear();
    toast.success("Pedido especial limpiado");
  };

  const handleGenerarFechasCheques = () => {
    const fechas = generarFechasCheques(chequesCantidad, hoy);
    setChequesFechas(fechas);
    toast.success(`Fechas generadas: ${chequesCantidad} cheques a 30 días entre sí`);
  };

  const fmtUS = (n: number) => "US$ " + n.toLocaleString("es-PY");

  // Botón de TIPO DE PLAN (los 6 del sistema, mismo estilo de siempre).
  const botonPlan = (p: PlanPedidoEspecial) => (
    <button
      key={p}
      onClick={() => setPlan(p)}
      className="h-10 px-4 rounded-xl font-bold text-[13px] transition-all border"
      style={
        plan === p
          ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
          : { backgroundColor: "rgba(21,87,137,0.06)", color: AZUL, borderColor: "rgba(21,87,137,0.35)" }
      }
    >
      {NOMBRE_PLAN[p]}
    </button>
  );

  // Fila simple del desglose interno.
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-center justify-between px-4 py-2.5 gap-3">
      <span className="text-stone-500 shrink-0">{etiqueta}</span>
      <span className="font-semibold text-stone-800 text-right">{valor}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* === A. DATOS DEL PEDIDO (costo + proveedor + tipo + descripción) === */}
      <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2
            className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"
            style={{ color: AZUL }}
          >
            <Store className="h-4 w-4" />
            PEDIDO ESPECIAL
          </h2>
          <button
            onClick={cargarConfig}
            disabled={cargandoConfig}
            className="text-[11px] font-semibold text-stone-500 hover:text-sky-700 transition-colors flex items-center gap-1 disabled:opacity-50"
            title="Recargar proveedores, tipos y % desde la BASE (por si el admin cargó algo nuevo)"
          >
            <RefreshCw className={`h-3 w-3 ${cargandoConfig ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Aviso si la Base todavía no tiene combinaciones con % */}
        {!cargandoConfig && conPorcentaje === 0 && (
          <div className="rounded-lg px-3 py-2.5 bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed mb-3 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Todavía no hay combinaciones con % cargados en la Base. Pedile al admin
              que las cargue en el Panel Admin (Base) con el botón{" "}
              <strong>PEDIDO ESPECIAL</strong>.
            </span>
          </div>
        )}

        {/* COSTO: moneda + monto directo (como pidió el dueño) */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
            Costo del producto *
          </label>
          <div className="flex gap-2">
            {/* Toggle de moneda: US$ / Gs */}
            <div className="flex rounded-lg overflow-hidden border border-stone-300 shrink-0">
              <button
                onClick={() => setModoCosto("usd")}
                className="h-10 px-3 text-xs font-bold flex items-center gap-1 transition-colors"
                style={
                  modoCosto === "usd"
                    ? { backgroundColor: AZUL, color: "#fff" }
                    : { backgroundColor: "#fff", color: AZUL }
                }
                title="Costo en Dólares (se convierte con la tasa activa de la Base)"
              >
                <DollarSign className="h-3.5 w-3.5" />
                US$
              </button>
              <button
                onClick={() => setModoCosto("gs")}
                className="h-10 px-3 text-xs font-bold flex items-center gap-1 transition-colors border-l border-stone-300"
                style={
                  modoCosto === "gs"
                    ? { backgroundColor: AZUL, color: "#fff" }
                    : { backgroundColor: "#fff", color: AZUL }
                }
                title="Costo directo en Guaraníes"
              >
                <Coins className="h-3.5 w-3.5" />
                GS
              </button>
            </div>
            <input
              type="text"
              value={costoStr}
              onChange={(e) => setCostoStr(e.target.value)}
              inputMode="decimal"
              placeholder={modoCosto === "usd" ? "Ej: 2500" : "Ej: 15.000.000"}
              className="flex-1 h-10 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
            />
          </div>
          {/* Hint de conversión con la tasa activa (US$ → Gs) */}
          {modoCosto === "usd" && costo && (
            <p className="text-[11px] mt-1" style={{ color: AZUL }}>
              = {formatPYG(costo * cambioUS)} (cambio activo: US$ 1 = Gs {cambioUS.toLocaleString("es-PY")})
            </p>
          )}
        </div>

        {/* PROVEEDOR + TIPO DE PRODUCTO — ESTIRADOS DE LA BASE (v2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
              Proveedor * <span className="normal-case text-stone-400">(de la BASE)</span>
            </label>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none disabled:bg-stone-100 disabled:text-stone-400"
              disabled={proveedores.length === 0}
            >
              <option value="">
                {proveedores.length === 0 ? "Sin proveedores en la BASE" : "Elegir proveedor…"}
              </option>
              {proveedores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
              Tipo de producto * <span className="normal-case text-stone-400">(de la BASE)</span>
            </label>
            <select
              value={tipoProducto}
              onChange={(e) => setTipoProducto(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none disabled:bg-stone-100 disabled:text-stone-400"
              disabled={tiposDelProveedor.length === 0}
            >
              <option value="">
                {proveedor
                  ? tiposDelProveedor.length === 0
                    ? "Sin tipos para este proveedor"
                    : "Elegir tipo…"
                  : "Primero el proveedor"}
              </option>
              {tiposDelProveedor.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* DESCRIPCIÓN del producto (la escribe el vendedor) */}
        <div>
          <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1 flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Descripción del producto *
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Moto Zanella 110 Z1 Base 2025 roja"
            className="w-full h-10 px-3 rounded-lg border border-stone-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
          />
          <p className="text-[11px] text-stone-400 mt-1">
            Los % se aplican SOLOS según el proveedor + tipo elegidos (cargados
            en la Base del admin). El vendedor no los toca.
          </p>
        </div>
      </section>

      {/* === B. TIPO DE PLAN — TODOS los planes de VIZA (v2, pedido del dueño) === */}
      <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h2
          className="text-xs font-bold uppercase tracking-wide flex items-center gap-2 mb-3"
          style={{ color: AZUL }}
        >
          <Calculator className="h-4 w-4" />
          TIPO DE PLAN
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLANES.map(botonPlan)}
        </div>

        {/* Parámetros del plan elegido */}
        <div className="mt-4 space-y-3">
          {(plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega") && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap">
                  Cantidad:
                </label>
                <select
                  value={cuotas}
                  onChange={(e) => setCuotas(Number(e.target.value))}
                  className="h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "cuota" : "cuotas"}
                    </option>
                  ))}
                </select>
              </div>
              {plan === "cuotas_sin_entrega" && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Inicio de pago:
                    </label>
                    <input
                      type="date"
                      value={fechaInicioPago}
                      min={hoy}
                      onChange={(e) => setFechaInicioPago(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500 leading-snug basis-full">
                    Misma regla del cotizador: 0-30 días = mismo valor que CON
                    ENTREGA · 31-60 días = recargo del 3% · más de 60 días no se
                    permite.
                    {diasSinEntrega !== null && diasSinEntrega >= 0 && diasSinEntrega <= 60 && (
                      <strong style={{ color: AZUL }}>
                        {" "}
                        Elegiste {diasSinEntrega} días →{" "}
                        {diasSinEntrega <= 30 ? "sin recargo" : "recargo 3%"}.
                      </strong>
                    )}
                  </p>
                </>
              )}
            </div>
          )}

          {plan === "mayorista" && (
            <p className="text-[11px] text-stone-500 leading-snug">
              Valor TÉCNICO de la BASE: <strong>Costo Gs × (1 + % técnico)</strong> —
              el % técnico se carga por combinación en la Base (sin cuotas, igual
              que el plan MAYORISTA de siempre).
            </p>
          )}

          {plan === "safra" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap flex items-center gap-1">
                  <Landmark className="h-3 w-3" />
                  Entrada (Gs):
                </label>
                <input
                  type="text"
                  value={safraEntradaStr}
                  onChange={(e) => setSafraEntradaStr(e.target.value)}
                  inputMode="decimal"
                  placeholder="0 = sin entrada"
                  className="w-36 h-10 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap">
                  Refuerzos (meses):
                </label>
                <select
                  value={safraMeses}
                  onChange={(e) => setSafraMeses(Number(e.target.value))}
                  className="h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                >
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "mes" : "meses"}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-stone-500 leading-snug basis-full">
                Misma lógica del plan SAFRA: interés MENSUAL sobre el saldo
                restante con la tasa de la combinación — menos meses = menos
                intereses. El último refuerzo ajusta para que el plan CUADRE.
              </p>
            </div>
          )}

          {plan === "cheque" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap">
                    Cantidad de cheques:
                  </label>
                  <select
                    value={chequesCantidad}
                    onChange={(e) => setChequesCantidad(Number(e.target.value))}
                    className="h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "cheque" : "cheques"}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleGenerarFechasCheques}
                  className="h-10 px-4 rounded-lg font-bold text-xs flex items-center gap-1.5 border transition-colors hover:brightness-105"
                  style={{ backgroundColor: DORADO_CLARO, color: AZUL_OSCURO, borderColor: DORADO }}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  GENERAR FECHAS
                </button>
              </div>
              {chequesFechas.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {chequesFechas.map((f, i) => {
                    const d = diasDesdeEmision(f, hoy);
                    const fuera = d === null || d > 180;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-stone-500 w-14">
                          Cheque {i + 1}:
                        </span>
                        <input
                          type="date"
                          value={f}
                          min={hoy}
                          onChange={(e) => setFechaCheque(i, e.target.value)}
                          className={`h-9 px-2 rounded-md border-2 bg-white text-xs font-semibold outline-none w-full ${
                            fuera ? "border-rose-400" : "border-stone-200 focus:border-amber-400"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-stone-500 leading-snug">
                Misma lógica del plan CON CHEQUE: todos los cheques con el MISMO
                valor; tasa mensual 1.5% si el TIPO es MOTO
                {esMoto ? " (tu tipo lo es)" : ""} / 3% resto
                {tipoProducto && !esMoto ? " (tu tipo no lo es)" : ""} · plazo
                máximo 180 días.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* === C. RESULTADO (solo cálculo en pantalla, como pidió el dueño) === */}
      <section className="bg-white rounded-2xl border-2 p-5 shadow-sm" style={{ borderColor: DORADO }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2
            className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"
            style={{ color: AZUL }}
          >
            <FileText className="h-4 w-4" />
            RESULTADO
          </h2>
          <button
            onClick={handleLimpiar}
            className="text-[11px] font-semibold text-stone-500 hover:text-rose-600 transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Limpiar
          </button>
        </div>

        {resultadoOk ? (
          <div className="space-y-4">
            {/* Número grande del plan elegido */}
            <div
              className="rounded-xl p-5 text-center"
              style={{ background: "linear-gradient(135deg, #f8fafc 0%, #fffbeb 100%)" }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                {plan === "contado" && "VALOR AL CONTADO"}
                {plan === "cuotas_con_entrega" && (
                  <>VALOR DE CADA CUOTA ({resultadoOk.cuotas} {resultadoOk.cuotas === 1 ? "CUOTA" : "CUOTAS"})</>
                )}
                {plan === "cuotas_sin_entrega" && (
                  <>
                    VALOR DE CADA CUOTA ({resultadoOk.cuotas}{" "}
                    {resultadoOk.cuotas === 1 ? "CUOTA" : "CUOTAS"}) — SIN ENTREGA
                    {resultadoOk.recargoSinEntregaPct > 0 ? " (+3%)" : ""}
                  </>
                )}
                {plan === "mayorista" && "TOTAL MAYORISTA (VALOR TÉCNICO)"}
                {plan === "safra" && "TOTAL DEL PLAN SAFRA"}
                {plan === "cheque" && (
                  <>VALOR DE CADA CHEQUE ({resultadoOk.cheques.length})</>
                )}
              </p>
              <p
                className="text-3xl sm:text-4xl font-extrabold tracking-tight"
                style={{ color: AZUL_OSCURO }}
              >
                {formatPYG(
                  plan === "contado"
                    ? resultadoOk.valorContado
                    : plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega"
                      ? resultadoOk.cuotaValor
                      : plan === "mayorista"
                        ? resultadoOk.valorTecnico
                        : plan === "cheque"
                          ? resultadoOk.cheques[0]?.valor || 0
                          : resultadoOk.total
                )}
              </p>
              {(plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega") && (
                <p className="text-sm font-semibold mt-2" style={{ color: AZUL }}>
                  Total del plan: {formatPYG(resultadoOk.total)} ({resultadoOk.cuotas} ×{" "}
                  {formatPYG(resultadoOk.cuotaValor)})
                </p>
              )}
              {plan === "cuotas_sin_entrega" && fechaInicioPago && (
                <p className="text-sm font-semibold mt-1" style={{ color: AZUL }}>
                  1ª cuota: {fechaCorta(fechaInicioPago)} ·{" "}
                  {resultadoOk.recargoSinEntregaPct > 0
                    ? "recargo 3% (31-60 días)"
                    : "sin recargo (0-30 días)"}
                </p>
              )}
              {plan === "safra" && (
                <p className="text-sm font-semibold mt-2" style={{ color: AZUL }}>
                  Intereses totales: {formatPYG(resultadoOk.totalIntereses)}
                  {safraEntrada > 0 && <> · Entrada: {formatPYG(safraEntrada)}</>} ·{" "}
                  {safraMeses} refuerzo{safraMeses === 1 ? "" : "s"} mensual
                  {safraMeses === 1 ? "" : "es"}
                </p>
              )}
              {plan === "cheque" && (
                <p className="text-sm font-semibold mt-2" style={{ color: AZUL }}>
                  Total a pagar: {formatPYG(resultadoOk.total)} ({resultadoOk.cheques.length} ×{" "}
                  {formatPYG(resultadoOk.cheques[0]?.valor || 0)}) · Tasa{" "}
                  {esMoto ? "1.5%" : "3%"} mensual
                </p>
              )}
            </div>

            {/* Tabla del cronograma SAFRA (misma estructura del plan real) */}
            {plan === "safra" && resultadoOk.cronograma.length > 0 && (
              <div className="rounded-xl border border-stone-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-600 uppercase text-[10px]">
                      <th className="text-center px-3 py-2 font-bold">MES</th>
                      <th className="text-left px-3 py-2 font-bold">CONCEPTO</th>
                      <th className="text-right px-3 py-2 font-bold">PAGO</th>
                      <th className="text-right px-3 py-2 font-bold">INTERÉS DEL MES</th>
                      <th className="text-right px-3 py-2 font-bold">SALDO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {resultadoOk.cronograma.map((f, i) => (
                      <tr key={i} className={"hover:bg-stone-50 " + (i === resultadoOk.cronograma.length - 1 ? "bg-amber-50/60" : "")}>
                        <td className="px-3 py-2 text-center font-bold text-stone-700">{f.mes}</td>
                        <td className="px-3 py-2 font-semibold text-stone-800">{f.concepto}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">
                          {formatPYG(f.pagoMostrado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                          {formatPYG(f.interes)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                          {formatPYG(Math.max(0, f.saldoFinal))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-stone-100 border-t-2 border-stone-300">
                      <td colSpan={2} className="px-3 py-2 text-right font-bold uppercase text-[10px] text-stone-600">
                        Total del plan:
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-extrabold" style={{ color: AZUL }}>
                        {formatPYG(resultadoOk.total)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[10px] text-stone-500">
                        + {formatPYG(resultadoOk.totalIntereses)} interés
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Tabla de cheques (misma estructura del plan real) */}
            {plan === "cheque" && resultadoOk.cheques.length > 0 && (
              <div className="rounded-xl border border-stone-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-600 uppercase text-[10px]">
                      <th className="text-center px-3 py-2 font-bold">N° CHEQUE</th>
                      <th className="text-center px-3 py-2 font-bold">VENCIMIENTO</th>
                      <th className="text-right px-3 py-2 font-bold">VALOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {resultadoOk.cheques.map((c) => (
                      <tr key={c.numero} className="hover:bg-stone-50">
                        <td className="px-3 py-2 text-center font-bold text-stone-700">
                          {c.numero}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-stone-700">
                          {fechaCorta(c.fecha)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">
                          {formatPYG(c.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Desglose (interno del vendedor, no viaja a ningún lado) */}
            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 text-sm">
              {fila(
                "Costo ingresado",
                modoCosto === "usd" ? fmtUS(costo || 0) : formatPYG(costo || 0)
              )}
              {modoCosto === "usd" &&
                fila(
                  "Conversión US$ → Gs",
                  `US$ ${(costo || 0).toLocaleString("es-PY")} × Gs ${resultadoOk.cambioUSUsado.toLocaleString("es-PY")}`
                )}
              {plan === "mayorista"
                ? fila("Costo Gs (col G de la BASE)", formatPYG(resultadoOk.costoGs))
                : fila("Costo base (redondeado a miles)", formatPYG(resultadoOk.costoProd))}
              {fila("Combinación aplicada", `${proveedor} · ${tipoProducto}`)}
              {fila("Descripción", (
                <span className="max-w-[60%] truncate inline-block align-bottom" title={descripcion}>
                  {descripcion}
                </span>
              ))}
              {(plan === "contado" ||
                plan === "cuotas_con_entrega" ||
                plan === "cuotas_sin_entrega" ||
                plan === "safra" ||
                plan === "cheque") &&
                fila("% contado de la combinación", `${resultadoOk.margenAplicado} %`)}
              {plan === "cuotas_con_entrega" &&
                fila("Margen de la cuota (tramos 1-6/7-13/14-30)", `${resultadoOk.margenAplicado} %`)}
              {plan === "cuotas_sin_entrega" && (
                <>
                  {fila("Recargo SIN ENTREGA", `${resultadoOk.recargoSinEntregaPct} %`)}
                  {fechaInicioPago && fila("Inicio de la 1ª cuota", fechaCorta(fechaInicioPago))}
                </>
              )}
              {plan === "mayorista" &&
                fila("% técnico de la combinación", `${resultadoOk.margenAplicado} %`)}
              {plan === "safra" && (
                <>
                  {fila("Tasa SAFRA (interés mensual)", `${combinacionElegida?.pctSafra ?? 0} %`)}
                  {fila("Entrada", formatPYG(safraEntrada))}
                  {fila("Refuerzos", `${safraMeses} mensual${safraMeses === 1 ? "" : "es"}`)}
                  {fila("Total intereses", formatPYG(resultadoOk.totalIntereses))}
                </>
              )}
              {plan === "cheque" && (
                <>
                  {fila("Tasa mensual", `${resultadoOk.tasaChequePct} % (${esMoto ? "MOTO" : "GENERAL"})`)}
                  {fila("Plazo promedio", `${resultadoOk.plazoPromedioMeses.toFixed(1)} meses`)}
                  {fila("Base financiada (valor contado)", formatPYG(resultadoOk.valorContado))}
                </>
              )}
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              {plan === "contado" &&
                "MISMA fórmula de la BASE: costo a miles × (1 + % contado). Cálculo en pantalla únicamente: no genera PDF ni guarda registros."}
              {(plan === "cuotas_con_entrega" || plan === "cuotas_sin_entrega") &&
                "MISMA fórmula de la BASE (márgenes por tramo 1-6 / 7-13 / 14-30 y redondeo a miles, igual que el cotizador). Cálculo en pantalla únicamente: no genera PDF ni guarda registros."}
              {plan === "mayorista" &&
                "MISMA fórmula de la BASE (col CV): Valor Técnico = Costo Gs × (1 + % técnico), como el plan MAYORISTA. Cálculo en pantalla únicamente."}
              {plan === "safra" &&
                "MISMA lógica del plan SAFRA: interés mensual sobre el saldo restante, refuerzos al millar superior y último pago ajustado para que cuadre. Cálculo en pantalla únicamente."}
              {plan === "cheque" &&
                "MISMA lógica del plan CON CHEQUE: base = valor contado, plazo promedio (días/30) y cheques con el mismo valor al millar superior. Cálculo en pantalla únicamente."}
            </p>
          </div>
        ) : (
          <div className="py-6 text-center">
            <Calculator className="h-10 w-10 text-stone-300 mx-auto mb-2" />
            {faltantes.length > 0 ? (
              <p className="text-sm font-medium text-stone-500">
                Completá <span className="font-bold text-stone-700">{faltantes.join(", ")}</span> para
                ver el plan
              </p>
            ) : (
              <p className="text-sm font-medium text-stone-500">
                Elegí el tipo de plan para ver el resultado
              </p>
            )}
            <p className="text-xs text-stone-400 mt-1">
              El resultado aparece solo en cuanto completás los datos
            </p>
          </div>
        )}
      </section>

      {/* Recordatorio discreto de qué plan usa qué (guía rápida) */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-[11px] font-bold uppercase text-stone-500 mb-2 flex items-center gap-1.5">
          <Table2 className="h-3.5 w-3.5" />
          Qué usa cada plan (los % los carga el admin en la Base)
        </p>
        <ul className="text-[11px] text-stone-600 leading-relaxed space-y-1">
          <li>
            <strong>CONTADO / CUOTAS:</strong> % contado + tramos 1-6 / 7-13 / 14-30
            (misma estructura de la BASE).
          </li>
          <li>
            <strong>MAYORISTA:</strong> % técnico (Costo Gs × (1 + %), como el VALOR
            TÉCNICO de la BASE).
          </li>
          <li>
            <strong>SAFRA:</strong> % SAFRA = tasa de interés mensual sobre el saldo
            restante.
          </li>
          <li>
            <strong>CHEQUE:</strong> tasa automática 1.5% (tipo MOTO) / 3% (resto),
            base = valor al contado.
          </li>
        </ul>
      </div>
    </div>
  );
}
