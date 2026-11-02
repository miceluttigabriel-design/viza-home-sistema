// ============================================================
// PEDIDO ESPECIAL (Task 113 v4) — LOS % SALEN DE LA BASE, SOLOS
//
// El dueño pidió: "vas a usar TODAS las lógicas de la BASE… la única
// cosa que cambia es que el costo vas a usar lo que vamos a poner
// manualmente". O sea: los % (margen contado, tramos 1-6/7-13/14-30,
// técnico del MAYORISTA, tasa SAFRA) NO se cargan a mano para el
// pedido especial: se ESTIRAN de los productos de la BASE con ese
// PROVEEDOR (fabricante, col CO) + TIPO DE PRODUCTO (col CS).
//
// REGLA DE CÁLCULO = la MISMA que ya usa el sistema para productos
// sin margen propio (src/app/api/products/import-margins/shared.ts,
// "MÁRGENES AUTOMÁTICAS"): PROMEDIO de los productos del grupo con
// margen > 0 → si el grupo no tiene, promedio de todo el TIPO →
// si tampoco hay, promedio GENERAL. Cada campo cae de forma
// independiente (ej: el técnico puede venir del TIPO y el contado
// del par proveedor+tipo).
//
// UNIDADES (verificadas contra la planilla real LISTA VIZA HOME):
//   · marginContado / pct1A6 / pct7A13 / pct14A30 / margenTecnico
//     se guardan como FRACCIÓN (0.05 = 5%).
//   · safra (col CL) va como TEXTO con número legible ("7" = 7%
//     mensual; "null" = sin tasa) — igual que parseSafra del plan.
// La pantalla del PEDIDO ESPECIAL trabaja con NÚMEROS LEGIBLES
// (5 = 5%) — acá se convierte fracción × 100.
//
// Prioridad por campo: BASE (promedio) → si da 0, el % que el admin
// haya cargado en el panel PEDIDO ESPECIAL (tabla PedidoEspecialConfig,
// respaldo) → 0. Así lo que ve el vendedor y lo que recalcula el
// servidor al guardar es SIEMPRE lo mismo.
// ============================================================
import { db } from "@/lib/db";
import { listarCombinaciones } from "@/lib/pedido-especial";

// Los 6 % legibles que usa el cálculo del pedido especial.
export interface PorcentajesPedidoEspecial {
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number;
  pctSafra: number;
}

const PORCENTAJES_CERO: PorcentajesPedidoEspecial = {
  pctContado: 0,
  pct1A6: 0,
  pct7A13: 0,
  pct14A30: 0,
  pctTecnico: 0,
  pctSafra: 0,
};

