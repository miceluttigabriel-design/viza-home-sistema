"use client";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA ORQUESTADOR DE VIZA HOME — rediseño "tema oscuro + identidad VIZA"
// Pantalla "desde arriba" del sistema.
//
// Task 144 (pedido del dueño): además del SUPREMO, también pueden verla los
// ADMINS y los usuarios VIP. El GDA y las acciones críticas (IMPORTAR EXCEL,
// DISTRIBUCIÓN INTELIGENTE) siguen siendo SOLO del supremo.
//
// Distribución del dibujo (rediseño pedido por el dueño):
//   · COLUMNA IZQUIERDA, pegada al borde final de la pantalla, uno debajo
//     del otro y bien alineados:
//       STOCK GENERAL → vista inventario
//       LA BASE → AdminPanel
//       COTIZADOR → SalesPanel
//   · AL LADO DERECHO DE CADA CUADRO PRINCIPAL:
//       ENCARGADO DE DISTRIBUCIÓN (a la altura de STOCK GENERAL)
//       ENCARGADO DE COMPRA       (a la altura de LA BASE)
//   · DERECHA: los 4 cuadritos de sucursales — NUEVA ESPERANZA · KATUETE ·
//     LA PALOMA · SALTOS DEL GUAIRA — unidos al Encargado de Distribución.
//   · Sin etiquetas "ALIMENTA"/"LIGADO": solo las líneas del flujo.
//
// Marca: azul #155789 · dorado #D9B86B · logo /viza-home-logo-nuevo.png
// SOLO ES VISUALIZACIÓN: no toca datos, no toca APIs, no toca la base.
// page.tsx decide qué roles llegan a esta pantalla.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Database, Boxes, Calculator, Network, ShoppingCart, MapPin, ArrowRight } from "lucide-react";
import { esUsuarioVip } from "@/lib/encargados-sucursal";

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
const C_COMPRA = "#22d3ee";
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
  // Task 144: SOLO el supremo recibe esta prop. Si no llega, el botón GDA
  // no se renderiza para admins ni VIPs.
  onGoGestion?: () => void;
  // Pedido del dueño: abre el ENCARGADO DE COMPRA como PÁGINA COMPLETA.
  // Lo recibe el supremo y los usuarios habilitados (page.tsx decide según
  // src/lib/acceso-encargado-compra.ts).
  onGoCompra?: () => void;
}

// ─── Tarjeta de módulo (una sola pieza reutilizada por todos) ───
interface ModuloCardProps {
  c: string;
  icon: ReactNode;
  titulo: string;
  badge: ReactNode;
  onClick?: () => void;
  className?: string;
}

