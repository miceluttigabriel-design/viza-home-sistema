"use client";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA ORQUESTADOR DE VIZA HOME — cara "ECOSISTEMA ISOMÉTRICO"
//
//   · CENTRO-ARRIBA: CASA CENTRAL de KATUETE con la FACHADA REAL de la
//     sucursal (foto recortada con fondo transparente) = LA BASE
//   · IZQUIERDA: columna MÓDULOS → AUTOMATIZACIÓN → LA BASE
//   · ADELANTE: las 3 sucursales (Nueva Esperanza, La Paloma y
//     Saltos del Guairá) en fila frente a la Central, con sus líneas
//
// SOLO VISUAL: mismas props, permisos y callbacks que el orquestador
// anterior. Para usarlo, reemplazar src/components/viza/orquestador.tsx
// (el export sigue siendo `Orquestador`).
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Database, Boxes, Calculator, Network, ShoppingCart, BarChart3, Lock, MapPin, Building2 } from "lucide-react";
import { accesosDeUsuario } from "@/lib/acceso-modulos";

const SUCURSALES_CUADROS = ["NUEVA ESPERANZA", "KATUETE", "LA PALOMA", "SALTOS DEL GUAIRA"] as const;

const AZUL = "#155789";
const AZUL_OSC = "#0d3d5e";
const DORADO = "#D9B86B";
const C_STOCK = "#4aa8f0";
const C_COTIZ = "#34d399";
const C_CRM = "#f59e0b";
const C_DISTRI = "#a78bfa";
const C_COMPRA = "#22d3ee";
const FONT = "'Montserrat', sans-serif";

// Colores de las líneas (leyenda)
const L_PEDIDOS = "#38bdf8";
const L_FISICO = "#fb923c";
const L_SYNC = "#4ade80";
const L_PAGOS = "#a78bfa";
const L_POST = "#94a3b8";

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface OrquestadorProps {
  user: AppUser;
  onGoBase?: () => void;
  // Task 171 (pedido del dueño): STOCK GENERAL no está disponible para
  // usuarios COMUNES. page.tsx solo pasa esta prop con permiso; sin ella el
  // cuadro se dibuja BLOQUEADO (no se rompe la vista).
  onGoStock?: () => void;
  onGoSales: () => void;
  onGoCrm: () => void;
  onGoGestion?: () => void;
  onGoCompra?: () => void;
  onGoDistribucion?: () => void;
}

const GLASS: CSSProperties = {
  background: "linear-gradient(160deg, rgba(20,70,150,0.55), rgba(7,25,60,0.88))",
  border: "1.5px solid rgba(56,160,255,0.65)",
  boxShadow: "0 0 26px rgba(56,160,255,0.28), inset 0 0 18px rgba(56,160,255,0.12)",
};

// ─── Tarjeta de módulo / departamento (DORADO VIZA con letra NEGRA) ───
// Pedido del dueño: los cuadros del Orquestador (La Base, Stock General,
// Cotizador, CRM y los Departamentos) van en el DORADO de VIZA y con la
// escritura en NEGRO. El botón de la opción ya no hace falta: el cuadro
// entero es el botón.
function Tarjeta({
  icon,
  titulo,
  onClick,
  bloqueado = false,
  hint,
}: {
  icon: ReactNode;
  titulo: ReactNode;
  onClick?: () => void;
  bloqueado?: boolean;
  hint?: string;
}) {
  const estilo: CSSProperties = {
    background: "linear-gradient(135deg, #b89853 0%, #D9B86B 55%, #efd89d 100%)",
    border: "1.5px solid #8a6d2f",
    boxShadow: "0 0 22px rgba(217,184,107,0.40), inset 0 0 18px rgba(255,255,255,0.30)",
  };
  const cuerpo = (
    <>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "rgba(0,0,0,0.22)" }} />
      <div
        className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.10)", border: "1px solid rgba(0,0,0,0.35)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-black text-black leading-tight tracking-tight">{titulo}</div>
        {!onClick && (
          <p className="mt-1 text-[9.5px] font-black tracking-widest">
            {bloqueado ? (
              <span className="inline-flex items-center gap-1 text-black/70">
                <Lock className="h-3 w-3" /> SIN ACCESO
              </span>
            ) : (
              <span className="text-black/60">EN DESARROLLO</span>
            )}
          </p>
        )}
      </div>
    </>
  );
  const base = "relative overflow-hidden h-full w-full rounded-xl px-3 flex items-center gap-2.5 text-left";
  const title = bloqueado ? "Sin acceso para tu tipo de usuario" : hint;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`group ${base} cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110`} style={estilo}>
      {cuerpo}
    </button>
  ) : (
    <div title={title} className={`${base} select-none ${bloqueado ? "opacity-55 grayscale" : "opacity-90"}`} style={{ ...estilo, borderStyle: "dashed" }}>
      {cuerpo}
    </div>
  );
}

