// ─── ACCESOS A LOS MÓDULOS DEL ORQUESTADOR (client-safe) ────────────────────
// Pedido del dueño (Task 169): el ORQUESTADOR queda visible para TODOS los
// usuarios. Desde ahí:
//   · SUPREMO / ADMIN / VIP → COTIZADOR + CRM GENERAL + STOCK + LA BASE.
//     (El VIP y los usuarios de consulta ven la Base SOLO LECTURA.)
//   · ESPECIAL (los 4 encargados de sucursal) → COTIZADOR + CRM DE SU
//     SUCURSAL + STOCK GENERAL. La Base y los departamentos quedan visibles
//     pero BLOQUEADOS.
//   · COMÚN → COTIZADOR + CRM PERSONAL (solo lo que él mismo emitió).
//     Task 171 (pedido del dueño): "el stock general no debe estar disponible
//     para usuarios comunes". La Base, el Stock y los departamentos quedan
//     bloqueados.
//
// Este archivo SOLO lee listas estáticas (no toca Prisma ni la base), así que
// se puede importar desde componentes de cliente. El BACKEND re-valida el
// alcance del CRM en /api/crm/ranking: aunque alguien fuerce la vista, un
// COMÚN nunca puede ver los datos de otro usuario.
import { ENCARGADOS_SUCURSAL, esUsuarioVip } from "./encargados-sucursal";

export type ModoCrm = "general" | "sucursal" | "personal";

export type TipoUsuario = "SUPREMO" | "ADMIN" | "VIP" | "ESPECIAL" | "COMÚN";

export interface AccesosUsuario {
  tipo: TipoUsuario;
  esSupremo: boolean;
  esAdmin: boolean;
  esVip: boolean;
  esEspecial: boolean;
  esComun: boolean;
  // Alcance del CRM: general (todas las sucursales), sucursal (la del
  // encargado) o personal (solo el propio usuario).
  modoCrm: ModoCrm;
  // Solo admin/supremo (y nunca un VIP de consulta) pueden cambiar la
  // sucursal de un usuario desde el CRM.
  puedeAsignarSucursalCrm: boolean;
  crmSoloLectura: boolean;
  // Módulos accesibles desde el Orquestador.
  puedeVerCotizador: boolean;
  puedeVerCrm: boolean;
  puedeVerStock: boolean;
  puedeVerBase: boolean;
  puedeVerGestion: boolean;
  // La Base debe abrirse en modo lectura (VIP / usuarios de consulta).
  baseSoloLectura: boolean;
}

/**
 * Clasifica al usuario con el MISMO vocabulario del GDA
 * (Supremo / Admin / VIP / ESPECIAL / Común) y devuelve qué módulos puede
 * abrir. La prioridad del tipo es la del GDA: Supremo > Admin > VIP >
 * ESPECIAL > Común.
 */
export function accesosDeUsuario(user: {
  email?: string | null;
  role?: string | null;
}): AccesosUsuario {
  const email = String(user.email || "").trim().toLowerCase();
  const role = String(user.role || "");

  const esSupremo = role === "supremo_admin";
  const esAdminRol = role === "admin";
  const esVip = esUsuarioVip(email, role);
  const esEspecial = role === "especial" || !!ENCARGADOS_SUCURSAL[email];
  // Un VIP que además tenga rol admin (ej. viza.compras@) NO es un admin
  // "común": la etiqueta y los permisos de lectura del VIP mandan.
  const esAdmin = esAdminRol && !esVip;
  const esComun = !esSupremo && !esAdmin && !esVip && !esEspecial;

  const tipo: TipoUsuario = esSupremo
    ? "SUPREMO"
    : esVip
      ? "VIP"
      : esAdminRol
        ? "ADMIN"
        : esEspecial
          ? "ESPECIAL"
          : "COMÚN";

  const modoCrm: ModoCrm =
    esSupremo || esAdminRol || esVip
      ? "general"
      : esEspecial
        ? "sucursal"
        : "personal";

  return {
    tipo,
    esSupremo,
    esAdmin,
    esVip,
    esEspecial,
    esComun,
    modoCrm,
    puedeAsignarSucursalCrm: (esSupremo || esAdminRol) && !esVip,
    // El CRM general de un VIP es solo lectura; ESPECIAL y COMÚN también.
    crmSoloLectura: esVip || esEspecial || esComun,
    puedeVerCotizador: true,
    puedeVerCrm: true,
    // Task 171 (pedido del dueño): STOCK GENERAL queda para SUPREMO / ADMIN /
    // VIP / ESPECIAL. El usuario COMÚN ya no lo ve ni puede abrirlo (tampoco
    // por API: /api/stock/general re-valida con esta misma función).
    puedeVerStock: !esComun,
    // La Base queda para Supremo/Admin/VIP. ESPECIAL y COMÚN la ven
    // bloqueada en el Orquestador y no reciben la navegación.
    puedeVerBase: esSupremo || esAdminRol || esVip || esEspecial,
    puedeVerGestion: esSupremo,
    baseSoloLectura: esVip || esEspecial,
  };
}
