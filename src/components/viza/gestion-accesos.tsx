"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  LogOut,
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
  Bell,
  BellOff,
  MapPin,
  Phone,
  UserPlus,
  Pencil,
  X,
  Trash2,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";
// Lista de encargados de sucursal con acceso al CRM (la MISMA lista que usa
// la API /api/crm/ranking para decidir quién ve el CRM). Lib estática y
// client-safe: no importa Prisma ni la base (ver cabecera del archivo).
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
// Task 139 (pedido del dueño): usuarios VIP de la central (filipe.campos@,
// viza.compras@) — solo la etiqueta visible; misma lib client-safe.
// Task 165: además de la lista fija, el TIPO VIP ahora se puede PROMOVER
// desde el GDA (User.role = "vip").
import { esUsuarioVip } from "@/lib/encargados-sucursal";
// Task 101 (pedido del dueño): número de CONTACTO de cada usuario, sacado de
// la planilla oficial FUN.VIZA (columna CONTACTO, coincidencia por EMAIL).
// Task 141: ese número ahora llega en `contacto` desde /api/admin/usuarios
// (edición guardada desde el GDA con prioridad sobre la planilla).

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
  // Sucursal asignada (tabla UsuarioSucursal, la misma del CRM). "" = sin sucursal.
  sucursal: string;
  // Task 141: número de contacto editable desde el GDA. Es el mismo que sale
  // en la franja del vendedor en TODOS los presupuestos.
  contacto: string;
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
  // Task 91 (mudanza visual): SOLO llega al supremo (gestión es solo suya).
  // Botón para volver al Orquestador (los 4 cuadros).
  onGoOrquestador?: () => void;
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

// Task 77: sin emojis en los tipos (pedido del dueño: sacar la estrella, el
// escudo y la corona) — solo texto con su color.
function roleBadge(role: string, email?: string): { label: string; cls: string } {
  if (role === "supremo_admin") {
    return { label: "SUPREMO ADMIN", cls: "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-amber-600" };
  }
  // Task 165: el TIPO guardado en la base MANDA (promoción hecha desde el GDA
  // con el botón GUARDAR). Así, promover a VIP/ESPECIAL desde acá se ve al
  // instante en toda la columna Tipo.
  if (role === "vip") {
    return {
      label: "VIP",
      cls: "bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-amber-950 border-amber-700 shadow-[0_0_8px_rgba(217,184,107,0.65)]",
    };
  }
  if (role === "especial") {
    return { label: "ESPECIAL", cls: "bg-emerald-100 text-emerald-800 border-emerald-400" };
  }
  // ESPECIAL (Task 139, pedido del dueño): los ENCARGADOS de sucursal que ven
  // el CRM de su sucursal (antes se mostraban como VIP — Task 76). Etiqueta
  // visible únicamente: el rol en la base sigue siendo colaborador y su
  // acceso al CRM NO cambia nada. Verde esmeralda, distinto del VIP.
  if (email && esEspecial(email)) {
    return { label: "ESPECIAL", cls: "bg-emerald-100 text-emerald-800 border-emerald-400" };
  }
  // VIP (Task 139/140/141, pedido del dueño): usuarios destacados de la
  // CENTRAL (filipe.campos@ = DIRECTORIO, viza.compras@ = ENC. COMPRAS).
  // "viza.compras@ ... con etiqueta dourada VIP nomas": el VIP manda sobre
  // el rol ADMIN de la base (viza.compras@ fue sembrado como admin), así que
  // se evalúa ANTES que admin. Etiqueta visible: no cambia permisos.
  if (email && esVip(email)) {
    return {
      label: "VIP",
      cls: "bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-amber-950 border-amber-700 shadow-[0_0_8px_rgba(217,184,107,0.65)]",
    };
  }
  if (role === "admin") {
    return { label: "ADMIN", cls: "bg-sky-100 text-sky-800 border-sky-300" };
  }
  // Compat hacia atrás: representante → colaborador. Etiqueta visible con el
  // vocabulario del dueño (Supremo / Admin / ESPECIAL / VIP / Común); el rol
  // en la base no cambia.
  return { label: "COMÚN", cls: "bg-stone-100 text-stone-700 border-stone-300" };
}

function formatPYG(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "Gs " + Math.round(v).toLocaleString("es-PY");
}

// ─── TIPO DE USUARIO (vocabulario del dueño: Supremo / Admin / ESPECIAL / VIP / Común) ───
// Es SOLO la etiqueta visible del rol guardado en la base: supremo_admin →
// SUPREMO, admin → ADMIN, colaborador/representante → COMÚN. No cambia
// ningún dato, permiso ni consulta.
// ESPECIAL (Task 139, pedido del dueño: "jeyson / antonio.fagner / danwillian /
// librado vas a poner como usuario tipo ESPECIAL"): los 4 ENCARGADOS de
// sucursal que ven el CRM — MISMA lista ENCARGADOS_SUCURSAL que habilita el
// botón CRM en el panel de ventas y el acceso por la API. Fuente única de
// verdad. Solo cambió el NOMBRE de la etiqueta (antes VIP); el acceso no
// se toca.
function esEspecial(email: string): boolean {
  return !!ENCARGADOS_SUCURSAL[(email || "").trim().toLowerCase()];
}

// VIP (Task 139, pedido del dueño: "filipe.campos y viza.compras el TIPO vas
// a poner como VIP"): lista USUARIOS_VIP de la central. Etiqueta visible
// únicamente — no da acceso al CRM ni cambia permisos.
function esVip(email: string): boolean {
  return esUsuarioVip(email);
}

function tipoUsuario(role: string, email?: string): string {
  if (role === "supremo_admin") return "SUPREMO";
  // Task 165: el TIPO PROMOVIDO desde el GDA (guardado en User.role) manda.
  if (role === "vip") return "VIP";
  if (role === "especial") return "ESPECIAL";
  // Task 141: ESPECIAL/VIP históricos (listas fijas) mandan sobre el rol
  // ADMIN de la base. Es solo la etiqueta visible del GDA.
  if (email && esEspecial(email)) return "ESPECIAL";
  if (email && esVip(email)) return "VIP";
  if (role === "admin") return "ADMIN";
  return "COMÚN";
}

// Etiqueta del TIPO que se ve en la tabla (Task 165: única fuente para el
// select, los filtros, los contadores y el listado descargable).
function tipoEfectivo(u: { role: string; email: string }): string {
  return tipoUsuario(u.role, u.email);
}

// Tipo visible → rol real guardado en la base.
const ROL_POR_TIPO: Record<string, string> = {
  "COMÚN": "colaborador",
  ADMIN: "admin",
  ESPECIAL: "especial",
  VIP: "vip",
};