function BaseCard({ onClick }: { onClick?: () => void }) {
  return (
    <Tarjeta
      icon={<Database className="h-5 w-5" style={{ color: "#000" }} />}
      titulo={
        <>
          <div className="text-[11px] font-black text-black leading-none">LA BASE</div>
          <div className="mt-0.5 flex flex-col gap-0.5">
            <span className="text-[10px] font-black uppercase tracking-tight">CENTRAL</span>
            <span className="text-[8px] font-bold tracking-widest opacity-85">KATUETE · CASA CENTRAL</span>
          </div>
        </>
      }
      onClick={onClick}
      bloqueado={!onClick}
      hint="abrir La Base"
    />
  );
}
function StockCard({ onClick }: { onClick?: () => void }) {
  return (
    <Tarjeta
      icon={<Boxes className="h-5 w-5" style={{ color: "#000" }} />}
      titulo="STOCK GENERAL"
      onClick={onClick}
      // Task 171: sin permiso (usuario COMÚN) se ve igual, pero bloqueado.
      bloqueado={!onClick}
      hint="abrir Stock General"
    />
  );
}
function CotizadorCard({ onClick }: { onClick: () => void }) {
  return (
    <Tarjeta
      icon={<Calculator className="h-5 w-5" style={{ color: "#000" }} />}
      titulo="COTIZADOR"
      onClick={onClick}
    />
  );
}
function CrmCard({ onClick }: { onClick: () => void }) {
  return (
    <Tarjeta
      icon={<BarChart3 className="h-5 w-5" style={{ color: "#000" }} />}
      titulo="CRM"
      onClick={onClick}
    />
  );
}
function DistriCard({ onClick }: { onClick?: () => void }) {
  const b = !onClick;
  return (
    <Tarjeta
      icon={<Network className="h-5 w-5" style={{ color: "#000" }} />}
      titulo="DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA"
      onClick={onClick}
      bloqueado={b}
      hint="abrir Stock General"
    />
  );
}
function CompraCard({ onClick, hint }: { onClick?: () => void; hint?: string }) {
  const b = !onClick;
  return (
    <Tarjeta
      icon={<ShoppingCart className="h-5 w-5" style={{ color: "#000" }} />}
      titulo="DEPARTAMENTO DE COMPRA"
      onClick={onClick}
      bloqueado={b}
      hint={hint}
    />
  );
}

// Cartel de sucursal (como los banners del ejemplo)
function SucursalBanner({ nombre }: { nombre: string }) {
  return (
    <div className="h-full w-full rounded-xl px-3 flex items-center gap-2.5 select-none" style={GLASS} title={`${nombre} — stock controlado por el Departamento Distribución/Logística`}>
      <MapPin className="h-5 w-5 shrink-0" style={{ color: C_DISTRI }} />
      <div className="min-w-0">
        <p className="text-[12px] font-black text-white leading-tight">SUCURSAL {nombre}</p>
        <p className="text-[9px] font-bold tracking-widest mt-0.5" style={{ color: C_DISTRI }}>
          SHOWROOM + DEPÓSITO · PRÓXIMAMENTE
        </p>
      </div>
    </div>
  );
}

// Cartel de la Casa Central: va arriba de la fachada real y aclara que la
// Central está en el primer piso y abajo está el salón de Katuete.
function CentralBanner() {
  return (
    <div
      className="h-full w-full rounded-xl px-3 flex items-center gap-2.5 select-none"
      style={GLASS}
      title="CASA CENTRAL — Central en el primer piso + Salón Katuete en planta baja"
    >
      <Building2 className="h-5 w-5 shrink-0" style={{ color: DORADO }} />
      <div className="min-w-0">
        <p className="text-[12px] font-black text-white leading-tight">CENTRAL · PRIMER PISO</p>
        <p className="text-[9px] font-bold tracking-widest mt-0.5" style={{ color: DORADO }}>
          + SALÓN KATUETE
        </p>
      </div>
    </div>
  );
}

