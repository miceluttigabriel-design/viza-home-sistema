// ─── PRODUCTOS REGALO DE VIZA HOME (descuento automático) ───
//
// La CHAPA (COD 100068) funciona IGUAL que el CASCO: es un REGALO de VIZA
// Home. Al agregarla al presupuesto el sistema la detecta sola y descuenta
// su valor del total automáticamente (no se financia, no se cobra).
// Funciona en TODOS los planes: CUOTA, SAFRA, CON CHEQUE y MAYORISTA.
//
// Detección por COD (SKU) EXACTO — no por nombre — para que nunca un
// producto con "CHAPA" en el nombre dispare el descuento por error.
// Si mañana aparece otro código de regalo, agregarlo a la lista de abajo
// y todos los planes lo respetan solos.
//
// Este archivo es SEGURO para importar desde componentes de cliente y
// rutas de servidor (no importa la base de datos, es solo una lista).
export const CODIGOS_PRODUCTO_REGALO: readonly string[] = [
  "100068", // CHAPA
];

export function esProductoRegalo(sku: unknown): boolean {
  const s = String(sku ?? "").trim().toUpperCase();
  return CODIGOS_PRODUCTO_REGALO.includes(s);
}
