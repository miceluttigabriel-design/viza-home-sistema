// ─── PERMISOS DE LAS COPIAS DE SEGURIDAD (Task 134, pedido del dueño) ───
// ¿Quién puede VER y MOVER el interruptor COPIAS DE SEGURIDAD de la Base
// (ON/OFF de los backups automáticos)?
//   · supremo_admin — siempre (dueño del sistema).
//   · viza@viza.com.py — SOLO este email (el dueño pidió el control del
//     backup para sí, igual que la tasa de cambio).
// NADIE más lo ve ni lo mueve: ni admins comunes, ni colaboradores, ni los
// usuarios de consulta (la lista solo-lectura de usuarios-consulta.ts manda
// SIEMPRE encima de todo: aunque un email estuviera acá, si es solo-lectura
// no mueve jamás).
//
// El botón EXPORTAR EXCEL también quedó SOLO para el Supremo (Task 134,
// pedido del dueño: "el boton exportar excel es apenas para Supremo
// usuario") — tanto en la Base (admin-panel.tsx) como en la API
// /api/products/export, que ahora exige supremo_admin.
//
// Archivo chiquito y SIN imports: lo usan igual la API (/api/config-backup
// y /api/products/export, servidor) y los paneles (cliente), así la UI y el
// backend SIEMPRE deciden lo mismo. Para dar permiso a otro email en el
// futuro: agregarlo (en minúsculas) a la lista de abajo y nada más.

export const EMAILS_QUE_EDITAN_BACKUP: string[] = [
  "viza@viza.com.py",
];

// Devuelve true si ese usuario (rol + email) puede VER y MOVER el
// interruptor de copias de seguridad. Tolera null/undefined, espacios y
// mayúsculas/minúsculas en el email.
export function puedeEditarBackup(
  role: string | null | undefined,
  email: string | null | undefined
): boolean {
  if ((role || "").trim().toLowerCase() === "supremo_admin") return true;
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return EMAILS_QUE_EDITAN_BACKUP.includes(e);
}
