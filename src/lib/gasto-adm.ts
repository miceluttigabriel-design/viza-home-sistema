// ─── % ADD + GASTOS ADM 1% (Task 96 y 96b, pedido del dueño) ───
// Lo que pidió el dueño (aclaración final):
//   "el gasto (ADM) es 1 para todos los productos en general y el %ADD es 1
//    para todos los productos menos los TRANSPORTERS que son de CHACOMER
//    KENTON. Hacé esto en un mismo botón y también quiero que los nuevos
//    productos que no sean TRANSPORTERS ya nazcan con esta margen".
//
// Reglas de esta tarea:
//   1. UN MISMO BOTÓN pone DOS columnas en 1% en TODOS los productos:
//        · % ADD        (columna M, campo addPct) = 1%
//        · GASTOS ADM   (columna O, campo admPct) = 1%
//      y recalcula Costo Prod. y precios con las MISMAS fórmulas de la
//      edición manual (L → N → P → T → márgenes → precios).
//   2. Los productos NUEVOS (creación manual, planilla ERP e importación de
//      stock) nacen con 1% en AMBOS campos si no traen valor propio. Si el
//      admin/la planilla carga un valor explícito (aunque sea 0 en la
//      planilla), ese valor se RESPETA.
//   3. EXCEPCIÓN: los TRANSPORTERS de CHACOMER y KENTON NO reciben el 1%
//      (ni el botón ni los defaults los tocan: quedan EXACTAMENTE como
//      están). Es la familia que el dueño protegió en las dos versiones del
//      pedido ("menos los TRANSPORTERS de CHACOMER KENTON").
//   4. % ADD PROPIO: los productos que YA tienen un % ADD cargado (por
//      planilla VALOR ADD o a mano, ej. refuerzos SAFRA) NO se les pisa el
//      valor con el botón: se les pone solo el GASTOS ADM 1% y su % ADD
//      propio queda intacto (regla de la casa: el importador NUNCA borra
//      valores que el producto ya tiene). El preview los lista para que el
//      dueño los vea ANTES de aplicar.
//
// La operación del botón es IDEMPOTENTE (pone 1%, no suma 1%): si se aplica
// dos veces, el resultado es el mismo — nunca se acumula.
//
// Lib client-safe: NO importa Prisma. Lo usan los endpoints (preview/apply
// del botón, creación e importación de productos) y podría usarse en la UI.

// El 1% del pedido del dueño, como fracción decimal (0.01 = 1%).
// En la base admPct/addPct se guardan como fracción (0.25 = 25%), igual que
// % DESC — la tabla los muestra multiplicados por 100.
export const GASTO_ADM_DEFAULT = 0.01;

// Mismo 1% para la columna % ADD (el dueño pidió 1% en AMBAS columnas).
export const PCT_ADD_DEFAULT = 0.01;

// Tolerancia para comparar porcentajes guardados con el 1% objetivo: limpia
// ruido de punto flotante (0.010000000001 vs 0.01 cuenta como igual).
const TOL = 1e-9;

export function yaEsGastoAdmDefault(admPct: number | null | undefined): boolean {
  return admPct !== null && admPct !== undefined && Math.abs(admPct - GASTO_ADM_DEFAULT) < TOL;
}

export function yaEsAddPctDefault(addPct: number | null | undefined): boolean {
  return addPct !== null && addPct !== undefined && Math.abs(addPct - PCT_ADD_DEFAULT) < TOL;
}

// ¿El producto tiene un % ADD PROPIO (explícito y distinto de vacío/0)?
// Los vacíos (null) y 0 cuentan como "sin % ADD" → el botón les pone el 1%.
// Un valor propio (ej. 0.25 = 25% de un refuerzo) se RESPETA: no se pisa.
export function tieneAddPctPropio(addPct: number | null | undefined): boolean {
  return addPct !== null && addPct !== undefined && Math.abs(addPct) > TOL;
}

// ¿El producto es un TRANSPORTER de CHACOMER o KENTON? (los EXCLUIDOS del 1%)
// Se mira el TEXTO del nombre del producto (contiene "TRANSPORTER" — cubre
// TRANSPORTER, TRANSPORTERS y variantes sin espacio) y la marca/fabricante
// (campos brand / fabricante / marca / modelo, o el propio nombre cuando la
// marca viene dentro del nombre). Comparación sin acentos ni
// mayúsculas/minúsculas, tolerando espacios y guiones.
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
  // ¿Es un TRANSPORTER? (subcadena del nombre: cubre "TRANSPORTER",
  // "TRANSPORTERS", "TRANSPORTER 110", "TRANSPORTER-110"…)
  const nombre = ` ${limpiar(p.name)} `;
  if (!nombre.includes("TRANSPORTER")) return false;
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

// ─── NACIMIENTO CON LA MARGEN (Task 96b) ───
// Producto NUEVO (creación manual, planilla ERP o importación de stock):
// nace con % ADD = 1% y GASTOS ADM = 1% si no trae valores propios.
//  · Los valores EXPLÍCITOS que trae el body/la planilla se RESPETAN
//    (incluido 0 cuando viene de la planilla con la columna cargada).
//  · Los TRANSPORTERS de CHACOMER/KENTON nacen como siempre: sin el 1%
//    (la familia excluida del dueño).
// Devuelve el MISMO objeto, mutado (patrón de la casa en los importadores).
export function naceConMargenDefault<T extends {
  admPct?: number | null;
  addPct?: number | null;
  name?: string | null;
  brand?: string | null;
  fabricante?: string | null;
  marca?: string | null;
  modelo?: string | null;
}>(data: T): T {
  if (!esTransporterChacomerKenton(data)) {
    if (data.admPct === null || data.admPct === undefined) {
      data.admPct = GASTO_ADM_DEFAULT;
    }
    if (data.addPct === null || data.addPct === undefined) {
      data.addPct = PCT_ADD_DEFAULT;
    }
  }
  return data;
}
