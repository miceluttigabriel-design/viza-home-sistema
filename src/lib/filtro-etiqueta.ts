import { idsProductosConHashtag } from "@/lib/producto-hashtag";

// ═══════════════════════════════════════════════════════════════════════════
// TASK 167b - FILTROS DE ETIQUETA COMBINADOS (pedido del dueño)
//
// Antes la BASE solo dejaba elegir UN filtro de etiqueta por vez
// (SELECCIONADO, QUEMA STOCK, VIZA LÍQUIDA, #HASHTAG...). El dueño pidió
// poder marcar VARIOS y exportar esa combinación.
//
// Regla: los valores elegidos se suman con OR (UNIÓN) — "SELECCIONADO +
// QUEMA STOCK" muestra y exporta los productos de cualquiera de los dos.
// Eso es lo mismo que ya hacen los filtros por columna (where in [...]).
//
// EDITADOS es un modo aparte (no es una etiqueta): si viene, manda solo.
// El cliente ya lo trata como exclusivo; acá se refuerza por las dudas.
//
// El parámetro llega como "verde,rojo" (separado por comas). Un solo valor
// se comporta EXACTAMENTE igual que antes.
// ═══════════════════════════════════════════════════════════════════════════

const RESERVADOS = new Set(["editados", "sin", "hashtag"]);

export async function condicionesEtiqueta(
  etiquetaParam: string | null,
  veBaseCompleta: boolean
): Promise<Record<string, unknown>[]> {
  const valores = String(etiquetaParam || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (valores.length === 0) return [];

  // EDITADOS: productos con edición manual. Es un modo exclusivo.
  if (valores.includes("editados")) {
    return [{ ultimaEdicionAt: { not: null } }];
  }

  const conds: Record<string, unknown>[] = [];
  const etiquetas = valores.filter((v) => !RESERVADOS.has(v));

  if (valores.includes("sin")) {
    conds.push({ etiquetaColor: null });
  }
  if (etiquetas.length > 0) {
    conds.push({ etiquetaColor: { in: etiquetas } });
  }
  if (valores.includes("hashtag")) {
    const ids = await idsProductosConHashtag(!veBaseCompleta);
    conds.push({ id: { in: ids.length > 0 ? ids : ["__sin_coincidencia__"] } });
  }
  return conds;
}

// Aplica las condiciones al `where`. Con varias, se guardan en AND para NO
// pisar el `OR` de la búsqueda (Prisma combina los campos de primer nivel con
// AND, así que (búsqueda OR ...) AND (etiqueta A OR etiqueta B) queda bien sin
// importar el orden en que se armen).
export function aplicarCondicionesEtiqueta(
  where: Record<string, any>,
  conds: Record<string, unknown>[]
): void {
  if (conds.length === 0) return;
  if (conds.length === 1) {
    Object.assign(where, conds[0]);
    return;
  }
  where.AND = Array.isArray(where.AND)
    ? [...where.AND, { OR: conds }]
    : [{ OR: conds }];
}
