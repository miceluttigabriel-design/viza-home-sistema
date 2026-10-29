"use client";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA ORQUESTADOR DE VIZA HOME — rediseño "tema oscuro + identidad VIZA"
// Pantalla "desde arriba" que ve SOLO el supremo_admin al entrar.
//
// Distribución del dibujo del dueño (se mantiene EXACTA):
//   · ARRIBA: STOCK GENERAL → vista inventario
//   · IZQUIERDA (ligado al Stock): LA BASE → AdminPanel
//   · ABAJO (ligado a La Base): COTIZADOR → SalesPanel
//   · DERECHA (ligado al Stock): DISTRIBUIDOR INTELIGENTE (PRÓXIMAMENTE)
//     + los 4 cuadritos de sucursales: NUEVA ESPERANZA · KATUETE ·
//       LA PALOMA · SALTOS DEL GUAIRA
//
// Marca: azul #155789 · dorado #D9B86B · logo /viza-home-logo-nuevo.png
// SOLO ES VISUALIZACIÓN: no toca datos, no toca APIs, no toca la base.
// Los demás roles nunca llegan a esta pantalla (page.tsx decide por rol).
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Database, Boxes, Calculator, Network, MapPin, Link2, ArrowRight } from "lucide-react";

// Sucursales oficiales de VIZA (misma lista que SUCURSALES_VIZA en
// src/lib/sucursal-usuario.ts, en el orden del dueño). Se repite acá SOLO
// para mostrar en el orquestador (ese archivo importa la base de datos y
// este componente es de cliente). Puro texto visual, cero datos.
const SUCURSALES_CUADROS = [
  "NUEVA ESPERANZA",
  "KATUETE",
  "LA PALOMA",
  "SALTOS DEL GUAIRA",
] as const;

// ─── Paleta de la marca + color de cada módulo ───
const DORADO = "#D9B86B";
const C_STOCK = "#3b9be0"; // azul VIZA (versión clara para fondo negro)
const C_BASE = DORADO; // dorado VIZA
const C_COTIZ = "#34d399";
const C_DISTRI = "#a78bfa";
const FONT = "'Montserrat', sans-serif";

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

// ─── Tarjeta de módulo (una sola pieza reutilizada por todos) ───
interface ModuloCardProps {
  c: string;
  icon: ReactNode;
  titulo: string;
  subtitulo: string;
  badge: ReactNode;
  puntos: string[];
  extra?: ReactNode;
  onClick?: () => void;
  className?: string;
  apilado?: boolean;
}

function ModuloCard({ c, icon, titulo, subtitulo, badge, puntos, extra, onClick, className = "", apilado = false }: ModuloCardProps) {
  const estilo: CSSProperties = {
    background: `linear-gradient(155deg, ${c}1f 0%, rgba(9,12,17,0.94) 48%)`,
    border: `1px solid ${c}40`,
    boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 44px -16px ${c}66`,
  };
  const base = `relative overflow-hidden h-full w-full text-left rounded-2xl p-5 flex flex-col ${className}`;

  const contenido = (
    <>
      {/* franja de color arriba */}
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }}
      />
      {/* brillo al pasar el mouse */}
      {onClick && (
        <span
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `${c}55` }}
        />
      )}

      {(() => {
        const tile = (
          <div
            className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: `${c}22`, border: `1px solid ${c}55`, boxShadow: `0 0 18px ${c}40` }}
          >
            {icon}
          </div>
        );
        const textos = (
          <div className="min-w-0">
            <h2 className="text-[17px] font-black text-white leading-tight tracking-tight">{titulo}</h2>
            <p className="text-[10px] font-bold uppercase tracking-wide lg:whitespace-nowrap mt-1.5" style={{ color: c }}>
              {subtitulo}
            </p>
          </div>
        );
        return apilado ? (
          <div className="relative mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              {tile}
              {badge}
            </div>
            {textos}
          </div>
        ) : (
          <div className="relative flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {tile}
              {textos}
            </div>
            {badge}
          </div>
        );
      })()}

      <ul className="relative flex flex-col gap-1.5 text-xs text-slate-300">
        {puntos.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            {p}
          </li>
        ))}
      </ul>

      {extra}

      <p className="relative mt-auto pt-3 text-[11px] font-black tracking-widest flex items-center gap-1.5">
        {onClick ? (
          <span className="flex items-center gap-1.5" style={{ color: c }}>
            ABRIR <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        ) : (
          <span className="text-slate-600">EN DESARROLLO</span>
        )}
      </p>
    </>
  );

  return onClick ? (
    <button
      onClick={onClick}
      className={`group ${base} cursor-pointer transition-all duration-200 hover:-translate-y-1`}
      style={estilo}
    >
      {contenido}
    </button>
  ) : (
    <div
      className={`${base} select-none opacity-90`}
      style={{ ...estilo, borderStyle: "dashed" }}
      title="Módulo en desarrollo — próximo paso del sistema"
    >
      {contenido}
    </div>
  );
}

function Pill({ c, children }: { c: string; children: ReactNode }) {
  return (
    <span
      className="shrink-0 text-[9px] font-black tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}44` }}
    >
      {children}
    </span>
  );
}

