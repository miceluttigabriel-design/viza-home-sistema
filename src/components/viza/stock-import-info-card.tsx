"use client";

// ─── MINI CUADRITO "ÚLTIMA ACTUALIZACIÓN DE STOCK" (Task 105, dueño) ───
// "cada vez que yo suba el excel para actualizar stock y agregar nuevos
//  productos seria importante que lo equipo tenga esto informado en su
//  panel... cantidad de productos nuevos agregados y horario de
//  actualizacion de stock... creame un mini cuadrito lado izquierdo nel
//  panel de ventas... esto trae mas confianza de trabajo".
//
// Componente PRESENTACIÓN, solo lectura: vive en el HEADER del panel de
// ventas, LADO IZQUIERDO (al lado del reloj, que sigue siendo el primero —
// regla de oro intacta), visible en TODAS las vistas (Cotizador, Safra,
// Cheque, Mayorista). Muestra:
//     [ ⟳ STOCK · Hoy 14:35        ]
//     [ +12 nuevos · 640 actualizados ]
// La fecha se muestra en hora LOCAL del dispositivo ("Hoy 14:35", "Ayer
// 09:12", "28/10 16:45"). Se consulta 1 vez al entrar y se refresca sola
// cada 5 minutos (GET /api/stock-import-info, solo lectura).
//
// NUNCA rompe nada: el fetch es best-effort; si falla o no hay registros
// todavía, el cuadrito queda en modo neutro y el panel funciona igual que
// siempre. No recibe props ni toca datos del presupuesto.
import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";

interface ImportacionInfo {
  fecha: string; // ISO
  nuevos: number;
  actualizados: number;
}

const REFRESCAR_CADA_MS = 5 * 60 * 1000; // 5 minutos

// "Hoy 14:35" / "Ayer 09:12" / "28/10 16:45" / "05/03/27 09:12" en hora local.
function cuandoTexto(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const ese = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDias = Math.round((hoy.getTime() - ese.getTime()) / 86400000);
  const hhmm = d.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (diffDias <= 0) return `Hoy ${hhmm}`;
  if (diffDias === 1) return `Ayer ${hhmm}`;
  const ddmm = d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
  if (d.getFullYear() === ahora.getFullYear()) return `${ddmm} ${hhmm}`;
  return `${ddmm}/${String(d.getFullYear()).slice(-2)} ${hhmm}`;
}

export function StockImportInfoCard() {
  const [info, setInfo] = useState<ImportacionInfo | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      fetch("/api/stock-import-info")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo) return;
          const u = d?.ultima;
          setInfo(u && u.fecha ? { fecha: u.fecha, nuevos: u.nuevos || 0, actualizados: u.actualizados || 0 } : null);
        })
        .catch(() => {
          /* best-effort: sin dato el cuadrito queda neutro */
        });
    };
    cargar();
    const t = setInterval(cargar, REFRESCAR_CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div
      className="flex flex-col items-start text-left px-3 py-1.5 rounded-xl border shrink-0"
      style={{
        backgroundColor: "#FFFFFF",
        borderColor: info ? "#10b981" : "#d6d3d1",
      }}
      title={
        info
          ? `Última actualización de stock (subida del Excel): ${cuandoTexto(info.fecha)} · ${info.nuevos} producto(s) nuevo(s) agregado(s), ${info.actualizados} actualizado(s)`
          : "Todavía no hay registros de actualización de stock. Aparecerá en cuanto se suba la planilla."
      }
    >
      <div className="flex items-center gap-1.5">
        <RefreshCcw className="h-3 w-3" style={{ color: info ? "#059669" : "#78716c" }} />
        <span
          className="text-[11px] font-bold tabular-nums tracking-tight whitespace-nowrap"
          style={{ color: "#000000" }}
        >
          {info ? `STOCK · ${cuandoTexto(info.fecha)}` : "STOCK · sin registros"}
        </span>
      </div>
      {info ? (
        <span className="text-[9px] uppercase tracking-wider mt-0.5 whitespace-nowrap">
          <span className="font-bold" style={{ color: "#059669" }}>
            +{info.nuevos} nuevos
          </span>
          <span style={{ color: "#57534e" }}> · {info.actualizados} actualizados</span>
        </span>
      ) : (
        <span className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: "#78716c" }}>
          esperando 1ra. subida
        </span>
      )}
    </div>
  );
}
