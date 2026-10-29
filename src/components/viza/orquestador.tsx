"use client";

// ═══════════════════════════════════════════════════════════════════
// TASK 92 — SISTEMA ORQUESTADOR DE VIZA HOME (boceto del dueño)
// Pantalla "desde arriba" que ve SOLO el supremo_admin al entrar.
// Distribución EXACTA que pidió el dueño:
//   · ARRIBA: STOCK GENERAL (azul, ancho) → vista inventario solo lectura
//   · ABAJO LADO IZQUIERDO: LA BASE (naranja) → AdminPanel
//   · MÁS ABAJO: COTIZADOR (verde) → SalesPanel
//   · LADO DERECHO, ligado al Stock General: DISTRIBUIDOR INTELIGENTE
//     (violeta, PRÓXIMAMENTE, no clicable) + los 4 cuadritos de las
//     sucursales: NUEVA ESPERANZA · KATUETE · LA PALOMA · SALTOS DEL GUAIRA
// SOLO ES VISUALIZACIÓN: no toca datos, no toca APIs, no toca la base.
// Los demás roles nunca llegan a esta pantalla (page.tsx decide por rol).
// ═══════════════════════════════════════════════════════════════════

import { Database, Boxes, Calculator, Network, MapPin, Link2 } from "lucide-react";

// Sucursales oficiales de VIZA (misma lista que SUCURSALES_VIZA en
// src/lib/sucursal-usuario.ts, en el orden del dueño). Se repite acá SOLO
// para mostrar en el orquestador porque ese archivo importa la base de
// datos y este componente es de cliente. Puro texto visual, cero datos.
const SUCURSALES_CUADROS = [
  "NUEVA ESPERANZA",
  "KATUETE",
  "LA PALOMA",
  "SALTOS DEL GUAIRA",
] as const;

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface OrquestadorProps {
  user: AppUser;
  onGoBase: () => void;
  onGoStock: () => void;
  onGoSales: () => void;
  onGoGestion: () => void;
}