function StockCard({ onClick }: { onClick: () => void }) {
  return (
    <ModuloCard
      c={C_STOCK}
      icon={<Boxes className="h-6 w-6" style={{ color: C_STOCK }} />}
      titulo="STOCK GENERAL"
      subtitulo="Inventario · Tiempo real"
      badge={
        <Pill c="#4ade80">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          SYSTEM ONLINE
        </Pill>
      }
      puntos={["Sincronización de inventario", "Base de datos centralizada", "Disponibilidad por producto"]}
      onClick={onClick}
    />
  );
}

function BaseCard({ onClick }: { onClick: () => void }) {
  return (
    <ModuloCard
      c={C_BASE}
      icon={<Database className="h-6 w-6" style={{ color: C_BASE }} />}
      titulo="LA BASE"
      subtitulo="Reglas · Costos · Márgenes"
      badge={<Pill c={C_BASE}>NÚCLEO</Pill>}
      puntos={["Productos, costos y márgenes", "Importación de planilla ERP", "Etiquetas · #HASHTAG · CRM"]}
      onClick={onClick}
    />
  );
}

function CotizadorCard({ onClick }: { onClick: () => void }) {
  return (
    <ModuloCard
      c={C_COTIZ}
      icon={<Calculator className="h-6 w-6" style={{ color: C_COTIZ }} />}
      titulo="COTIZADOR"
      subtitulo="Presupuestos · Precios"
      badge={<Pill c={C_COTIZ}>4 PLANES</Pill>}
      puntos={["Generación dinámica de precios", "CUOTA · SAFRA · CHEQUE · MAYORISTA", "Descuentos y reglas de venta"]}
      onClick={onClick}
    />
  );
}

function DistribuidorCard() {
  return (
    <ModuloCard
      c={C_DISTRI}
      icon={<Network className="h-6 w-6" style={{ color: C_DISTRI }} />}
      apilado
      titulo="DISTRIBUIDOR INTELIGENTE"
      subtitulo="Leads · Sucursales · Canales"
      badge={<Pill c={C_DISTRI}>PRÓXIMAMENTE</Pill>}
      puntos={["CRM · Ranking de presupuestos", "Asignación por sucursal", "Optimización de canales"]}
      extra={
        <div
          className="relative mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-widest"
          style={{ background: `${C_STOCK}1a`, color: C_STOCK, border: `1px solid ${C_STOCK}33` }}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          LIGADO AL STOCK GENERAL
        </div>
      }
    />
  );
}

function SucursalCard({ nombre }: { nombre: string }) {
  return (
    <div
      className="h-full w-full rounded-xl p-3 flex flex-col justify-center select-none"
      style={{
        background: `linear-gradient(155deg, ${C_DISTRI}1a, rgba(9,12,17,0.94) 70%)`,
        border: `1px dashed ${C_DISTRI}55`,
      }}
      title={`${nombre} — se activará con el Distribuidor Inteligente`}
    >
      <MapPin className="h-4 w-4 mb-1.5" style={{ color: C_DISTRI }} />
      <p className="text-[11px] font-black text-white leading-tight">{nombre}</p>
      <p className="text-[9px] font-bold tracking-widest mt-1" style={{ color: C_DISTRI }}>
        PRÓXIMAMENTE
      </p>
    </div>
  );
}

// ─── DIAGRAMA: lienzo fijo de 1152 × 820 que se escala solo al ancho de la pantalla ───
const W = 1152;
const H = 820;

// Cuadros: x, y, ancho, alto (en px del lienzo)
const POS = {
  stock: { x: 190, y: 0, w: 380, h: 210 },
  base: { x: 0, y: 300, w: 340, h: 210 },
  cotizador: { x: 90, y: 600, w: 420, h: 210 },
  distribuidor: { x: 670, y: 150, w: 280, h: 400 },
  leyenda: { x: 580, y: 640, w: 572, h: 170 },
};
const SUC_X = 1010;
const SUC_W = 142;
const SUC_H = 100;
const SUC_Y = [80, 210, 340, 470];

