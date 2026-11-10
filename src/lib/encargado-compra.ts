// ═══════════════════════════════════════════════════════════════════
// ENCARGADO DE COMPRA — MOTOR DE CÁLCULO (Task 161)
//
// Pedido del dueño: "el cuadro de necesidades va a pertenecer al
// ENCARGADO DE COMPRA... que trabaje de la misma forma... allá adentro
// él va analizar la necesidad de la compra".
//
// QUÉ HACE (determinístico, sin IA):
//   · Lee el stock real de las 4 sucursales + CENTRAL y las ventas
//     detectadas (bajadas de stock entre análisis).
//   · Calcula el objetivo de la RED:
//       - con STOCK IDEAL: la suma de los ideales de las sucursales;
//       - sin ideal: el stock actual + lo vendido (reponer lo que salió).
//   · Necesidad de compra = lo que falta a la red después de contar TODO
//     el stock disponible (sucursales + CENTRAL). Si CENTRAL alcanza, la
//     necesidad es 0: eso lo cubre el ENCARGADO DE DISTRIBUCIÓN.
//   · Prioriza por quiebre (0 en sucursales) y por ventas detectadas.
//   · Agrupa por PROVEEDOR (columna FABRICANTE de la Base), TIPO y COLOR.
//
// REGLA DE ORO: el sistema NO genera órdenes de compra ni compra nada.
// Solo recomienda y deja el PDF listo para que el dueño decida.
// ═══════════════════════════════════════════════════════════════════

import {
  DEPOSITO_CENTRAL,
  codigoNumero,
  ordenarSucursales,
  type EntradaPlanEncargado,
  type EntradaProductoEncargado,
} from "@/lib/encargado-distribucion";

// Task 161 (pedido del dueño): el Encargado de Compra trabaja SOLO con:
//   · productos marcados con la etiqueta verde SELECCIONADO en la Base;
//   · códigos desde 100.000 en adelante (los códigos viejos se descartan).
export const CODIGO_MINIMO_COMPRA = 100_000;

export function codigoCompraValido(sku: unknown): boolean {
  const n = codigoNumero(sku);
  return n !== null && n >= CODIGO_MINIMO_COMPRA;
}

export type PrioridadCompra = "ALTA" | "MEDIA" | "BAJA";

export const PRIORIDAD_ORDEN: Record<PrioridadCompra, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAJA: 2,
};

export interface DetalleSucursalCompra {
  sucursal: string;
  saldo: number;
  objetivo: number;
  falta: number;
  vendido: number;
}

export interface FilaCompra {
  sku: string;
  producto: string;
  tipo: string | null;
  color: string | null;
  colores: string[];
  marca: string | null;
  proveedor: string;
  categoria: string | null;
  /** saldo por sucursal (sin CENTRAL) */
  saldos: Record<string, number>;
  central: number;
  stockSucursales: number;
  stockRed: number; // sucursales + CENTRAL
  objetivoRed: number;
  faltaRed: number;
  compra: number;
  vendidoRed: number;
  prioridad: PrioridadCompra;
  detalle: DetalleSucursalCompra[];
}

export interface ProveedorCompra {
  proveedor: string;
  productos: number;
  unidades: number;
  prioritarios: number;
}

export interface ResumenCompra {
  productos: number;
  unidades: number;
  proveedores: number;
  prioridadAlta: number;
  prioridadMedia: number;
  prioridadBaja: number;
  productosAnalizados: number;
  productosConVenta: number;
  unidadesVendidas: number;
  unidadesEnCentral: number;
  /** productos descartados por no estar SELECCIONADOS en la Base */
  noSeleccionados: number;
  /** productos descartados por código menor a 100.000 */
  codigosIgnorados: number;
}

export interface PlanCompra {
  generadoEn: string;
  modo: "IDEAL" | "VENTAS" | "MIXTO";
  sucursales: string[];
  nodos: string[];
  filas: FilaCompra[];
  proveedores: ProveedorCompra[];
  resumen: ResumenCompra;
  alertas: string[];
}

// ─── Análisis que devuelve la IA (o el respaldo determinístico) ───
export interface AnalisisCompraIA {
  activa: boolean;
  modelo: string | null;
  resumen: string;
  prioridades: string[];
  alertas: string[];
  recomendaciones: string[];
  mensaje: string;
  error?: string;
}