// ─── Edificio isométrico dibujado en SVG (sucursales) ───
// La Casa Central ya no usa este dibujo: muestra la fachada REAL de la
// sucursal de Katuete (public/orquestador/central-viza-home.webp).
function Edificio({ x, y, s = 1, h = 56, pisos = 1 }: { x: number; y: number; s?: number; h?: number; pisos?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* plataforma */}
      <polygon points={`0,${h - 70} 140,${h} 0,${h + 70} -140,${h}`} fill="#101d36" stroke="#3b82f6" strokeOpacity="0.8" strokeWidth="1.5" filter="url(#glow)" />
      <polygon points={`0,${h - 58} 120,${h} 0,${h + 58} -120,${h}`} fill="#1a2a48" opacity="0.8" />
      {Array.from({ length: pisos }, (_, i) => {
        // Cada piso se apoya en el techo del anterior (dy = -h * i).
        const dy = -h * i;
        const arriba = i === pisos - 1;
        const paredIzq = i === 0 ? "#cfd9e8" : "#e4ebf5";
        const paredDer = i === 0 ? "#8fa3bd" : "#9fb2c9";
        const techo = i === 0 ? "#dbe3ee" : "#e8eef7";
        const techoInt = i === 0 ? "#5b6b82" : "#64748b";
        return (
          <g key={i}>
            {/* cara izquierda */}
            <g transform={`translate(-120 ${dy}) matrix(1 0.5 0 1 0 0)`}>
              <rect width="120" height={h} fill={paredIzq} />
              <rect x="8" y="6" width="104" height="16" fill="#1d4ed8" />
              <text x="60" y="18" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily={FONT}>VIZA HOME</text>
              {[0, 1, 2, 3].map((w) => (
                <rect key={w} x={10 + w * 27} y="28" width="19" height={h - 36} fill="#f6c36a" opacity="0.9" stroke="#1e3a8a" strokeWidth="1.5" />
              ))}
            </g>
            {/* cara derecha */}
            <g transform={`translate(0 ${60 + dy}) matrix(1 -0.5 0 1 0 0)`}>
              <rect width="120" height={h} fill={paredDer} />
              {[0, 1, 2].map((w) => (
                <rect key={w} x={8 + w * 36} y="14" width="26" height={h - 24} fill="#1e3a8a" opacity="0.9" stroke="#e2e8f0" strokeWidth="1" />
              ))}
            </g>
            {/* techo del piso */}
            <polygon points={`0,${-60 + dy} 120,${dy} 0,${60 + dy} -120,${dy}`} fill={techo} stroke="#94a3b8" strokeWidth="1" />
            <polygon points={`0,${-42 + dy} 86,${dy} 0,${42 + dy} -86,${dy}`} fill={techoInt} />
            {arriba && (
              <g transform={`translate(-6 ${dy - 4})`}>
                {[0, 1, 2, 3].map((w) => (
                  <rect key={w} x={(w % 2) * 8} y={Math.floor(w / 2) * 8} width="6" height="6" fill={DORADO}>
                    <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" begin={`${w * 0.3}s`} repeatCount="indefinite" />
                  </rect>
                ))}
              </g>
            )}
          </g>
        );
      })}
      {/* camioneta en el patio */}
      <g transform={`translate(34 ${h + 30})`}>
        <polygon points="0,0 34,17 34,29 0,12" fill="#2563eb" />
        <polygon points="34,17 46,11 46,23 34,29" fill="#1e3a8a" />
        <polygon points="0,0 12,-6 46,11 34,17" fill="#e2e8f0" />
      </g>
    </g>
  );
}

