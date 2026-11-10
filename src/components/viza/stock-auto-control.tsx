"use client";

// ============================================================================
//  STOCK AUTOMATICO - CONTROL EN LA BASE (interruptor + boton)
// ----------------------------------------------------------------------------
//  Lo que ve el duenio DENTRO DE LA BASE, al lado de los chips de siempre:
//
//    [Switch] STOCK AUTOMATICO: ACTIVADO     [ACTUALIZAR AHORA]
//    [PC: en linea hace 12 s]   [Ultima: 16:19 · 2141 actualizados]
//
//  · El Switch prende/apaga el robot (se guarda en la base, tabla
//    ConfigStockAuto). Apagado = la PC no importa nada, pero sigue dando
//    senal de vida.
//  · ACTUALIZAR AHORA deja un pedido y la PC lo ejecuta en menos de 1 minuto
//    (sin esperar a la proxima hora). Mientras corre, el panel lo muestra y
//    al terminar avisa con un toast: cuantos nuevos y cuantos actualizados.
//  · El chip de la PC dice si la maquina esta encendida y conectada. Si esta
//    apagada, se ve al instante (no miente "todo bien").
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

interface EstadoStockAuto {
  habilitado: boolean;
  ultimaCorrida: string | null;
  ultimaOk: boolean | null;
  ultimoMensaje: string | null;
  ultimosNuevos: number;
  ultimosActualizados: number;
  pedidoManual: string | null;
  heartbeat: string | null;
  actualizadoPor?: string | null;
  puedeControlar?: boolean;
}

// Si la ultima senal de la PC tiene mas de estos minutos, se considera
// apagada / sin internet.
const FRESCO_MIN = 6;
const SENTINELA = "SIN-CORRIDA";