// ─── SUCURSALES para dividir la tabla de usuarios (pedido del dueño) ───
// Task 137: CENTRAL vuelve a ser una sucursal propia para USUARIOS (la
// oficina central estaba metida "dentro de KATUETE" y el dueño pasó la lista
// de 24 correos que deben quedar en CENTRAL). MISMA lista que
// SUCURSALES_USUARIO de src/lib/sucursal-usuario.ts, pero definida ACÁ a
// propósito: esa lib importa Prisma (solo servidor) y este componente es
// cliente, así que NO se puede importar de ahí. Las sucursales de STOCK de
// productos siguen siendo solo las 4 de venta — esto es solo de usuarios.
const SUCURSALES_GDA = [
  "CENTRAL",
  "KATUETE",
  "LA PALOMA",
  "NUEVA ESPERANZA",
  "SALTOS DEL GUAIRA",
] as const;
const SIN_SUCURSAL = "SIN SUCURSAL";

// Sucursal normalizada de un usuario (mayúsculas, sin espacios). Vacía o
// sin asignar = SIN SUCURSAL (se muestra al final de la tabla).
function sucursalDe(u: Usuario): string {
  const v = (u.sucursal || "").trim().toUpperCase();
  return v || SIN_SUCURSAL;
}

// ─── SECTOR POR USUARIO (planilla oficial FUN.VIZA, columna "Dtpo. LABORAL") ───
// Pedido del dueño: categorizar cada usuario por el sector que tiene la
// planilla de funcionarios (VENTAS, CAJA, COBRANZA, GERENTE, etc.),
// coincidiendo el EMAIL. Es SOLO REFERENCIA de lectura en el cliente:
// NO se guarda en la base, NO cambia el modelo User, NO toca ninguna API.
// Si un email no está en la planilla (ej. usuarios creados a mano con
// correo personal) se muestra "GENERAL". Cero riesgo para el sistema.
const SECTOR_GENERAL = "GENERAL";

// Orden fijo de los sectores conocidos (directorio primero, ventas después,
// generales de oficina al medio). Los que no estén acá van alfabéticos y
// GENERAL siempre al final.
const SECTORES_ORDEN = [
  "DIRECTORIO",
  "GERENTE ADMINISTRATIVO",
  "ENC. SUCURSAL",
  "ENC. COMPRAS",
  "CONTABILIDAD",
  "FINANCIERO",
  "RR.HH",
  "AUDITORIA",
  "STOCK",
  "DOCUMENTOS",
  "CREDITO",
  "COBRANZA",
  "CAJA",
  "FACTURACION",
  "DEPOSITO",
  "VENTAS",
  "VENTAS ONLINE",
  "TELEVENTAS",
  "MARKETING",
  "ARTES VISUAL",
  "REDES SOCIALES",
  "WEB",
  "SERCOM",
] as const;

const MAPA_SECTOR_EXCEL: Record<string, string> = {
  // DIRECTORIO (Representante Legal, Directores y cónyuges — planilla CENTRAL)
  "viza@viza.com.py": "DIRECTORIO",
  "juliane@viza.com.py": "DIRECTORIO",
  "larazago@viza.com.py": "DIRECTORIO",
  "juliozago@viza.com.py": "DIRECTORIO",
  "filipe.campos@viza.com.py": "DIRECTORIO",
  "julianamoleiro@viza.com.py": "DIRECTORIO",
  // Gerencias
  "baltazar@viza.com.py": "GERENTE ADMINISTRATIVO",
  // Encargados de sucursal (en la planilla dicen GERENTE; el dueño pidió
  // mostrarlos como ENC. SUCURSAL — Task 76). Task 139: estos 4 son los
  // ESPECIAL del CRM (antes se mostraban como VIP).
  "jeyson@viza.com.py": "ENC. SUCURSAL",
  "danwillian@viza.com.py": "ENC. SUCURSAL",
  "antonio.fagner@viza.com.py": "ENC. SUCURSAL",
  "librado@viza.com.py": "ENC. SUCURSAL",
  // Compras central (pedido del dueño, Task 76): Adriano Ruiz Gómez es
  // ENC. COMPRAS (la planilla lo traía como GENERAL); Task 137: su sucursal
  // es CENTRAL (antes KATUETE).
  "viza.compras@viza.com.py": "ENC. COMPRAS",
  // Administración central (planilla CENTRAL)
  "contabilidad@viza.com.py": "CONTABILIDAD",
  "sac@viza.com.py": "FINANCIERO",
  "rrhh@viza.com.py": "RR.HH",
  "auditoria.stock@viza.com.py": "STOCK",
  "auditoria@viza.com.py": "AUDITORIA",
  "documentos@viza.com.py": "DOCUMENTOS",
  "credito@viza.com.py": "CREDITO",
  "credito1@viza.com.py": "CREDITO",
  "viza.cobranza@viza.com.py": "COBRANZA",
  "factura@viza.com.py": "FACTURACION",
  "ventas.online@viza.com.py": "VENTAS ONLINE",
  "viza.marketing@viza.com.py": "MARKETING",
  "viza.artes@viza.com.py": "ARTES VISUAL",
  "viza.redes@viza.com.py": "REDES SOCIALES",
  "viza.web@viza.com.py": "WEB",
  "sercom@viza.com.py": "SERCOM",
  // KATUETE
  "caja.katuete@viza.com.py": "CAJA",
  "fact.katuete@viza.com.py": "FACTURACION",
  "deposito.katuete@viza.com.py": "DEPOSITO",
  "cobranza.katuete@viza.com.py": "COBRANZA",
  "ventas.rafael@viza.com.py": "VENTAS",
  "ventas.carla@viza.com.py": "VENTAS",
  "ventas.emmanuel@viza.com.py": "VENTAS",
  "ventas.paola@viza.com.py": "VENTAS",
  "ventas.richard@viza.com.py": "VENTAS",
  // Televentas (Task 77, pedido del dueño): vendedor@ (COMERCIAL VIZA HOME
  // E.A.S) es TELEVENTAS; Task 137: sucursal CENTRAL (antes KATUETE).
  "vendedor@viza.com.py": "TELEVENTAS",
  // LORENA MERCADO PEREZ (Task 77): VENTAS de KATUETE. Se crea con el botón
  // CREAR USUARIO del GDA; se dejan los 2 emails que sigue el patrón de la
  // planilla — el que no se use nunca coincide y no hace nada.
  "ventas.lorena@viza.com.py": "VENTAS",
  "lorena@viza.com.py": "VENTAS",
  // LA PALOMA
  "caja.paloma@viza.com.py": "CAJA",
  "fac.paloma@viza.com.py": "FACTURACION",
  "deposito.paloma@viza.com.py": "DEPOSITO",
  "cobranza.paloma@viza.com.py": "COBRANZA",
  "ventas.alvaliz@viza.com.py": "VENTAS",
  "ventas.camila@viza.com.py": "VENTAS",
  "ventas.giceli@viza.com.py": "VENTAS",
  "venta.ana@viza.com.py": "VENTAS",
  "ventas.victor@viza.com.py": "VENTAS",
  // FLORENCIO (Task 138, pedido del dueño): VENTAS de LA PALOMA. Se muestra
  // igual que la planilla lo tendría; solo referencia visual del GDA.
  "ventas.florencio@viza.com.py": "VENTAS",
  // NUEVA ESPERANZA
  "caja.ne@viza.com.py": "CAJA",
  "fac.ne@viza.com.py": "FACTURACION",
  "deposito.ne@viza.com.py": "DEPOSITO",
  "cobranza.ne@viza.com.py": "COBRANZA",
  "ventas.madelin@viza.com.py": "VENTAS",
  "ventas.adriano@viza.com.py": "VENTAS",
  "ventas.michael@viza.com.py": "VENTAS",
  "ventas.nueva@viza.com.py": "VENTAS",
  // SALTOS DEL GUAIRA
  "caja.saltos@viza.com.py": "CAJA",
  "fac.saltos@viza.com.py": "FACTURACION",
  "deposito.saltos@viza.com.py": "DEPOSITO",
  "cobranza.saltos@viza.com.py": "COBRANZA",
  "ventas.rolando@viza.com.py": "VENTAS",
  "ventas.hector@viza.com.py": "VENTAS",
  "ventas.gustavo@viza.com.py": "VENTAS",
  "ventas.yessica@viza.com.py": "VENTAS",
};

