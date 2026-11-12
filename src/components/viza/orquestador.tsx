"use client";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA ORQUESTADOR DE VIZA HOME — cara INFOGRÁFICA "LA CASA VIZA"
//
// Idea: el sistema ES la casa de la logo (la "A" con las 4 ventanas doradas):
//   · TECHO (la "A" de la logo)  → LA BASE, el núcleo que sostiene todo.
//   · VENTANAS de la casa        → STOCK GENERAL, COTIZADOR, CRM y los
//                                   DEPARTAMENTOS (Distribución/Logística y Compra).
//   · PUERTA                     → sale hacia la RED DE SUCURSALES (casitas).
//
// SOLO VISUAL: mismas props, mismos permisos, mismos callbacks y mismos
// textos que el orquestador anterior. No toca datos, APIs ni base.
// Marca: azul #155789 · dorado #D9B86B
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Database, Boxes, Calculator, Network, ShoppingCart, ArrowRight, BarChart3, Lock } from "lucide-react";
import { accesosDeUsuario } from "@/lib/acceso-modulos";

const SUCURSALES_CUADROS = [
  "NUEVA ESPERANZA",
  "KATUETE",
  "LA PALOMA",
  "SALTOS DEL GUAIRA",
] as const;

// ─── Paleta ───
const AZUL = "#155789";
const AZUL_OSC = "#0d3d5e";
const DORADO = "#D9B86B";
const C_STOCK = "#4aa8f0";
const C_BASE = DORADO;
const C_COTIZ = "#34d399";
const C_CRM = "#f59e0b";
const C_DISTRI = "#a78bfa";
const C_COMPRA = "#22d3ee";
const FONT = "'Montserrat', sans-serif";

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface OrquestadorProps {
  user: AppUser;
  onGoBase?: () => void;
  onGoStock: () => void;
  onGoSales: () => void;
  onGoCrm: () => void;
  onGoGestion?: () => void;
  onGoCompra?: () => void;
  onGoDistribucion?: () => void;
}

// ─── Dibujitos de cada módulo (infografía) ───
function Dibujo({ tipo, c }: { tipo: "stock" | "base" | "cotiz" | "crm" | "compra" | "distri"; c: string }) {
  const s = { fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 64 48" className="pointer-events-none absolute bottom-2 right-3 h-11 w-14 opacity-90" aria-hidden="true">
      {tipo === "stock" && (
        <g {...s}>
          <rect x="4" y="28" width="18" height="16" fill={`${c}33`} />
          <rect x="24" y="28" width="18" height="16" fill={`${c}33`} />
          <rect x="14" y="10" width="18" height="16" fill={`${c}55`} />
          <path d="M44 44h16M48 36h12" />
        </g>
      )}
      {tipo === "base" && (
        <g {...s}>
          <ellipse cx="32" cy="10" rx="18" ry="6" fill={`${c}44`} />
          <path d="M14 10v26c0 3.3 8 6 18 6s18-2.7 18-6V10" />
          <path d="M14 23c0 3.3 8 6 18 6s18-2.7 18-6" />
        </g>
      )}
      {tipo === "cotiz" && (
        <g {...s}>
          <rect x="16" y="4" width="32" height="40" rx="4" fill={`${c}22`} />
          <rect x="21" y="9" width="22" height="9" rx="1.5" fill={`${c}55`} />
          <path d="M23 26h2M31 26h2M39 26h2M23 33h2M31 33h2M39 33h2M23 40h2M31 40h2" />
        </g>
      )}
      {tipo === "crm" && (
        <g {...s}>
          <rect x="6" y="28" width="9" height="16" fill={`${c}55`} />
          <rect x="21" y="20" width="9" height="24" fill={`${c}55`} />
          <rect x="36" y="12" width="9" height="32" fill={`${c}55`} />
          <path d="M6 18l16-8 14 4 22-10M50 4h8v8" />
        </g>
      )}
      {tipo === "compra" && (
        <g {...s}>
          <path d="M4 6h8l6 24h28l6-18H14" fill={`${c}22`} />
          <circle cx="22" cy="40" r="3.5" fill={c} />
          <circle cx="42" cy="40" r="3.5" fill={c} />
        </g>
      )}
      {tipo === "distri" && (
        <g {...s}>
          <rect x="2" y="12" width="30" height="24" fill={`${c}33`} />
          <path d="M32 20h14l10 10v6H32z" fill={`${c}22`} />
          <circle cx="14" cy="38" r="4" fill="#0b1b2b" />
          <circle cx="46" cy="38" r="4" fill="#0b1b2b" />
        </g>
      )}
    </svg>
  );
}

