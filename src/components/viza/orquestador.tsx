"use client";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA ORQUESTADOR DE VIZA HOME — cara "ECOSISTEMA ISOMÉTRICO"
//
//   · CENTRO: CENTRAL / KATUETÉ (CD central) = LA BASE (núcleo)
//   · ARRIBA: panel AUTOMATIZACIÓN / INTEGRACIÓN = los 2 Departamentos
//   · ALREDEDOR: edificios 3D de las sucursales + líneas de flujo
//   · ABAJO-IZQUIERDA: MÓDULOS (Stock General, Cotizador, CRM)
//
// SOLO VISUAL: mismas props, permisos y callbacks que el orquestador
// anterior. Para usarlo, reemplazar src/components/viza/orquestador.tsx
// (el export sigue siendo `Orquestador`).
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Database, Boxes, Calculator, Network, ShoppingCart, ArrowRight, BarChart3, Lock, MapPin } from "lucide-react";
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

// ─── Tarjeta de módulo / departamento (cristal con brillo) ───
function Tarjeta({
  c,
  icon,
  titulo,
  badge,
  onClick,
  bloqueado = false,
  hint,
}: {
  c: string;
  icon: ReactNode;
  titulo: string;
  badge: ReactNode;
  onClick?: () => void;
  bloqueado?: boolean;
  hint?: string;
}) {
  const estilo: CSSProperties = {
    ...GLASS,
    border: `1.5px solid ${c}99`,
    boxShadow: `0 0 22px ${c}44, inset 0 0 16px ${c}1f`,
  };
  const cuerpo = (
    <>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <div
        className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: `${c}22`, border: `1px solid ${c}77`, boxShadow: `0 0 16px ${c}55` }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[12px] font-black text-white leading-tight tracking-tight">{titulo}</h3>
        <p className="mt-1 text-[9.5px] font-black tracking-widest">
          {onClick ? (
            // Pedido del dueño: la opción ABRIR va en DORADO VIZA con letra
            // NEGRA, como botón, dentro de cada cuadro del Orquestador.
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[9px] font-black tracking-widest shadow-sm transition-transform group-hover:translate-x-0.5"
              style={{
                background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)",
                color: "#000000",
              }}
            >
              ABRIR <ArrowRight className="h-3 w-3" />
            </span>
          ) : bloqueado ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Lock className="h-3 w-3" /> SIN ACCESO
            </span>
          ) : (
            <span className="text-slate-500">EN DESARROLLO</span>
          )}
        </p>
      </div>
      {badge}
    </>
  );
  const base = "relative overflow-hidden h-full w-full rounded-xl px-3 flex items-center gap-2.5 text-left";
  const title = bloqueado ? "Sin acceso para tu tipo de usuario" : hint;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`group ${base} cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125`} style={estilo}>
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
      c={DORADO}
      icon={<Database className="h-5 w-5" style={{ color: DORADO }} />}
      titulo="LA BASE · CENTRAL KATUETÉ"
      badge={<Pill c={DORADO}>NÚCLEO</Pill>}
      onClick={onClick}
      bloqueado={!onClick}
      hint="abrir La Base"
    />
  );
}
function StockCard({ onClick }: { onClick?: () => void }) {
  return (
    <Tarjeta
      c={C_STOCK}
      icon={<Boxes className="h-5 w-5" style={{ color: C_STOCK }} />}
      titulo="STOCK GENERAL"
      badge={
        onClick ? (
          <Pill c="#4ade80">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            SYSTEM ONLINE
          </Pill>
        ) : (
          <Pill c="#94a3b8">RESTRINGIDO</Pill>
        )
      }
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
      c={C_COTIZ}
      icon={<Calculator className="h-5 w-5" style={{ color: C_COTIZ }} />}
      titulo="COTIZADOR"
      badge={<Pill c={C_COTIZ}>4 PLANES</Pill>}
      onClick={onClick}
    />
  );
}
function CrmCard({ onClick }: { onClick: () => void }) {
  return (
    <Tarjeta
      c={C_CRM}
      icon={<BarChart3 className="h-5 w-5" style={{ color: C_CRM }} />}
      titulo="CRM"
      badge={<Pill c={C_CRM}>RANKING</Pill>}
      onClick={onClick}
    />
  );
}
function DistriCard({ onClick }: { onClick?: () => void }) {
  const b = !onClick;
  return (
    <Tarjeta
      c={C_DISTRI}
      icon={<Network className="h-5 w-5" style={{ color: C_DISTRI }} />}
      titulo="DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA"
      badge={<Pill c={b ? "#94a3b8" : C_DISTRI}>{b ? "SIN ACCESO" : "ACTIVO"}</Pill>}
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
      c={C_COMPRA}
      icon={<ShoppingCart className="h-5 w-5" style={{ color: C_COMPRA }} />}
      titulo="DEPARTAMENTO DE COMPRA"
      badge={<Pill c={b ? "#94a3b8" : C_COMPRA}>{b ? "SIN ACCESO" : "ACTIVO"}</Pill>}
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

// ─── Edificio isométrico dibujado en SVG ───
function Edificio({ x, y, s = 1, h = 56, central = false }: { x: number; y: number; s?: number; h?: number; central?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* plataforma */}
      <polygon points={`0,${h - 70} 140,${h} 0,${h + 70} -140,${h}`} fill="#101d36" stroke="#3b82f6" strokeOpacity="0.8" strokeWidth="1.5" filter="url(#glow)" />
      <polygon points={`0,${h - 58} 120,${h} 0,${h + 58} -120,${h}`} fill="#1a2a48" opacity="0.8" />
      {/* cara izquierda */}
      <g transform="translate(-120 0) matrix(1 0.5 0 1 0 0)">
        <rect width="120" height={h} fill="#cfd9e8" />
        <rect x="8" y="6" width="104" height="16" fill="#1d4ed8" />
        <text x="60" y="18" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily={FONT}>VIZA HOME</text>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={10 + i * 27} y="28" width="19" height={h - 36} fill="#f6c36a" opacity="0.9" stroke="#1e3a8a" strokeWidth="1.5" />
        ))}
      </g>
      {/* cara derecha */}
      <g transform={`translate(0 60) matrix(1 -0.5 0 1 0 0)`}>
        <rect width="120" height={h} fill="#8fa3bd" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={8 + i * 36} y="14" width="26" height={h - 24} fill="#1e3a8a" opacity="0.9" stroke="#e2e8f0" strokeWidth="1" />
        ))}
      </g>
      {/* techo */}
      <polygon points="0,-60 120,0 0,60 -120,0" fill="#dbe3ee" stroke="#94a3b8" strokeWidth="1" />
      <polygon points="0,-42 86,0 0,42 -86,0" fill="#5b6b82" />
      {[-24, -8, 8, 24].map((o) => (
        <line key={o} x1={-62 + o * 0.5} y1={o * 0.5 + 12} x2={62 + o * 0.5} y2={o * 0.5 - 12} stroke="#f59e0b" strokeWidth="5" strokeOpacity="0.85" strokeLinecap="round" />
      ))}
      {/* camionetas en el patio */}
      <g transform={`translate(${central ? 20 : 34} ${h + 30})`}>
        <polygon points="0,0 34,17 34,29 0,12" fill="#2563eb" />
        <polygon points="34,17 46,11 46,23 34,29" fill="#1e3a8a" />
        <polygon points="0,0 12,-6 46,11 34,17" fill="#e2e8f0" />
      </g>
      {central && (
        <>
          <g transform={`translate(-30 ${h + 38})`}>
            <polygon points="0,0 34,17 34,29 0,12" fill="#2563eb" />
            <polygon points="34,17 46,11 46,23 34,29" fill="#1e3a8a" />
            <polygon points="0,0 12,-6 46,11 34,17" fill="#e2e8f0" />
          </g>
          <g transform={`translate(-80 ${h + 12})`}>
            <polygon points="0,0 34,17 34,29 0,12" fill="#2563eb" />
            <polygon points="34,17 46,11 46,23 34,29" fill="#1e3a8a" />
            <polygon points="0,0 12,-6 46,11 34,17" fill="#e2e8f0" />
          </g>
        </>
      )}
      {/* luz de la A de la logo sobre el techo */}
      <g transform="translate(-6 -4)">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={(i % 2) * 8} y={Math.floor(i / 2) * 8} width="6" height="6" fill={DORADO}>
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </rect>
        ))}
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
const H = 780;
type Rect = { x: number; y: number; w: number; h: number };
const place = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