// Misma normalización que la casa (normalizeKey de import-margins):
// mayúsculas, sin espacios de más — para agrupar sin cullos por typos.
function normalizarClave(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

// Misma regla de parseo del campo SAFRA que el plan real (plan-safra.ts):
// texto "7" → 7 · "7,5" → 7.5 · "null"/"" → 0. NUNCA lanza.
export function parseSafraStr(safra: string | null | undefined): number {
  if (!safra) return 0;
  const limpio = String(safra).trim();
  if (!limpio || limpio.toUpperCase() === "NULL") return 0;
  const n = parseFloat(limpio.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Fila mínima de producto con la que se calculan los promedios
// (todo en las unidades de la BD: fracciones + texto SAFRA).
export interface FilaPorcentajeProducto {
  fabricante: string | null;
  tipo: string | null;
  marginContado: number | null;
  pct1A6: number | null;
  pct7A13: number | null;
  pct14A30: number | null;
  margenTecnico: number | null;
  safra: string | null;
}

// Promedios de UN grupo (en fracción, sin convertir todavía).
interface PromediosGrupo {
  m: number; // margen contado (fracción)
  y: number; // base 1 A 6 (fracción)
  z: number; // base 7 A 13 (fracción)
  aa: number; // base 14 A 30 (fracción)
  tecnico: number; // margen P/técnico (fracción)
  safra: number; // tasa mensual (legible, como la col CL)
  count: number; // productos del grupo (los que aportaron contado)
}

const GRUPO_VACIO: PromediosGrupo = { m: 0, y: 0, z: 0, aa: 0, tecnico: 0, safra: 0, count: 0 };

function promedioDe(valores: number[]): number {
  if (valores.length === 0) return 0;
  const suma = valores.reduce((a, b) => a + b, 0);
  return suma / valores.length;
}

function promediarGrupo(filas: FilaPorcentajeProducto[]): PromediosGrupo {
  // MISMA regla de la casa: el promedio de contado/tramos solo cuenta
  // productos con margen contado > 0. El técnico y el SAFRA caen aparte
  // (cada uno sobre los productos que SÍ tienen ese dato).
  const conContado = filas.filter((f) => (f.marginContado ?? 0) > 0);
  const conTecnico = filas.filter((f) => (f.margenTecnico ?? 0) > 0);
  const conSafra = filas
    .map((f) => parseSafraStr(f.safra))
    .filter((v) => v > 0);
  return {
    m: promedioDe(conContado.map((f) => f.marginContado ?? 0)),
    y: promedioDe(conContado.map((f) => f.pct1A6 ?? 0)),
    z: promedioDe(conContado.map((f) => f.pct7A13 ?? 0)),
    aa: promedioDe(conContado.map((f) => f.pct14A30 ?? 0)),
    tecnico: promedioDe(conTecnico.map((f) => f.margenTecnico ?? 0)),
    safra: promedioDe(conSafra),
    count: conContado.length,
  };
}

// El corazón PURA (sin DB): filas de Product → promedios por
// proveedor+tipo, por tipo y global. Testeable sin base de datos.
export interface MapaPorcentajes {
  porPar: Map<string, PromediosGrupo>; // clave "FAB||TIPO"
  porTipo: Map<string, PromediosGrupo>; // clave "TIPO"
  global: PromediosGrupo;
}

export function calcularPromediosPorcentajes(
  filas: FilaPorcentajeProducto[]
): MapaPorcentajes {
  const porPar = new Map<string, FilaPorcentajeProducto[]>();
  const porTipo = new Map<string, FilaPorcentajeProducto[]>();
  const todas: FilaPorcentajeProducto[] = [];

  for (const f of filas) {
    const fab = normalizarClave(f.fabricante);
    const tip = normalizarClave(f.tipo);
    if (!fab || !tip) continue;
    todas.push(f);
    const clavePar = `${fab}||${tip}`;
    const arrPar = porPar.get(clavePar) || [];
    arrPar.push(f);
    porPar.set(clavePar, arrPar);
    const arrTip = porTipo.get(tip) || [];
    arrTip.push(f);
    porTipo.set(tip, arrTip);
  }

  const promediosPorPar = new Map<string, PromediosGrupo>();
  for (const [clave, filasPar] of porPar) promediosPorPar.set(clave, promediarGrupo(filasPar));
  const promediosPorTipo = new Map<string, PromediosGrupo>();
  for (const [clave, filasTipo] of porTipo) promediosPorTipo.set(clave, promediarGrupo(filasTipo));

  return {
    porPar: promediosPorPar,
    porTipo: promediosPorTipo,
    global: promediarGrupo(todas),
  };
}

// Convierte un grupo (fracción) a los % LEGIBLES con la cascada
// par → tipo → global, campo por campo. El respaldo (config del admin)
// entra solo si la cascada dio 0 en ese campo.
function resolverGrupo(
  mapa: MapaPorcentajes,
  fabricante: string,
  tipo: string,
  respaldo?: Partial<PorcentajesPedidoEspecial> | null
): PorcentajesPedidoEspecial {
  const fab = normalizarClave(fabricante);
  const tip = normalizarClave(tipo);
  const par = mapa.porPar.get(`${fab}||${tip}`) || GRUPO_VACIO;
  const tipoSolo = mapa.porTipo.get(tip) || GRUPO_VACIO;
  const global = mapa.global || GRUPO_VACIO;

  // Cada campo: par → tipo → global → respaldo (config) → 0.
  const porCascada = (
    delPar: number,
    delTipo: number,
    delGlobal: number,
    delRespaldo: number | undefined
  ): number => {
    // Los promedios de contado/tramos/técnico vienen en FRACCIÓN → ×100.
    const elegido = delPar > 0 ? delPar : delTipo > 0 ? delTipo : delGlobal > 0 ? delGlobal : 0;
    const legible = Math.round(elegido * 1_000_000) / 10_000; // fracción → % legible
    if (legible > 0) return legible;
    const r = Number(delRespaldo) || 0;
    return r > 0 ? r : 0;
  };

  // SAFRA ya está en unidades legibles (7 = 7%): sin ×100.
  const safraElegido = par.safra > 0 ? par.safra : tipoSolo.safra > 0 ? tipoSolo.safra : global.safra > 0 ? global.safra : 0;
  const safraFinal =
    safraElegido > 0 ? Math.round(safraElegido * 1_000_000) / 1_000_000 : Number(respaldo?.pctSafra) > 0 ? Number(respaldo?.pctSafra) : 0;

  return {
    pctContado: porCascada(par.m, tipoSolo.m, global.m, respaldo?.pctContado),
    pct1A6: porCascada(par.y, tipoSolo.y, global.y, respaldo?.pct1A6),
    pct7A13: porCascada(par.z, tipoSolo.z, global.z, respaldo?.pct7A13),
    pct14A30: porCascada(par.aa, tipoSolo.aa, global.aa, respaldo?.pct14A30),
    pctTecnico: porCascada(par.tecnico, tipoSolo.tecnico, global.tecnico, respaldo?.pctTecnico),
    pctSafra: safraFinal,
  };
}

// Lee los % para UNA combinación proveedor + tipo (servidor).
// NUNCA lanza: si la BD falla devuelve ceros (o el respaldo cargado).
export async function porcentajesDeLaBase(
  fabricante: string,
  tipo: string,
  respaldo?: Partial<PorcentajesPedidoEspecial> | null
): Promise<PorcentajesPedidoEspecial> {
  try {
    const filas = await db.product.findMany({
      where: { fabricante: { not: null }, tipo: { not: null } },
      select: {
        fabricante: true,
        tipo: true,
        marginContado: true,
        pct1A6: true,
        pct7A13: true,
        pct14A30: true,
        margenTecnico: true,
        safra: true,
      },
    });
    return resolverGrupo(calcularPromediosPorcentajes(filas), fabricante, tipo, respaldo);
  } catch (error) {
    console.error("porcentajesDeLaBase:", error);
    return { ...PORCENTAJES_CERO, ...(respaldo || {}) };
  }
}

// Un par del catálogo con sus % ya resueltos (lo que consume la pantalla).
export interface ParConPorcentajes extends PorcentajesPedidoEspecial {
  fabricante: string;
  tipo: string;
}

// Mapa COMPLETO de la BASE para la pantalla: un registro por cada par
// (fabricante, tipo) real de los productos, con los % ya resueltos
// (promedio de la BASE + respaldo del panel del admin). NUNCA lanza.
export async function mapaPorcentajesDeLaBase(): Promise<ParConPorcentajes[]> {
  try {
    const [filas, combinaciones] = await Promise.all([
      db.product.findMany({
        where: { fabricante: { not: null }, tipo: { not: null } },
        select: {
          fabricante: true,
          tipo: true,
          marginContado: true,
          pct1A6: true,
          pct7A13: true,
          pct14A30: true,
          margenTecnico: true,
          safra: true,
        },
      }),
      listarCombinaciones().catch(() => []),
    ]);
    const mapa = calcularPromediosPorcentajes(filas);

    // Respaldo del panel del admin, por clave normalizada.
    const respaldoPorClave = new Map<string, Partial<PorcentajesPedidoEspecial>>();
    for (const c of combinaciones) {
      const clave = `${normalizarClave(c.proveedor)}||${normalizarClave(c.tipoProducto)}`;
      respaldoPorClave.set(clave, {
        pctContado: c.pctContado,
        pct1A6: c.pct1A6,
        pct7A13: c.pct7A13,
        pct14A30: c.pct14A30,
        pctTecnico: c.pctTecnico,
        pctSafra: c.pctSafra,
      });
    }

    // Un registro por par REAL (texto original de la BASE, sin duplicados).
    const pares = new Map<string, { fabricante: string; tipo: string }>();
    for (const f of filas) {
      const fab = String(f.fabricante || "").trim();
      const tip = String(f.tipo || "").trim();
      if (!fab || !tip) continue;
      const clave = `${normalizarClave(fab)}||${normalizarClave(tip)}`;
      if (!pares.has(clave)) pares.set(clave, { fabricante: fab, tipo: tip });
    }

    const salida: ParConPorcentajes[] = [];
    for (const [clave, par] of pares) {
      const resueltos = resolverGrupo(mapa, par.fabricante, par.tipo, respaldoPorClave.get(clave));
      salida.push({ fabricante: par.fabricante, tipo: par.tipo, ...resueltos });
    }
    salida.sort(
      (a, b) =>
        a.fabricante.localeCompare(b.fabricante) || a.tipo.localeCompare(b.tipo)
    );
    return salida;
  } catch (error) {
    console.error("mapaPorcentajesDeLaBase:", error);
    return [];
  }
}