function ModuloCard({ c, icon, titulo, badge, onClick, className = "" }: ModuloCardProps) {
  const estilo: CSSProperties = {
    background: `linear-gradient(155deg, ${c}1f 0%, rgba(9,12,17,0.94) 48%)`,
    border: `1px solid ${c}40`,
    boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 44px -16px ${c}66`,
  };
  const base = `relative overflow-hidden h-full w-full text-left rounded-2xl p-4 flex flex-col ${className}`;

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

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: `${c}22`, border: `1px solid ${c}55`, boxShadow: `0 0 18px ${c}40` }}
          >
            {icon}
          </div>
          <h2 className="text-[15px] font-black text-white leading-tight tracking-tight">{titulo}</h2>
        </div>
        {badge}
      </div>

      <p className="relative mt-auto pt-2 text-[10px] font-black tracking-widest flex items-center gap-1.5">
        {onClick ? (
          <span className="flex items-center gap-1.5" style={{ color: c }}>
            ABRIR <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
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

function BaseCard({ onClick }: { onClick: () => void }) {
  return (
    <ModuloCard
      c={C_BASE}
      icon={<Database className="h-6 w-6" style={{ color: C_BASE }} />}
      titulo="LA BASE"
      badge={<Pill c={C_BASE}>NÚCLEO</Pill>}
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
      badge={<Pill c={C_COTIZ}>4 PLANES</Pill>}
      onClick={onClick}
    />
  );
}

// ─── Agents cards (Task 159/160, pedido del dueño) ───
// Dos cuadritos MENORES en el lugar del antiguo "Distribuidor Inteligente":
//   · ENCARGADO DE DISTRIBUCIÓN → ACTIVO: analiza Base + Stock de las 4
//     sucursales y genera el plan + PDF (solo transferencias internas).
//   · ENCARGADO DE COMPRA       → ACTIVO: analiza la necesidad de compra
//     de la red (stock + CENTRAL + ventas) y arma el informe + PDF.
function AgenteCard({
  c,
  icon,
  titulo,
  estado = "PRÓXIMAMENTE",
  onClick,
  hint,
}: {
  c: string;
  icon: ReactNode;
  titulo: string;
  estado?: string;
  onClick?: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative overflow-hidden h-full w-full rounded-2xl p-3 flex flex-col select-none text-left transition-transform hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-default"
      style={{
        background: `linear-gradient(155deg, ${c}1f 0%, rgba(9,12,17,0.94) 55%)`,
        border: `1px dashed ${c}55`,
        boxShadow: `0 10px 30px -16px ${c}66`,
      }}
      title={`${titulo}${onClick ? ` — ${hint || "abrir Stock General"}` : " — próximo paso del sistema"}`}
    >
      <span
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: `${c}22`, border: `1px solid ${c}55`, boxShadow: `0 0 14px ${c}33` }}
        >
          {icon}
        </div>
        <Pill c={c}>{estado}</Pill>
      </div>
      <h3 className="mt-auto pt-2 text-[12px] font-black text-white leading-tight tracking-tight">{titulo}</h3>
    </button>
  );
}

function AgenteDistribucionCard({ onClick }: { onClick?: () => void }) {
  return (
    <AgenteCard
      c={C_DISTRI}
      icon={<Network className="h-4 w-4" style={{ color: C_DISTRI }} />}
      titulo="ENCARGADO DE DISTRIBUCIÓN"
      estado="ACTIVO"
      onClick={onClick}
    />
  );
}

function AgenteCompraCard({ onClick, hint }: { onClick?: () => void; hint?: string }) {
  return (
    <AgenteCard
      c={C_COMPRA}
      icon={<ShoppingCart className="h-4 w-4" style={{ color: C_COMPRA }} />}
      titulo="ENCARGADO DE COMPRA"
      estado="ACTIVO"
      onClick={onClick}
      hint={hint}
    />
  );
}

function SucursalCard({ nombre }: { nombre: string }) {
  return (
    <div
      className="h-full w-full rounded-xl p-2.5 flex flex-col justify-center select-none"
      style={{
        background: `linear-gradient(155deg, ${C_DISTRI}1a, rgba(9,12,17,0.94) 70%)`,
        border: `1px dashed ${C_DISTRI}55`,
      }}
      title={`${nombre} — stock controlado por el Encargado de Distribución`}
    >
      <MapPin className="h-3.5 w-3.5 mb-1" style={{ color: C_DISTRI }} />
      <p className="text-[10.5px] font-black text-white leading-tight">{nombre}</p>
      <p className="text-[8px] font-bold tracking-widest mt-0.5" style={{ color: C_DISTRI }}>
        PRÓXIMAMENTE
      </p>
    </div>
  );
}

// ─── DIAGRAMA: lienzo fijo que se escala solo al ancho de la pantalla ───
const W = 1050;
const H = 500;

// Cuadros: x, y, ancho, alto (en px del lienzo).
// Pedido del dueño: los dos encargados van AL LADO de su módulo principal —
// DISTRIBUCIÓN a la altura de STOCK GENERAL y COMPRA a la altura de LA BASE.
const POS = {
  stock: { x: 0, y: 0, w: 360, h: 130 },
  base: { x: 0, y: 160, w: 360, h: 130 },
  cotizador: { x: 0, y: 320, w: 360, h: 130 },
  distribucion: { x: 430, y: 10, w: 260, h: 110 },
  compra: { x: 430, y: 170, w: 260, h: 110 },
};
// Sucursales: un poco más separadas entre sí para que el conjunto respire y
// se lea como un ecosistema, sin amontonarse contra los encargados.
const SUC_X = 780;
const SUC_W = 190;
const SUC_H = 80;
const SUC_Y = [14, 140, 266, 392];

type Rect = { x: number; y: number; w: number; h: number };
const place = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

// Líneas de flujo (curvas). Sin etiquetas: el dueño pidió sacar los
// cartelitos "ALIMENTA" y "LIGADO" para que el diagrama quede limpio.
// La columna comparte eje vertical (x=180): La Base alimenta hacia ARRIBA al
// Stock y hacia ABAJO al Cotizador.
const FLUJO_BASE_STOCK = "M 180 160 C 180 150, 180 140, 180 130";
const FLUJO_BASE_COTIZ = "M 180 290 C 180 300, 180 310, 180 320";
// STOCK GENERAL → ENCARGADO DE DISTRIBUCIÓN (mismo eje horizontal, y=65).
const FLUJO_STOCK_DISTRI = "M 360 65 C 390 65, 400 65, 430 65";
// LA BASE → ENCARGADO DE COMPRA (mismo eje horizontal, y=225).
const FLUJO_BASE_COMPRA = "M 360 225 C 390 225, 400 225, 430 225";
// Los dos encargados quedan uno sobre otro: línea corta vertical que los une.
const FLUJO_COMPRA_DISTRI = "M 560 170 C 560 155, 560 135, 560 120";
// Del Encargado de Distribución salen las 4 líneas hacia los cuadritos de
// sucursales (todas desde el mismo punto de salida, abriéndose en abanico).
const FLUJOS_SUCURSALES = SUC_Y.map((y, i) => {
  const yd = y + SUC_H / 2; // centro del cuadrito
  return { id: `distri-suc-${i}`, d: `M 690 65 C 720 65, 740 ${yd}, ${SUC_X} ${yd}` };
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
    // Task 151: el lienzo queda pegado al borde IZQUIERDO de la pantalla (sin
    // mx-auto) para que STOCK GENERAL toque el cantito final de la pantalla.
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

export function Orquestador({ user, onGoBase, onGoStock, onGoSales, onGoGestion, onGoCompra }: OrquestadorProps) {
  const inicial = (user.name || user.email).charAt(0).toUpperCase();
  const esSupremo = user.role === "supremo_admin";
  // Pedido del dueño: el ENCARGADO DE COMPRA se abre como PÁGINA COMPLETA
  // (igual que STOCK GENERAL), sin ventana encima. Para admins/VIP el cuadro
  // mantiene el comportamiento anterior (abre STOCK GENERAL).
  // Task 165: VIP por ROL promovido desde el GDA o por la lista histórica.
  const esVip = esUsuarioVip(user.email, user.role);
  const etiquetaUsuario = esSupremo
    ? "SUPREMO · ACCESO TOTAL"
    : esVip
      ? "VIP · ACCESO"
      : "ADMINISTRADOR";

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-x-clip"
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

      {/* ─── Barra superior fija: título + usuario + GDA ─── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <h1 className="text-base sm:text-xl lg:text-2xl font-black tracking-tight text-white text-center">
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
          <span className="hidden md:block h-7 w-px bg-white/15" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black shadow-lg shrink-0"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
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
          {/* Task 144: GDA SOLO para el supremo. Admins y VIPs ven el
              Orquestador, pero no este botón. */}
          {esSupremo && onGoGestion && (
            <button
              onClick={onGoGestion}
              className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm hover:brightness-110 lg:absolute lg:right-0 lg:top-1/2 lg:-translate-y-1/2"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Gestión de Accesos y Contraseñas"
            >
              GESTIÓN DE ACCESOS
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center pt-6 pb-10">
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
              <Flecha id="flecha-compra" color={C_COMPRA} />
            </defs>
            <Flujo d={FLUJO_BASE_STOCK} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={FLUJO_BASE_COTIZ} color={DORADO} flecha="flecha-dorada" />
            <Flujo d={FLUJO_STOCK_DISTRI} color={C_STOCK} flecha="flecha-azul" />
            <Flujo d={FLUJO_BASE_COMPRA} color={C_COMPRA} flecha="flecha-compra" />
            <Flujo d={FLUJO_COMPRA_DISTRI} color={C_COMPRA} punteado flecha="flecha-compra" />
            {FLUJOS_SUCURSALES.map((f) => (
              <Flujo key={f.id} d={f.d} color={C_DISTRI} punteado flecha="flecha-violeta" />
            ))}
          </svg>

          <div style={place(POS.stock)}><StockCard onClick={onGoStock} /></div>
          <div style={place(POS.base)}><BaseCard onClick={onGoBase} /></div>
          <div style={place(POS.cotizador)}><CotizadorCard onClick={onGoSales} /></div>
          <div style={place(POS.distribucion)}><AgenteDistribucionCard onClick={onGoStock} /></div>
          <div style={place(POS.compra)}>
            <AgenteCompraCard
              onClick={onGoCompra || onGoStock}
              hint={onGoCompra ? "abrir el Encargado de Compra" : "abrir Stock General"}
            />
          </div>
          {SUCURSALES_CUADROS.map((nombre, i) => (
            <div key={nombre} style={place({ x: SUC_X, y: SUC_Y[i], w: SUC_W, h: SUC_H })}>
              <SucursalCard nombre={nombre} />
            </div>
          ))}
        </Escenario>

        {/* ═══ VISTA CELULAR / TABLET: los mismos cuadros, uno debajo del otro ═══ */}
        <div className="lg:hidden w-full max-w-md px-4 sm:px-6">
          <div className="min-h-[120px]"><StockCard onClick={onGoStock} /></div>
          <Conector color={C_STOCK} />
          <div className="min-h-[110px]"><AgenteDistribucionCard onClick={onGoStock} /></div>
          <Conector />
          <div className="min-h-[120px]"><BaseCard onClick={onGoBase} /></div>
          <Conector color={C_COMPRA} />
          <div className="min-h-[110px]">
            <AgenteCompraCard
              onClick={onGoCompra || onGoStock}
              hint={onGoCompra ? "abrir el Encargado de Compra" : "abrir Stock General"}
            />
          </div>
          <Conector />
          <div className="min-h-[120px]"><CotizadorCard onClick={onGoSales} /></div>
          <Conector color={C_DISTRI} />
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
