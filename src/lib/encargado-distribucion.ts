// ═══════════════════════════════════════════════════════════════════
// ENCARGADO DE DISTRIBUCIÓN — MOTOR DE CÁLCULO (Task 160)
//
// Pedido del dueño:
//   "quiero que reparta BALANCEADO POR CADA SUCURSAL según el TIPO de
//    producto, su COLOR y la CANTIDAD DE STOCK. Tiene que balancear
//    proporcional para las 4 sucursales y estar activo viendo cuál
//    producto bajó en cuál sucursal para suplir la necesidad de aquel
//    stock... cada vez que actualizo el stock algunos bajan la cantidad
//    y significa que fueron vendidos."
//
// REGLAS DEL MOTOR (determinísticas, sin IA):
//   · Trabaja SOLO entre sucursales. CENTRAL es el depósito y solo
//     actúa como ORIGEN de reposición cuando una sucursal queda por
//     debajo de su objetivo. Nunca genera compras a proveedores.
//   · Objetivo por sucursal:
//       - Si el producto tiene STOCK IDEAL configurado en las sucursales,
//         se respeta ese ideal. Las sucursales sin ideal toman el
//         promedio de las que sí lo tienen (así las 4 quedan pareadas).
//       - Si no hay ideal, se reparte el stock total de las 4 en forma
//         proporcional, con un ajuste suave por las ventas recientes
//         (bajadas de stock detectadas entre análisis).
//   · La cantidad a mover es el mínimo entre lo que SOBRA en el origen
//     y lo que FALTA en el destino. Nunca se deja un origen por debajo
//     de su objetivo y NUNCA se vacía una sucursal: si tenía stock,
//     conserva al menos 1 unidad. Mover la única unidad de una sucursal
//     a otra no equilibra nada, solo mueve el problema de lugar.
//   · El COLOR sale de la columna CORES de la Base. Se conserva el
//     detalle de colores y se agrupa por TIPO + COLOR para el informe.
//   · Si los excedentes no alcanzan, el faltante queda informado. NO se
//     inventa mercadería ni se genera una compra.
// ═══════════════════════════════════════════════════════════════════

export const SUCURSALES_BALANCE = [
  "NUEVA ESPERANZA",
  "KATUETE",
  "LA PALOMA",
  "SALTOS DEL GUAIRA",
] as const;

export const DEPOSITO_CENTRAL = "CENTRAL";

export interface EntradaProductoEncargado {
  id: string;
  sku: string;
  nombre: string;
  tipo: string | null;
  categoria: string | null;
  marca: string | null;
  /** fabricante de la Base = PROVEEDOR del producto */
  proveedor?: string | null;
  /** true = etiqueta verde SELECCIONADO en la Base */
  seleccionado?: boolean;
  /** etiquetaColor tal cual la Base: "verde", "azul", "dorado", "rojo",
   *  id de etiqueta creada, o null = SIN etiqueta (en blanco).
   *  Regla del dueño (Task 168): el Encargado de Compra analiza
   *  SELECCIONADO (verde) + PARA PEDIDO (azul) + EN BLANCO (null).
   *  Cualquier otra etiqueta (DESCONTINUADO, QUEMA STOCK, VIZA LÍQUIDA...)
   *  queda FUERA del análisis. */
  etiqueta?: string | null;
  modelo: string | null;
  colores: string[];
  /** CORES tal cual viene de la Base (respaldo si no se parseó antes) */
  colorLegacy?: string | null;
  /** saldo actual por nodo (CENTRAL + sucursales) */
  saldos: Record<string, number>;
  /** stock ideal por nodo (vacío = sin ideal configurado) */
  ideales: Record<string, number>;
  /** unidades que bajaron desde el análisis anterior (ventas/consumo) */
  vendido: Record<string, number>;
}

export interface EntradaPlanEncargado {
  nodos: string[];
  productos: EntradaProductoEncargado[];
  generadoEn?: string;
}

