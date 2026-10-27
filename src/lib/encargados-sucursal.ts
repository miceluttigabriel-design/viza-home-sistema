// ─── ENCARGADOS DE SUCURSAL CON ACCESO AL CRM (panel de ventas) ───
// Cada encargado ve el CRM de presupuestos SOLO de SU sucursal y en modo
// SOLO LECTURA: no puede cambiar sucursales, no ve datos de otras
// sucursales ni el total general de la empresa.
//
// Clave = email del usuario (en minúscula, igual al login).
// Valor = la sucursal oficial que ve en su CRM.
//
// Para habilitar el CRM a las otras sucursales más adelante: agregar UNA
// línea por encargado acá y listo — el botón en el panel de ventas y el
// acceso por la API se activan solos, sin tocar nada más.
//
// Este archivo es SEGURO para importar desde componentes de cliente
// (no importa la base de datos, es solo una lista estática).
export const ENCARGADOS_SUCURSAL: Record<string, string> = {
  // KATUETE — JEYSON MARCELO WEISS
  "jeyson@viza.com.py": "KATUETE",
  // (Las otras 3 sucursales se agregan acá cuando el admin lo pida.)
};