// Mini casita (sucursales) con las 2 ventanas doradas de la logo
function MiniCasa() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <polygon points="16,3 30,15 2,15" fill={AZUL} stroke={DORADO} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="6" y="15" width="20" height="14" fill={`${AZUL}88`} stroke={`${DORADO}99`} strokeWidth="1.2" />
      <rect x="9" y="18" width="5" height="5" fill={DORADO} />
      <rect x="18" y="18" width="5" height="5" fill={DORADO} />
      <rect x="13.5" y="24" width="5" height="5" fill={`${DORADO}55`} />
    </svg>
  );
}

// Marca de la logo (la "A" casita) para el encabezado
function MarcaA() {
  return (
    <svg viewBox="0 0 40 36" className="h-9 w-10 shrink-0" aria-hidden="true">
      <path d="M20 2 L38 34 H29 L20 17 L11 34 H2 Z" fill={AZUL} stroke={DORADO} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="17" y="22" width="3" height="3" fill={DORADO} />
      <rect x="21" y="22" width="3" height="3" fill={DORADO} />
      <rect x="17" y="26" width="3" height="3" fill={DORADO} />
      <rect x="21" y="26" width="3" height="3" fill={DORADO} />
    </svg>
  );
}

function Pill({ c, children }: { c: string; children: ReactNode }) {
  return (
    <span
      className="shrink-0 text-[9px] font-black tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
    >
      {children}
    </span>
  );
}

// ─── Ventana (módulo principal) ───
interface VentanaProps {
  c: string;
  dibujo: "stock" | "base" | "cotiz" | "crm" | "compra" | "distri";
  icon: ReactNode;
  titulo: string;
  badge: ReactNode;
  onClick?: () => void;
  bloqueado?: boolean;
  // true = cartel punteado (departamentos) / false = ventana sólida
  agente?: boolean;
  hint?: string;
}

