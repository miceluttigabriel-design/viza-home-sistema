// ─── GASTOS ADM 1% (Task 96, pedido del dueño) ───
// El dueño pidió: "en GASTO ADM % ADD puede agregar el 1% ... poné esto con
// el botón en TODOS los productos y quiero que esto vaya hasta en los
// productos que vamos a cargar nuevos ... menos en los TRANSPORTERS de
// CHACOMER KENTON".
//
// Reglas de esta tarea:
//   1. GASTOS ADM (columna O de la cadena de costos, campo admPct) = 1% en
//      TODOS los productos — el botón del panel de la base lo aplica a
//      toda la base de una sola vez (y recalcula Costo Prod. y precios con
//      las MISMAS fórmulas que la edición manual).
//   2. Los productos NUEVOS (creación manual y planilla ERP) nacen con 1%
//      si no traen un GASTOS ADM propio. Si el admin/la planilla lo carga
//      explícito (aunque sea 0), ese valor se RESPETA.
//   3. EXCEPCIÓN: los TRANSPORTERS de CHACOMER y KENTON NO reciben el 1%
//      (ni el botón ni los defaults los tocan: quedan con lo que tienen).
//
// La operación es IDEMPOTENTE (poner 1%, no sumar 1%): si se aplica dos
// veces, el resultado es el mismo — nunca se acumula.
//
// Lib client-safe: NO importa Prisma. Lo usan los endpoints (preview/apply
// del botón, creación e importación de productos) y podría usarse en la UI.

// El 1% del pedido del dueño, como fracción decimal (0.01 = 1%).
// En la base admPct se guarda como fracción (0.25 = 25%), igual que % DESC
// y % ADD — la tabla lo muestra multiplicado por 100.
export const GASTO_ADM_DEFAULT = 0.01;

// Tolerancia para comparar el admPct guardado con el 1% objetivo: limpia
// ruido de punto flotante (0.010000000001 vs 0.01 cuenta como igual).
export function yaEsGastoAdmDefault(admPct: number | null | undefined): boolean {
  return admPct !== null && admPct !== undefined && Math.abs(admPct - GASTO_ADM_DEFAULT) < 1e-9;
}

// ¿El producto es un TRANSPORTER de CHACOMER o KENTON? (los EXCLUIDOS del 1%)
// Se mira el TEXTO del nombre del producto (contiene "TRANSPORTER") y la
// marca/fabricante (campos brand / fabricante / marca / modelo, o el propio
// nombre cuando la marca viene dentro del nombre). Comparación sin acentos
// ni mayúsculas/minúsculas, tolerando espacios y guiones.
export function esTransporterChacomerKenton(p: {
  name?: string | null;
  brand?: string | null;
  fabricante?: string | null;
  marca?: string | null;
  modelo?: string | null;
} | null | undefined): boolean {
  if (!p) return false;
  const limpiar = (s: unknown): string =>
    String(s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  // ¿Es un TRANSPORTER? (palabra completa dentro del nombre)
  const nombre = ` ${limpiar(p.name)} `;
  if (!nombre.includes(" TRANSPORTER ")) return false;
  // ¿La marca es CHACOMER o KENTON? (en cualquiera de los campos de marca,
  // o dentro del propio nombre: "TRANSPORTER 110 CHACOMER")
  const textoMarca = [
    limpiar(p.brand),
    limpiar(p.fabricante),
    limpiar(p.marca),
    limpiar(p.modelo),
    nombre,
  ].join(" ");
  return textoMarca.includes("CHACOMER") || textoMarca.includes("KENTON");
}