type Rect = { x: number; y: number; w: number; h: number };
const place = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

// Líneas de flujo (curvas). "alimenta" = dorado continuo · "distribuye" = violeta punteado
const FLUJOS_PRINCIPALES = [
  { id: "base-stock", d: "M 230 300 C 230 250, 300 260, 300 210", label: "ALIMENTA", lx: 265, ly: 255 },
  { id: "base-cotiz", d: "M 230 510 C 230 560, 280 550, 280 600", label: "ALIMENTA", lx: 255, ly: 555 },
  { id: "stock-distri", d: "M 570 105 C 625 105, 615 250, 670 250", label: "LIGADO", lx: 620, ly: 178 },
];
const FLUJOS_SUCURSALES = SUC_Y.map((y, i) => {
  const yo = 230 + i * 80; // punto de salida en el Distribuidor
  const yd = y + SUC_H / 2; // centro del cuadrito
  return { id: `distri-suc-${i}`, d: `M 950 ${yo} C 985 ${yo}, 975 ${yd}, ${SUC_X} ${yd}` };
});

function Flecha({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}

function Flujo({ d, color, punteado = false, flecha }: { d: string; color: string; punteado?: boolean; flecha: string }) {
  return (
    <g>
      {/* resplandor */}
      <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={9} strokeLinecap="round" filter="url(#brillo)" />
      {punteado ? (
        <path d={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" markerEnd={`url(#${flecha})`}>
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.6s" repeatCount="indefinite" />
        </path>
      ) : (
        <>
          <path d={d} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" markerEnd={`url(#${flecha})`} />
          <path d={d} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="3 22" strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" from="50" to="0" dur="1.8s" repeatCount="indefinite" />
          </path>
          <circle r={3.5} fill={color}>
            <animateMotion dur="3s" repeatCount="indefinite" path={d} />
          </circle>
        </>
      )}
    </g>
  );
}

function Etiqueta({ x, y, texto }: { x: number; y: number; texto: string }) {
  return (
    <span
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[8.5px] font-black tracking-widest whitespace-nowrap"
      style={{ left: x, top: y, background: "#06080c", color: DORADO, border: `1px solid ${DORADO}66`, boxShadow: `0 0 12px ${DORADO}33` }}
    >
      {texto}
    </span>
  );
}

function Leyenda() {
  const fila = (color: string, dash: boolean, texto: string) => (
    <div className="flex items-center gap-3 text-[11px] text-slate-300">
      <svg width="46" height="10" aria-hidden="true">
        <line x1="2" y1="5" x2="40" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dash ? "5 4" : undefined} strokeLinecap="round" />
        <path d="M 36 1 L 44 5 L 36 9 z" fill={color} />
      </svg>
      {texto}
    </div>
  );
  return (
    <div
      className="h-full w-full rounded-2xl p-5 flex flex-col"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <p className="text-[10px] font-black tracking-[0.2em] mb-3" style={{ color: DORADO }}>
        FLUJOS DEL SISTEMA
      </p>
      <div className="flex flex-col gap-2">
        {fila(DORADO, false, "La Base alimenta con datos al Stock y al Cotizador")}
        {fila(C_STOCK, false, "El Stock se liga al Distribuidor Inteligente")}
        {fila(C_DISTRI, true, "El Distribuidor reparte a las 4 sucursales (próximamente)")}
      </div>
      <p className="mt-auto text-[11px] font-bold italic" style={{ color: DORADO }}>
        Todo para tu hogar, en un solo lugar.
      </p>
    </div>
  );
}

function Escenario({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => {
      const ancho = el.clientWidth;
      if (ancho > 0) setEscala(Math.min(1, ancho / W));
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="hidden lg:block w-full mx-auto" style={{ maxWidth: W, height: H * escala }}>
      <div style={{ position: "relative", width: W, height: H, transform: `scale(${escala})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

function Conector({ color = DORADO }: { color?: string }) {
  return (
    <div
      className="mx-auto h-7 w-0.5 rounded"
      style={{ background: `linear-gradient(${color}, ${color}55)`, boxShadow: `0 0 10px ${color}66` }}
    />
  );
}

export function Orquestador({ user, onGoBase, onGoStock, onGoSales, onGoGestion }: OrquestadorProps) {
  const inicial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: FONT,
        background:
          "radial-gradient(900px 480px at 50% -8%, rgba(21,87,137,0.38), transparent 65%), radial-gradient(700px 420px at 100% 100%, rgba(217,184,107,0.10), transparent 60%), #050608",
      }}
    >
      {/* cuadrícula de puntos sutil */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(to bottom, #000 0%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 85%)",
        }}
      />

      {/* ─── Barra superior: marca + usuario + GDA ─── */}
      <header className="relative z-10 border-b border-white/10 bg-black/40 backdrop-blur">
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
              <p className="text-[10px] uppercase tracking-widest font-bold mt-1" style={{ color: DORADO }}>
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

      <main className="relative z-10 flex-1 flex flex-col items-center px-4 sm:px-6 pt-8 pb-10">
        {/* ─── Marca + título ─── */}
        <div className="text-center mb-8 sm:mb-10">
          <div
            className="mx-auto mb-4 w-24 rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 0 0 1px rgba(217,184,107,0.35), 0 12px 40px -8px rgba(21,87,137,0.8)" }}
          >
            <img src="/viza-home-logo-nuevo.png" alt="VIZA HOME" className="block w-full h-auto" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            SISTEMA ORQUESTADOR DE{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #b89853 0%, #f1d89b 50%, #D9B86B 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              VIZA HOME
            </span>
          </h1>
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] font-bold mt-2" style={{ color: C_STOCK }}>
            MUEBLES · ELECTRODOMÉSTICOS · HOGAR
          </p>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
            Los módulos del sistema y las 4 sucursales · solo el supremo ve esta pantalla
          </p>
        </div>

        {/* ═══ DIAGRAMA (pantallas grandes): cuadros unidos por líneas de flujo ═══ */}
        <Escenario>
          <svg width={W} height={H} className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <defs>
              <filter id="brillo" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <Flecha id="flecha-dorada" color={DORADO} />
              <Flecha id="flecha-azul" color={C_STOCK} />
              <Flecha id="flecha-violeta" color={C_DISTRI} />
            </defs>
            <Flujo d={FLUJOS_PRINCIPALES[0].d} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={FLUJOS_PRINCIPALES[1].d} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={FLUJOS_PRINCIPALES[2].d} color={C_STOCK} flecha="flecha-azul" />
            {FLUJOS_SUCURSALES.map((f) => (
              <Flujo key={f.id} d={f.d} color={C_DISTRI} punteado flecha="flecha-violeta" />
            ))}
          </svg>

          {FLUJOS_PRINCIPALES.map((f) => (
            <Etiqueta key={f.id} x={f.lx} y={f.ly} texto={f.label} />
          ))}

          <div style={place(POS.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(POS.base)}><BaseCard onClick={onGoBase} /></div>
          <div style={place(POS.cotizador)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(POS.distribuidor)}><DistribuidorCard /></div>
          {SUCURSALES_CUADROS.map((nombre, i) => (
            <div key={nombre} style={place({ x: SUC_X, y: SUC_Y[i], w: SUC_W, h: SUC_H })}>
              <SucursalCard nombre={nombre} />
            </div>
          ))}
          <div style={place(POS.leyenda)}><Leyenda /></div>
        </Escenario>

        {/* ═══ VISTA CELULAR / TABLET: los mismos cuadros, uno debajo del otro ═══ */}
        <div className="lg:hidden w-full max-w-md">
          <div className="min-h-[200px]"><StockCard onClick={onGoStock} /></div>
          <Conector />
          <div className="min-h-[200px]"><BaseCard onClick={onGoBase} /></div>
          <Conector />
          <div className="min-h-[200px]"><CotizadorCard onClick={onGoSales} /></div>
          <Conector color={C_STOCK} />
          <div className="min-h-[300px]"><DistribuidorCard /></div>
          <Conector color={C_DISTRI} />
          <div className="grid grid-cols-2 gap-2.5">
            {SUCURSALES_CUADROS.map((nombre) => (
              <div key={nombre} className="min-h-[96px]"><SucursalCard nombre={nombre} /></div>
            ))}
          </div>
        </div>

        {/* ─── Flujo entre módulos (decorativo) ─── */}
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold tracking-widest text-slate-500">
          <span style={{ color: C_BASE }}>LA BASE</span>
          <span className="text-slate-600">— ALIMENTA →</span>
          <span style={{ color: C_STOCK }}>STOCK</span>
          <span className="text-slate-600">+</span>
          <span style={{ color: C_COTIZ }}>COTIZADOR</span>
          <span className="text-slate-600">— DISTRIBUYE →</span>
          <span style={{ color: C_DISTRI }}>DISTRIBUIDOR INTELIGENTE</span>
        </div>
      </main>
    </div>
  );
}