const R = {
  panelTop: { x: 420, y: 6, w: 500, h: 128 },
  distri: { x: 436, y: 52, w: 232, h: 70 },
  compra: { x: 672, y: 52, w: 232, h: 70 },
  base: { x: 500, y: 178, w: 340, h: 76 },
  panelMod: { x: 20, y: 448, w: 390, h: 262 },
  stock: { x: 36, y: 498, w: 172, h: 76 },
  cotiz: { x: 222, y: 498, w: 172, h: 76 },
  crm: { x: 36, y: 590, w: 358, h: 76 },
  neBanner: { x: 80, y: 140, w: 300, h: 56 },
  lpBanner: { x: 960, y: 140, w: 300, h: 56 },
  sgBanner: { x: 960, y: 496, w: 300, h: 56 },
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
            <p className="mt-1 text-[10px] font-bold tracking-widest text-sky-300">UN SOLO ECOSISTEMA, TODOS LOS CANALES.</p>
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
              {(Object.keys(COLORES) as Estilo[]).map((t) => (
                <Flecha key={t} id={`f-${t}`} color={COLORES[t]} />
              ))}
            </defs>

            {/* edificios */}
            <Edificio x={230} y={270} />
            <Edificio x={1110} y={270} />
            <Edificio x={1110} y={620} />
            <Edificio x={670} y={360} s={1.4} h={70} central />

            {/* Panel automatización → banner de La Base */}
            <Linea d="M 560 134 L 560 176" t="pedidos" ida={false} />
            <Linea d="M 625 134 L 625 176" t="pagos" ida={false} />
            <Linea d="M 715 134 L 715 176" t="sync" ida={false} />
            <Linea d="M 780 134 L 780 176" t="post" ida={false} />
            {/* La Base → edificio central */}
            <Linea d="M 670 254 L 670 280" t="sync" />

            {/* Nueva Esperanza ↔ Central */}
            <Linea d="M 372 300 C 440 300, 450 330, 520 345" t="pedidos" ida={false} />
            <Linea d="M 372 322 C 440 335, 460 362, 525 364" t="fisico" ida={false} />
            <Linea d="M 360 342 C 430 355, 470 384, 540 388" t="sync" ida={false} />
            {/* La Paloma ↔ Central */}
            <Linea d="M 968 300 C 900 300, 890 330, 820 345" t="pedidos" ida={false} />
            <Linea d="M 968 322 C 900 335, 880 362, 815 364" t="fisico" ida={false} />
            <Linea d="M 980 342 C 910 355, 870 384, 800 388" t="sync" ida={false} />
            {/* Saltos del Guairá ↔ Central */}
            <Linea d="M 972 640 C 900 630, 880 530, 800 485" t="pedidos" ida={false} />
            <Linea d="M 975 662 C 900 662, 870 548, 790 500" t="fisico" ida={false} />
            <Linea d="M 982 620 C 910 600, 890 510, 810 470" t="sync" ida={false} />
            {/* Módulos ↔ Central */}
            <Linea d="M 412 540 C 470 540, 490 500, 545 470" t="pedidos" ida={false} />
            <Linea d="M 412 566 C 480 575, 500 525, 556 484" t="pagos" ida={false} />
            <Linea d="M 412 592 C 490 600, 510 545, 570 500" t="post" ida={false} />
          </svg>

          {/* Panel superior: automatización / integración */}
          <div className="rounded-2xl" style={{ ...place(R.panelTop), ...GLASS }} />
          <p style={{ position: "absolute", left: R.panelTop.x, top: 16, width: R.panelTop.w }} className="text-center text-[14px] font-black tracking-[0.18em] text-white">
            AUTOMATIZACIÓN / INTEGRACIÓN
          </p>
          <div style={place(R.distri)}><DistriCard onClick={onGoDistribucion} /></div>
          <div style={place(R.compra)}><CompraCard onClick={onGoCompra} hint="abrir el Departamento de Compra" /></div>

          {/* Centro: La Base */}
          <div style={place(R.base)}><BaseCard onClick={onGoBase} /></div>

          {/* Sucursales */}
          <div style={place(R.neBanner)}><SucursalBanner nombre="NUEVA ESPERANZA" /></div>
          <div style={place(R.lpBanner)}><SucursalBanner nombre="LA PALOMA" /></div>
          <div style={place(R.sgBanner)}><SucursalBanner nombre="SALTOS DEL GUAIRA" /></div>

          {/* Panel de módulos */}
          <div className="rounded-3xl" style={{ ...place(R.panelMod), ...GLASS }} />
          <p style={{ position: "absolute", left: R.panelMod.x, top: 462, width: R.panelMod.w }} className="text-center text-[13px] font-black tracking-[0.18em] text-white">
            MÓDULOS DEL SISTEMA
          </p>
          <div style={place(R.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(R.cotiz)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(R.crm)}><CrmCard onClick={onGoCrm} /></div>
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