export function Orquestador({ user, onGoBase, onGoStock, onGoSales, onGoGestion }: OrquestadorProps) {
  const inicial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "radial-gradient(1200px 600px at 70% -10%, #12314f 0%, transparent 60%), linear-gradient(160deg, #0a1628 0%, #0c1f36 55%, #081222 100%)",
      }}
    >
      {/* ─── Barra superior: marca + usuario + GDA ─── */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black shadow-lg"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
            >
              {inicial}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">
                {user.name || user.email}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-bold mt-1" style={{ color: "#D9B86B" }}>
                SUPREMO · ACCESO TOTAL
              </p>
            </div>
          </div>
          <button
            onClick={onGoGestion}
            className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm hover:brightness-110"
            style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
            title="Gestión de Accesos y Contraseñas"
          >
            GDA
          </button>
        </div>
      </header>

      {/* ─── Título central ─── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            SISTEMA ORQUESTADOR DE <span style={{ color: "#D9B86B" }}>VIZA HOME</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
            Los módulos del sistema y las 4 sucursales · solo el supremo ve esta pantalla
          </p>
        </div>

        {/* ─── Los cuadros, en la posición EXACTA del boceto del dueño:
               arriba Stock General (ancho), abajo-izquierda La Base, más
               abajo Cotizador, y a la derecha (ligado al Stock) el
               Distribuidor Inteligente con los 4 cuadritos de sucursales ─── */}
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {/* 1 · ARRIBA — STOCK GENERAL (azul, ancho) */}
          <button
            onClick={onGoStock}
            className="group text-left rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer md:col-span-2"
            style={{ borderTop: "3px solid #0ea5e9" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(14,165,233,0.15)" }}>
                  <Boxes className="h-6 w-6" style={{ color: "#38bdf8" }} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-none">STOCK GENERAL</h2>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "#7dd3fc" }}>
                    Inventario · Tiempo real
                  </p>
                </div>
              </div>
              <span
                className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5"
                style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                SYSTEM ONLINE
              </span>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#38bdf8" }} />Sincronización de inventario</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#38bdf8" }} />Base de datos centralizada</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#38bdf8" }} />Disponibilidad por producto</li>
            </ul>
            <p className="mt-4 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
              ABRIR →
            </p>
          </button>

          {/* 2 · DERECHA (ligado al Stock General) — DISTRIBUIDOR INTELIGENTE
                 (violeta) — PRÓXIMAMENTE + los 4 cuadritos de sucursales */}
          <div
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 opacity-80 select-none flex flex-col md:col-span-2 xl:col-start-3 xl:row-start-1 xl:row-span-3"
            style={{ borderTop: "3px solid #8b5cf6" }}
            title="Módulo en desarrollo — próximo paso del sistema"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
                <Network className="h-6 w-6" style={{ color: "#a78bfa" }} />
              </div>
              <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>
                PRÓXIMAMENTE
              </span>
            </div>
            <h2 className="text-lg font-black text-white leading-none">DISTRIBUIDOR INTELIGENTE</h2>
            <p className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "#c4b5fd" }}>
              Leads · Sucursales · Canales
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#a78bfa" }} />CRM · Ranking de presupuestos</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#a78bfa" }} />Asignación por sucursal</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#a78bfa" }} />Optimización de canales</li>
            </ul>
            <div
              className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-widest"
              style={{ background: "rgba(14,165,233,0.10)", color: "#7dd3fc" }}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              LIGADO AL STOCK GENERAL
            </div>

            {/* Cuadritos de las 4 sucursales (decorativos, se activan con
                el Distribuidor Inteligente) */}
            <div className="mt-auto pt-5">
              <p className="text-[9px] font-black tracking-widest text-slate-500 mb-2.5">
                SUCURSALES · PRÓXIMAMENTE
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {SUCURSALES_CUADROS.map((sucursal) => (
                  <div
                    key={sucursal}
                    className="rounded-xl border border-white/10 p-3 opacity-70"
                    style={{ background: "rgba(139,92,246,0.08)" }}
                    title={`${sucursal} — se activará con el Distribuidor Inteligente`}
                  >
                    <MapPin className="h-4 w-4 mb-2" style={{ color: "#a78bfa" }} />
                    <p className="text-[11px] font-black text-white leading-tight">{sucursal}</p>
                    <p className="text-[9px] font-bold tracking-widest mt-1" style={{ color: "#c4b5fd" }}>
                      PRÓXIMAMENTE
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] font-black tracking-widest text-slate-600">
                EN DESARROLLO
              </p>
            </div>
          </div>

          {/* 3 · ABAJO LADO IZQUIERDO — LA BASE (naranja) */}
          <button
            onClick={onGoBase}
            className="group text-left rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer xl:col-span-2"
            style={{ borderTop: "3px solid #f97316" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.15)" }}>
                  <Database className="h-6 w-6" style={{ color: "#fb923c" }} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-none">LA BASE</h2>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "#fdba74" }}>
                    Reglas · Costos · Márgenes
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full" style={{ background: "rgba(249,115,22,0.15)", color: "#fdba74" }}>
                NÚCLEO
              </span>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#fb923c" }} />Productos, costos y márgenes</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#fb923c" }} />Importación de planilla ERP</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#fb923c" }} />Etiquetas · #HASHTAG · CRM</li>
            </ul>
            <p className="mt-4 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
              ABRIR →
            </p>
          </button>

          {/* 4 · MÁS ABAJO — COTIZADOR (verde) */}
          <button
            onClick={onGoSales}
            className="group text-left rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer xl:col-span-2"
            style={{ borderTop: "3px solid #10b981" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                  <Calculator className="h-6 w-6" style={{ color: "#34d399" }} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-none">COTIZADOR</h2>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "#6ee7b7" }}>
                    Presupuestos · Precios
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}>
                4 PLANES
              </span>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#34d399" }} />Generación dinámica de precios</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#34d399" }} />CUOTA · SAFRA · CHEQUE · MAYORISTA</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#34d399" }} />Descuentos y reglas de venta</li>
            </ul>
            <p className="mt-4 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
              ABRIR →
            </p>
          </button>
        </div>

        {/* ─── Flujo entre módulos (decorativo, como el diagrama) ─── */}
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold tracking-widest text-slate-500">
          <span>LA BASE</span>
          <span className="text-slate-600">— ALIMENTA →</span>
          <span>STOCK + COTIZADOR</span>
          <span className="text-slate-600">— DISTRIBUYE →</span>
          <span>DISTRIBUIDOR INTELIGENTE</span>
        </div>
      </main>
    </div>
  );
}
