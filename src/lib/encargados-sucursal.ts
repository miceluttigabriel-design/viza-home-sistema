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
  // LA PALOMA — ANTONIO FAGNER VILLANUEVA ROSATTO
  "antonio.fagner@viza.com.py": "LA PALOMA",
  // NUEVA ESPERANZA — DAN WILLIAN AUGUSTO VIEIRA
  "danwillian@viza.com.py": "NUEVA ESPERANZA",
  // SALTOS DEL GUAIRA — LIBRADO JUSTO FRANCO AQUINO
  "librado@viza.com.py": "SALTOS DEL GUAIRA",
};

// ─── TIPO ESPECIAL (Task 139, pedido del dueño) ──────────────────────────────
// Los 4 encargados de arriba ahora se muestran en el GDA con el TIPO
// "ESPECIAL" (antes se mostraban como VIP). Su ACCESO AL CRM NO CAMBIA NADA:
// esta misma lista ENCARGADOS_SUCURSAL sigue habilitando el botón CRM y el
// acceso por la API exactamente igual que antes — solo cambió el nombre de la
// etiqueta visible (pedido del dueño: "vas a poner como usuario tipo ESPECIAL").
export const TIPOS_ESPECIAL = ENCARGADOS_SUCURSAL;

// ─── USUARIOS VIP (Task 139 + Task 147, pedido del dueño) ────────────────────
// "filipe.campos@ y viza.compras@ estos dos usuarios el TIPO vas a poner como
// VIP". Task 147: se suman larazago@, juliane@, julianamoleiro@ y juliozago@.
// Etiqueta visible en el GDA y acceso al ORQUESTADOR (Task 144). Para ver el
// CRM y la Base en SOLO LECTURA, el email también va en la lista de
// src/lib/usuarios-consulta.ts (así lo hacen todos los VIP de hoy).
// Valor = sucursal del usuario, informativa (todos son de CENTRAL).
export const USUARIOS_VIP: Record<string, string> = {
  // DIRECTORIO (Task 137: sucursal CENTRAL)
  "filipe.campos@viza.com.py": "CENTRAL",
  // ENC. COMPRAS (Task 137: sucursal CENTRAL)
  "viza.compras@viza.com.py": "CENTRAL",
  // Task 147 — VIPs (sucursal CENTRAL)
  "larazago@viza.com.py": "CENTRAL",
  "juliane@viza.com.py": "CENTRAL",
  "julianamoleiro@viza.com.py": "CENTRAL",
  "juliozago@viza.com.py": "CENTRAL",
};
