"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  LogOut,
  LayoutDashboard,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  History,
  Power,
  RefreshCw,
  Download,
  AlertCircle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface Usuario {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  contrasenaActual: string;
  fechaUltimoCambio: string | null;
  cambiadoPor: string | null;
}

interface HistorialItem {
  id: string;
  contrasena: string;
  fechaCambio: string;
  cambiadoPor: string;
}

interface GestionAccesosProps {
  user: AppUser;
  onGoSales: () => void;
  onGoAdmin: () => void;
}

function formatDatePY(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return ts;
  }
}

function roleBadge(role: string): { label: string; cls: string; icon: string } {
  if (role === "supremo_admin") {
    return { label: "SUPREMO ADMIN", cls: "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-amber-600", icon: "👑" };
  }
  if (role === "admin") {
    return { label: "ADMIN", cls: "bg-sky-100 text-sky-800 border-sky-300", icon: "🛡️" };
  }
  // Compat hacia atrás: representante → colaborador
  return { label: "COLABORADOR", cls: "bg-stone-100 text-stone-700 border-stone-300", icon: "👤" };
}

function formatPYG(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "Gs " + Math.round(v).toLocaleString("es-PY");
}

export function GestionAccesos({ user, onGoSales, onGoAdmin }: GestionAccesosProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroRol, setFiltroRol] = useState<string>("todos");
  const [mostrarContrasenas, setMostrarContrasenas] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historialModal, setHistorialModal] = useState<{ email: string; name: string | null; items: HistorialItem[] } | null>(null);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [resetando, setResetando] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // Estado para polling en tiempo real
  const [destacadosIds, setDestacadosIds] = useState<Set<string>>(new Set());
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [pollingActivo, setPollingActivo] = useState(true);
  // Modal: cambiar mi propia contraseña (visible también para el supremo)
  const [cambiarContrasenaOpen, setCambiarContrasenaOpen] = useState(false);

  const cargar = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al cargar usuarios");
      }
      const data = await res.json();
      const nuevos: Usuario[] = data.usuarios || [];

      // Detectar cambios para highlight verde (polling tiempo real)
      setUsuarios((prev) => {
        if (prev.length === 0) return nuevos;
        const cambios = new Set<string>();
        for (const n of nuevos) {
          const old = prev.find((p) => p.id === n.id);
          if (!old) {
            cambios.add(n.id);
          } else if (
            old.contrasenaActual !== n.contrasenaActual ||
            old.active !== n.active ||
            old.role !== n.role
          ) {
            cambios.add(n.id);
          }
        }
        if (cambios.size > 0) {
          setDestacadosIds(cambios);
          setUltimaActualizacion(new Date());
          setTimeout(() => setDestacadosIds(new Set()), 2500);
        }
        return nuevos;
      });
    } catch (e: any) {
      if (!silent) toast.error(e.message || "No se pudieron cargar los usuarios");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    cargar();
  }, []);

  // Polling en tiempo real: cada 5 segundos
  useEffect(() => {
    if (!pollingActivo) return;
    const intervalId = setInterval(() => {
      cargar(true);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [pollingActivo]);

  const copiar = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    toast.success("Copiado");
  };

  const abrirHistorial = async (u: Usuario) => {
    setLoadingHistorial(true);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/historial`);
      if (!res.ok) {
        throw new Error("Error al cargar historial");
      }
      const data = await res.json();
      setHistorialModal({
        email: data.email,
        name: data.name,
        items: data.historial || [],
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingHistorial(false);
    }
  };

  const resetearContrasena = async (u: Usuario) => {
    const confirmar = window.confirm(
      `¿Seguro que querés RESETEAR la contraseña de ${u.email}?\nSe generará una nueva contraseña aleatoria y se reemplazará la actual.`
    );
    if (!confirmar) return;

    setResetando(u.id);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/resetar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al resetear");
      }
      const data = await res.json();
      toast.success(`Nueva contraseña para ${data.email}: ${data.nuevaContrasena}`);
      await cargar(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetando(null);
    }
  };

  const toggleActive = async (u: Usuario) => {
    const nuevoEstado = !u.active;
    const accion = nuevoEstado ? "activar" : "desactivar";
    if (!window.confirm(`¿Confirmás ${accion} el usuario ${u.email}?`)) return;

    setToggling(u.id);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/toggle-active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nuevoEstado }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al cambiar estado");
      }
      toast.success(`Usuario ${nuevoEstado ? "activado" : "desactivado"}: ${u.email}`);
      await cargar(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setToggling(null);
    }
  };

  const descargarListado = () => {
    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push("  LISTADO DE USUARIOS Y CONTRASEÑAS - VIZA HOME E.A.S");
    lines.push("  Sistema de Cotización y Presupuestos");
    lines.push("  Generado por: " + (user.email || "SUPREMO ADMIN"));
    lines.push("  Fecha: " + formatDatePY(new Date().toISOString()));
    lines.push("================================================================================");
    lines.push("");

    const supremos = usuarios.filter((u) => u.role === "supremo_admin");
    const admins = usuarios.filter((u) => u.role === "admin");
    const reps = usuarios.filter((u) => u.role === "colaborador" || u.role === "representante");

    if (supremos.length) {
      lines.push("👑 SUPREMO ADMINISTRADOR (Acceso Total + Gestión de Contraseñas)");
      lines.push("  ─ PUEDE VER Y RESETEAR TODAS LAS CONTRASEÑAS DESDE EL PANEL ─");
      lines.push("-".repeat(80));
      for (const u of supremos) {
        lines.push(`  Email:        ${u.email}`);
        lines.push(`  Contraseña:   ${u.contrasenaActual}`);
        lines.push(`  Nombre:       ${u.name}`);
        lines.push("");
      }
    }

    if (admins.length) {
      lines.push("🛡️ USUARIOS ADMIN (Acceso Total: Admin + Ventas)");
      lines.push("-".repeat(80));
      for (const u of admins) {
        lines.push(`  ${u.email.padEnd(40)} | ${u.contrasenaActual}`);
        lines.push(`  ${u.name}`);
        lines.push("");
      }
    }

    if (reps.length) {
      lines.push("👥 USUARIOS COLABORADORES (Solo Ventas - No Acceden al Panel Admin)");
      lines.push("-".repeat(80));
      for (const u of reps) {
        lines.push(`  ${u.email.padEnd(40)} | ${u.contrasenaActual}`);
        lines.push(`  ${u.name}`);
        lines.push("");
      }
    }

    lines.push("================================================================================");
    lines.push(`  TOTAL: ${usuarios.length} usuarios`);
    lines.push(`    Supremo Admin:  ${supremos.length}`);
    lines.push(`    Admin:          ${admins.length}`);
    lines.push(`    Colaborador:    ${reps.length}`);
    lines.push("================================================================================");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "LISTADO-USUARIOS-VIZA-HOME.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Listado descargado");
  };

  // Filtrado
  const filtrados = usuarios.filter((u) => {
    const matchSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name || "").toLowerCase().includes(search.toLowerCase());
    // Compat hacia atrás: representante ≡ colaborador
    const esColaborador = (r: string) => r === "colaborador" || r === "representante";
    const matchRol =
      filtroRol === "todos" ||
      u.role === filtroRol ||
      (filtroRol === "colaborador" && esColaborador(u.role));
    return matchSearch && matchRol;
  });

  return (
    <div className="min-h-screen bg-stone-100">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        .viza-row-highlight {
          background-color: #d4edda !important;
          animation: viza-flash-green 2.5s ease-out forwards;
        }
        @keyframes viza-flash-green {
          0%   { background-color: #22c55e !important; }
          20%  { background-color: #86efac !important; }
          100% { background-color: transparent !important; }
        }
        .viza-row-highlight td {
          transition: background-color 0.5s ease;
        }
      ` }} />
      <header className="sticky top-0 z-30 border-b" style={{ backgroundColor: "#155789", borderColor: "#0d3d5e" }}>
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #b89853 0%, #D9B86B 50%, #b89853 100%)" }} />
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: "system-ui, sans-serif" }}>VIZA</span>
              <span className="text-base font-bold" style={{ color: "#D9B86B", fontFamily: "system-ui, sans-serif" }}>home</span>
            </div>
            <div className="hidden md:block border-l pl-3 ml-1" style={{ borderColor: "#D9B86B" }}>
              <p className="text-[11px] font-medium text-white/80">SUPREMO · Gestión de Accesos y Contraseñas</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] italic" style={{ color: "#D9B86B" }}>Todo para tu hogar, en un solo lugar.</p>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border"
                  style={{
                    background: pollingActivo ? "rgba(34, 197, 94, 0.15)" : "rgba(120, 113, 108, 0.2)",
                    color: pollingActivo ? "#86efac" : "#d6d3d1",
                    borderColor: pollingActivo ? "#22c55e" : "#78716c",
                  }}
                  title={pollingActivo ? "Polling activo: consulta cada 5 segundos" : "Actualización automática en pausa"}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: pollingActivo ? "#22c55e" : "#78716c",
                      animation: pollingActivo ? "pulse-dot 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                  TIEMPO REAL {pollingActivo ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onGoAdmin}
              className="h-10 px-3 sm:px-4 rounded-xl text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">VOLVER A ADMIN</span>
              <span className="sm:hidden">ADMIN</span>
            </button>
            <button
              onClick={onGoSales}
              className="h-10 px-3 sm:px-4 rounded-xl text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">IR A VENTAS</span>
              <span className="sm:hidden">VENTAS</span>
            </button>

            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-white leading-none">{user.name || user.email}</span>
              <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "#D9B86B" }}>SUPREMO ADMIN</span>
            </div>
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <button
              onClick={() => setCambiarContrasenaOpen(true)}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors text-white hover:bg-white/10"
              style={{ backgroundColor: "rgba(217, 184, 107, 0.18)", color: "#D9B86B" }}
              title="Cambiar mi contraseña"
            >
              <KeyRound className="h-5 w-5" />
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors text-white hover:bg-white/10"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal: Cambiar mi contraseña */}
      <CambiarContrasena
        email={user.email}
        open={cambiarContrasenaOpen}
        onClose={() => setCambiarContrasenaOpen(false)}
      />

      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Tarjeta de resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-stone-500 text-[11px] uppercase font-semibold tracking-wide">
              <AlertCircle className="h-4 w-4" /> TOTAL USUARIOS
            </div>
            <p className="text-3xl font-black text-stone-900 mt-1">{usuarios.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-amber-700 text-[11px] uppercase font-semibold tracking-wide">
              👑 SUPREMO ADMIN
            </div>
            <p className="text-3xl font-black text-amber-600 mt-1">
              {usuarios.filter((u) => u.role === "supremo_admin").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-sky-700 text-[11px] uppercase font-semibold tracking-wide">
              🛡️ ADMIN
            </div>
            <p className="text-3xl font-black text-sky-600 mt-1">
              {usuarios.filter((u) => u.role === "admin").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-stone-600 text-[11px] uppercase font-semibold tracking-wide">
              👤 COLABORADOR
            </div>
            <p className="text-3xl font-black text-stone-700 mt-1">
              {usuarios.filter((u) => u.role === "colaborador" || u.role === "representante").length}
            </p>
          </div>
        </div>

        {/* Barra de acciones */}
        <div className="bg-white rounded-xl p-3 border border-stone-200 shadow-sm flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email o nombre..."
              className="w-full h-10 pl-10 pr-4 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            />
          </div>

          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="h-10 px-3 rounded-lg bg-stone-100 border border-stone-200 text-sm font-medium focus:outline-none"
          >
            <option value="todos">TODOS</option>
            <option value="supremo_admin">SUPREMO ADMIN</option>
            <option value="admin">ADMIN</option>
            <option value="colaborador">COLABORADOR</option>
          </select>

          <button
            onClick={() => setMostrarContrasenas((v) => !v)}
            className={`h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors border ${
              mostrarContrasenas
                ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
            }`}
          >
            {mostrarContrasenas ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">{mostrarContrasenas ? "OCULTAR" : "MOSTRAR"} CLAVES</span>
            <span className="sm:hidden">{mostrarContrasenas ? "OCULTAR" : "MOSTRAR"}</span>
          </button>

          <button
            onClick={descargarListado}
            className="h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 bg-stone-900 text-white hover:bg-stone-800 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">DESCARGAR LISTADO TXT</span>
            <span className="sm:hidden">TXT</span>
          </button>

          <button
            onClick={() => setPollingActivo((v) => !v)}
            title={pollingActivo ? "Pausar actualización automática" : "Activar actualización automática"}
            className={`h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 border transition-colors ${
              pollingActivo
                ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-200"
                : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${pollingActivo ? "bg-green-500 animate-pulse" : "bg-stone-400"}`} />
            <span className="hidden sm:inline">{pollingActivo ? "AUTO ON" : "AUTO OFF"}</span>
          </button>

          <button
            onClick={() => cargar(false)}
            disabled={loading}
            className="h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">RECARGAR</span>
          </button>

          {/* Indicador de última actualización */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-stone-500 ml-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>
              {ultimaActualizacion
                ? `Última actualización: ${formatDatePY(ultimaActualizacion.toISOString())}`
                : "Esperando primera actualización..."}
            </span>
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-3 flex items-start gap-2 text-amber-900">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-xs sm:text-sm leading-relaxed">
            <strong>IMPORTANTE:</strong> Este panel es visible únicamente para el <strong>SUPREMO ADMINISTRADOR</strong>. Las contraseñas se muestran en texto plano para fines de recuperación y auditoría. Cada cambio de contraseña queda registrado en la bitácora (tabla <code className="bg-amber-100 px-1 rounded">PasswordLog</code>).
          </p>
        </div>

        {/* Tabla de usuarios */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#155789" }} className="text-white">
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Rol</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Estado</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Contraseña Actual</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Último Cambio</th>
                  <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-500">
                      No se encontraron usuarios con esos filtros.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((u, idx) => {
                    const rb = roleBadge(u.role);
                    const destacado = destacadosIds.has(u.id);
                    return (
                      <tr
                        key={u.id}
                        className={destacado ? "viza-row-highlight" : idx % 2 === 0 ? "bg-white" : "bg-stone-50/60"}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                        data-usuario-id={u.id}
                      >
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-stone-900 text-xs">{u.email}</span>
                        </td>
                        <td className="px-3 py-2.5 text-stone-700 text-xs">{u.name || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${rb.cls}`}>
                            <span>{rb.icon}</span>
                            {rb.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300 text-[10px] font-bold uppercase">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              ACTIVO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 text-[10px] font-bold uppercase">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              INACTIVO
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <code className={`px-2 py-1 rounded text-xs font-mono ${destacado ? "bg-green-100 text-green-900 ring-2 ring-green-400" : "bg-stone-100 text-stone-800"}`}>
                              {mostrarContrasenas ? u.contrasenaActual : "•".repeat(Math.min(u.contrasenaActual.length, 16))}
                            </code>
                            {destacado && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full border border-green-300 animate-pulse">
                                <RefreshCw className="h-3 w-3" />
                                ACTUALIZADO
                              </span>
                            )}
                            {mostrarContrasenas && (
                              <button
                                onClick={() => copiar(u.contrasenaActual, u.id)}
                                className="text-stone-400 hover:text-stone-700 transition-colors"
                                title="Copiar"
                              >
                                {copiedId === u.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-stone-500 text-xs">
                          {formatDatePY(u.fechaUltimoCambio)}
                          {u.cambiadoPor && (
                            <span className="block text-[10px] uppercase font-bold text-stone-400">por {u.cambiadoPor}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirHistorial(u)}
                              title="Ver historial"
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => resetearContrasena(u)}
                              disabled={resetando === u.id || u.role === "supremo_admin"}
                              title={u.role === "supremo_admin" ? "No se puede resetear al supremo" : "Resetear contraseña"}
                              className="h-8 px-2 rounded-lg flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors text-[11px] font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {resetando === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                              <span className="hidden sm:inline">RESETEAR</span>
                            </button>
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={toggling === u.id || u.role === "supremo_admin"}
                              title={u.role === "supremo_admin" ? "No se puede desactivar al supremo" : u.active ? "Desactivar" : "Activar"}
                              className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.active
                                  ? "text-red-600 hover:bg-red-50"
                                  : "text-green-600 hover:bg-green-50"
                              }`}
                            >
                              {toggling === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-[10px] text-stone-400 uppercase tracking-widest pb-4">
          VIZA HOME E.A.S · Sistema de Gestión de Accesos · Solo Supremo Admin
        </p>
      </main>

      {/* Modal de historial */}
      {historialModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setHistorialModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ backgroundColor: "#155789", borderColor: "#0d3d5e" }}>
              <div>
                <h3 className="text-white font-bold text-base flex items-center gap-2">
                  <History className="h-5 w-5" style={{ color: "#D9B86B" }} />
                  HISTORIAL DE CONTRASEÑAS
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  {historialModal.email} {historialModal.name && `· ${historialModal.name}`}
                </p>
              </div>
              <button
                onClick={() => setHistorialModal(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {loadingHistorial ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-stone-400" />
                </div>
              ) : historialModal.items.length === 0 ? (
                <p className="text-center text-stone-500 py-8 text-sm">
                  No hay cambios de contraseña registrados.
                </p>
              ) : (
                historialModal.items.map((h, idx) => (
                  <div
                    key={h.id}
                    className={`p-3 rounded-lg border ${idx === 0 ? "bg-amber-50 border-amber-300" : "bg-stone-50 border-stone-200"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-sm font-mono font-semibold text-stone-900">
                        {h.contrasena}
                      </code>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      <strong>Cambio:</strong> {formatDatePY(h.fechaCambio)} · <strong>Por:</strong> {h.cambiadoPor || "—"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