export type MotivoTransferencia = "EQUILIBRIO" | "REPOSICION";

export interface FilaEncargado {
  sku: string;
  producto: string;
  /** texto completo de CORES, tal cual la Base (ej. "BLANCO / AZUL") */
  color: string | null;
  /** colores separados para mostrar chips */
  colores: string[];
  tipo: string | null;
  categoria: string | null;
  marca: string | null;
  origen: string;
  destino: string;
  cantidad: number;
  origenSaldo: number;
  origenObjetivo: number;
  destinoSaldo: number;
  destinoObjetivo: number;
  origenVendido: number;
  destinoVendido: number;
  origenDespues: number;
  destinoDespues: number;
  motivo: MotivoTransferencia;
}

export interface BalanceSucursalEncargado {
  sucursal: string;
  saldoActual: number;
  objetivo: number;
  saldoDespues: number;
  entradas: number;
  salidas: number;
  vendidoReciente: number;
  productos: number;
  productosBajos: number;
  faltanteNoCubierto: number;
}

export interface NecesidadEncargado {
  sku: string;
  producto: string;
  color: string | null;
  colores: string[];
  tipo: string | null;
  sucursal: string;
  saldo: number;
  objetivo: number;
  falta: number;
  /** parte de la falta que quedó sin cubrir tras mover todo el excedente */
  faltaSinCubrir: number;
  vendido: number;
}

export interface ResumenEncargado {
  transferencias: number;
  unidades: number;
  productos: number;
  productosAnalizados: number;
  productosConStock: number;
  faltanteNoCubierto: number;
  sucursalesConFaltante: Array<{ nodo: string; falta: number }>;
  sucursalesBalance: string[];
  nodos: string[];
}

export interface CentralEncargado {
  saldoActual: number;
  ideal: number | null;
  saldoDespues: number;
  salidas: number;
}

// Motivo que ve el dueño en el informe:
//   · FALTA       → la sucursal destino estaba en 0 antes de recibir.
//   · EQUILIBRAR  → la sucursal destino ya tenía 1 o más y se pareja.
export type MotivoVisibleTransferencia = "FALTA" | "EQUILIBRAR";

export function motivoVisibleTransferencia(
  fila: Pick<FilaEncargado, "destinoSaldo">
): MotivoVisibleTransferencia {
  return Math.max(0, Math.round(Number(fila.destinoSaldo) || 0)) <= 0
    ? "FALTA"
    : "EQUILIBRAR";
}

export interface PlanEncargado {
  generadoEn: string;
  modo: "IDEAL" | "PROPORCIONAL" | "MIXTO";
  sucursales: string[];
  nodos: string[];
  filas: FilaEncargado[];
  balance: BalanceSucursalEncargado[];
  necesidades: NecesidadEncargado[];
  alertas: string[];
  resumen: ResumenEncargado;
  central: CentralEncargado | null;
}

// ─── Análisis que devuelve la IA (o el respaldo determinístico) ───
export interface AnalisisEncargadoIA {
  activa: boolean;
  modelo: string | null;
  resumen: string;
  prioridades: string[];
  alertas: string[];
  recomendaciones: string[];
  mensaje: string;
  error?: string;
}

// ─── Helpers numéricos y de texto ───
function numero(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function entero(v: unknown): number {
  return Math.max(0, Math.round(numero(v)));
}

export function codigoNumero(sku: unknown): number | null {
  const m = String(sku ?? "").match(/\d+/g);
  if (!m) return null;
  return Number(m.join(""));
}

// La columna CORES es texto libre ("BRANCO/AZUL", "PRETO", "CINZA"...).
// Se separa por los separadores habituales y se conserva el orden.
export function parsearColores(valor: string | null | undefined): string[] {
  const texto = String(valor ?? "").trim();
  if (!texto) return [];
  const partes = texto
    .split(/[\/,;|+]+/g)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const p of partes) {
    const clave = p.toLocaleUpperCase("es");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(p);
  }
  return salida;
}