// Sector de un usuario según la planilla (coincidencia por email).
function sectorDe(u: Usuario): string {
  return MAPA_SECTOR_EXCEL[u.email.trim().toLowerCase()] || SECTOR_GENERAL;
}

export function GestionAccesos({ user, onGoSales, onGoAdmin, onGoOrquestador }: GestionAccesosProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroRol, setFiltroRol] = useState<string>("todos");
  // Filtro por sucursal (divide la tabla; "todas" = mostrar agrupadas).
  const [filtroSucursal, setFiltroSucursal] = useState<string>("todas");
  const [mostrarContrasenas, setMostrarContrasenas] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Task 101: guarda el id del usuario cuyo NÚMERO DE CONTACTO acaba de
  // copiarse (independiente del estado de copiar contraseñas).
  const [copiedContactoId, setCopiedContactoId] = useState<string | null>(null);
  const [historialModal, setHistorialModal] = useState<{ email: string; name: string | null; items: HistorialItem[] } | null>(null);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [resetando, setResetando] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // Task 141: edición inline del CONTACTO (número que sale en el presupuesto).
  const [editandoContactoId, setEditandoContactoId] = useState<string | null>(null);
  const [contactoDraft, setContactoDraft] = useState("");
  const [guardandoContacto, setGuardandoContacto] = useState<string | null>(null);
  // Task 141: eliminación definitiva de un usuario (con confirmación doble).
  const [eliminando, setEliminando] = useState<string | null>(null);
  // Task 82: guarda el id del usuario cuyo TIPO se está cambiando (spinner).
  const [cambiandoRol, setCambiandoRol] = useState<string | null>(null);
  // Task 165 (pedido del dueño): el TIPO se elige en el select y se CONFIRMA
  // con el botón GUARDAR (no se guarda al tocar el select). Acá queda el
  // borrador por usuario, sin tocar la base hasta que el dueño confirme.
  const [tipoDraft, setTipoDraft] = useState<Record<string, string>>({});
  // Estado para polling en tiempo real
  const [destacadosIds, setDestacadosIds] = useState<Set<string>>(new Set());
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [pollingActivo, setPollingActivo] = useState(true);
  // Estado para sonido de notificaciones en tiempo real
  const [sonidoActivo, setSonidoActivo] = useState(true);
  // Modal: cambiar mi propia contraseña (visible también para el supremo)
  const [cambiarContrasenaOpen, setCambiarContrasenaOpen] = useState(false);
  // Modal: crear usuario nuevo (Task 77, pedido del dueño). Usa el POST
  // /api/admin/usuarios que YA existía en el sistema (la API solo deja al
  // SUPREMO). Sector y sucursal se asignan solos si el email está en los
  // mapas de la planilla.
  const [crearOpen, setCrearOpen] = useState(false);
  const [crearNombre, setCrearNombre] = useState("");
  const [crearEmail, setCrearEmail] = useState("");
  const [crearContrasena, setCrearContrasena] = useState("");
  const [crearRol, setCrearRol] = useState("colaborador");
  // Task 138 (pedido del dueño): el CREAR USUARIO elige la SUCURSAL —
  // "para que no quede usuario sin sucursal". Empieza vacía = obliga a
  // elegir una de las 5 (CENTRAL + las 4 de venta).
  const [crearSucursal, setCrearSucursal] = useState("");
  const [verContrasenaCrear, setVerContrasenaCrear] = useState(false);
  const [creando, setCreando] = useState(false);

  // Función para reproducir un sonido de notificación usando Web Audio API
  // (no requiere archivos externos - generado en runtime)
  const tocarSonido = () => {
    if (!sonidoActivo) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Tono de notificación: dos beeps ascendentes (C5 → E5)
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.20);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
      // Cerrar contexto para liberar memoria
      setTimeout(() => audioCtx.close(), 600);
    } catch (e) {
      console.warn("[gestion-accesos] No se pudo reproducir sonido:", e);
    }
  };

  // Función para notificar cambios en tiempo real (toast + sonido)
  const notificarCambio = (usuarioPrevio: Usuario, usuarioNuevo: Usuario) => {
    const email = usuarioNuevo.email;
    const nombre = usuarioNuevo.name || email;

    // Detectar tipo de cambio
    if (usuarioPrevio.contrasenaActual !== usuarioNuevo.contrasenaActual) {
      const cambiadoPor = usuarioNuevo.cambiadoPor || "el usuario";
      toast.success(`🔒 ${email} cambió su contraseña`, {
        description: `Detectado en tiempo real · Cambio por: ${cambiadoPor}`,
        duration: 6000,
      });
      tocarSonido();
    } else if (usuarioPrevio.active !== usuarioNuevo.active) {
      const accion = usuarioNuevo.active ? "ACTIVADO" : "DESACTIVADO";
      toast.info(`${nombre} fue ${accion}`, {
        description: `Usuario ${accion.toLowerCase()} en tiempo real`,
        duration: 5000,
      });
      tocarSonido();
    } else if (usuarioPrevio.role !== usuarioNuevo.role) {
      toast.info(`🎭 ${email} cambió de rol`, {
        description: `De ${usuarioPrevio.role} → ${usuarioNuevo.role}`,
        duration: 5000,
      });
      tocarSonido();
    }
  };

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
        const cambiosDetallados: Array<{ previo: Usuario; nuevo: Usuario }> = [];
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
            cambiosDetallados.push({ previo: old, nuevo: n });
          }
        }
        if (cambios.size > 0) {
          setDestacadosIds(cambios);
          setUltimaActualizacion(new Date());
          setTimeout(() => setDestacadosIds(new Set()), 2500);
          // Notificar cada cambio al usuario (toast + sonido)
          // Usar setTimeout para no bloquear el render
          setTimeout(() => {
            for (const { previo, nuevo } of cambiosDetallados) {
              notificarCambio(previo, nuevo);
            }
          }, 0);
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

  // Task 101: copiar el número de contacto de la planilla FUN.VIZA con un
  // click (mismo comportamiento que copiar contraseñas, con su propio estado).
  const copiarContacto = (numero: string, id: string) => {
    navigator.clipboard.writeText(numero);
    setCopiedContactoId(id);
    setTimeout(() => setCopiedContactoId(null), 1500);
    toast.success("Número copiado");
  };

  // ─── Task 141: MODIFICAR / AGREGAR el número de contacto ───
  // El número guardado acá es el que aparece en la franja del vendedor en
  // TODOS los presupuestos (misma prioridad que /api/admin/usuarios).
  const abrirEdicionContacto = (u: Usuario) => {
    setEditandoContactoId(u.id);
    setContactoDraft(u.contacto || "");
  };

  const cancelarEdicionContacto = () => {
    setEditandoContactoId(null);
    setContactoDraft("");
  };

  const guardarContacto = async (u: Usuario) => {
    setGuardandoContacto(u.id);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/contacto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono: contactoDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el contacto");
      const contacto = String(data.contacto || "");
      setUsuarios((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, contacto } : x))
      );
      setEditandoContactoId(null);
      setContactoDraft("");
      toast.success(
        contacto ? `Contacto actualizado: ${contacto}` : "Contacto actualizado",
        { description: "El nuevo número sale en los próximos presupuestos" }
      );
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar el contacto");
    } finally {
      setGuardandoContacto(null);
    }
  };

  // ─── Task 141: ELIMINAR usuario ───
  // Doble confirmación (aviso + escribir el email). La API vuelve a validar:
  // solo SUPREMO, nunca la propia cuenta ni otro SUPREMO_ADMIN.
  const eliminarUsuario = async (u: Usuario) => {
    if (u.role === "supremo_admin") {
      toast.error("No se puede eliminar un usuario SUPREMO_ADMIN");
      return;
    }
    if (u.email.trim().toLowerCase() === (user.email || "").trim().toLowerCase()) {
      toast.error("No puedes eliminar tu propia cuenta");
      return;
    }
    const aviso = window.confirm(
      `¿ELIMINAR DEFINITIVAMENTE el usuario ${u.email}?\n\n` +
        "Se borra su cuenta y su historial de contraseñas. " +
        "Los presupuestos ya emitidos NO se borran (quedan sin vínculo al usuario).\n\n" +
        "Esta acción NO se puede deshacer."
    );
    if (!aviso) return;
    const escrito = window.prompt(
      `Para confirmar, escribí el email completo del usuario:\n${u.email}`
    );
    if (escrito === null) return;
    if (escrito.trim().toLowerCase() !== u.email.trim().toLowerCase()) {
      toast.error("El email no coincide. No se eliminó nada.");
      return;
    }

    setEliminando(u.id);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el usuario");
      toast.success(`Usuario eliminado: ${u.email}`);
      if (editandoContactoId === u.id) cancelarEdicionContacto();
      await cargar(true);
    } catch (e: any) {
      toast.error(e.message || "No se pudo eliminar el usuario");
    } finally {
      setEliminando(null);
    }
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

  // Task 82 (pedido del dueño): cambiar el TIPO DE USUARIO de un usuario
  // existente desde la propia tabla.
  // Task 165 (pedido del dueño): ahora se puede PROMOVER a CUALQUIERA de los
  // tipos del sistema (COMÚN / ADMIN / ESPECIAL / VIP) y el cambio se
  // confirma con el botón GUARDAR. Solo SUPREMO (esta pantalla ya es suya).
  //   • VIP    → User.role = "vip": ve el Orquestador y la BASE completa,
  //     pero SOLO LECTURA (no edita nada). Mismos permisos que los VIP de
  //     siempre (lista USUARIOS_VIP).
  //   • ESPECIAL → User.role = "especial": encargado que ve el CRM de SU
  //     sucursal (la asignada en el GDA), en solo lectura.
  //   • ADMIN  → User.role = "admin": Base + Ventas + Orquestador.
  //   • COMÚN  → User.role = "colaborador": solo Ventas.
  // OJO: la sesión es JWT — el usuario ve su nuevo tipo al volver a entrar
  // (cerrar sesión y loguearse de nuevo). La etiqueta del GDA cambia al
  // instante porque lee la base.
  const guardarTipo = async (u: Usuario) => {
    const tipoActual = tipoEfectivo(u);
    const tipoNuevo = tipoDraft[u.id] || tipoActual;
    if (tipoNuevo === tipoActual) return;
    const nuevoRol = ROL_POR_TIPO[tipoNuevo];
    if (!nuevoRol) return;
    if (
      !window.confirm(
        `¿Confirmás cambiar el TIPO de ${u.email} de ${tipoActual} a ${tipoNuevo}?`
      )
    ) {
      return;
    }
    setCambiandoRol(u.id);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/cambiar-rol`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nuevoRol }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al cambiar tipo");
      }
      setTipoDraft((prev) => {
        const copia = { ...prev };
        delete copia[u.id];
        return copia;
      });
      toast.success(`Tipo de usuario actualizado (${tipoNuevo}): ${u.email}`, {
        description:
          tipoNuevo === "VIP"
            ? "VIP: puede VER el Orquestador y la Base, pero NO editar nada. Entra en vigencia cuando vuelva a iniciar sesión."
            : "Entra en vigencia cuando el usuario vuelva a iniciar sesión.",
        duration: 8000,
      });
      await cargar(true);
    } catch (e: any) {
      toast.error(e.message);
      await cargar(true);
    } finally {
      setCambiandoRol(null);
    }
  };

  // Crear un usuario nuevo (Task 77): llama al POST /api/admin/usuarios que
  // ya existía en el sistema (valida, hashea con bcrypt, registra la clave
  // en PasswordLog y crea el usuario ACTIVO con el rol elegido).
  // Task 138: ahora también manda la SUCURSAL elegida (obligatoria en el
  // modal) y la API la asigna en UsuarioSucursal al momento de crear.
  const crearUsuario = async () => {
    const email = crearEmail.trim().toLowerCase();
    if (!email || !crearContrasena.trim()) {
      toast.error("El email y la contraseña son obligatorios");
      return;
    }
    if (!crearSucursal) {
      toast.error("Elegí la SUCURSAL del usuario (no puede quedar SIN SUCURSAL)");
      return;
    }
    setCreando(true);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: crearNombre.trim() || undefined,
          password: crearContrasena,
          role: crearRol,
          sucursal: crearSucursal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      if (data.sucursalAsignada === false) {
        toast.warning(`Usuario creado: ${email}. La sucursal ${crearSucursal} no se pudo guardar — asignála desde el CRM.`, { duration: 10000 });
      } else {
        toast.success(`Usuario creado: ${email} · ${crearSucursal}`);
      }
      setCrearOpen(false);
      setCrearNombre("");
      setCrearEmail("");
      setCrearContrasena("");
      setCrearRol("colaborador");
      setCrearSucursal("");
      setVerContrasenaCrear(false);
      await cargar(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreando(false);
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
    lines.push("  ORGANIZACIÓN: SUCURSAL → SECTOR (planilla FUN.VIZA) → usuarios.");
    lines.push("  TIPO DE USUARIO: SUPREMO = acceso total · ADMIN = Admin + Ventas · ESPECIAL = encargado que ve el CRM de su sucursal · VIP = destacado de la central · COMÚN = solo Ventas.");
    lines.push("  CONTACTO: número de teléfono de la planilla FUN.VIZA (columna CONTACTO); '—' = la planilla todavía no lo tiene.");
    lines.push("");

    // ── Agrupar TODOS los usuarios por sucursal (mismo orden del panel) ──
    const gruposSuc = new Map<string, Usuario[]>();
    for (const u of usuarios) {
      const k = sucursalDe(u);
      const arr = gruposSuc.get(k);
      if (arr) arr.push(u);
      else gruposSuc.set(k, [u]);
    }
    const sucConocidas = SUCURSALES_GDA.filter((s) => gruposSuc.has(s));
    const sucExtras = Array.from(gruposSuc.keys())
      .filter((n) => n !== SIN_SUCURSAL && !(SUCURSALES_GDA as readonly string[]).includes(n))
      .sort();
    const ordenSuc = [...sucConocidas, ...sucExtras, ...(gruposSuc.has(SIN_SUCURSAL) ? [SIN_SUCURSAL] : [])];

    // ── Dentro de cada sucursal: subgrupos por SECTOR (planilla FUN.VIZA) ──
    for (const suc of ordenSuc) {
      const grupo = gruposSuc.get(suc)!;
      lines.push("================================================================================");
      lines.push(`  SUCURSAL: ${suc} · ${grupo.length} ${grupo.length === 1 ? "USUARIO" : "USUARIOS"}`);
      lines.push("================================================================================");

      const gruposSec = new Map<string, Usuario[]>();
      for (const u of grupo) {
        const k = sectorDe(u);
        const arr = gruposSec.get(k);
        if (arr) arr.push(u);
        else gruposSec.set(k, [u]);
      }
      const secConocidos = SECTORES_ORDEN.filter((s) => gruposSec.has(s));
      const secExtras = Array.from(gruposSec.keys())
        .filter((n) => n !== SECTOR_GENERAL && !(SECTORES_ORDEN as readonly string[]).includes(n))
        .sort();
      const ordenSec = [...secConocidos, ...secExtras, ...(gruposSec.has(SECTOR_GENERAL) ? [SECTOR_GENERAL] : [])];

      for (const sec of ordenSec) {
        lines.push("");
        lines.push(`  » SECTOR: ${sec} · ${gruposSec.get(sec)!.length} ${gruposSec.get(sec)!.length === 1 ? "usuario" : "usuarios"}`);
        lines.push("-".repeat(80));
        for (const u of gruposSec.get(sec)!) {
          lines.push(`    Email:        ${u.email}`);
          lines.push(`    Contraseña:   ${u.contrasenaActual}`);
          lines.push(`    Nombre:       ${u.name || "—"}`);
          lines.push(`    Contacto:     ${u.contacto || "—"}`);
          lines.push(`    Tipo:         ${tipoUsuario(u.role, u.email)}`);
          lines.push("");
        }
      }
      lines.push("");
    }

    // ── Totales: por tipo y por sucursal ──
    const nSupremos = usuarios.filter((u) => u.role === "supremo_admin").length;
    // Task 165: cada etiqueta cuenta lo mismo que se ve en la columna Tipo
    // (incluye las PROMOCIONES hechas desde el GDA).
    const nAdmins = usuarios.filter((u) => tipoEfectivo(u) === "ADMIN").length;
    const nEspecial = usuarios.filter((u) => tipoEfectivo(u) === "ESPECIAL").length;
    const nVip = usuarios.filter((u) => tipoEfectivo(u) === "VIP").length;
    const nComunes = usuarios.filter((u) => tipoEfectivo(u) === "COMÚN").length;
    lines.push("================================================================================");
    lines.push(`  TOTAL: ${usuarios.length} usuarios`);
    lines.push(`    Por tipo:      Supremo: ${nSupremos} · Admin: ${nAdmins} · ESPECIAL: ${nEspecial} · VIP: ${nVip} · Común: ${nComunes}`);
    lines.push(`    Por sucursal:  ${ordenSuc.map((s) => `${s}: ${gruposSuc.get(s)!.length}`).join(" · ")}`);
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
    // Task 165: el filtro usa exactamente la MISMA etiqueta de la columna
    // Tipo, así que los usuarios PROMOVIDOS a VIP/ESPECIAL desde el GDA
    // aparecen en su filtro sin importar el rol viejo de la base.
    const tipoFila = tipoEfectivo(u);
    const matchRol =
      filtroRol === "todos"
        ? true
        : filtroRol === "especial"
          ? tipoFila === "ESPECIAL"
          : filtroRol === "vip"
            ? tipoFila === "VIP"
            : filtroRol === "admin"
              ? tipoFila === "ADMIN"
              : filtroRol === "colaborador"
                ? tipoFila === "COMÚN" && esColaborador(u.role)
                : u.role === filtroRol;
    // Filtro por sucursal ("todas" = no filtra, solo agrupa en secciones)
    const matchSucursal = filtroSucursal === "todas" || sucursalDe(u) === filtroSucursal;
    return matchSearch && matchRol && matchSucursal;
  });

  // ─── DIVISIÓN POR SUCURSAL (pedido del dueño) ───
  // Aplana los usuarios filtrados en una lista de filas para la tabla:
  // una fila-cabecera por sucursal (con su cantidad) seguida de los usuarios
  // de esa sucursal. Orden: CENTRAL (Task 137, casa matriz), KATUETE, LA
  // PALOMA, NUEVA ESPERANZA, SALTOS DEL GUAIRA; después cualquier valor viejo
  // no listado (ej. "CENTRAL/KATUETE")
  // alfabético; y "SIN SUCURSAL" siempre al final. Se conservan los filtros
  // de búsqueda y rol: solo aparecen las sucursales que tienen usuarios.
  type FilaTabla =
    | { tipo: "sucursal"; key: string; nombre: string; cantidad: number }
    | { tipo: "usuario"; key: string; usuario: Usuario; zebra: number };
  const filasTabla: FilaTabla[] = (() => {
    const grupos = new Map<string, Usuario[]>();
    for (const u of filtrados) {
      const k = sucursalDe(u);
      const arr = grupos.get(k);
      if (arr) arr.push(u);
      else grupos.set(k, [u]);
    }
    const conocidos = SUCURSALES_GDA.filter((s) => grupos.has(s));
    const extras = Array.from(grupos.keys())
      .filter((n) => n !== SIN_SUCURSAL && !(SUCURSALES_GDA as readonly string[]).includes(n))
      .sort();
    const orden = [...conocidos, ...extras, ...(grupos.has(SIN_SUCURSAL) ? [SIN_SUCURSAL] : [])];
    const filas: FilaTabla[] = [];
    let zebra = 0;
    for (const nombre of orden) {
      const grupo = grupos.get(nombre)!;
      filas.push({ tipo: "sucursal", key: `sucursal-${nombre}`, nombre, cantidad: grupo.length });
      for (const u of grupo) filas.push({ tipo: "usuario", key: u.id, usuario: u, zebra: zebra++ });
    }
    return filas;
  })();

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
          {/* IZQUIERDA: solo el título de la página. Sin logo "VIZA home" y sin
              el lema "Todo para tu hogar..." (pedidos del dueño, Task 73). */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[11px] font-medium text-white/80">SUPREMO · Gestión de Accesos y Contraseñas</p>
              <div className="flex items-center gap-2">
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
            {/* Task 91 (mudanza visual): ORQUESTADOR — vuelve a los 4 cuadros. */}
            {onGoOrquestador && (
              <button
                onClick={onGoOrquestador}
                className="h-9 px-3 rounded-xl font-bold text-xs flex items-center justify-center whitespace-nowrap transition-all shadow-sm hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
                title="Volver al Orquestador (los 4 cuadros del sistema)"
              >
                ORQUESTADOR
              </button>
            )}
            {/* BASE (antes VOLVER A ADMIN): compacto, dorado, sin icono. */}
            <button
              onClick={onGoAdmin}
              className="h-9 px-3 rounded-xl font-bold text-xs flex items-center justify-center transition-all shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Ir a la BASE (Panel Admin)"
            >
              BASE
            </button>
            {/* IR A VENTAS: solo el carrito, compacto y dorado (Task 73). */}
            <button
              onClick={onGoSales}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Ir a Ventas"
              aria-label="Ir a Ventas"
            >
              <ShoppingCart className="h-4 w-4" />
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
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Cambiar mi contraseña"
              aria-label="Cambiar mi contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
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
        {/* Tarjeta de resumen (Task 76: tarjetas por tipo; Task 139: la
            tarjeta VIP (CRM) pasa a llamarse ESPECIAL (CRM) y se agrega la
            tarjeta VIP al lado — Supremo / Admin / ESPECIAL / VIP / Común) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-stone-500 text-[11px] uppercase font-semibold tracking-wide">
              <AlertCircle className="h-4 w-4" /> TOTAL USUARIOS
            </div>
            <p className="text-3xl font-black text-stone-900 mt-1">{usuarios.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-amber-700 text-[11px] uppercase font-semibold tracking-wide">
              SUPREMO ADMIN
            </div>
            <p className="text-3xl font-black text-amber-600 mt-1">
              {usuarios.filter((u) => u.role === "supremo_admin").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-sky-700 text-[11px] uppercase font-semibold tracking-wide">
              ADMIN
            </div>
            <p className="text-3xl font-black text-sky-600 mt-1">
              {usuarios.filter((u) => tipoEfectivo(u) === "ADMIN").length}
            </p>
          </div>
          {/* Task 139: los encargados del CRM ahora se llaman ESPECIAL. */}
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700 text-[11px] uppercase font-semibold tracking-wide">
              ESPECIAL (CRM)
            </div>
            <p className="text-3xl font-black text-emerald-600 mt-1">
              {usuarios.filter((u) => tipoEfectivo(u) === "ESPECIAL").length}
            </p>
          </div>
          {/* Task 139: tarjeta VIP para los destacados de la central
              (filipe.campos@ y viza.compras@ — solo etiqueta). */}
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-yellow-700 text-[11px] uppercase font-semibold tracking-wide">
              VIP
            </div>
            <p className="text-3xl font-black text-yellow-600 mt-1">
              {usuarios.filter((u) => tipoEfectivo(u) === "VIP").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-stone-600 text-[11px] uppercase font-semibold tracking-wide">
              COMÚN
            </div>
            <p className="text-3xl font-black text-stone-700 mt-1">
              {usuarios.filter((u) => tipoEfectivo(u) === "COMÚN").length}
            </p>
          </div>
        </div>

        {/* USUARIOS POR SUCURSAL: tarjetas de resumen (pedido del dueño, Task 75).
            Cuenta sobre TODOS los usuarios (igual que la tarjeta TOTAL).
            Task 139 (pedido del dueño): el cuadrito SIN SUCURSAL se borró —
            ya no queda ningún usuario sin sucursal (florencio fue a LA
            PALOMA y el CREAR USUARIO exige sucursal desde la Task 138). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SUCURSALES_GDA.map((s) => (
            <div key={s} className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
              <div
                className="flex items-center gap-1.5 text-[11px] uppercase font-semibold tracking-wide"
                style={{ color: "#b89853" }}
              >
                <MapPin className="h-3.5 w-3.5" /> {s}
              </div>
              <p className="text-3xl font-black text-stone-900 mt-1">
                {usuarios.filter((u) => sucursalDe(u) === s).length}
              </p>
            </div>
          ))}
          {/* Task 139: cuadrito SIN SUCURSAL borrado (pedido del dueño). Si
              algún usuario viejo quedara sin sucursal igual no se pierde:
              la tabla lo agrupa al final bajo SIN SUCURSAL solo cuando
              existe alguno (fila defensiva, normalmente invisible). */}
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
            {/* Task 141 (pedido del dueño): filtros por TIPO VIP y ESPECIAL. */}
            <option value="especial">ESPECIAL</option>
            <option value="vip">VIP</option>
            {/* Etiqueta con el vocabulario del dueño; el valor "colaborador" es el rol real en la base. */}
            <option value="colaborador">COMÚN</option>
          </select>

          {/* Filtro por SUCURSAL: divide la tabla por sucursal (pedido del dueño). */}
          <select
            value={filtroSucursal}
            onChange={(e) => setFiltroSucursal(e.target.value)}
            className="h-10 px-3 rounded-lg bg-stone-100 border border-stone-200 text-sm font-medium focus:outline-none"
            title="Filtrar por sucursal"
          >
            <option value="todas">TODAS LAS SUCURSALES</option>
            {SUCURSALES_GDA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {/* Task 138: la opción SIN SUCURSAL se quitó del filtro (pedido
                del dueño) — ya no queda ningún usuario sin sucursal: florencio
                fue a LA PALOMA y el CREAR USUARIO ahora exige sucursal. */}
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
            onClick={() => setSonidoActivo((v) => !v)}
            title={sonidoActivo ? "Silenciar notificaciones de cambios" : "Activar sonido de notificaciones"}
            className={`h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 border transition-colors ${
              sonidoActivo
                ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
            }`}
          >
            {sonidoActivo ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{sonidoActivo ? "SONIDO ON" : "SONIDO OFF"}</span>
            <span className="sm:hidden">{sonidoActivo ? "🔔" : "🔕"}</span>
          </button>

          <button
            onClick={() => cargar(false)}
            disabled={loading}
            className="h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">RECARGAR</span>
          </button>

          {/* CREAR USUARIO (Task 77): formulario que usa la API de creación
              que ya existía en el sistema (el POST solo deja al SUPREMO). */}
          <button
            onClick={() => setCrearOpen(true)}
            className="h-10 px-3 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
            title="Crear un usuario nuevo"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">CREAR USUARIO</span>
            <span className="sm:hidden">CREAR</span>
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

        {/* Tabla de usuarios */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#155789" }} className="text-white">
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Nombre</th>
                  {/* SECTOR (planilla FUN.VIZA) con el TIPO DE USUARIO al lado
                      (Supremo / Admin / ESPECIAL / VIP / Común) — pedido del
                      dueño, Tasks 75/76/139. */}
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Sector</th>
                  {/* CONTACTO (planilla FUN.VIZA, columna CONTACTO) — Task 101,
                      pedido del dueño: cada usuario con su respectivo número.
                      Solo referencia de lectura; un click copia el número. */}
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Contacto</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Estado</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Contraseña Actual</th>
                  <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Último Cambio</th>
                  <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-stone-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-stone-500">
                      No se encontraron usuarios con esos filtros.
                    </td>
                  </tr>
                ) : (
                  filasTabla.map((fila) => {
                    // Fila-cabecera de SUCURSAL: divide la tabla en secciones
                    // (una por sucursal, con su cantidad de usuarios).
                    if (fila.tipo === "sucursal") {
                      return (
                        <tr
                          key={fila.key}
                          style={{ backgroundColor: "rgba(217, 184, 107, 0.16)", borderBottom: "1px solid #e5d9bd" }}
                        >
                          <td colSpan={9} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5" style={{ color: "#b89853" }} />
                              <span
                                className="text-[11px] font-black uppercase tracking-widest"
                                style={{ color: "#0d3d5e" }}
                              >
                                {fila.nombre}
                              </span>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#155789", color: "#D9B86B" }}
                              >
                                {fila.cantidad} {fila.cantidad === 1 ? "USUARIO" : "USUARIOS"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const u = fila.usuario;
                    const rb = roleBadge(u.role, u.email);
                    const destacado = destacadosIds.has(u.id);
                    // Task 101/141: número de contacto del usuario. Prioridad:
                    // 1) número modificado/agregado desde el GDA, 2) planilla
                    // FUN.VIZA. Vacío = todavía no tiene número ("—").
                    const tel = u.contacto || "";
                    return (
                      <tr
                        key={fila.key}
                        className={destacado ? "viza-row-highlight" : fila.zebra % 2 === 0 ? "bg-white" : "bg-stone-50/60"}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                        data-usuario-id={u.id}
                      >
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-stone-900 text-xs">{u.email}</span>
                        </td>
                        <td className="px-3 py-2.5 text-stone-700 text-xs">{u.name || "—"}</td>
                        {/* SECTOR según la planilla FUN.VIZA (solo referencia;
                            usuarios fuera de la planilla = GENERAL). */}
                        <td className="px-3 py-2.5 text-stone-600 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" style={{ color: "#b89853" }} />
                            {sectorDe(u)}
                          </span>
                        </td>
                        {/* CONTACTO (Task 101/141, pedido del dueño): es el número
                            que sale en la franja del vendedor en TODOS los
                            presupuestos. Se puede MODIFICAR (lápiz) y AGREGAR si
                            todavía no tiene (botón + AGREGAR). Un click copia. */}
                        <td className="px-3 py-2.5">
                          {editandoContactoId === u.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="tel"
                                autoFocus
                                value={contactoDraft}
                                maxLength={40}
                                onChange={(e) => setContactoDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    guardarContacto(u);
                                  } else if (e.key === "Escape") {
                                    cancelarEdicionContacto();
                                  }
                                }}
                                placeholder="0983 000000"
                                className="h-8 w-32 px-2 rounded-lg bg-white border border-amber-400 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-100"
                                title="Número que sale en el presupuesto. Enter = guardar · Esc = cancelar"
                              />
                              <button
                                onClick={() => guardarContacto(u)}
                                disabled={guardandoContacto === u.id}
                                className="h-8 w-8 rounded-lg flex items-center justify-center bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                                title="Guardar número"
                              >
                                {guardandoContacto === u.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelarEdicionContacto}
                                disabled={guardandoContacto === u.id}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-colors disabled:opacity-50"
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : tel ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copiarContacto(tel, u.id)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-100 border border-stone-200 hover:bg-amber-50 hover:border-amber-300 transition-colors group"
                                title={`Copiar ${tel}`}
                              >
                                <Phone className="h-3 w-3" style={{ color: "#b89853" }} />
                                <span className="text-xs font-mono font-medium text-stone-700 group-hover:text-stone-900">{tel}</span>
                                {copiedContactoId === u.id && <Check className="h-3.5 w-3.5 text-green-600" />}
                              </button>
                              <button
                                onClick={() => abrirEdicionContacto(u)}
                                className="h-7 w-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                                title="Modificar número (sale en el presupuesto)"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-stone-300">—</span>
                              <button
                                onClick={() => abrirEdicionContacto(u)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition-colors"
                                title="Agregar el número que sale en el presupuesto"
                              >
                                <Pencil className="h-3 w-3" />
                                AGREGAR
                              </button>
                            </div>
                          )}
                        </td>
                        {/* TIPO DE USUARIO al lado del sector: Supremo / Admin /
                            ESPECIAL / VIP / Común. Task 82: para usuarios NO supremo
                            el rol es un SELECT — el dueño (SUPREMO) puede cambiar
                            COMÚN ↔ ADMIN directo acá, sin tocar la base. Task 140
                            (pedido del dueño: "el TIPO de usuario si es VIP no
                            necessita aparecer do lado COMUN"): el ESPECIAL (verde)
                            y el VIP (dorado) ahora se muestran SOLOS — su etiqueta
                            de TIPO reemplaza al select COMÚN/ADMIN, sin COMÚN al
                            lado. Solo etiqueta: el ROL real de la base NO cambia
                            nada. Los supremos siguen con la etiqueta fija (nadie
                            toca su tipo) y el resto de los usuarios con el select
                            COMÚN ↔ ADMIN de siempre. */}
                        <td className="px-3 py-2.5">
                          {u.role === "supremo_admin" ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${rb.cls}`}>
                              {rb.label}
                            </span>
                          ) : (
                            /* Task 165 (pedido del dueño): el dueño puede
                               PROMOVER el usuario a cualquiera de los TIPOS
                               del sistema y CONFIRMAR con GUARDAR. Hasta
                               tocar GUARDAR no se cambia nada en la base. */
                            <div className="flex items-center gap-1">
                              <select
                                value={tipoDraft[u.id] ?? tipoEfectivo(u)}
                                onChange={(e) =>
                                  setTipoDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                                }
                                disabled={cambiandoRol === u.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide outline-none cursor-pointer disabled:opacity-50 bg-stone-100 text-stone-700 border-stone-300"
                                title="TIPO del usuario. Elegí uno y después tocá GUARDAR."
                              >
                                <option value="COMÚN">COMÚN</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="ESPECIAL">ESPECIAL</option>
                                <option value="VIP">VIP</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void guardarTipo(u)}
                                disabled={
                                  cambiandoRol === u.id ||
                                  (tipoDraft[u.id] ?? tipoEfectivo(u)) === tipoEfectivo(u)
                                }
                                className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-white transition-colors ${
                                  (tipoDraft[u.id] ?? tipoEfectivo(u)) === tipoEfectivo(u)
                                    ? "bg-stone-300 cursor-not-allowed"
                                    : "bg-green-600 hover:bg-green-700"
                                }`}
                                title="Guardar el TIPO elegido"
                              >
                                {cambiandoRol === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                GUARDAR
                              </button>
                            </div>
                          )}
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
                            {/* Task 141 (pedido del dueño): eliminar usuario.
                                Doble confirmación en pantalla; la API protege
                                la propia cuenta y a los SUPREMO_ADMIN. */}
                            <button
                              onClick={() => eliminarUsuario(u)}
                              disabled={
                                eliminando === u.id ||
                                u.role === "supremo_admin" ||
                                u.email.trim().toLowerCase() === (user.email || "").trim().toLowerCase()
                              }
                              title={
                                u.role === "supremo_admin"
                                  ? "No se puede eliminar al supremo"
                                  : u.email.trim().toLowerCase() === (user.email || "").trim().toLowerCase()
                                    ? "No puedes eliminar tu propia cuenta"
                                    : "Eliminar usuario"
                              }
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-red-700 hover:bg-red-100 border border-transparent hover:border-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {eliminando === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

      </main>
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

      {/* Modal: CREAR USUARIO (Task 77). Mismo estilo que el de historial.
          Usa el POST /api/admin/usuarios que ya existía (solo SUPREMO). */}
      {crearOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !creando && setCrearOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ backgroundColor: "#155789", borderColor: "#0d3d5e" }}>
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <UserPlus className="h-5 w-5" style={{ color: "#D9B86B" }} />
                CREAR NUEVO USUARIO
              </h3>
              <button
                onClick={() => setCrearOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                  Nombre completo (opcional)
                </label>
                <input
                  type="text"
                  value={crearNombre}
                  onChange={(e) => setCrearNombre(e.target.value)}
                  placeholder="Ej: LORENA MERCADO PEREZ"
                  className="w-full h-10 px-3 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                  Email (obligatorio)
                </label>
                <input
                  type="email"
                  value={crearEmail}
                  onChange={(e) => setCrearEmail(e.target.value)}
                  placeholder="Ej: ventas.lorena@viza.com.py"
                  className="w-full h-10 px-3 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                  Contraseña (obligatoria)
                </label>
                <div className="relative">
                  <input
                    type={verContrasenaCrear ? "text" : "password"}
                    value={crearContrasena}
                    onChange={(e) => setCrearContrasena(e.target.value)}
                    placeholder="La contraseña que le vas a entregar"
                    className="w-full h-10 px-3 pr-10 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setVerContrasenaCrear((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    title={verContrasenaCrear ? "Ocultar" : "Mostrar"}
                  >
                    {verContrasenaCrear ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                  Tipo de usuario
                </label>
                <select
                  value={crearRol}
                  onChange={(e) => setCrearRol(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-stone-100 border border-stone-200 text-sm font-medium focus:outline-none"
                >
                  <option value="colaborador">COMÚN (colaborador)</option>
                  <option value="admin">ADMIN</option>
                  <option value="especial">ESPECIAL (encargado del CRM de su sucursal)</option>
                  <option value="vip">VIP (solo lectura de la Base)</option>
                  <option value="supremo_admin">SUPREMO ADMIN</option>
                </select>
              </div>
              {/* Task 138 (pedido del dueño): elegir la SUCURSAL al crear —
                  obligatoria para que no quede usuario SIN SUCURSAL. */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                  Sucursal (obligatoria)
                </label>
                <select
                  value={crearSucursal}
                  onChange={(e) => setCrearSucursal(e.target.value)}
                  className={`w-full h-10 px-3 rounded-lg border text-sm font-medium focus:outline-none ${
                    crearSucursal
                      ? "bg-stone-100 border-stone-200"
                      : "bg-amber-50 border-amber-300"
                  }`}
                >
                  <option value="">— ELEGIR SUCURSAL —</option>
                  {SUCURSALES_GDA.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Se crea ACTIVO y queda registrado en la bitácora de contraseñas (PasswordLog), igual que un reseteo. La SUCURSAL se guarda al momento de crear (obligatoria desde la Task 138 — ningún usuario queda SIN SUCURSAL). Si el email está en la planilla, el SECTOR se asigna solo (ej.: ventas.lorena@viza.com.py = VENTAS). Su número de CONTACTO aparece solo si la planilla FUN.VIZA lo tiene.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setCrearOpen(false)}
                  disabled={creando}
                  className="h-10 flex-1 rounded-lg font-bold text-xs uppercase border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  onClick={crearUsuario}
                  disabled={creando || !crearEmail.trim() || !crearContrasena.trim() || !crearSucursal}
                  className="h-10 flex-1 rounded-lg font-bold text-xs uppercase bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {creando ? "CREANDO..." : "CREAR USUARIO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
