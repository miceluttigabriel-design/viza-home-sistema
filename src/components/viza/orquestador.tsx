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
// REDISEÑO: los cuadros ahora se muestran como DIAGRAMA con líneas que los
// conectan (igual al dibujo del dueño): Stock arriba → La Base (izquierda)
// → Cotizador (abajo), y Stock → Distribuidor (derecha) → 4 sucursales.
// SOLO ES VISUALIZACIÓN: no toca datos, no toca APIs, no toca la base.
// Los demás roles nunca llegan a esta pantalla (page.tsx decide por rol).
// ═══════════════════════════════════════════════════════════════════

import type * as React from "react";
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

// ─── Tarjetas (se reutilizan en la vista diagrama y en la vista móvil) ───
const cardBase =
  "h-full w-full text-left rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 flex flex-col";

function Punto({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-1 w-1 rounded-full shrink-0" style={{ background: color }} />
      {children}
    </li>
  );
}

function StockCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group ${cardBase} transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer`}
      style={{ borderTop: "3px solid #0ea5e9" }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
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
          className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5 shrink-0"
          style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          SYSTEM ONLINE
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-slate-300">
        <Punto color="#38bdf8">Sincronización de inventario</Punto>
        <Punto color="#38bdf8">Base de datos centralizada</Punto>
        <Punto color="#38bdf8">Disponibilidad por producto</Punto>
      </ul>
      <p className="mt-auto pt-3 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
        ABRIR →
      </p>
    </button>
  );
}

function BaseCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group ${cardBase} transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer`}
      style={{ borderTop: "3px solid #f97316" }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
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
        <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full shrink-0" style={{ background: "rgba(249,115,22,0.15)", color: "#fdba74" }}>
          NÚCLEO
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-slate-300">
        <Punto color="#fb923c">Productos, costos y márgenes</Punto>
        <Punto color="#fb923c">Importación de planilla ERP</Punto>
        <Punto color="#fb923c">Etiquetas · #HASHTAG · CRM</Punto>
      </ul>
      <p className="mt-auto pt-3 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
        ABRIR →
      </p>
    </button>
  );
}

function CotizadorCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group ${cardBase} transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 cursor-pointer`}
      style={{ borderTop: "3px solid #10b981" }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
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
        <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full shrink-0" style={{ background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}>
          4 PLANES
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-slate-300">
        <Punto color="#34d399">Generación dinámica de precios</Punto>
        <Punto color="#34d399">CUOTA · SAFRA · CHEQUE · MAYORISTA</Punto>
        <Punto color="#34d399">Descuentos y reglas de venta</Punto>
      </ul>
      <p className="mt-auto pt-3 text-[11px] font-black tracking-widest text-slate-500 group-hover:text-white transition-colors">
        ABRIR →
      </p>
    </button>
  );
}

function DistribuidorCard() {
  return (
    <div
      className={`${cardBase} opacity-80 select-none`}
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
        <Punto color="#a78bfa">CRM · Ranking de presupuestos</Punto>
        <Punto color="#a78bfa">Asignación por sucursal</Punto>
        <Punto color="#a78bfa">Optimización de canales</Punto>
      </ul>
      <div
        className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-widest"
        style={{ background: "rgba(14,165,233,0.10)", color: "#7dd3fc" }}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        LIGADO AL STOCK GENERAL
      </div>
      <p className="mt-auto pt-4 text-[11px] font-black tracking-widest text-slate-600">EN DESARROLLO</p>
    </div>
  );
}

function SucursalCard({ nombre }: { nombre: string }) {
  return (
    <div
      className="h-full w-full rounded-xl border border-white/10 p-3 opacity-80 flex flex-col justify-center"
      style={{ background: "rgba(139,92,246,0.08)" }}
      title={`${nombre} — se activará con el Distribuidor Inteligente`}
    >
      <MapPin className="h-4 w-4 mb-1.5" style={{ color: "#a78bfa" }} />
      <p className="text-[11px] font-black text-white leading-tight">{nombre}</p>
      <p className="text-[9px] font-bold tracking-widest mt-1" style={{ color: "#c4b5fd" }}>
        PRÓXIMAMENTE
      </p>
    </div>
  );
}

// Posición de cada cuadro en el diagrama (en % del contenedor): x, y, ancho, alto
const POS = {
  stock: { x: 14, y: 0, w: 36, h: 25 },
  base: { x: 0, y: 38, w: 30, h: 26 },
  cotizador: { x: 8, y: 77, w: 38, h: 23 },
  distribuidor: { x: 58, y: 20, w: 26, h: 50 },
};
const SUC_X = 88;
const SUC_W = 12;
const SUC_H = 15;
const SUC_Y = [4, 28, 52, 76];

const place = (r: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
  position: "absolute",
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

// Líneas del diagrama (coordenadas en % del contenedor)
const LINEAS_PRINCIPALES: [number, number, number, number][] = [
  [20, 25, 14, 38], // Stock → La Base
  [14, 64, 22, 77], // La Base → Cotizador
  [50, 12, 58, 30], // Stock → Distribuidor
];
const LINEAS_SUCURSALES: [number, number, number, number][] = [
  [84, 30, 88, SUC_Y[0] + SUC_H / 2],
  [84, 40, 88, SUC_Y[1] + SUC_H / 2],
  [84, 50, 88, SUC_Y[2] + SUC_H / 2],
  [84, 60, 88, SUC_Y[3] + SUC_H / 2],
];

function Conector() {
  return <div className="mx-auto h-6 w-0.5 rounded" style={{ background: "rgba(217,184,107,0.6)" }} />;
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
              <p className="text-sm font-bold text-white leading-none">{user.name || user.email}</p>
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

        {/* ═══ DIAGRAMA (pantallas grandes): cuadros unidos por líneas ═══ */}
        <div className="hidden lg:block relative w-full max-w-6xl" style={{ height: 780 }}>
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {LINEAS_PRINCIPALES.map(([x1, y1, x2, y2], i) => (
              <line
                key={`p${i}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#D9B86B" strokeOpacity={0.7} strokeWidth={2.5}
                strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            ))}
            {LINEAS_SUCURSALES.map(([x1, y1, x2, y2], i) => (
              <line
                key={`s${i}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#a78bfa" strokeOpacity={0.7} strokeWidth={2}
                strokeDasharray="5 5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <div style={place(POS.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(POS.base)}><BaseCard onClick={onGoBase} /></div>
          <div style={place(POS.cotizador)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(POS.distribuidor)}><DistribuidorCard /></div>
          {SUCURSALES_CUADROS.map((nombre, i) => (
            <div key={nombre} style={place({ x: SUC_X, y: SUC_Y[i], w: SUC_W, h: SUC_H })}>
              <SucursalCard nombre={nombre} />
            </div>
          ))}
        </div>

        {/* ═══ VISTA CELULAR / TABLET: los mismos cuadros, uno debajo del otro ═══ */}
        <div className="lg:hidden w-full max-w-md">
          <StockCard onClick={onGoStock} />
          <Conector />
          <BaseCard onClick={onGoBase} />
          <Conector />
          <CotizadorCard onClick={onGoSales} />
          <Conector />
          <DistribuidorCard />
          <div className="mx-auto h-6 w-0.5" style={{ borderLeft: "2px dashed rgba(167,139,250,0.7)" }} />
          <div className="grid grid-cols-2 gap-2.5">
            {SUCURSALES_CUADROS.map((nombre) => (
              <SucursalCard key={nombre} nombre={nombre} />
            ))}
          </div>
        </div>

        {/* ─── Flujo entre módulos (decorativo) ─── */}
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
