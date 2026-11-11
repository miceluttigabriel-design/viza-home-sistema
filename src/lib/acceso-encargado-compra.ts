// ─── ACCESO AL DEPARTAMENTO DE COMPRA (pedido del dueño) ───
//
// El DEPARTAMENTO DE COMPRA nació exclusivo del supremo_admin (Task 161). El
// dueño pidió habilitar también a estos usuarios ADMIN:
//   · baltazar@viza.com.py — GERENTE ADMINISTRATIVO
//   · viza@viza.com.py     — VILMAR CESAR ZAGO PEREIRA (DIRECTORIO)
//
// Regla de la casa: el control va por EMAIL en una lista única (mismo
// patrón que src/lib/acceso-stock-general.ts y src/lib/usuarios-consulta.ts),
// NO por rol. Así SOLO estos dos usuarios (además del supremo) entran; el
// resto de los admins NO ve el módulo. Para habilitar a otro usuario en el
// futuro, basta agregar su email (minúsculas) a la lista de abajo.
//
// La lib la usan el FRONT (page.tsx: vista + cuadro del ORQUESTADOR) y el
// BACKEND (/api/stock/compra re-valida siempre, por si llaman a mano).

export const EMAILS_ENCARGADO_COMPRA: string[] = [
  "baltazar@viza.com.py",
  "viza@viza.com.py",
];

// true = este usuario puede abrir y usar el DEPARTAMENTO DE COMPRA.
export function puedeUsarEncargadoCompra(
  email?: string | null,
  role?: string | null
): boolean {
  if (role === "supremo_admin") return true;
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return EMAILS_ENCARGADO_COMPRA.includes(e);
}