function ordenSucursal(nombre: string): number {
  const i = SUCURSALES_BALANCE.indexOf(nombre as (typeof SUCURSALES_BALANCE)[number]);
  return i >= 0 ? i : 999;
}

export function ordenarSucursales(nodos: string[]): string[] {
  const unicos = Array.from(new Set(nodos.map((n) => String(n || "").trim().toUpperCase()).filter(Boolean)));
  unicos.sort((a, b) => {
    if (a === DEPOSITO_CENTRAL) return -1;
    if (b === DEPOSITO_CENTRAL) return 1;
    const oa = ordenSucursal(a);
    const ob = ordenSucursal(b);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, "es");
  });
  return unicos;
}

// Reparte un total entero según pesos, con el método del resto mayor
// (determinista: ante empate manda el orden de las sucursales).
function repartir(total: number, pesos: number[]): number[] {
  const t = Math.max(0, Math.floor(total));
  const n = pesos.length;
  if (n === 0) return [];
  if (t === 0) return new Array(n).fill(0);
  const limpios = pesos.map((p) => Math.max(0, numero(p)));
  const suma = limpios.reduce((a, b) => a + b, 0);
  const usados = suma > 0 ? limpios : new Array(n).fill(1);
  const sumaUsada = suma > 0 ? suma : n;
  const exactos = usados.map((p) => (t * p) / sumaUsada);
  const base = exactos.map((x) => Math.floor(x));
  let resto = t - base.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (resto > 0 && orden.length > 0) {
    base[orden[k % orden.length].i] += 1;
    resto -= 1;
    k += 1;
  }
  return base;
}

function compararCodigo(a: string, b: string): number {
  const na = codigoNumero(a);
  const nb = codigoNumero(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na === null && nb !== null) return 1;
  if (na !== null && nb === null) return -1;
  return String(a).localeCompare(String(b), "es");
}

function clonarMapa(valores: Record<string, number>, nodos: string[]): Map<string, number> {
  return new Map(nodos.map((n) => [n, entero(valores[n])]));
}

