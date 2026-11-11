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
// "MÁRGENES AUTOMÁTICAS") + la peldaña del PROVEEDOR que pidió el
// dueño (Task 113 v6: "en margen se usa conforme de proveedor"):
//   PROMEDIO de los productos del PAR proveedor+tipo con margen > 0
//   → si el par no tiene, promedio de TODO EL PROVEEDOR (todos sus
//     productos, todos sus tipos — el margen es de él)
//   → si tampoco hay, promedio de todo el TIPO
//   → si tampoco hay, promedio GENERAL.
// Cada campo cae de forma independiente (ej: el técnico puede venir
// del TIPO y el contado del par proveedor+tipo).
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
import { listarTiposExtra } from "@/lib/pedido-especial-tipos";

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
  // GRUPO de la BASE (columna CQ "CATEGORIA" del Excel → `categoria`).
  // El dueño pidió usar GRUPO en el PEDIDO ESPECIAL: es más confiable que
  // el TIPO, que puede venir vacío en muchos productos.
  categoria: string | null;
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
// proveedor+tipo, por proveedor, por tipo y global. Testeable sin base.
export interface MapaPorcentajes {
  porPar: Map<string, PromediosGrupo>; // clave "FAB||TIPO"
  porParGrupo: Map<string, PromediosGrupo>; // clave "FAB||GRUPO" (categoria)
  porProveedor: Map<string, PromediosGrupo>; // clave "FAB" (Task 113 v6)
  porTipo: Map<string, PromediosGrupo>; // clave "TIPO"
  porGrupo: Map<string, PromediosGrupo>; // clave "GRUPO" (categoria)
  global: PromediosGrupo;
}

export function calcularPromediosPorcentajes(
  filas: FilaPorcentajeProducto[]
): MapaPorcentajes {
  const porPar = new Map<string, FilaPorcentajeProducto[]>();
  const porParGrupo = new Map<string, FilaPorcentajeProducto[]>();
  const porProveedor = new Map<string, FilaPorcentajeProducto[]>();
  const porTipo = new Map<string, FilaPorcentajeProducto[]>();
  const porGrupo = new Map<string, FilaPorcentajeProducto[]>();
  const todas: FilaPorcentajeProducto[] = [];

  for (const f of filas) {
    const fab = normalizarClave(f.fabricante);
    const tip = normalizarClave(f.tipo);
    const grp = normalizarClave(f.categoria);

    // GRUPO (col CQ): se agrupa aunque el producto no tenga TIPO (justamente
    // GRUPO es más confiable que TIPO en la BASE). Solo necesita proveedor.
    if (fab && grp) {
      const claveParGrupo = `${fab}||${grp}`;
      const arrParGrupo = porParGrupo.get(claveParGrupo) || [];
      arrParGrupo.push(f);
      porParGrupo.set(claveParGrupo, arrParGrupo);
      const arrGrp = porGrupo.get(grp) || [];
      arrGrp.push(f);
      porGrupo.set(grp, arrGrp);
    }

    // Regla de SIEMPRE para el resto de los promedios (par / proveedor /
    // tipo / global): el producto tiene que tener PROVEEDOR y TIPO. No se
    // toca para no cambiar los % que ya funcionaban.
    if (!fab || !tip) continue;
    todas.push(f);
    const clavePar = `${fab}||${tip}`;
    const arrPar = porPar.get(clavePar) || [];
    arrPar.push(f);
    porPar.set(clavePar, arrPar);
    const arrFab = porProveedor.get(fab) || [];
    arrFab.push(f);
    porProveedor.set(fab, arrFab);
    const arrTip = porTipo.get(tip) || [];
    arrTip.push(f);
    porTipo.set(tip, arrTip);
  }

  const promediosPorPar = new Map<string, PromediosGrupo>();
  for (const [clave, filasPar] of porPar) promediosPorPar.set(clave, promediarGrupo(filasPar));
  const promediosPorParGrupo = new Map<string, PromediosGrupo>();
  for (const [clave, filasPar] of porParGrupo) {
    promediosPorParGrupo.set(clave, promediarGrupo(filasPar));
  }
  const promediosPorProveedor = new Map<string, PromediosGrupo>();
  for (const [clave, filasFab] of porProveedor) promediosPorProveedor.set(clave, promediarGrupo(filasFab));
  const promediosPorTipo = new Map<string, PromediosGrupo>();
  for (const [clave, filasTipo] of porTipo) promediosPorTipo.set(clave, promediarGrupo(filasTipo));
  const promediosPorGrupo = new Map<string, PromediosGrupo>();
  for (const [clave, filasGrp] of porGrupo) promediosPorGrupo.set(clave, promediarGrupo(filasGrp));

  return {
    porPar: promediosPorPar,
    porParGrupo: promediosPorParGrupo,
    porProveedor: promediosPorProveedor,
    porTipo: promediosPorTipo,
    porGrupo: promediosPorGrupo,
    global: promediarGrupo(todas),
  };
}

