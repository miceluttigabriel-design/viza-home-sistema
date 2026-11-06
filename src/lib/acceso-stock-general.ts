// ─── ACCESO AL STOCK GENERAL (Task 127, pedido del dueño) ───
//
// "haga el buton ir a stock general > este buton apenas el usuario
//  viza@viza.com.py  VILMAR CESAR ZAGO PEREIRA  vá poder ver amigo ok".
//
// Regla de la casa: el control va por EMAIL en una lista única (mismo
// patrón que src/lib/usuarios-consulta.ts), NO por rol — así VILMAR ve
// el botón tenga el rol que tenga, y NADIE más lo ve. El supremo_admin
// sigue entrando al Stock General por su ORQUESTADOR de siempre (no
// necesita este botón); si un día el dueño quiere darle acceso a otro
// usuario, solo se agrega su email acá abajo.
//
// Lib compartida por el FRONT (renderiza el botón IR A STOCK GENERAL)
// y el BACKEND (page.tsx solo pasa la navegación, y la API de
// distribución re-valida por si alguien la llamara a mano).

// Emails con el botón IR A STOCK GENERAL (y con acceso a la vista).
export const EMAILS_ACCESO_STOCK_GENERAL = ["viza@viza.com.py"];

export function puedeIrAStockGeneral(email?: string | null): boolean {
  if (!email) return false;
  return EMAILS_ACCESO_STOCK_GENERAL.includes(email.trim().toLowerCase());
}
