// ─── PERMISOS DE LA TASA DE CAMBIO (Task 87B, pedido del dueño) ───
// ¿Quién puede EDITAR la tasa de cambio (botón TASA DE CAMBIO de la Base)?
//   · supremo_admin — siempre (dueño del sistema).
//   · viza@viza.com.py — SOLO este email (pedido explícito del dueño:
//     "el usuario viza@viza.com.py también va poder editar la tasa de
//     cambio pero solo el").
// NADIE más puede editarla: ni admins comunes, ni colaboradores, ni los
// usuarios de consulta (la lista solo-lectura de usuarios-consulta.ts manda
// SIEMPRE encima de todo: aunque un email estuviera acá, si es solo-lectura
// no edita jamás).
//
// El MOSTRADOR (chip CAMBIO: R$ ... · US$ ...) se ve para TODOS — en la
// Base y en el panel de ventas — pero es solo informativo: editar es
// exclusivamente el botón TASA DE CAMBIO de la Base para los de acá arriba.
//
// Archivo chiquito y SIN imports: lo usan igual la API (/api/config-cambio,
// servidor) y los paneles (cliente), así la UI y el backend SIEMPRE deciden
// lo mismo. Para dar permiso a otro email en el futuro: agregarlo (en
// minúsculas) a la lista de abajo y nada más.

export const EMAILS_QUE_EDITAN_TASA_CAMBIO: string[] = [
  "viza@viza.com.py",
];

// Devuelve true si ese usuario (rol + email) puede EDITAR la tasa de cambio.
// Tolera null/undefined, espacios y mayúsculas/minúsculas en el email.
export function puedeEditarTasaCambio(
  role: string | null | undefined,
  email: string | null | undefined
): boolean {
  if ((role || "").trim().toLowerCase() === "supremo_admin") return true;
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return EMAILS_QUE_EDITAN_TASA_CAMBIO.includes(e);
}
