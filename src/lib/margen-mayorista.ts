// ─── MARGEN MAYORISTA → VALOR MAYORISTA AUTOMÁTICO (Task 97, pedido del dueño) ───
//
// Lo que pidió el dueño (texto textual):
//   "% AUTOMATICA NO MAYORISTA PARA REFLETIR EN VALOR DE MAYORISTA ok.
//    % PARA AIRES SERIA EMCIMA DE (COSTO GS) Y % PARA DEMAS PRODUCTOS
//    EM CIMA DE (COSTO PROD.) ambos ao agregar en MARGEN MAYORISTA ya
//    nos traria automaticamente el VALOR MAYORISTA."
//
// Reglas de esta tarea:
//   1. La columna MARGEN MAYORISTA (campo margenTecnico) ahora es un %:
//      el admin escribe 5 (= 5%) y el sistema guarda 0.05, igual que
//      % CONTADO / % DESC (la base ya guarda fracciones: la planilla
//      trae 0.05 en "Margen P/Tecnico").
//   2. Al escribir el %, el VALOR MAYORISTA (campo valorTecnico) se
//      calcula SOLO, con la MISMA fórmula de la planilla LISTA VIZA HOME
//      (columna CV "Valor Para Tecnico"):
//         VALOR = CostoBase * Margen + CostoBase   (= CostoBase * (1 + %))
//      Sin redondeos: exactamente lo mismo que calcula el Excel
//      (verificado contra los valores cacheados de la planilla).
//   3. El CostoBase depende del producto:
//         · AIRES  (aire acondicionado)  → COSTO GS   (col G, costGs)
//         · DEMÁS productos               → COSTO PROD. (col T, costProd)
//      Es la misma base que ya usa la planilla: los únicos productos con
//      fórmula en la columna CV son los AIRES y todos apuntan a
//      [Costo Gs] (72 con categoria AIRES ACONDICIONADOS + 4 con nombre
//      AIRE y categoria vacía).
//   4. Si el producto NO tiene margen cargada (o es 0), el VALOR MAYORISTA
//      no se toca: queda el que el admin escribió a mano (regla de la
//      casa: un valor propio siempre se respeta).
//   5. Si el admin escribe el VALOR MAYORISTA a mano, se respeta tal cual
//      (el cálculo automático solo llena el valor cuando el body de la
//      edición NO trae valorTecnico explícito).
//
// ¿Qué es un AIRE? (regla del detector, validada contra la planilla real:
// 0 falsos negativos y los únicos "con AIRE en el texto" que quedan fuera
// son los que NO son aire acondicionado: EXTRACTOR/DEPURADOR/CEPILLO/
// CORTINA DE AIRE — el dueño los tiene fuera de la familia AIRES):
//   · GRUPO (categoria) contiene la palabra AIRE/AIRES
//     ("AIRES ACONDICIONADOS"), o
//   · TIPO PRODUCTO empieza con AIRE ("AIRE COMPLETO"), o
//   · DESCRIPCION empieza con AIRE ("AIRE ACOND. GW 12.000BTU...").
// "EXTRACTOR DE AIRE" / "CEPILLO DE AIRE" NO arrancan con AIRE y su GRUPO
// es ELECTRO UTILITARIOS / HIGIENE → quedan fuera, como corresponde.
//
// Lib client-safe: NO importa Prisma. La usan la tabla del Panel ADM
// (cálculo en vivo mientras el admin escribe el %) y los endpoints
// (PUT /api/products/[id] y POST /api/products, como espejo de seguridad).

// Normaliza texto para comparar: sin acentos, mayúsculas, solo A-Z0-9 y
// espacios (mismo espíritu del limpiar() de src/lib/gasto-adm.ts).
function limpiar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// ¿El producto es un AIRE acondicionado? Ver doc de arriba.
export function esProductoAire(
  p:
    | {
        categoria?: string | null;
        tipo?: string | null;
        name?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!p) return false;
  const grupo = limpiar(p.categoria);
  // "AIRES ACONDICIONADOS" (y cualquier GRUPO con la palabra AIRE/AIRES)
  if (/(^| )AIRES?( |$)/.test(grupo)) return true;
  const tipo = limpiar(p.tipo);
  // "AIRE COMPLETO" — el TIPO arranca con AIRE (evita "EXTRACTOR DE AIRE")
  if (/^AIRES?( |$)/.test(tipo)) return true;
  const nombre = limpiar(p.name);
  // "AIRE ACOND. GW 12.000BTU..." — la DESCRIPCION arranca con AIRE
  // (evita "CEPILLO DE AIRE", "CORTINA DE AIRE", "EXTRACTOR DE AIRE")
  if (/^AIRES?( |$)/.test(nombre)) return true;
  return false;
}

// Costo base del cálculo según el producto:
//   AIRES → COSTO GS · DEMÁS → COSTO PROD. (regla textual del dueño)
export function baseMayorista(p: {
  categoria?: string | null;
  tipo?: string | null;
  name?: string | null;
  costGs?: number | null;
  costProd?: number | null;
}): { esAire: boolean; base: number } {
  const esAire = esProductoAire(p);
  const base = esAire
    ? Number(p.costGs) || 0
    : Number(p.costProd) || 0;
  return { esAire, base };
}

// VALOR MAYORISTA desde el % (misma fórmula del Excel, sin redondeo):
//   VALOR = CostoBase * (1 + %)
// Devuelve null cuando NO corresponde calcular:
//   · margen vacío, no numérico o <= 0 (sin margen el VALOR es manual)
// toPrecision(12) limpia el ruido de punto flotante (1950000*1.05 =
// 2047500.0000000002 → 2047500) sin tocar decimales reales
// (2649982.5*1.05 = 2782481.625 queda exacto, igual que el Excel).
export function calcularValorMayorista(
  p: {
    categoria?: string | null;
    tipo?: string | null;
    name?: string | null;
    costGs?: number | null;
    costProd?: number | null;
  },
  margen: number | string | null | undefined
): number | null {
  const m = Number(margen);
  if (!Number.isFinite(m) || m <= 1e-9) return null;
  const { base } = baseMayorista(p);
  // Sin base todavía (producto recién creado sin COSTO GS / COSTO PROD.)
  // → NO calcular: si se escribiera 0 encima se pisaría un VALOR MAYORISTA
  // que el admin pudo cargar a mano. Que quede lo que había (el % ya quedó
  // guardado: cuando exista la base, el próximo cálculo llena el VALOR).
  if (base <= 0) return null;
  const valor = base * (1 + m);
  return Number(valor.toPrecision(12));
}
