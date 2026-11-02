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
} from "lucide-react";
import { toast } from "sonner";
import { usePedidoEspecialStore } from "@/store/pedido-especial";
import { calcularPedidoEspecial } from "@/lib/pedido-especial-calc";
import { formatPYG } from "@/lib/format";

// === PEDIDO ESPECIAL (Task 113, pedido del dueño) ===
// Pantalla del VENDEDOR dentro del panel del cotizador:
//   1. Pone el COSTO (en US$ o en Gs — el US$ se convierte con la tasa
//      activa de la Base).
//   2. Selecciona el PROVEEDOR.
//   3. Selecciona el TIPO DE PRODUCTO.
//   4. Escribe la DESCRIPCIÓN del producto.
//   5. Elige el TIPO DE PLAN: CONTADO o CUOTAS (1 a 30).
//   6. El sistema genera el plan con los % de la Base para esa
//      combinación proveedor + tipo (la MISMA fórmula de la BASE:
//      márgenes acumulativos por tramo + redondeo a miles).
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
}

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

export function PlanEspecial() {
  const {
    modoCosto,
    costoStr,
    proveedor,
    tipoProducto,
    descripcion,
    plan,
    cuotas,
    setModoCosto,
    setCostoStr,
    setProveedor,
    setTipoProducto,
    setDescripcion,
    setPlan,
    setCuotas,
    clear,
  } = usePedidoEspecialStore();

  // === Config de la Base (proveedores + tipos + %) y tasa activa ===
  const [combinaciones, setCombinaciones] = useState<CombinacionApi[]>([]);
  const [cambioUS, setCambioUS] = useState(6000);
  const [cargandoConfig, setCargandoConfig] = useState(true);

  const cargarConfig = async () => {
    setCargandoConfig(true);
    try {
      const resCfg = await fetch("/api/pedido-especial/config");
      const dataCfg = await resCfg.json().catch(() => ({}));
      setCombinaciones(Array.isArray(dataCfg.combinaciones) ? dataCfg.combinaciones : []);
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

  // === Listas derivadas de la config (igual que pidió el dueño) ===
  const proveedores = useMemo(
    () => Array.from(new Set(combinaciones.map((c) => c.proveedor))),
    [combinaciones]
  );
  const tiposDelProveedor = useMemo(
    () =>
      Array.from(
        new Set(
          combinaciones
            .filter((c) => c.proveedor === proveedor)
            .map((c) => c.tipoProducto)
        )
      ),
    [combinaciones, proveedor]
  );
  const combinacionElegida = useMemo(
    () =>
      combinaciones.find(
        (c) => c.proveedor === proveedor && c.tipoProducto === tipoProducto
      ) || null,
    [combinaciones, proveedor, tipoProducto]
  );

  // === Cálculo EN VIVO (recalcula solo si el admin cambia un %) ===
  const costo = parseCosto(costoStr);
  const resultado = useMemo(() => {
    if (!costo || !combinacionElegida) return null;
    return calcularPedidoEspecial({
      costo,
      modoCosto,
      cambioUS,
      pctContado: combinacionElegida.pctContado,
      pct1A6: combinacionElegida.pct1A6,
      pct7A13: combinacionElegida.pct7A13,
      pct14A30: combinacionElegida.pct14A30,
      plan,
      cuotas,
    });
  }, [costo, combinacionElegida, modoCosto, cambioUS, plan, cuotas]);

  // Qué falta para poder calcular (hint en pantalla, nada bloqueante).
  const faltantes: string[] = [];
  if (!costo) faltantes.push("el costo");
  if (!proveedor) faltantes.push("el proveedor");
  if (!tipoProducto) faltantes.push("el tipo de producto");
  if (!descripcion.trim()) faltantes.push("la descripción");
  if (costo && proveedor && tipoProducto && !combinacionElegida) {
    faltantes.push(
      "una combinación válida proveedor + tipo (la que tenías elegida ya no está en la Base: apretá ACTUALIZAR y elegí de nuevo)"
    );
  }

  const handleLimpiar = () => {
    if (!costoStr && !proveedor && !tipoProducto && !descripcion && !resultado) return;
    clear();
    toast.success("Pedido especial limpiado");
  };

  const fmtUS = (n: number) => "US$ " + n.toLocaleString("es-PY");

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
            title="Recargar proveedores, tipos y % desde la Base (por si el admin cargó algo nuevo)"
          >
            <RefreshCw className={`h-3 w-3 ${cargandoConfig ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Aviso si la Base todavía no tiene combinaciones cargadas */}
        {!cargandoConfig && combinaciones.length === 0 && (
          <div className="rounded-lg px-3 py-2.5 bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed mb-3 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Todavía no hay PROVEEDORES ni TIPOS DE PRODUCTO con % cargados en la
              Base. Pedile al admin que los cargue en el Panel Admin (Base) con el
              botón <strong>PEDIDO ESPECIAL</strong>.
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

        {/* PROVEEDOR + TIPO DE PRODUCTO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
              Proveedor *
            </label>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-stone-300 text-sm bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none disabled:bg-stone-100 disabled:text-stone-400"
              disabled={proveedores.length === 0}
            >
              <option value="">
                {proveedores.length === 0 ? "Sin proveedores cargados" : "Elegir proveedor…"}
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
              Tipo de producto *
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

      {/* === B. TIPO DE PLAN (contado o cuotas — confirmado por el dueño) === */}
      <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h2
          className="text-xs font-bold uppercase tracking-wide flex items-center gap-2 mb-3"
          style={{ color: AZUL }}
        >
          <Calculator className="h-4 w-4" />
          TIPO DE PLAN
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPlan("contado")}
            className="h-10 px-5 rounded-xl font-bold text-sm transition-all border"
            style={
              plan === "contado"
                ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
                : { backgroundColor: "rgba(21,87,137,0.06)", color: AZUL, borderColor: "rgba(21,87,137,0.35)" }
            }
          >
            CONTADO
          </button>
          <button
            onClick={() => setPlan("cuotas")}
            className="h-10 px-5 rounded-xl font-bold text-sm transition-all border"
            style={
              plan === "cuotas"
                ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
                : { backgroundColor: "rgba(21,87,137,0.06)", color: AZUL, borderColor: "rgba(21,87,137,0.35)" }
            }
          >
            CUOTAS
          </button>
          {plan === "cuotas" && (
            <div className="flex items-center gap-2 ml-1">
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

        {resultado ? (
          <div className="space-y-4">
            {/* Número grande del plan elegido */}
            <div
              className="rounded-xl p-5 text-center"
              style={{ background: "linear-gradient(135deg, #f8fafc 0%, #fffbeb 100%)" }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                {resultado.plan === "contado" ? (
                  "VALOR AL CONTADO"
                ) : (
                  <>VALOR DE CADA CUOTA ({resultado.cuotas} {resultado.cuotas === 1 ? "CUOTA" : "CUOTAS"})</>
                )}
              </p>
              <p
                className="text-3xl sm:text-4xl font-extrabold tracking-tight"
                style={{ color: AZUL_OSCURO }}
              >
                {formatPYG(resultado.plan === "contado" ? resultado.valorContado : resultado.cuotaValor)}
              </p>
              {resultado.plan === "cuotas" && (
                <p className="text-sm font-semibold mt-2" style={{ color: AZUL }}>
                  Total del plan: {formatPYG(resultado.total)} ({resultado.cuotas} × {formatPYG(resultado.cuotaValor)})
                </p>
              )}
            </div>

            {/* Desglose (interno del vendedor, no viaja a ningún lado) */}
            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-stone-500">Costo ingresado</span>
                <span className="font-semibold text-stone-800">
                  {modoCosto === "usd" ? fmtUS(costo || 0) : formatPYG(costo || 0)}
                </span>
              </div>
              {modoCosto === "usd" && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-stone-500">Conversión US$ → Gs</span>
                  <span className="font-semibold text-stone-800">
                    US$ {(costo || 0).toLocaleString("es-PY")} × Gs {resultado.cambioUSUsado.toLocaleString("es-PY")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-stone-500">Costo base (redondeado a miles)</span>
                <span className="font-semibold text-stone-800">{formatPYG(resultado.costoProd)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-stone-500">
                  Combinación aplicada
                </span>
                <span className="font-semibold text-stone-800">
                  {proveedor} · {tipoProducto}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-stone-500">Descripción</span>
                <span className="font-semibold text-stone-800 text-right max-w-[60%] truncate" title={descripcion}>
                  {descripcion}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              Cálculo con la MISMA fórmula de la BASE (márgenes por tramo 1-6 /
              7-13 / 14-30 y redondeo a miles). Cálculo en pantalla únicamente:
              no genera PDF ni guarda registros.
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
    </div>
  );
}