// ═══════════════════════════════════════════════════════════════════
// CÁLCULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export function calcularPlanEncargado(entrada: EntradaPlanEncargado): PlanEncargado {
  const nodos = ordenarSucursales(entrada.nodos);
  const sucursales = nodos.filter((n) => n !== DEPOSITO_CENTRAL);
  const generadoEn = entrada.generadoEn || new Date().toISOString();

  const filas: FilaEncargado[] = [];
  const necesidades: NecesidadEncargado[] = [];
  const alertas = new Set<string>();
  const faltantePorNodo = new Map<string, number>();
  const salidasPorNodo = new Map<string, number>();
  const entradasPorNodo = new Map<string, number>();

  let productosConIdeal = 0;
  let productosAnalizados = 0;
  let productosConStock = 0;
  let productosMultiColor = 0;
  let productosSinStockConIdeal = 0;

  for (const producto of entrada.productos || []) {
    productosAnalizados += 1;
    // Para dejar el "saldo después" coherente en todas las filas del
    // producto (aunque el origen haga varias transferencias).
    const filaInicio = filas.length;

    const saldo = clonarMapa(producto.saldos, nodos);
    const ideal = clonarMapa(producto.ideales, nodos);
    const vendido = clonarMapa(producto.vendido, nodos);
    const colores = Array.isArray(producto.colores) && producto.colores.length > 0
      ? producto.colores
      : parsearColores(producto.colorLegacy ?? null);
    const colorTexto = colores.length > 0 ? colores.join(" / ") : null;

    if (colores.length > 1) productosMultiColor += 1;

    const saldoTotalSucursales = sucursales.reduce((acc, s) => acc + (saldo.get(s) ?? 0), 0);
    if (saldoTotalSucursales > 0) productosConStock += 1;

    const idealesSucursales = sucursales.map((s) => ideal.get(s) ?? 0);
    const hayIdeal = idealesSucursales.some((v) => v > 0);
    if (hayIdeal) productosConIdeal += 1;

    // Sin stock en sucursales y sin ideal: nada que balancear. Si CENTRAL
    // tiene stock, NO se vacía solo: el dueño define el ideal o la
    // reposición se informa como alerta.
    if (saldoTotalSucursales === 0 && !hayIdeal) {
      const central = saldo.get(DEPOSITO_CENTRAL) ?? 0;
      if (central > 0) {
        alertas.add(
          `${producto.sku} · ${producto.nombre}: CENTRAL tiene ${central} unidades y las sucursales 0, pero el producto no tiene STOCK IDEAL. Configurá el ideal para que el Encargado lo reparta.`
        );
      }
      continue;
    }

    if (saldoTotalSucursales === 0 && hayIdeal) {
      productosSinStockConIdeal += 1;
    }

    // ── Objetivo por sucursal ──
    let objetivos: number[];
    if (hayIdeal) {
      const definidos = idealesSucursales.filter((v) => v > 0);
      const promedio = definidos.length
        ? definidos.reduce((a, b) => a + b, 0) / definidos.length
        : Math.ceil(saldoTotalSucursales / Math.max(1, sucursales.length));
      objetivos = idealesSucursales.map((v) => (v > 0 ? v : Math.max(0, Math.round(promedio))));
    } else {
      // Equilibrio proporcional + ajuste SUAVE por ventas recientes.
      // La venta no domina el objetivo: como máximo pesa 1,75 vs 1.
      const pesos = sucursales.map((s) => 1 + Math.min(0.75, (vendido.get(s) ?? 0) * 0.05));
      objetivos = repartir(saldoTotalSucursales, pesos);
    }

    // ── Excedentes y déficits de las sucursales ──
    // Task 161 (pedido del dueño): una sucursal NUNCA se vacía para
    // "equilibrar". Si solo tiene 1 unidad, esa unidad se queda donde está:
    // moverla no cubre a nadie más, solo deja otra sucursal en 0. El origen
    // solo entrega lo que realmente le sobra por encima de su objetivo y,
    // como mínimo, conserva 1 unidad si tenía stock.
    const excedentes = sucursales
      .map((s, i) => {
        const saldoNodo = saldo.get(s) ?? 0;
        const piso = Math.max(objetivos[i], saldoNodo > 0 ? 1 : 0);
        return {
          nodo: s,
          indice: i,
          sobra: saldoNodo - piso,
          saldo: saldoNodo,
          objetivo: objetivos[i],
        };
      })
      .filter((x) => x.sobra > 0)
      .sort((a, b) => b.sobra - a.sobra || a.indice - b.indice);

    const deficits = sucursales
      .map((s, i) => ({
        nodo: s,
        indice: i,
        falta: objetivos[i] - (saldo.get(s) ?? 0),
        saldo: saldo.get(s) ?? 0,
        objetivo: objetivos[i],
      }))
      .filter((x) => x.falta > 0)
      .sort((a, b) => b.falta - a.falta || a.indice - b.indice);

    // Needs se registran ANTES de mover: es la foto de lo que falta.
    const necesidadesProducto: NecesidadEncargado[] = [];
    for (const d of deficits) {
      const necesidad: NecesidadEncargado = {
        sku: producto.sku,
        producto: producto.nombre,
        color: colorTexto,
        colores,
        tipo: producto.tipo,
        sucursal: d.nodo,
        saldo: d.saldo,
        objetivo: d.objetivo,
        falta: d.falta,
        faltaSinCubrir: d.falta,
        vendido: vendido.get(d.nodo) ?? 0,
      };
      necesidadesProducto.push(necesidad);
      necesidades.push(necesidad);
    }

    if (excedentes.length === 0 && deficits.length === 0) continue;

    // ── Fase 1: mover excedente de sucursales a sucursales ──
    const usado = new Map<string, number>();
    const faltaRestante = new Map<string, number>();

    for (const d of deficits) {
      let falta = d.falta;
      for (const e of excedentes) {
        if (falta <= 0) break;
        const disponible = e.sobra - (usado.get(e.nodo) ?? 0);
        if (disponible <= 0) continue;
        const cantidad = Math.min(disponible, falta);
        if (cantidad <= 0) continue;

        const origenAntes = saldo.get(e.nodo) ?? 0;
        const destinoAntes = saldo.get(d.nodo) ?? 0;
        usado.set(e.nodo, (usado.get(e.nodo) ?? 0) + cantidad);
        falta -= cantidad;
        saldo.set(e.nodo, origenAntes - cantidad);
        saldo.set(d.nodo, destinoAntes + cantidad);
        salidasPorNodo.set(e.nodo, (salidasPorNodo.get(e.nodo) ?? 0) + cantidad);
        entradasPorNodo.set(d.nodo, (entradasPorNodo.get(d.nodo) ?? 0) + cantidad);

        filas.push({
          sku: producto.sku,
          producto: producto.nombre,
          color: colorTexto,
          colores,
          tipo: producto.tipo,
          categoria: producto.categoria,
          marca: producto.marca,
          origen: e.nodo,
          destino: d.nodo,
          cantidad,
          origenSaldo: e.saldo,
          origenObjetivo: e.objetivo,
          destinoSaldo: d.saldo,
          destinoObjetivo: d.objetivo,
          origenVendido: vendido.get(e.nodo) ?? 0,
          destinoVendido: vendido.get(d.nodo) ?? 0,
          origenDespues: origenAntes - cantidad,
          destinoDespues: destinoAntes + cantidad,
          motivo: "EQUILIBRIO",
        });
      }
      if (falta > 0) faltaRestante.set(d.nodo, falta);
    }

    // ── Fase 2: CENTRAL repone lo que las sucursales no pudieron cubrir ──
    // Solo se usa el excedente de CENTRAL sobre su ideal (si tiene ideal).
    // Si no tiene ideal, se usa lo necesario para cubrir el faltante, sin
    // tocar más de lo imprescindible.
    if (faltaRestante.size > 0 && nodos.includes(DEPOSITO_CENTRAL)) {
      const centralSaldo = saldo.get(DEPOSITO_CENTRAL) ?? 0;
      const centralIdeal = ideal.get(DEPOSITO_CENTRAL) ?? 0;
      const reservaCentral = centralIdeal > 0 ? centralIdeal : 0;
      let centralDisponible = Math.max(0, centralSaldo - reservaCentral);

      const pendientes = Array.from(faltaRestante.entries())
        .map(([nodo, falta]) => ({
          nodo,
          falta,
          indice: sucursales.indexOf(nodo),
        }))
        .sort((a, b) => b.falta - a.falta || a.indice - b.indice);

      for (const p of pendientes) {
        if (centralDisponible <= 0) break;
        const cantidad = Math.min(centralDisponible, p.falta);
        if (cantidad <= 0) continue;

        const origenAntes = saldo.get(DEPOSITO_CENTRAL) ?? 0;
        const destinoAntes = saldo.get(p.nodo) ?? 0;
        centralDisponible -= cantidad;
        saldo.set(DEPOSITO_CENTRAL, origenAntes - cantidad);
        saldo.set(p.nodo, destinoAntes + cantidad);
        salidasPorNodo.set(DEPOSITO_CENTRAL, (salidasPorNodo.get(DEPOSITO_CENTRAL) ?? 0) + cantidad);
        entradasPorNodo.set(p.nodo, (entradasPorNodo.get(p.nodo) ?? 0) + cantidad);

        const indiceDestino = sucursales.indexOf(p.nodo);
        const objetivoDestino = indiceDestino >= 0 ? objetivos[indiceDestino] : 0;

        filas.push({
          sku: producto.sku,
          producto: producto.nombre,
          color: colorTexto,
          colores,
          tipo: producto.tipo,
          categoria: producto.categoria,
          marca: producto.marca,
          origen: DEPOSITO_CENTRAL,
          destino: p.nodo,
          cantidad,
          origenSaldo: centralSaldo,
          origenObjetivo: centralIdeal,
          destinoSaldo: destinoAntes,
          destinoObjetivo: objetivoDestino,
          origenVendido: vendido.get(DEPOSITO_CENTRAL) ?? 0,
          destinoVendido: vendido.get(p.nodo) ?? 0,
          origenDespues: origenAntes - cantidad,
          destinoDespues: destinoAntes + cantidad,
          motivo: "REPOSICION",
        });

        const resta = p.falta - cantidad;
        if (resta > 0) faltaRestante.set(p.nodo, resta);
        else faltaRestante.delete(p.nodo);
      }
    }

    // ── Saldo FINAL por sucursal para mostrar en el informe ──
    // Si un origen hace 2 transferencias, todas sus filas deben mostrar el
    // mismo "queda" final (ej. LA PALOMA 4 → 1), no 4 → 3 y 4 → 2.
    for (let i = filaInicio; i < filas.length; i += 1) {
      const f = filas[i];
      f.origenDespues = Math.max(0, saldo.get(f.origen) ?? f.origenDespues);
      f.destinoDespues = Math.max(0, saldo.get(f.destino) ?? f.destinoDespues);
    }

    // ── Faltante final por sucursal ──
    for (const [nodo, falta] of faltaRestante) {
      if (falta > 0) faltantePorNodo.set(nodo, (faltantePorNodo.get(nodo) ?? 0) + falta);
    }
    // Cada necesidad guarda cuánto quedó sin cubrir después del plan.
    for (const n of necesidadesProducto) {
      n.faltaSinCubrir = Math.max(0, faltaRestante.get(n.sucursal) ?? 0);
    }

    if (saldoTotalSucursales > 0 && saldoTotalSucursales < sucursales.length) {
      alertas.add(
        `${producto.sku} · ${producto.nombre}: las sucursales tienen ${saldoTotalSucursales} unidad(es) en total; no alcanza para dejar 1 en cada una. No se vacía ninguna sucursal: solo se mueve el excedente real.`
      );
    }
  }

  // ── Alertas de cobertura ──
  for (const [nodo, falta] of faltantePorNodo) {
    alertas.add(`${nodo}: quedan ${falta} unidad(es) sin cobertura después de mover todo el excedente disponible.`);
  }
  if (productosMultiColor > 0) {
    alertas.add(
      `${productosMultiColor} código(s) tienen más de un color en CORES. Al despachar, verificar que el surtido de colores acompañe la transferencia.`
    );
  }
  if (productosSinStockConIdeal > 0) {
    alertas.add(
      `${productosSinStockConIdeal} producto(s) con STOCK IDEAL no tienen stock en ninguna sucursal. El Encargado los marca como necesidad, pero NO genera compras a proveedores.`
    );
  }

  // ── Balance por sucursal (agregado de todos los productos) ──
  const balance: BalanceSucursalEncargado[] = sucursales.map((s) => {
    let saldoActual = 0;
    let objetivo = 0;
    let saldoDespues = 0;
    let vendidoReciente = 0;
    let productos = 0;
    let productosBajos = 0;

    for (const p of entrada.productos || []) {
      const saldoS = entero(p.saldos[s]);
      const idealS = entero(p.ideales[s]);
      const totalSucursales = sucursales.reduce((acc, x) => acc + entero(p.saldos[x]), 0);
      const idealesSuc = sucursales.map((x) => entero(p.ideales[x]));
      const hayIdealP = idealesSuc.some((v) => v > 0);
      let objetivoS = idealS;
      if (!hayIdealP) {
        const pesos = sucursales.map((x) => 1 + Math.min(0.75, entero(p.vendido[x]) * 0.05));
        const rep = repartir(totalSucursales, pesos);
        objetivoS = rep[sucursales.indexOf(s)] ?? 0;
      } else if (idealS <= 0) {
        const definidos = idealesSuc.filter((v) => v > 0);
        objetivoS = definidos.length
          ? Math.round(definidos.reduce((a, b) => a + b, 0) / definidos.length)
          : 0;
      }

      saldoActual += saldoS;
      objetivo += objetivoS;
      vendidoReciente += entero(p.vendido[s]);
      if (saldoS > 0) productos += 1;
      if (saldoS < objetivoS) productosBajos += 1;
    }

    // saldoDespues = saldoActual + entradas - salidas (de las filas reales)
    const entradas = entradasPorNodo.get(s) ?? 0;
    const salidas = salidasPorNodo.get(s) ?? 0;
    saldoDespues = saldoActual + entradas - salidas;

    return {
      sucursal: s,
      saldoActual,
      objetivo,
      saldoDespues,
      entradas,
      salidas,
      vendidoReciente,
      productos,
      productosBajos,
      faltanteNoCubierto: faltantePorNodo.get(s) ?? 0,
    };
  });

  // ── Detalle ordenado: TIPO > COLOR > CÓDIGO > DESTINO ──
  filas.sort((a, b) => {
    const ta = String(a.tipo ?? "").localeCompare(String(b.tipo ?? ""), "es");
    if (ta !== 0) return ta;
    const ca = String(a.color ?? "").localeCompare(String(b.color ?? ""), "es");
    if (ca !== 0) return ca;
    const cod = compararCodigo(a.sku, b.sku);
    if (cod !== 0) return cod;
    return a.destino.localeCompare(b.destino, "es");
  });

  necesidades.sort((a, b) => {
    if (b.falta !== a.falta) return b.falta - a.falta;
    if (b.vendido !== a.vendido) return b.vendido - a.vendido;
    return compararCodigo(a.sku, b.sku);
  });

  const unidades = filas.reduce((acc, f) => acc + f.cantidad, 0);
  const productosMovidos = new Set(filas.map((f) => f.sku)).size;
  const sucursalesConFaltante = Array.from(faltantePorNodo.entries())
    .map(([nodo, falta]) => ({ nodo, falta }))
    .sort((a, b) => b.falta - a.falta);

  const centralSaldo = nodos.includes(DEPOSITO_CENTRAL) ? entero(
    entrada.productos.reduce((acc, p) => acc + entero(p.saldos[DEPOSITO_CENTRAL]), 0)
  ) : 0;
  const centralIdealTotal = nodos.includes(DEPOSITO_CENTRAL) ? entero(
    entrada.productos.reduce((acc, p) => acc + entero(p.ideales[DEPOSITO_CENTRAL]), 0)
  ) : 0;
  const central = nodos.includes(DEPOSITO_CENTRAL)
    ? {
        saldoActual: centralSaldo,
        ideal: centralIdealTotal > 0 ? centralIdealTotal : null,
        saldoDespues: centralSaldo - (salidasPorNodo.get(DEPOSITO_CENTRAL) ?? 0),
        salidas: salidasPorNodo.get(DEPOSITO_CENTRAL) ?? 0,
      }
    : null;

  const modo: PlanEncargado["modo"] =
    productosConIdeal === 0 ? "PROPORCIONAL" : productosConIdeal >= productosAnalizados ? "IDEAL" : "MIXTO";

  return {
    generadoEn,
    modo,
    sucursales,
    nodos,
    filas,
    balance,
    necesidades,
    alertas: Array.from(alertas),
    resumen: {
      transferencias: filas.length,
      unidades,
      productos: productosMovidos,
      productosAnalizados,
      productosConStock,
      faltanteNoCubierto: sucursalesConFaltante.reduce((acc, s) => acc + s.falta, 0),
      sucursalesConFaltante,
      sucursalesBalance: sucursales,
      nodos,
    },
    central,
  };
}
