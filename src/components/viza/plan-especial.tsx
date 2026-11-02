"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Coins,
  DollarSign,
  Store,
  Tag,
  FileText,
  Trash2,
  RefreshCw,
  Calendar,
  Landmark,
  History,
  CheckCircle2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { usePedidoEspecialStore } from "@/store/pedido-especial";
import {
  calcularPedidoEspecial,
  esTipoMoto,
  generarFechasCheques,
  diasDesdeEmision,
  diasHastaFecha,
  formatearMontoInput,
  NOMBRE_PLAN,
  type PlanPedidoEspecial,
} from "@/lib/pedido-especial-calc";
import type { CombinacionPedidoEspecial } from "@/lib/pedido-especial";
import type { PresupuestoPedidoEspecial } from "@/lib/pedido-especial-presupuestos";
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
// Task 113 v3 (pedido del dueño): además de calcular en pantalla, el
// vendedor puede GUARDAR el presupuesto → queda en el HISTORIAL con
// situación GENERADO, puede MARCARLO APROBADO y puede IMPRIMIRLO (PDF
// con el mismo diseño VIZA del resto de los presupuestos). El encargado
// de sucursal ve el historial de SU sucursal con la situación de cada
// uno (el número ESPECIAL-01, 02… sale del servidor junto con el
// recálculo: lo guardado siempre es lo visto).
// Task 113 v4 (pedido del dueño): los % NO se cargan a mano — salen
// SOLOS de la BASE (promedio real de los productos del proveedor + tipo
// elegidos, calculado en el servidor; la MISMA regla de márgenes
// automáticas de la casa). El dueño: "vas a usar TODAS las lógicas de
// la BASE, lo único que cambia es que el costo lo ponemos manualmente".
// También v4: fuera los textos técnicos de la pantalla (fórmulas, %,
// tasas, plazos): el vendedor solo ve costo, datos y resultado.
// El campo de costo (y la entrada del SAFRA) formatean SOLOS los miles
// con puntito mientras se escribe: "15000000" → "15.000.000".

// ─── INPUT DE MONTO con puntito automático (Task 113 v3) ───
// Formatea MIENTRAS se escribe: separa miles con punto y acepta coma
// decimal (2.500,50). Cuida el cursor (mapearCaret) y el backspace
// sobre un separador (borra el dígito de una, para que no se "atasque").
function mapearCaret(viejo: string, nuevo: string, caret: number): number {
  const esSig = (c: string) => /[\d,]/.test(c);
  let sig = 0;
  for (let i = 0; i < caret && i < viejo.length; i++) {
    if (esSig(viejo[i])) sig++;
  }
  let cont = 0;
  let i = 0;
  while (i < nuevo.length && cont < sig) {
    if (esSig(nuevo[i])) cont++;
    i++;
  }
  return i;
}