function Ventana({ c, dibujo, icon, titulo, badge, onClick, bloqueado = false, agente = false, hint }: VentanaProps) {
  const estilo: CSSProperties = {
    background: `linear-gradient(155deg, ${c}26 0%, rgba(8,28,48,0.93) 55%)`,
    border: agente ? `1px dashed ${c}77` : `1.5px solid ${c}66`,
    boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 36px -16px ${c}88`,
  };
  const base = `relative overflow-hidden h-full w-full text-left rounded-xl p-3 flex flex-col`;
  const contenido = (
    <>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <Dibujo tipo={dibujo} c={c} />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
            style={{ background: `${c}22`, border: `1px solid ${c}66`, boxShadow: `0 0 16px ${c}44` }}
          >
            {icon}
          </div>
          {!agente && <h2 className="text-[14px] font-black text-white leading-tight tracking-tight">{titulo}</h2>}
        </div>
        {badge}
      </div>
      {agente && <h3 className="relative mt-auto pr-16 pt-1 text-[11.5px] font-black text-white leading-tight tracking-tight">{titulo}</h3>}
      {!agente && (
        <p className="relative mt-auto text-[10px] font-black tracking-widest">
          {onClick ? (
            <span className="flex items-center gap-1.5" style={{ color: c }}>
              ABRIR <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          ) : bloqueado ? (
            <span className="text-slate-400 flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> SIN ACCESO
            </span>
          ) : (
            <span className="text-slate-500">EN DESARROLLO</span>
          )}
        </p>
      )}
    </>
  );

  const title = agente
    ? `${titulo}${onClick ? ` — ${hint || "abrir"}` : bloqueado ? " — sin acceso para tu tipo de usuario" : " — próximo paso del sistema"}`
    : bloqueado
      ? "Sin acceso para tu tipo de usuario"
      : undefined;

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`group ${base} cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:brightness-110`}
      style={estilo}
    >
      {contenido}
    </button>
  ) : (
    <div
      title={title}
      className={`${base} select-none ${bloqueado ? "opacity-55 grayscale" : "opacity-90"}`}
      style={{ ...estilo, borderStyle: "dashed" }}
    >
      {contenido}
    </div>
  );
}

function StockCard({ onClick }: { onClick: () => void }) {
  return (
    <Ventana
      c={C_STOCK}
      dibujo="stock"
      icon={<Boxes className="h-5 w-5" style={{ color: C_STOCK }} />}
      titulo="STOCK GENERAL"
      badge={
        <Pill c="#4ade80">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          SYSTEM ONLINE
        </Pill>
      }
      onClick={onClick}
    />
  );
}

function BaseCard({ onClick }: { onClick?: () => void }) {
  return (
    <Ventana
      c={C_BASE}
      dibujo="base"
      icon={<Database className="h-5 w-5" style={{ color: C_BASE }} />}
      titulo="LA BASE"
      badge={<Pill c={C_BASE}>NÚCLEO</Pill>}
      onClick={onClick}
      bloqueado={!onClick}
    />
  );
}

function CotizadorCard({ onClick }: { onClick: () => void }) {
  return (
    <Ventana
      c={C_COTIZ}
      dibujo="cotiz"
      icon={<Calculator className="h-5 w-5" style={{ color: C_COTIZ }} />}
      titulo="COTIZADOR"
      badge={<Pill c={C_COTIZ}>4 PLANES</Pill>}
      onClick={onClick}
    />
  );
}

function CrmCard({ onClick }: { onClick: () => void }) {
  return (
    <Ventana
      c={C_CRM}
      dibujo="crm"
      icon={<BarChart3 className="h-5 w-5" style={{ color: C_CRM }} />}
      titulo="CRM"
      badge={<Pill c={C_CRM}>RANKING</Pill>}
      onClick={onClick}
    />
  );
}

function AgenteDistribucionCard({ onClick }: { onClick?: () => void }) {
  const bloq = !onClick;
  return (
    <Ventana
      agente
      c={C_DISTRI}
      dibujo="distri"
      icon={<Network className="h-4 w-4" style={{ color: C_DISTRI }} />}
      titulo="DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA"
      badge={<Pill c={bloq ? "#94a3b8" : C_DISTRI}>{bloq ? "SIN ACCESO" : "ACTIVO"}</Pill>}
      onClick={onClick}
      bloqueado={bloq}
      hint="abrir Stock General"
    />
  );
}

function AgenteCompraCard({ onClick, hint }: { onClick?: () => void; hint?: string }) {
  const bloq = !onClick;
  return (
    <Ventana
      agente
      c={C_COMPRA}
      dibujo="compra"
      icon={<ShoppingCart className="h-4 w-4" style={{ color: C_COMPRA }} />}
      titulo="DEPARTAMENTO DE COMPRA"
      badge={<Pill c={bloq ? "#94a3b8" : C_COMPRA}>{bloq ? "SIN ACCESO" : "ACTIVO"}</Pill>}
      onClick={onClick}
      bloqueado={bloq}
      hint={hint}
    />
  );
}

function SucursalCard({ nombre }: { nombre: string }) {
  return (
    <div
      className="h-full w-full rounded-xl px-3 flex items-center gap-3 select-none"
      style={{
        background: `linear-gradient(155deg, ${C_DISTRI}22, rgba(8,28,48,0.93) 70%)`,
        border: `1px dashed ${C_DISTRI}66`,
      }}
      title={`${nombre} — stock controlado por el Departamento Distribución/Logística`}
    >
      <MiniCasa />
      <div className="min-w-0">
        <p className="text-[11.5px] font-black text-white leading-tight">{nombre}</p>
        <p className="text-[8.5px] font-bold tracking-widest mt-0.5" style={{ color: C_DISTRI }}>
          PRÓXIMAMENTE
        </p>
      </div>
    </div>
  );
}

// ─── LIENZO: casa + sucursales (se escala al ancho de pantalla) ───
const W = 1090;
const H = 700;

type Rect = { x: number; y: number; w: number; h: number };
const place = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

const POS = {
  base: { x: 170, y: 100, w: 260, h: 85 }, // desván (techo)
  stock: { x: 40, y: 235, w: 240, h: 100 },
  distribucion: { x: 320, y: 235, w: 240, h: 100 },
  cotizador: { x: 40, y: 355, w: 240, h: 100 },
  compra: { x: 320, y: 355, w: 240, h: 100 },
  crm: { x: 40, y: 475, w: 520, h: 100 },
};
const SUC_X = 800;
const SUC_W = 250;
const SUC_H = 80;
const SUC_Y = [190, 300, 410, 520];

// Flujos (mismas relaciones que antes)
const F_BASE_STOCK = "M 200 185 C 200 210, 160 212, 160 235";
const F_BASE_TRONCO = "M 300 185 L 300 405";
const F_TRONCO_COTIZ = "M 300 405 L 284 405";
const F_TRONCO_COMPRA = "M 300 405 L 316 405";
const F_STOCK_DISTRI = "M 280 285 L 318 285";
const F_COMPRA_DISTRI = "M 440 355 L 440 337";
const F_COTIZ_CRM = "M 160 455 L 160 473";
const F_SUCURSALES = SUC_Y.map((y, i) => {
  const yc = y + SUC_H / 2;
  return { id: `distri-suc-${i}`, d: `M 560 285 C 690 285, 700 ${yc}, ${SUC_X} ${yc}` };
});

function Flecha({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}

function Flujo({ d, color, punteado = false, flecha }: { d: string; color: string; punteado?: boolean; flecha: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={8} strokeLinecap="round" filter="url(#brillo)" />
      {punteado ? (
        <path d={d} fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" markerEnd={`url(#${flecha})`}>
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.6s" repeatCount="indefinite" />
        </path>
      ) : (
        <>
          <path d={d} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" markerEnd={`url(#${flecha})`} />
          <circle r={3.5} fill={color}>
            <animateMotion dur="2.8s" repeatCount="indefinite" path={d} />
          </circle>
        </>
      )}
    </g>
  );
}