function textoHace(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "nunca";
  if (ms < 0) return "ahora";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function textoFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StockAutoControl() {
  const [estado, setEstado] = useState<EstadoStockAuto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  // ultimaCorrida al momento de apretar el boton: cuando cambia, la corrida
  // termino (sirve para avisar el resultado exacto).
  const [esperandoDesde, setEsperandoDesde] = useState<string | null>(null);
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/stock-auto", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as EstadoStockAuto;
      if (vivo.current && data && typeof data.habilitado === "boolean") {
        setEstado(data);
      }
    } catch {
      // sin estado: el chip queda como estaba, nada se rompe
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  // Refresco: 20 s normal, 5 s mientras esperamos una corrida manual.
  useEffect(() => {
    const ms = esperandoDesde ? 5000 : 20000;
    const id = window.setInterval(() => void cargar(), ms);
    return () => window.clearInterval(id);
  }, [cargar, esperandoDesde]);

  // La corrida manual termino: avisar el resultado.
  useEffect(() => {
    if (!esperandoDesde || !estado) return;
    const actual = estado.ultimaCorrida ?? SENTINELA;
    if (actual === esperandoDesde) return;
    setEsperandoDesde(null);
    setPidiendo(false);
    if (estado.ultimaOk === false) {
      toast.error(
        `La actualizacion de stock fallo: ${estado.ultimoMensaje || "sin detalle"}`,
        { duration: 15000 }
      );
    } else {
      toast.success(
        `Stock actualizado: ${estado.ultimosNuevos} nuevos · ${estado.ultimosActualizados} actualizados`,
        { duration: 10000 }
      );
    }
  }, [estado, esperandoDesde]);

  // Si en 10 minutos no hay respuesta (PC apagada), cortar la espera.
  useEffect(() => {
    if (!esperandoDesde) return;
    const id = window.setTimeout(() => {
      setEsperandoDesde(null);
      setPidiendo(false);
      toast.warning(
        "La PC no respondio en 10 minutos. Fijate que este encendida y con internet.",
        { duration: 12000 }
      );
    }, 10 * 60 * 1000);
    return () => window.clearTimeout(id);
  }, [esperandoDesde]);

  const moverInterruptor = async (nuevo: boolean) => {
    if (guardando) return;
    setGuardando(true);
    const id = toast.loading(
      nuevo ? "Activando el stock automatico..." : "Pausando el stock automatico..."
    );
    try {
      const res = await fetch("/api/stock-auto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habilitado: nuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      setEstado((e) => (e ? { ...e, habilitado: data.habilitado === true } : e));
      toast.success(
        nuevo
          ? "Stock automatico ACTIVADO: la PC actualiza sola todos los dias de 07:00 a 21:00, cada 1 hora."
          : "Stock automatico PAUSADO: la PC no va a importar nada hasta que lo vuelvas a activar.",
        { id, duration: 9000 }
      );
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`, { id });
    } finally {
      setGuardando(false);
    }
  };

  const pedirAhora = async () => {
    if (pidiendo || esperandoDesde) return;
    setPidiendo(true);
    const id = toast.loading("Enviando el pedido a la PC...");
    try {
      const base = estado?.ultimaCorrida ?? SENTINELA;
      const res = await fetch("/api/stock-auto/pedido", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      setEstado((e) => (e ? { ...e, ...data } : e));
      setEsperandoDesde(base);
      toast.success(
        "Pedido enviado: la PC arranca en menos de 1 minuto. Te aviso cuando termine.",
        { id, duration: 7000 }
      );
    } catch (error) {
      setPidiendo(false);
      toast.error(`Error: ${(error as Error).message}`, { id });
    }
  };

  if (!estado || estado.puedeControlar === false) return null;

  const activo = estado.habilitado;
  const ultimaSenalMs = estado.heartbeat
    ? Date.now() - new Date(estado.heartbeat).getTime()
    : Number.POSITIVE_INFINITY;
  const enLinea = Number.isFinite(ultimaSenalMs) && ultimaSenalMs < FRESCO_MIN * 60 * 1000;
  const ocupado = guardando || pidiendo || Boolean(esperandoDesde);

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {/* Interruptor ON/OFF */}
      <span
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ring-1 text-xs font-semibold ${
          activo
            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
            : "bg-stone-100 text-stone-700 ring-stone-300"
        }`}
        title={
          "Stock automatico: con el interruptor ACTIVADO la PC exporta el inventario del CtrCredito e importa la planilla en STOCK GENERAL todos los dias de 07:00 a 21:00, cada 1 hora. Apagado, no importa nada."
        }
      >
        <RefreshCw className={`h-3.5 w-3.5 ${Boolean(esperandoDesde) ? "animate-spin" : ""}`} />
        STOCK AUTOMATICO:
        <Switch
          checked={activo}
          disabled={guardando}
          onCheckedChange={(v) => void moverInterruptor(v)}
          aria-label="Activar o desactivar la actualizacion automatica de stock"
        />
        {activo ? "ACTIVADO" : "DESACTIVADO"}
      </span>

      {/* Boton: correr ahora */}
      <button
        id="btn-stock-auto-ahora"
        type="button"
        onClick={() => void pedirAhora()}
        disabled={ocupado}
        className={`h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 transition-all ${
          ocupado ? "opacity-60 cursor-not-allowed" : "hover:brightness-110"
        }`}
        style={{ background: "linear-gradient(135deg, #8a6d2f 0%, #b08a3e 100%)" }}
        title="Pedirle a la PC que exporte el CtrCredito e importe la planilla AHORA (sin esperar a la proxima hora)"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${Boolean(esperandoDesde) ? "animate-spin" : ""}`} />
        {esperandoDesde ? "ACTUALIZANDO..." : "ACTUALIZAR AHORA"}
      </button>

      {/* Estado de la PC */}
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 text-xs font-semibold ${
          enLinea
            ? "bg-sky-50 text-sky-800 ring-sky-200"
            : "bg-rose-50 text-rose-700 ring-rose-200"
        }`}
        title={
          enLinea
            ? "La PC del robot esta encendida y conectada (deja una senal cada minuto)."
            : "La PC del robot no da senal: esta apagada, sin internet o el robot no esta corriendo. La actualizacion automatica NO va a pasar hasta que vuelva."
        }
      >
        {enLinea ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        PC: {enLinea ? `en linea ${textoHace(estado.heartbeat)}` : "sin senal"}
      </span>

      {/* Ultima corrida */}
      {estado.ultimaCorrida && (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 text-xs ${
            estado.ultimaOk === false
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : "bg-stone-50 text-stone-600 ring-stone-200"
          }`}
          title={
            estado.ultimaOk === false
              ? `Ultima corrida CON ERROR: ${estado.ultimoMensaje || "sin detalle"}`
              : `Ultima corrida: ${textoFecha(estado.ultimaCorrida)} · ${estado.ultimosNuevos} nuevos · ${estado.ultimosActualizados} actualizados`
          }
        >
          {estado.ultimaOk === false ? "ULTIMA: ERROR" : "ULTIMA:"}{" "}
          {textoFecha(estado.ultimaCorrida)}
          {estado.ultimaOk === false
            ? ""
            : ` · ${estado.ultimosActualizados} act.`}
        </span>
      )}
    </span>
  );
}