function CampoMonto({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  // Tras cada cambio de valor, ubica el cursor donde le corresponde
  // (solo si el último onChange lo pidió: las actualizaciones externas
  // del store no mueven el cursor).
  useEffect(() => {
    if (caretRef.current !== null && ref.current) {
      try {
        ref.current.setSelectionRange(caretRef.current, caretRef.current);
      } catch {
        // inputs sin selección: nada que hacer
      }
      caretRef.current = null;
    }
  }, [value]);

  const formatear = (raw: string, caret: number) => {
    const nuevo = formatearMontoInput(raw);
    caretRef.current = mapearCaret(raw, nuevo, caret);
    onChange(nuevo);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) =>
        formatear(e.target.value, e.target.selectionStart ?? e.target.value.length)
      }
      onKeyDown={(e) => {
        // Backspace sobre un separador ("1.500" borrando el "."):
        // el formateador lo volvería a poner y el input se atasca.
        // Solución: borrar el separador + el dígito anterior de una vez.
        if (e.key !== "Backspace" || !ref.current) return;
        const el = ref.current;
        const pos = el.selectionStart ?? el.value.length;
        const fin = el.selectionEnd ?? pos;
        if (pos === fin && pos > 0) {
          const c = el.value[pos - 1];
          if (c === "." || c === ",") {
            e.preventDefault();
            const raw = el.value.slice(0, pos - 2) + el.value.slice(pos);
            formatear(raw, pos - 2);
          }
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

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
  // Task 113 v4: los % de cada par (fabricante, tipo), resueltos en el
  // servidor desde la BASE (promedio de los productos del par + respaldo
  // del panel del admin). Números LEGIBLES (10 = 10%).
  porcentajes: PorcentajesApi[];
}

interface PorcentajesApi {
  fabricante: string;
  tipo: string;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number;
  pctSafra: number;
}

const CATALOGO_VACIO: CatalogoApi = {
  proveedores: [],
  tiposPorProveedor: {},
  tipos: [],
  porcentajes: [],
};

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

// ─── Helpers de presentación del HISTORIAL (Task 113 v3) ───

// "2026-11-02T14:30:00.000Z" → "02/11/2026" (fecha local del dispositivo).
function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// El MONTO PRINCIPAL de cada plan (lo mismo que muestra la pantalla
// grande del resultado: contado → valorContado, cuotas → cuota, etc.).
function montoPrincipal(p: PresupuestoPedidoEspecial): number {
  switch (p.plan) {
    case "contado":
      return p.valorContado;
    case "cuotas_con_entrega":
    case "cuotas_sin_entrega":
      return p.cuotaValor;
    case "mayorista":
      return p.valorTecnico;
    case "cheque":
      return p.detalle?.cheques?.[0]?.valor || 0;
    default:
      return p.total;
  }
}

// Aclaración chica debajo del plan/valor del historial.
function lineaValorPresupuesto(p: PresupuestoPedidoEspecial): string {
  if (p.plan === "cuotas_con_entrega" || p.plan === "cuotas_sin_entrega") {
    return p.cuotas > 0 ? `${p.cuotas} × ${formatPYG(p.cuotaValor)}` : "";
  }
  if (p.plan === "cheque") {
    const n = p.detalle?.cheques?.length || p.cuotas || 0;
    return n ? `${n} cheque${n !== 1 ? "s" : ""}` : "";
  }
  if (p.plan === "safra" && p.totalIntereses > 0) {
    return `incluye ${formatPYG(p.totalIntereses)} de intereses`;
  }
  if (p.plan === "mayorista") return "valor técnico";
  if (p.plan === "contado") return "al contado";
  return "";
}

// Costo original tal cual lo puso el vendedor (para que el encargado vea
// con qué costo se trabajó: "US$ 2.500" o "Gs 15.000.000").
function modoCostoFila(p: PresupuestoPedidoEspecial): string {
  const costo = p.costoOriginal || 0;
  if (!costo) return "";
  return p.modoCosto === "usd"
    ? `costo US$ ${costo.toLocaleString("es-PY")}`
    : `costo ${formatPYG(costo)}`;
}

export function PlanEspecial({
  userEmail = "",
  puedeVerTodo = false,
  puedeAprobarTodo = false,
}: {
  // Email del usuario logueado (para saber cuáles presupuestos son suyos:
  // el dueño puede marcarlos APROBADO).
  userEmail?: string;
  // true = encargado de sucursal / admin: el historial muestra TODOS los
  // presupuestos de su sucursal (lo decide la API; acá solo ordena la
  // pantalla con el historial ARRIBA, que es lo que el encargado busca).
  puedeVerTodo?: boolean;
  // true = admin/supremo: puede aprobar cualquier presupuesto.
  puedeAprobarTodo?: boolean;
}) {
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
        porcentajes: Array.isArray(dataCat.porcentajes) ? dataCat.porcentajes : [],
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

  // ═══ HISTORIAL de presupuestos (Task 113 v3, pedido del dueño) ═══
  // La API decide el alcance: el vendedor ve los SUYOS (con botón
  // MARCAR APROBADO), el encargado ve los de SU sucursal (solo lectura,
  // con la situación de cada uno) y el admin ve todos.
  const [historial, setHistorial] = useState<PresupuestoPedidoEspecial[]>([]);
  const [vistaHistorial, setVistaHistorial] = useState<string>("MIS");
  const [sucursalHistorial, setSucursalHistorial] = useState<string | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  // Task 113 v4: el último presupuesto GUARDADO (para el botón IMPRIMIR
  // que aparece justo después de guardar) y el estado del PDF en curso.
  const [ultimoGuardado, setUltimoGuardado] = useState<{ id: string; numero: string } | null>(null);
  const [imprimiendoId, setImprimiendoId] = useState<string | null>(null);

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const res = await fetch("/api/pedido-especial/presupuestos");
      const data = await res.json().catch(() => ({}));
      setHistorial(Array.isArray(data.presupuestos) ? data.presupuestos : []);
      if (typeof data.vista === "string") setVistaHistorial(data.vista);
      setSucursalHistorial(typeof data.sucursal === "string" ? data.sucursal : null);
    } catch {
      // Historial inaccesible: la pantalla de cálculo sigue normal.
    } finally {
      setCargandoHistorial(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  // GUARDAR el presupuesto actual en el historial (queda GENERADO).
  // El servidor RECALCULA con los % de la BASE y da el número ESPECIAL-XX.
  const guardarPresupuesto = async () => {
    if (!resultadoOk || guardando) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/pedido-especial/presupuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedor,
          tipoProducto,
          descripcion: descripcion.trim(),
          modoCosto,
          costo,
          plan,
          cuotas,
          fechaInicioPago,
          safraEntrada,
          safraMeses,
          chequesCantidad,
          chequesFechas,
          fechaEmision: hoy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      const guardado = { id: String(data?.presupuesto?.id || ""), numero: String(data?.presupuesto?.numero || "ESPECIAL") };
      setUltimoGuardado(guardado);
      toast.success(`Presupuesto ${guardado.numero} guardado (GENERADO)`);
      cargarHistorial();
    } catch (error) {
      toast.error(`No se pudo guardar: ${(error as Error).message}`);
    } finally {
      setGuardando(false);
    }
  };

  // IMPRIMIR el presupuesto guardado (Task 113 v4, pedido del dueño:
  // "después de guardar presupuesto que él tenga la opción de imprimir
  // presupuesto, el que él guardó"). El PDF sale del SERVIDOR con el
  // valor congelado de la base y el diseño VIZA de siempre.
  const imprimirPresupuesto = async (id: string) => {
    if (imprimiendoId) return;
    setImprimiendoId(id);
    try {
      const res = await fetch("/api/pedido-especial/presupuestos/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Se abre en pestaña nueva (imprimir como cualquier PDF); si el
      // navegador bloquea la pestaña, se descarga directo.
      const ventana = window.open(url, "_blank");
      if (!ventana) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "VIZA-Pedido-Especial.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Presupuesto listo para imprimir");
    } catch (error) {
      toast.error(`No se pudo imprimir: ${(error as Error).message}`);
    } finally {
      setImprimiendoId(null);
    }
  };

  // MARCAR COMO APROBADO (el vendedor que lo generó, o un admin).
  const aprobarPresupuesto = async (id: string) => {
    if (aprobandoId) return;
    setAprobandoId(id);
    try {
      const res = await fetch("/api/pedido-especial/presupuestos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      toast.success("Presupuesto marcado como APROBADO");
      cargarHistorial();
    } catch (error) {
      toast.error(`No se pudo aprobar: ${(error as Error).message}`);
    } finally {
      setAprobandoId(null);
    }
  };

  const miEmail = userEmail.trim().toLowerCase();
  const puedeAprobarFila = (p: PresupuestoPedidoEspecial): boolean =>
    p.estado === "GENERADO" &&
    (puedeAprobarTodo || (!!miEmail && p.vendedorEmail === miEmail));

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

  // ═══ LOS % DE LA BASE, SOLOS (Task 113 v4, pedido del dueño) ═══
  // "Vas a usar TODAS las lógicas de la BASE, lo único que cambia es que
  // el costo lo ponemos manualmente". Los % vienen del catálogo de la
  // BASE: promedio REAL de los productos del proveedor + tipo elegidos
  // (misma regla de márgenes automáticas de la casa, calculada en el
  // servidor). Respaldo por campo: la config del panel del admin, solo
  // si algún % no aparece en la BASE.
  const porcentajesElegidos = useMemo(() => {
    const par = catalogo.porcentajes.find(
      (p) => p.fabricante === proveedor && p.tipo === tipoProducto
    );
    const cfg = combinacionElegida;
    const elegir = (deLaBase: number | undefined, delPanel: number | undefined) => {
      const base = Number(deLaBase) || 0;
      if (base > 0) return base;
      return Number(delPanel) || 0;
    };
    return {
      pctContado: elegir(par?.pctContado, cfg?.pctContado),
      pct1A6: elegir(par?.pct1A6, cfg?.pct1A6),
      pct7A13: elegir(par?.pct7A13, cfg?.pct7A13),
      pct14A30: elegir(par?.pct14A30, cfg?.pct14A30),
      pctTecnico: elegir(par?.pctTecnico, cfg?.pctTecnico),
      pctSafra: elegir(par?.pctSafra, cfg?.pctSafra),
    };
  }, [catalogo, proveedor, tipoProducto, combinacionElegida]);

  // === Parámetros específicos del plan elegido ===
  const esMoto = useMemo(() => esTipoMoto(tipoProducto), [tipoProducto]);
  const diasSinEntrega = useMemo(() => diasHastaFecha(fechaInicioPago), [fechaInicioPago]);
  const safraEntrada = useMemo(() => parseCosto(safraEntradaStr) || 0, [safraEntradaStr]);

  // === Cálculo EN VIVO (recalcula solo si cambian los % de la BASE) ===
  const costo = parseCosto(costoStr);
  const resultado = useMemo(() => {
    if (!costo) return null;
    return calcularPedidoEspecial({
      costo,
      modoCosto,
      cambioUS,
      pctContado: porcentajesElegidos.pctContado,
      pct1A6: porcentajesElegidos.pct1A6,
      pct7A13: porcentajesElegidos.pct7A13,
      pct14A30: porcentajesElegidos.pct14A30,
      pctTecnico: porcentajesElegidos.pctTecnico,
      pctSafra: porcentajesElegidos.pctSafra,
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
    porcentajesElegidos,
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

  // ═══ SECCIÓN HISTORIAL (Task 113 v3, pedido del dueño) ═══
  // El encargado de sucursal ve el historial de SU sucursal con la
  // situación de cada presupuesto (GENERADO / APROBADO). El vendedor ve
  // el suyo y marca APROBADO los que quiera. Un solo JSX: para el
  // encargado/admin va ARRIBA en la pantalla, para el vendedor ABAJO.
  const tituloHistorial =
    vistaHistorial === "SUCURSAL" && sucursalHistorial
      ? ` · ${sucursalHistorial}`
      : vistaHistorial === "TODAS"
        ? " · TODAS LAS SUCURSALES"
        : "";
  const generados = historial.filter((p) => p.estado === "GENERADO").length;
  const aprobados = historial.filter((p) => p.estado === "APROBADO").length;

  const seccionHistorial = (
    <section className="bg-white rounded-2xl border-2 p-5 shadow-sm" style={{ borderColor: DORADO }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"
          style={{ color: AZUL }}
        >
          <History className="h-4 w-4" />
          HISTORIAL · PEDIDOS ESPECIALES{tituloHistorial}
        </h2>
        <button
          onClick={cargarHistorial}
          disabled={cargandoHistorial}
          className="text-[11px] font-semibold text-stone-500 hover:text-sky-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          title="Recargar el historial"
        >
          <RefreshCw className={`h-3 w-3 ${cargandoHistorial ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {cargandoHistorial ? (
        <div className="py-10 flex flex-col items-center gap-2">
          <div className="h-9 w-9 rounded-full border-4 border-stone-200 border-t-[#155789] animate-spin"></div>
          <p className="text-xs text-stone-500 font-medium">Cargando historial…</p>
        </div>
      ) : historial.length === 0 ? (
        <div className="py-10 text-center">
          <History className="h-9 w-9 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-stone-600">
            {vistaHistorial === "MIS"
              ? "Todavía no guardaste ningún presupuesto"
              : "Todavía no hay presupuestos de pedido especial"}
          </p>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            {vistaHistorial === "MIS"
              ? "Completá el pedido de arriba y apretá GUARDAR PRESUPUESTO: queda acá con situación GENERADO."
              : "Cuando los vendedores guarden presupuestos de pedido especial aparecen acá, con su situación (GENERADO / APROBADO)."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Resumen de la situación (lo que el dueño pidió ver) */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
              {historial.length} presupuesto{historial.length !== 1 ? "s" : ""}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              {generados} generado{generados !== 1 ? "s" : ""}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800">
              {aprobados} aprobado{aprobados !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="rounded-xl border border-stone-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-100 text-stone-600 uppercase text-[10px]">
                  <th className="text-left px-3 py-2 font-bold whitespace-nowrap">N°</th>
                  <th className="text-center px-3 py-2 font-bold whitespace-nowrap">FECHA</th>
                  {puedeVerTodo && (
                    <th className="text-left px-3 py-2 font-bold whitespace-nowrap">VENDEDOR</th>
                  )}
                  <th className="text-left px-3 py-2 font-bold">PRODUCTO</th>
                  <th className="text-left px-3 py-2 font-bold whitespace-nowrap">PLAN</th>
                  <th className="text-right px-3 py-2 font-bold whitespace-nowrap">VALOR</th>
                  <th className="text-center px-3 py-2 font-bold whitespace-nowrap">SITUACIÓN</th>
                  <th className="text-right px-3 py-2 font-bold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {historial.map((p) => {
                  const extra = lineaValorPresupuesto(p);
                  return (
                    <tr key={p.id} className="hover:bg-stone-50">
                      <td className="px-3 py-2.5 font-extrabold whitespace-nowrap" style={{ color: AZUL }}>
                        {p.numero}
                      </td>
                      <td className="px-3 py-2.5 text-center text-stone-600 whitespace-nowrap">
                        {fmtFechaHora(p.createdAt)}
                      </td>
                      {puedeVerTodo && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-semibold text-stone-800 max-w-[140px] truncate" title={p.vendedorNombre || p.vendedorEmail}>
                            {p.vendedorNombre || p.vendedorEmail}
                          </div>
                          {p.sucursal && (
                            <div className="text-[10px] text-stone-400">{p.sucursal}</div>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-stone-800">
                          {p.proveedor} · {p.tipoProducto}
                        </div>
                        <div className="text-[11px] text-stone-500 max-w-[220px] truncate" title={p.descripcion}>
                          {p.descripcion}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-bold text-stone-700">{NOMBRE_PLAN[p.plan as PlanPedidoEspecial] || p.plan}</span>
                        {extra && <div className="text-[10px] text-stone-400">{extra}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-extrabold text-stone-900">{formatPYG(montoPrincipal(p))}</span>
                        {modoCostoFila(p) && (
                          <div className="text-[10px] text-stone-400">{modoCostoFila(p)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.estado === "APROBADO" ? (
                          <span
                            className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-300 whitespace-nowrap"
                            title={p.fechaAprobado ? `Aprobado el ${fmtFechaHora(p.fechaAprobado)}` : "Aprobado"}
                          >
                            APROBADO
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                            GENERADO
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* IMPRIMIR (Task 113 v4): el PDF del presupuesto
                              guardado, con el diseño VIZA de siempre. */}
                          <button
                            onClick={() => imprimirPresupuesto(p.id)}
                            disabled={imprimiendoId === p.id}
                            className="h-7 w-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 hover:text-sky-700 hover:border-sky-300 transition-colors disabled:opacity-50 shrink-0"
                            title={`Imprimir el presupuesto ${p.numero} (PDF)`}
                          >
                            <Printer
                              className={`h-3.5 w-3.5 ${imprimiendoId === p.id ? "animate-pulse" : ""}`}
                            />
                          </button>
                          {puedeAprobarFila(p) ? (
                            <button
                              onClick={() => aprobarPresupuesto(p.id)}
                              disabled={aprobandoId === p.id}
                              className="h-7 px-3 rounded-lg font-bold text-[10px] flex items-center gap-1 border transition-colors hover:brightness-95 disabled:opacity-50 whitespace-nowrap"
                              style={{
                                backgroundColor: "rgba(22,163,74,0.08)",
                                color: "#166534",
                                borderColor: "rgba(22,163,74,0.4)",
                              }}
                              title="Marcar este presupuesto como APROBADO (el encargado lo ve aprobado)"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {aprobandoId === p.id ? "APROBANDO…" : "MARCAR APROBADO"}
                            </button>
                          ) : p.estado === "APROBADO" ? (
                            <span className="text-[10px] text-green-700 font-semibold whitespace-nowrap">
                              ✓ {p.fechaAprobado ? fmtFechaHora(p.fechaAprobado) : ""}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-stone-400 leading-relaxed">
            El VALOR guardado es el que se calculó en ese momento: si después cambian
            los valores de la BASE, el presupuesto guardado NO cambia.
            {vistaHistorial === "SUCURSAL" &&
              " Vés tu sucursal: solo lectura — la aprobación la hace el vendedor que lo generó."}
          </p>
        </div>
      )}
    </section>
  );

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
      {/* HISTORIAL ARRIBA para encargado/admin: es lo que busca al entrar
          (el dueño: "los encargados de sucursales… ver el histórico… y la
          situación de los mismos"). Para el vendedor va al final. */}
      {puedeVerTodo && seccionHistorial}

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
            title="Recargar proveedores, tipos y % desde la BASE"
          >
            <RefreshCw className={`h-3 w-3 ${cargandoConfig ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* COSTO: moneda + monto directo — Task 113 v3: el input separa
            SOLO los miles con puntito mientras se escribe (pedido del
            dueño: "puntito automático"). */}
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
            <CampoMonto
              value={costoStr}
              onChange={setCostoStr}
              placeholder={modoCosto === "usd" ? "Ej: 2.500" : "Ej: 15.000.000"}
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
                  {plan === "cuotas_sin_entrega" && (
                    <p
                      className="text-[11px] font-semibold leading-snug basis-full"
                      style={{ color: AZUL }}
                    >
                      {diasSinEntrega !== null && diasSinEntrega >= 0 && diasSinEntrega <= 60
                        ? `Elegiste ${diasSinEntrega} días → ${diasSinEntrega <= 30 ? "sin recargo" : "recargo 3%"}.`
                        : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {plan === "safra" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-stone-500 uppercase whitespace-nowrap flex items-center gap-1">
                  <Landmark className="h-3 w-3" />
                  Entrada (Gs):
                </label>
                <CampoMonto
                  value={safraEntradaStr}
                  onChange={setSafraEntradaStr}
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
                  {formatPYG(resultadoOk.cheques[0]?.valor || 0)})
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

            {/* Desglose de lo que el vendedor ingresó (solo sus datos:
                Task 113 v4 — fuera los % / tasas / plazos internos) */}
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
                ? fila("Costo (Gs)", formatPYG(resultadoOk.costoGs))
                : fila("Costo base (Gs)", formatPYG(resultadoOk.costoProd))}
              {fila("Proveedor · Tipo", `${proveedor} · ${tipoProducto}`)}
              {fila("Descripción", (
                <span className="max-w-[60%] truncate inline-block align-bottom" title={descripcion}>
                  {descripcion}
                </span>
              ))}
            </div>

            {/* ── GUARDAR + IMPRIMIR (Task 113 v3/v4, pedidos del dueño) ──
                Guardar → queda GENERADO con número ESPECIAL-XX; después
                el botón IMPRIMIR saca el PDF del presupuesto guardado. */}
            <div
              className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-dashed px-4 py-3"
              style={{ borderColor: DORADO, background: "rgba(217,184,107,0.07)" }}
            >
              {ultimoGuardado && (
                <button
                  onClick={() => imprimirPresupuesto(ultimoGuardado.id)}
                  disabled={imprimiendoId === ultimoGuardado.id}
                  className="h-10 px-5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 bg-white"
                  style={{ color: AZUL, borderColor: DORADO }}
                  title={`Imprimir el presupuesto ${ultimoGuardado.numero} que acabás de guardar`}
                >
                  <Printer
                    className={`h-4 w-4 ${imprimiendoId === ultimoGuardado.id ? "animate-pulse" : ""}`}
                  />
                  {imprimiendoId === ultimoGuardado.id
                    ? "PREPARANDO…"
                    : `IMPRIMIR PRESUPUESTO${ultimoGuardado.numero ? ` (${ultimoGuardado.numero})` : ""}`}
                </button>
              )}
              <button
                onClick={guardarPresupuesto}
                disabled={!resultadoOk || guardando}
                className="h-10 px-5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                style={{ backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }}
                title="Guardar este presupuesto en el historial"
              >
                <CheckCircle2 className={`h-4 w-4 ${guardando ? "animate-pulse" : ""}`} />
                {guardando ? "GUARDANDO…" : "GUARDAR PRESUPUESTO"}
              </button>
            </div>
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

      {/* ═══ HISTORIAL · PRESUPUESTOS PEDIDO ESPECIAL (Task 113 v3) ═══
          El vendedor ve los SUYOS con el botón MARCAR APROBADO; el
          encargado de sucursal ve los de SU sucursal con la situación de
          cada uno (GENERADO / APROBADO) — solo lectura; el admin ve todos.
          Para el encargado/admin el historial va ARRIBA (es lo que busca
          cuando entra); para el vendedor va ABAJO (calcula → guarda →
          ve lo suyo). */}
      {!puedeVerTodo && seccionHistorial}
    </div>
  );
}
