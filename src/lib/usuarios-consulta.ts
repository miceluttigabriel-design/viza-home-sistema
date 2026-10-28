// ─── USUARIOS DE CONSULTA (SOLO LECTURA de la Base) ───
// Lista única de emails con acceso de CONSULTA al Panel ADM: pueden VER la
// base completa (buscador, filtros, orden, paginación) y el CRM (ranking de
// presupuestos) pero NADA editable: ni celdas, ni etiquetas de color, ni
// #HASHTAG, ni guardar/borrar/importar.
//
// Pedidos del dueño:
//   · Task 79: viza.compras@viza.com.py (ENC. COMPRAS, Adriano) — solo puede
//     visualizar la base, sin etiquetar ni editar nada.
//   · Task 82: filipe.campos@viza.com.py — ADM solo para VISUALIZACIÓN de la
//     Base y el CRM (misma configuración que viza.compras@: la base no la
//     puede editar).
//
// El control va por EMAIL y NO por rol: así el modo lectura se aplica SIEMPRE
// para estos usuarios, tengan el rol que tengan en la base. El backend también
// lo rechaza en toda escritura de productos (PUT/DELETE/etiqueta/hashtag).
//
// Para dar acceso de consulta a otro usuario en el futuro: agregar su email
// (minúsculas) a la lista de abajo y nada más — todas las validaciones (UI y
// backend) leen de acá.

export const EMAILS_SOLO_LECTURA_BASE: string[] = [
  "viza.compras@viza.com.py",
  "filipe.campos@viza.com.py",
];

// Devuelve true si el email recibido es un usuario de consulta (solo lectura).
// Tolera null/undefined, espacios y mayúsculas/minúsculas.
export function esEmailSoloLectura(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return EMAILS_SOLO_LECTURA_BASE.includes(e);
}