// Convierte un grupo (fracción) a los % LEGIBLES con la cascada
// par proveedor+tipo → par proveedor+GRUPO → proveedor → tipo → GRUPO →
// global, campo por campo. El respaldo (config del admin) entra solo si la
// cascada dio 0 en ese campo.
// El GRUPO es opcional (lo usa el PEDIDO ESPECIAL); si viene vacío la
// cascada se comporta EXACTAMENTE como antes (par → proveedor → tipo →
// global), así no cambiamos ningún % que ya funcionaba.
// Exportada para la prueba de humo (mismo comportamiento en prod).
export function resolverGrupo(
  mapa: MapaPorcentajes,
  fabricante: string,
  grupo: string,
  tipo: string,
  respaldo?: Partial<PorcentajesPedidoEspecial> | null
): PorcentajesPedidoEspecial {
  const fab = normalizarClave(fabricante);
  const grp = normalizarClave(grupo);
  const tip = normalizarClave(tipo);
  const par = fab && tip ? mapa.porPar.get(`${fab}||${tip}`) || GRUPO_VACIO : GRUPO_VACIO;
  const parGrupo =
    fab && grp ? mapa.porParGrupo.get(`${fab}||${grp}`) || GRUPO_VACIO : GRUPO_VACIO;
  const prov = mapa.porProveedor.get(fab) || GRUPO_VACIO;
  const tipoSolo = tip ? mapa.porTipo.get(tip) || GRUPO_VACIO : GRUPO_VACIO;
  const grupoSolo = grp ? mapa.porGrupo.get(grp) || GRUPO_VACIO : GRUPO_VACIO;
  const global = mapa.global || GRUPO_VACIO;

  // Cada campo: par → par grupo → proveedor → tipo → grupo → global →
  // respaldo (config) → 0.
  const porCascada = (
    delPar: number,
    delParGrupo: number,
    delProveedor: number,
    delTipo: number,
    delGrupo: number,
    delGlobal: number,
    delRespaldo: number | undefined
  ): number => {
    // Los promedios de contado/tramos/técnico vienen en FRACCIÓN → ×100.
    const elegido =
      delPar > 0
        ? delPar
        : delParGrupo > 0
          ? delParGrupo
          : delProveedor > 0
            ? delProveedor
            : delTipo > 0
              ? delTipo
              : delGrupo > 0
                ? delGrupo
                : delGlobal > 0
                  ? delGlobal
                  : 0;
    const legible = Math.round(elegido * 1_000_000) / 10_000; // fracción → % legible
    if (legible > 0) return legible;
    const r = Number(delRespaldo) || 0;
    return r > 0 ? r : 0;
  };

  // SAFRA ya está en unidades legibles (7 = 7%): sin ×100.
  const safraElegido =
    par.safra > 0
      ? par.safra
      : parGrupo.safra > 0
        ? parGrupo.safra
        : prov.safra > 0
          ? prov.safra
          : tipoSolo.safra > 0
            ? tipoSolo.safra
            : grupoSolo.safra > 0
              ? grupoSolo.safra
              : global.safra > 0
                ? global.safra
                : 0;
  const safraFinal =
    safraElegido > 0
      ? Math.round(safraElegido * 1_000_000) / 1_000_000
      : Number(respaldo?.pctSafra) > 0
        ? Number(respaldo?.pctSafra)
        : 0;

  return {
    pctContado: porCascada(par.m, parGrupo.m, prov.m, tipoSolo.m, grupoSolo.m, global.m, respaldo?.pctContado),
    pct1A6: porCascada(par.y, parGrupo.y, prov.y, tipoSolo.y, grupoSolo.y, global.y, respaldo?.pct1A6),
    pct7A13: porCascada(par.z, parGrupo.z, prov.z, tipoSolo.z, grupoSolo.z, global.z, respaldo?.pct7A13),
    pct14A30: porCascada(par.aa, parGrupo.aa, prov.aa, tipoSolo.aa, grupoSolo.aa, global.aa, respaldo?.pct14A30),
    pctTecnico: porCascada(par.tecnico, parGrupo.tecnico, prov.tecnico, tipoSolo.tecnico, grupoSolo.tecnico, global.tecnico, respaldo?.pctTecnico),
    pctSafra: safraFinal,
  };
}