// Casa dibujada (techo "A", chimenea, paredes, puerta, suelo, nubes)
function CasaDibujo() {
  return (
    <g>
      {/* nubes */}
      <g opacity="0.16" fill="#fff">
        <g>
          <ellipse cx="700" cy="50" rx="46" ry="12" />
          <ellipse cx="725" cy="42" rx="26" ry="11" />
          <animateTransform attributeName="transform" type="translate" values="0 0; 40 0; 0 0" dur="26s" repeatCount="indefinite" />
        </g>
        <g>
          <ellipse cx="900" cy="95" rx="38" ry="10" />
          <ellipse cx="920" cy="88" rx="22" ry="9" />
          <animateTransform attributeName="transform" type="translate" values="0 0; -36 0; 0 0" dur="30s" repeatCount="indefinite" />
        </g>
      </g>

      {/* chimenea + humo */}
      <rect x="470" y="62" width="36" height="100" rx="3" fill={AZUL_OSC} stroke={DORADO} strokeWidth="2.5" />
      <rect x="464" y="56" width="48" height="10" rx="2" fill={AZUL} stroke={DORADO} strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="488" cy="48" r="7" fill="#fff" opacity="0">
          <animate attributeName="cy" values="48;8" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
          <animate attributeName="r" values="5;16" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.22;0" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* paredes */}
      <rect x="20" y="205" width="560" height="445" rx="6" fill="url(#pared)" stroke={`${DORADO}88`} strokeWidth="2" />

      {/* techo = la "A" de la logo */}
      <polygon points="300,10 604,208 -4,208" fill="url(#techo)" stroke={DORADO} strokeWidth="5" strokeLinejoin="round" />
      <polygon points="300,26 566,200 34,200" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />

      {/* las 4 ventanitas doradas de la logo, en la punta del techo */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={284 + (i % 2) * 18} y={48 + Math.floor(i / 2) * 18} width="14" height="14" fill={DORADO}>
          <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
        </rect>
      ))}

      {/* puerta */}
      <path d="M 262 650 V 612 A 38 38 0 0 1 338 612 V 650 Z" fill={`${DORADO}22`} stroke={DORADO} strokeWidth="2.5" />
      <circle cx="326" cy="634" r="3" fill={DORADO} />
      <text x="300" y="672" textAnchor="middle" fontSize="9.5" fontWeight="900" letterSpacing="2" fill={DORADO} fontFamily={FONT}>
        SALIDA A SUCURSALES
      </text>

      {/* camino punteado de la puerta hacia la red de sucursales */}
      <path d="M 338 646 C 520 700, 700 640, 790 620" fill="none" stroke={DORADO} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />

      {/* suelo y arbustos */}
      <line x1="0" y1="650" x2="1090" y2="650" stroke={DORADO} strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="4" cy="640" r="16" fill="#1f8a5a" opacity="0.55" />
      <circle cx="590" cy="642" r="13" fill="#1f8a5a" opacity="0.55" />
      <circle cx="606" cy="646" r="9" fill="#2aa874" opacity="0.5" />

      {/* rótulo de la red */}
      <g>
        <line x1="925" y1="172" x2="925" y2="150" stroke={DORADO} strokeOpacity="0.6" strokeWidth="2" />
      </g>
    </g>
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
    <div ref={ref} className="hidden lg:block w-full" style={{ height: H * escala }}>
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