function numero(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function entero(v: unknown): number {
  return Math.max(0, Math.round(numero(v)));
}

function compararCodigo(a: string, b: string): number {
  const na = Number(String(a).replace(/\D/g, ""));
  const nb = Number(String(b).replace(/\D/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), "es");
}

function prioridadDe(
  stockSucursales: number,
  objetivoRed: number,
  vendidoRed: number,
  detalle: DetalleSucursalCompra[]
): PrioridadCompra {
  const quiebres = detalle.filter((d) => d.saldo <= 0 && d.objetivo > 0).length;
  const cobertura = objetivoRed > 0 ? stockSucursales / objetivoRed : 1;
  if (stockSucursales <= 0 || quiebres >= 2 || cobertura < 0.5) return "ALTA";
  if (quiebres === 1 || vendidoRed > 0) return "MEDIA";
  return "BAJA";
}

function objetivoSucursales(
  producto: EntradaProductoEncargado,
  sucursales: string[]
): { objetivos: number[]; conIdeal: boolean } {
  const ideales = sucursales.map((s) => entero(producto.ideales[s]));
  const hayIdeal = ideales.some((v) => v > 0);

  if (hayIdeal) {
    const definidos = ideales.filter((v) => v > 0);
    const promedio = definidos.length
      ? definidos.reduce((a, b) => a + b, 0) / definidos.length
      : 0;
    return {
      objetivos: ideales.map((v) => (v > 0 ? v : Math.max(0, Math.round(promedio)))),
      conIdeal: true,
    };
  }

  // Sin ideal: cada sucursal necesita AL MENOS 1 unidad. Si además vendió,
  // se repone lo vendido. Así un producto seleccionado con 1 sola unidad en
  // la red genera necesidad de compra para cubrir las otras sucursales
  // (aunque no haya ventas ni Stock Ideal configurado).
  return {
    objetivos: sucursales.map((s) =>
      Math.max(1, entero(producto.saldos[s]) + entero(producto.vendido[s]))
    ),
    conIdeal: false,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CÁLCULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export function calcularPlanCompra(entrada: EntradaPlanEncargado): PlanCompra {
  const nodos = ordenarSucursales(entrada.nodos);
  const sucursales = nodos.filter((n) => n !== DEPOSITO_CENTRAL);
  const generadoEn = entrada.generadoEn || new Date().toISOString();

  const filas: FilaCompra[] = [];
  const alertas = new Set<string>();
  let productosAnalizados = 0;
  let productosConVenta = 0;
  let unidadesVendidas = 0;
  let unidadesEnCentral = 0;
  let conIdeal = 0;
  let sinIdeal = 0;
  let sinProveedor = 0;
  let noSeleccionados = 0;
  let codigosIgnorados = 0;

  for (const producto of entrada.productos || []) {
    // Regla del dueño: SOLO productos SELECCIONADOS (etiqueta verde).
    if (!producto.seleccionado) {
      noSeleccionados += 1;
      continue;
    }
    // Regla del dueño: descartar códigos menores a 100.000.
    if (!codigoCompraValido(producto.sku)) {
      codigosIgnorados += 1;
      continue;
    }

    productosAnalizados += 1;

    const { objetivos, conIdeal: tieneIdeal } = objetivoSucursales(producto, sucursales);
    if (tieneIdeal) conIdeal += 1;
    else sinIdeal += 1;

    const stockSucursales = sucursales.reduce(
      (acc, s) => acc + entero(producto.saldos[s]),
      0
    );
    const central = entero(producto.saldos[DEPOSITO_CENTRAL]);
    const stockRed = stockSucursales + central;
    const objetivoRed = objetivos.reduce((a, b) => a + b, 0);
    const vendidoRed = sucursales.reduce(
      (acc, s) => acc + entero(producto.vendido[s]),
      0
    );

    unidadesVendidas += vendidoRed;
    unidadesEnCentral += central;
    if (vendidoRed > 0) productosConVenta += 1;

    const faltaRed = Math.max(0, objetivoRed - stockRed);
    if (faltaRed <= 0) continue;

    const proveedor = String(producto.proveedor || "").trim().toUpperCase() || "SIN PROVEEDOR";
    if (proveedor === "SIN PROVEEDOR") sinProveedor += 1;

    const detalle: DetalleSucursalCompra[] = sucursales.map((s, i) => {
      const saldo = entero(producto.saldos[s]);
      return {
        sucursal: s,
        saldo,
        objetivo: objetivos[i],
        falta: Math.max(0, objetivos[i] - saldo),
        vendido: entero(producto.vendido[s]),
      };
    });

    const colores = Array.isArray(producto.colores) ? producto.colores : [];
    const colorTexto = colores.length > 0 ? colores.join(" / ") : null;
    const prioridad = prioridadDe(stockSucursales, objetivoRed, vendidoRed, detalle);

    const saldos: Record<string, number> = {};
    for (const s of sucursales) saldos[s] = entero(producto.saldos[s]);

    filas.push({
      sku: producto.sku,
      producto: producto.nombre,
      tipo: producto.tipo,
      color: colorTexto,
      colores,
      marca: producto.marca,
      proveedor,
      categoria: producto.categoria,
      saldos,
      central,
      stockSucursales,
      stockRed,
      objetivoRed,
      faltaRed,
      compra: faltaRed,
      vendidoRed,
      prioridad,
      detalle,
    });
  }

  // ── Orden: prioridad > proveedor > tipo > color > código ──
  filas.sort((a, b) => {
    const p = PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
    if (p !== 0) return p;
    const prov = a.proveedor.localeCompare(b.proveedor, "es");
    if (prov !== 0) return prov;
    const tipo = String(a.tipo ?? "").localeCompare(String(b.tipo ?? ""), "es");
    if (tipo !== 0) return tipo;
    const color = String(a.color ?? "").localeCompare(String(b.color ?? ""), "es");
    if (color !== 0) return color;
    return compararCodigo(a.sku, b.sku);
  });

  // ── Agrupado por proveedor ──
  const mapaProv = new Map<string, ProveedorCompra>();
  for (const f of filas) {
    let p = mapaProv.get(f.proveedor);
    if (!p) {
      p = { proveedor: f.proveedor, productos: 0, unidades: 0, prioritarios: 0 };
      mapaProv.set(f.proveedor, p);
    }
    p.productos += 1;
    p.unidades += f.compra;
    if (f.prioridad === "ALTA") p.prioritarios += 1;
  }
  const proveedores = Array.from(mapaProv.values()).sort(
    (a, b) => b.unidades - a.unidades || a.proveedor.localeCompare(b.proveedor, "es")
  );

  const prioridadAlta = filas.filter((f) => f.prioridad === "ALTA").length;
  const prioridadMedia = filas.filter((f) => f.prioridad === "MEDIA").length;
  const prioridadBaja = filas.filter((f) => f.prioridad === "BAJA").length;

  if (sinProveedor > 0) {
    alertas.add(
      `${sinProveedor} código(s) con necesidad de compra no tienen PROVEEDOR (columna FABRICANTE) en la Base. Completalo para poder agrupar el pedido.`
    );
  }
  if (noSeleccionados > 0) {
    alertas.add(
      `${noSeleccionados} producto(s) no están marcados como SELECCIONADO (etiqueta verde) en la Base y quedaron fuera del análisis de compra.`
    );
  }
  if (codigosIgnorados > 0) {
    alertas.add(
      `${codigosIgnorados} código(s) menores a ${CODIGO_MINIMO_COMPRA.toLocaleString("es-PY")} fueron descartados: el Encargado de Compra solo trabaja desde ese código en adelante.`
    );
  }
  if (prioridadAlta > 0) {
    alertas.add(
      `${prioridadAlta} código(s) están en QUIEBRE (0 en las sucursales) o con menos de la mitad de su objetivo. Son los primeros a comprar.`
    );
  }
  if (productosConVenta === 0) {
    alertas.add(
      "Todavía no hay ventas detectadas entre análisis. La primera pasada guarda la foto del stock; desde la siguiente, cada bajada se cuenta como venta y aparece acá."
    );
  }
  if (unidadesEnCentral > 0) {
    alertas.add(
      `CENTRAL tiene ${unidadesEnCentral.toLocaleString("es-PY")} unidad(es) que primero deben distribuirse con el ENCARGADO DE DISTRIBUCIÓN antes de comprar.`
    );
  }
  alertas.add(
    "El ENCARGADO DE COMPRA solo recomienda: el sistema NO genera órdenes de compra ni compra a proveedores."
  );

  const modo: PlanCompra["modo"] =
    conIdeal === 0 ? "VENTAS" : sinIdeal === 0 ? "IDEAL" : "MIXTO";

  return {
    generadoEn,
    modo,
    sucursales,
    nodos,
    filas,
    proveedores,
    resumen: {
      productos: filas.length,
      unidades: filas.reduce((acc, f) => acc + f.compra, 0),
      proveedores: proveedores.length,
      prioridadAlta,
      prioridadMedia,
      prioridadBaja,
      productosAnalizados,
      productosConVenta,
      unidadesVendidas,
      unidadesEnCentral,
      noSeleccionados,
      codigosIgnorados,
    },
    alertas: Array.from(alertas),
  };
}