// Lee los % para UNA combinación proveedor + grupo + tipo (servidor).
// NUNCA lanza: si la BD falla devuelve ceros (o el respaldo cargado).
export async function porcentajesDeLaBase(
  fabricante: string,
  grupo: string,
  tipo: string,
  respaldo?: Partial<PorcentajesPedidoEspecial> | null
): Promise<PorcentajesPedidoEspecial> {
  try {
    const filas = await db.product.findMany({
      where: { fabricante: { not: null } },
      select: {
        fabricante: true,
        categoria: true,
        tipo: true,
        marginContado: true,
        pct1A6: true,
        pct7A13: true,
        pct14A30: true,
        margenTecnico: true,
        safra: true,
      },
    });
    return resolverGrupo(calcularPromediosPorcentajes(filas), fabricante, grupo, tipo, respaldo);
  } catch (error) {
    console.error("porcentajesDeLaBase:", error);
    return { ...PORCENTAJES_CERO, ...(respaldo || {}) };
  }
}

// Un par del catálogo con sus % ya resueltos (lo que consume la pantalla).
// `grupo` es el GRUPO de la BASE (categoria) y `tipo` el TIPO (puede venir
// vacío: el dueño pidió GRUPO como selector principal y TIPO opcional).
export interface ParConPorcentajes extends PorcentajesPedidoEspecial {
  fabricante: string;
  grupo: string;
  tipo: string;
}

// Mapa COMPLETO de la BASE para la pantalla: un registro por cada
// combinación (fabricante, GRUPO, tipo) con los % ya resueltos
// (promedio de la BASE + respaldo del panel del admin). NUNCA lanza.
// El dueño pidió GRUPO como selector principal y TIPO opcional:
//   · (FAB, GRUPO, TIPO) → combo más específico
//   · (FAB, GRUPO, "")   → solo grupo
//   · (FAB, "", TIPO)    → solo tipo
//   · (FAB, "", "")      → promedio del proveedor (si no hay nada más)
// Task 113 v6: los TIPOS CREADOS por los vendedores también entran.
export async function mapaPorcentajesDeLaBase(): Promise<ParConPorcentajes[]> {
  try {
    const [filas, combinaciones, tiposExtra] = await Promise.all([
      db.product.findMany({
        where: { fabricante: { not: null } },
        select: {
          fabricante: true,
          categoria: true,
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
      listarTiposExtra().catch(() => [] as string[]),
    ]);
    const mapa = calcularPromediosPorcentajes(filas);

    // Respaldo del panel del admin, por clave normalizada (proveedor+tipo).
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

    // Combinaciones REALES de la BASE (texto original, sin duplicados).
    type ClavePar = { fabricante: string; grupo: string; tipo: string };
    const pares = new Map<string, ClavePar>();
    const proveedoresReales = new Set<string>();
    const claveDe = (fab: string, grp: string, tip: string) =>
      `${normalizarClave(fab)}||${normalizarClave(grp)}||${normalizarClave(tip)}`;
    const agregar = (fab: string, grp: string, tip: string) => {
      const f = String(fab || "").trim();
      if (!f) return;
      const g = String(grp || "").trim();
      const t = String(tip || "").trim();
      const clave = claveDe(f, g, t);
      if (!pares.has(clave)) pares.set(clave, { fabricante: f, grupo: g, tipo: t });
    };

    for (const f of filas) {
      const fab = String(f.fabricante || "").trim();
      if (!fab) continue;
      const grp = String(f.categoria || "").trim();
      const tip = String(f.tipo || "").trim();
      proveedoresReales.add(fab);
      // Base del proveedor (fallback final cuando no hay grupo ni tipo).
      agregar(fab, "", "");
      if (grp) agregar(fab, grp, "");
      if (tip) agregar(fab, "", tip);
      if (grp && tip) agregar(fab, grp, tip);
    }

    // TIPOS CREADOS (v6): un registro por (proveedor real × tipo extra).
    // Solo si el tipo extra NO existe ya en la BASE (por las dudas).
    const tiposBaseNorm = new Set(
      Array.from(pares.values())
        .filter((p) => p.tipo)
        .map((p) => normalizarClave(p.tipo))
    );
    for (const extra of tiposExtra) {
      if (tiposBaseNorm.has(normalizarClave(extra))) continue;
      for (const fab of Array.from(proveedoresReales).sort()) {
        agregar(fab, "", extra);
        agregar(fab, "", "");
      }
    }

    const salida: ParConPorcentajes[] = [];
    for (const [, par] of pares) {
      const claveRespaldo = `${normalizarClave(par.fabricante)}||${normalizarClave(par.tipo)}`;
      const resueltos = resolverGrupo(
        mapa,
        par.fabricante,
        par.grupo,
        par.tipo,
        respaldoPorClave.get(claveRespaldo)
      );
      salida.push({
        fabricante: par.fabricante,
        grupo: par.grupo,
        tipo: par.tipo,
        ...resueltos,
      });
    }
    salida.sort(
      (a, b) =>
        a.fabricante.localeCompare(b.fabricante) ||
        a.grupo.localeCompare(b.grupo) ||
        a.tipo.localeCompare(b.tipo)
    );
    return salida;
  } catch (error) {
    console.error("mapaPorcentajesDeLaBase:", error);
    return [];
  }
}