export function Orquestador({
  user,
  onGoBase,
  onGoStock,
  onGoSales,
  onGoCrm,
  onGoGestion,
  onGoCompra,
  onGoDistribucion,
}: OrquestadorProps) {
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
          "radial-gradient(900px 520px at 28% 4%, rgba(21,87,137,0.55), transparent 65%), radial-gradient(700px 420px at 100% 100%, rgba(217,184,107,0.12), transparent 60%), linear-gradient(180deg, #071a2b 0%, #050b13 100%)",
      }}
    >
      {/* puntitos sutiles */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(to bottom, #000 0%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 85%)",
        }}
      />

      {/* ─── Barra superior ─── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#04101c]/75 backdrop-blur">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-3">
            <MarcaA />
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
              <p className="mt-1 text-[10px] font-bold tracking-widest text-sky-200/70">
                TODO PARA TU HOGAR, EN UN SOLO LUGAR.
              </p>
            </div>
          </div>
          <span className="hidden md:block h-7 w-px bg-white/15" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black shadow-lg shrink-0"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: AZUL_OSC }}
            >
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

      <main className="relative z-10 flex-1 flex flex-col items-center pt-6 pb-10">
        {/* ═══ INFOGRAFÍA (pantallas grandes) ═══ */}
        <Escenario>
          <svg width={W} height={H} className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <defs>
              <filter id="brillo" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <linearGradient id="techo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={AZUL} />
                <stop offset="100%" stopColor={AZUL_OSC} />
              </linearGradient>
              <linearGradient id="pared" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(21,87,137,0.30)" />
                <stop offset="100%" stopColor="rgba(8,28,48,0.55)" />
              </linearGradient>
              <Flecha id="flecha-dorada" color={DORADO} />
              <Flecha id="flecha-azul" color={C_STOCK} />
              <Flecha id="flecha-crm" color={C_CRM} />
              <Flecha id="flecha-violeta" color={C_DISTRI} />
              <Flecha id="flecha-compra" color={C_COMPRA} />
            </defs>

            <CasaDibujo />

            <Flujo d={F_BASE_STOCK} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={F_BASE_TRONCO} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={F_TRONCO_COTIZ} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={F_TRONCO_COMPRA} color={C_COMPRA} flecha="flecha-compra" />
            <Flujo d={F_STOCK_DISTRI} color={C_STOCK} flecha="flecha-azul" />
            <Flujo d={F_COMPRA_DISTRI} color={C_COMPRA} punteado flecha="flecha-compra" />
            <Flujo d={F_COTIZ_CRM} color={C_CRM} flecha="flecha-crm" />
            {F_SUCURSALES.map((f) => (
              <Flujo key={f.id} d={f.d} color={C_DISTRI} punteado flecha="flecha-violeta" />
            ))}
          </svg>

          <div style={place(POS.base)}><BaseCard onClick={onGoBase} /></div>
          <div style={place(POS.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(POS.distribucion)}><AgenteDistribucionCard onClick={onGoDistribucion} /></div>
          <div style={place(POS.cotizador)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(POS.compra)}>
            <AgenteCompraCard onClick={onGoCompra} hint="abrir el Departamento de Compra" />
          </div>
          <div style={place(POS.crm)}><CrmCard onClick={onGoCrm} /></div>

          {/* rótulo de la red de sucursales */}
          <div style={{ position: "absolute", left: SUC_X, top: 120, width: SUC_W }} className="select-none">
            <p className="text-[11px] font-black tracking-[0.25em]" style={{ color: DORADO }}>
              RED DE SUCURSALES
            </p>
            <div className="mt-1.5 h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${DORADO}, transparent)` }} />
          </div>
          {SUCURSALES_CUADROS.map((nombre, i) => (
            <div key={nombre} style={place({ x: SUC_X, y: SUC_Y[i], w: SUC_W, h: SUC_H })}>
              <SucursalCard nombre={nombre} />
            </div>
          ))}
        </Escenario>

        {/* ═══ CELULAR / TABLET: mismos cuadros, uno debajo del otro ═══ */}
        <div className="lg:hidden w-full max-w-md px-4 sm:px-6">
          <div className="min-h-[110px]"><BaseCard onClick={onGoBase} /></div>
          <Conector />
          <div className="min-h-[110px]"><StockCard onClick={onGoStock} /></div>
          <Conector color={C_STOCK} />
          <div className="min-h-[110px]"><AgenteDistribucionCard onClick={onGoDistribucion} /></div>
          <Conector />
          <div className="min-h-[110px]">
            <AgenteCompraCard onClick={onGoCompra} hint="abrir el Departamento de Compra" />
          </div>
          <Conector />
          <div className="min-h-[110px]"><CotizadorCard onClick={onGoSales} /></div>
          <Conector color={C_CRM} />
          <div className="min-h-[110px]"><CrmCard onClick={onGoCrm} /></div>
          <Conector color={C_DISTRI} />
          <p className="text-center text-[11px] font-black tracking-[0.25em] mb-2" style={{ color: DORADO }}>
            RED DE SUCURSALES
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {SUCURSALES_CUADROS.map((nombre) => (
              <div key={nombre} className="min-h-[76px]"><SucursalCard nombre={nombre} /></div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