// ─── Líneas de flujo ───
function Flecha({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}

type Estilo = "pedidos" | "fisico" | "sync" | "pagos" | "post";
const COLORES: Record<Estilo, string> = { pedidos: L_PEDIDOS, fisico: L_FISICO, sync: L_SYNC, pagos: L_PAGOS, post: L_POST };
const DASH: Record<Estilo, string | undefined> = { pedidos: undefined, fisico: "9 6", sync: "2 7", pagos: undefined, post: "14 5" };

function Linea({ d, t, ida = true }: { d: string; t: Estilo; ida?: boolean }) {
  const c = COLORES[t];
  const dash = DASH[t];
  return (
    <g>
      <path d={d} fill="none" stroke={c} strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round" filter="url(#glow)" />
      <path d={d} fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeDasharray={dash} markerEnd={`url(#f-${t})`} markerStart={ida ? undefined : `url(#f-${t})`}>
        {dash && <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1.8s" repeatCount="indefinite" />}
      </path>
      {!dash && (
        <circle r="3.5" fill={c}>
          <animateMotion dur="3s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  );
}

// ─── Lienzo escalable ───
const W = 1340;
const H = 940;
type Rect = { x: number; y: number; w: number; h: number };
const place = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

const R = {
  // Task 184 (pedido del dueño): toda la columna izquierda, de arriba hacia
  // abajo, uno debajo del otro: MÓDULOS DEL SISTEMA →
  // AUTOMATIZACIÓN / INTEGRACIÓN → LA BASE · CENTRAL.
  panelMod: { x: 16, y: 8, w: 300, h: 282 },
  stock: { x: 32, y: 44, w: 268, h: 70 },
  cotiz: { x: 32, y: 124, w: 268, h: 70 },
  crm: { x: 32, y: 204, w: 268, h: 70 },
  // Mismo ancho y estilo que el panel de módulos, justo debajo.
  panelAuto: { x: 16, y: 300, w: 300, h: 188 },
  distri: { x: 32, y: 336, w: 268, h: 64 },
  compra: { x: 32, y: 408, w: 268, h: 64 },
  // La Base cierra la columna, debajo del panel de automatización.
  base: { x: 32, y: 504, w: 268, h: 70 },
  // Katuete es la CASA CENTRAL. Ya no se dibuja con el edificio isométrico
  // genérico: el centro y arriba va la FACHADA REAL de la sucursal (foto con
  // fondo transparente). Las otras 3 sucursales van adelante, en una fila.
  // Cartel arriba de la Casa Central.
  centralBanner: { x: 630, y: 150, w: 300, h: 56 },
  neBanner: { x: 230, y: 600, w: 300, h: 56 },
  lpBanner: { x: 610, y: 600, w: 300, h: 56 },
  sgBanner: { x: 990, y: 600, w: 300, h: 56 },
};

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
    <div ref={ref} className="hidden lg:block w-full" style={{ height: H * escala }}>
      <div style={{ position: "relative", width: W, height: H, transform: `scale(${escala})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

function Conector({ color = DORADO }: { color?: string }) {
  return <div className="mx-auto h-7 w-0.5 rounded" style={{ background: `linear-gradient(${color}, ${color}55)`, boxShadow: `0 0 10px ${color}66` }} />;
}

// ─── Casa Central: fachada real sobre una plataforma isométrica ───
// La foto de la sucursal se apoya en el mismo tipo de plataforma que usan
// las sucursales del dibujo (rombo azul). Así queda "medio 3D", a escala y
// apenas más grande que una sucursal: no un cartel gigante.
const CENTRAL_W = 500;
// La foto mide 1200x335: se mantiene la proporción exacta para no deformarla.
const CENTRAL_H = Math.round((CENTRAL_W * 335) / 1200); // 140
function CasaCentral({ cx = 780, base = 450 }: { cx?: number; base?: number }) {
  return (
    <g>
      {/* halo de luz en el piso */}
      <ellipse cx={cx} cy={base + 18} rx={300} ry={40} fill="url(#centralGlow)">
        <animate attributeName="opacity" values="0.55;1;0.55" dur="5s" repeatCount="indefinite" />
      </ellipse>
      {/* plataforma isométrica, igual estilo que las sucursales */}
      <polygon
        points={`${cx},${base - 62} ${cx + 270},${base} ${cx},${base + 62} ${cx - 270},${base}`}
        fill="#101d36"
        stroke="#3b82f6"
        strokeOpacity="0.8"
        strokeWidth="1.5"
        filter="url(#glow)"
      />
      <polygon
        points={`${cx},${base - 50} ${cx + 240},${base} ${cx},${base + 50} ${cx - 240},${base}`}
        fill="#1a2a48"
        opacity="0.8"
      />
      {/* fachada real de Katuete (foto recortada, fondo transparente) */}
      <image
        href="/orquestador/central-viza-home.webp"
        x={cx - CENTRAL_W / 2}
        y={base - CENTRAL_H}
        width={CENTRAL_W}
        height={CENTRAL_H}
        preserveAspectRatio="xMidYMid meet"
        style={{
          filter:
            "drop-shadow(0 12px 14px rgba(0,0,0,0.55)) drop-shadow(0 0 22px rgba(56,160,255,0.22))",
        }}
      />
    </g>
  );
}

export function Orquestador({ user, onGoBase, onGoStock, onGoSales, onGoCrm, onGoGestion, onGoCompra, onGoDistribucion }: OrquestadorProps) {
  const inicial = (user.name || user.email).charAt(0).toUpperCase();
  const accesos = accesosDeUsuario(user);
  const esSupremo = accesos.esSupremo;
  const etiquetaUsuario =
    accesos.tipo === "SUPREMO"
      ? "SUPREMO · ACCESO TOTAL"
      : accesos.tipo === "ADMIN"
        ? "ADMINISTRADOR"
        : accesos.tipo === "VIP"
          ? "VIP · ACCESO"
          : accesos.tipo === "ESPECIAL"
            ? "ESPECIAL · ENCARGADO"
            : "COMÚN · VENDEDOR";

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-x-clip"
      style={{
        fontFamily: FONT,
        background:
          "radial-gradient(1000px 600px at 50% 45%, rgba(30,90,200,0.35), transparent 65%), radial-gradient(700px 420px at 0% 0%, rgba(21,87,137,0.45), transparent 60%), linear-gradient(180deg, #08162e 0%, #050d1c 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(120,180,255,0.10) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* ─── Barra superior ─── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#04101c]/80 backdrop-blur">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <div className="text-center sm:text-left">
            <h1 className="text-base sm:text-xl lg:text-2xl font-black tracking-tight text-white leading-none">
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
          </div>
          <span className="hidden md:block h-7 w-px bg-white/15" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black shadow-lg shrink-0" style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: AZUL_OSC }}>
              {inicial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none truncate">{user.name || user.email}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold mt-1" style={{ color: DORADO }}>
                {etiquetaUsuario}
              </p>
            </div>
          </div>
          {esSupremo && onGoGestion && (
            <button
              onClick={onGoGestion}
              className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm hover:brightness-110 lg:absolute lg:right-0 lg:top-1/2 lg:-translate-y-1/2"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: AZUL_OSC }}
              title="Gestión de Accesos y Contraseñas"
            >
              GESTIÓN DE ACCESOS
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center pt-4 pb-10">
        {/* ═══ ECOSISTEMA (pantallas grandes) ═══ */}
        <Escenario>
          <svg width={W} height={H} className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              {/* Halo azul que apoya la fachada real de la Casa Central. */}
              <radialGradient id="centralGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.40" />
                <stop offset="55%" stopColor="#2563eb" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </radialGradient>
              {(Object.keys(COLORES) as Estilo[]).map((t) => (
                <Flecha key={t} id={`f-${t}`} color={COLORES[t]} />
              ))}
            </defs>

            {/* Las 3 sucursales, adelante y en fila. La Casa Central (centro
                y arriba) se muestra aparte con la FACHADA REAL de Katuete. */}
            <Edificio x={380} y={760} />
            <Edificio x={760} y={760} />
            <Edificio x={1140} y={760} />

            {/* Panel automatización → cuadro de La Base (conectores cortos en
                la columna izquierda) */}
            <Linea d="M 86 488 L 86 504" t="pedidos" ida={false} />
            <Linea d="M 152 488 L 152 504" t="pagos" ida={false} />
            <Linea d="M 218 488 L 218 504" t="sync" ida={false} />
            <Linea d="M 280 488 L 280 504" t="post" ida={false} />
            {/* La Base → edificio central */}
            <Linea d="M 300 539 C 410 566, 520 514, 566 458" t="sync" />

            {/* Nueva Esperanza → Central */}
            <Linea d="M 530 612 C 570 600, 592 520, 626 452" t="pedidos" ida={false} />
            <Linea d="M 530 630 C 575 620, 606 545, 640 470" t="fisico" ida={false} />
            <Linea d="M 530 648 C 582 640, 620 570, 654 481" t="sync" ida={false} />
            {/* La Paloma → Central */}
            <Linea d="M 680 600 C 708 570, 740 535, 756 500" t="pedidos" ida={false} />
            <Linea d="M 780 600 L 780 498" t="fisico" ida={false} />
            <Linea d="M 860 600 C 832 570, 812 535, 804 500" t="sync" ida={false} />
            {/* Saltos del Guairá → Central */}
            <Linea d="M 990 612 C 950 600, 928 520, 934 452" t="pedidos" ida={false} />
            <Linea d="M 990 630 C 945 620, 914 545, 920 470" t="fisico" ida={false} />
            <Linea d="M 990 648 C 938 640, 900 570, 906 481" t="sync" ida={false} />

            {/* Módulos (columna izquierda) → Central: llegan al lateral
                izquierdo de la fachada real. */}
            <Linea d="M 308 79 C 395 130, 470 270, 524 396" t="pedidos" ida={false} />
            <Linea d="M 308 159 C 400 200, 480 300, 527 418" t="pagos" ida={false} />
            <Linea d="M 308 239 C 405 275, 490 330, 530 440" t="post" ida={false} />

            {/* Casa Central: fachada REAL de la sucursal de Katuete sobre
                plataforma isométrica, a escala con las sucursales. */}
            <CasaCentral />
          </svg>

          {/* Columna izquierda: MÓDULOS DEL SISTEMA → AUTOMATIZACIÓN /
              INTEGRACIÓN → LA BASE · CENTRAL, uno debajo del otro */}
          <div className="rounded-3xl" style={{ ...place(R.panelMod), ...GLASS }} />
          <p style={{ position: "absolute", left: R.panelMod.x, top: 20, width: R.panelMod.w }} className="text-center text-[13px] font-black tracking-[0.18em] text-white">
            MÓDULOS DEL SISTEMA
          </p>
          <div style={place(R.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(R.cotiz)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(R.crm)}><CrmCard onClick={onGoCrm} /></div>

          <div className="rounded-3xl" style={{ ...place(R.panelAuto), ...GLASS }} />
          <p style={{ position: "absolute", left: R.panelAuto.x, top: 312, width: R.panelAuto.w }} className="text-center text-[11px] font-black tracking-[0.16em] text-white">
            AUTOMATIZACIÓN / INTEGRACIÓN
          </p>
          <div style={place(R.distri)}><DistriCard onClick={onGoDistribucion} /></div>
          <div style={place(R.compra)}><CompraCard onClick={onGoCompra} hint="abrir el Departamento de Compra" /></div>

          {/* La Base cierra la columna izquierda */}
          <div style={place(R.base)}><BaseCard onClick={onGoBase} /></div>

          {/* Cartel arriba de la Casa Central */}
          <div style={place(R.centralBanner)}><CentralBanner /></div>

          {/* Sucursales (adelante, en fila frente a la Central) */}
          <div style={place(R.neBanner)}><SucursalBanner nombre="NUEVA ESPERANZA" /></div>
          <div style={place(R.lpBanner)}><SucursalBanner nombre="LA PALOMA" /></div>
          <div style={place(R.sgBanner)}><SucursalBanner nombre="SALTOS DEL GUAIRA" /></div>
        </Escenario>

        {/* ═══ CELULAR / TABLET ═══ */}
        <div className="lg:hidden w-full max-w-md px-4 sm:px-6">
          <div className="h-[76px]"><BaseCard onClick={onGoBase} /></div>
          <Conector />
          <div className="h-[76px]"><DistriCard onClick={onGoDistribucion} /></div>
          <Conector color={C_COMPRA} />
          <div className="h-[76px]"><CompraCard onClick={onGoCompra} hint="abrir el Departamento de Compra" /></div>
          <Conector color={C_STOCK} />
          <div className="h-[76px]"><StockCard onClick={onGoStock} /></div>
          <Conector color={C_COTIZ} />
          <div className="h-[76px]"><CotizadorCard onClick={onGoSales} /></div>
          <Conector color={C_CRM} />
          <div className="h-[76px]"><CrmCard onClick={onGoCrm} /></div>
          <Conector color={C_DISTRI} />
          <div className="grid grid-cols-1 gap-2.5">
            {SUCURSALES_CUADROS.map((nombre) => (
              <div key={nombre} className="h-[60px]"><SucursalBanner nombre={nombre} /></div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
