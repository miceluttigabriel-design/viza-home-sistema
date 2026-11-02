// ============================================================
// PEDIDO ESPECIAL (Task 113, pedido del dueño) — CÁLCULO
// Fórmulas compartidas (cliente + servidor), PURAS: sin imports de
// Prisma ni de Next, así las usa igual la pantalla del vendedor,
// el modal de la Base y cualquier PDF futuro.
//
// ═══ TASK 113 v2 (pedido del dueño) — TODOS LOS PLANES ═══
// El dueño pidió: "adentro del tipo de plan hay que agregar todos
// los planes que tenemos incluso si es con entrega o sin entrega…
// los cálculos siguen la lógica de cada tipo de plan". O sea: la
// pantalla del PEDIDO ESPECIAL ahora replica UNO A UNO los planes
// reales del sistema, con LA MISMA matemática que ya usan:
//
//   · CONTADO            → igual que el precio CONTADO de la BASE:
//                          costo redondeado a miles × (1 + %contado).
//   · CUOTAS CON ENTREGA → igual que el cotizador CON ENTREGA: los
//                          valores salen de los márgenes acumulativos
//                          por tramos (1-6 / 7-13 / 14-30) y la CUOTA
//                          se redondea a miles (cols BG..CK).
//   · CUOTAS SIN ENTREGA → igual que el cotizador SIN ENTREGA: la
//                          cuota es la de CON ENTREGA y recarga 3%
//                          si la 1ª cuota arranca a 31-60 días
//                          (redondeo comercial al millar superior);
//                          0-30 días = mismo valor, sin recargo.
//   · MAYORISTA          → igual que el plan MAYORISTA: valor
//                          TÉCNICO = Costo Gs × (1 + %técnico), la
//                          MISMA fórmula de la col CV de la BASE
//                          ("Margen P/Tecnico" col CW). Sin cuotas.
//   · SAFRA              → igual que el plan SAFRA: interés MENSUAL
//                          sobre el SALDO RESTANTE con la tasa % de la
//                          combinación (como la col SAFRA de la BASE),
//                          entrada opcional + refuerzos mensuales,
//                          redondeo comercial al millar superior y el
//                          último refuerzo ajusta para que CUADRE.
//                          "Menos meses = menos intereses".
//   · CHEQUE             → igual que el plan CON CHEQUE: tasa mensual
//                          1.5% si el tipo es MOTO / MOTOS y 3% para
//                          el resto (misma regla de KENTON/SUZUKI vs
//                          general), interés = base × tasa × plazo
//                          promedio en meses (días/30), todos los
//                          cheques con el MISMO valor redondeado al
//                          millar superior. Plazo máximo 180 días.
//
// BASE DE FINANCIACIÓN (SAFRA y CHEQUE): el VALOR AL CONTADO del
// pedido (costo × (1 + %contado)), exactamente como esos planes
// financian el precioContado de la BASE en el cotizador de siempre.
//
// UNIDADES: en la config del PEDIDO ESPECIAL los % se guardan como
// NÚMEROS LEGIBLES (10 = 10%, 2.5 = 2.5%) — lo que el admin escribe
// es lo que se aplica (se divide por 100 acá). Ojo: en Product los
// márgenes van como FRACCIÓN (0.10 = 10%) — unidades distintas.
// ============================================================

// Tipo de plan elegido — TODOS los planes que tiene VIZA (el dueño:
// "hay que agregar todos los planes que tenemos incluso si es con
// entrega o sin entrega").
export type PlanPedidoEspecial =
  | "contado"
  | "cuotas_con_entrega"
  | "cuotas_sin_entrega"
  | "mayorista"
  | "safra"
  | "cheque";

// Rótulos en español para la pantalla (un solo lugar, sin duplicar).
export const NOMBRE_PLAN: Record<PlanPedidoEspecial, string> = {
  contado: "CONTADO",
  cuotas_con_entrega: "CUOTAS CON ENTREGA",
  cuotas_sin_entrega: "CUOTAS SIN ENTREGA",
  mayorista: "MAYORISTA",
  safra: "SAFRA",
  cheque: "CHEQUE",
};

// ─── Helpers de redondeo (los mismos del sistema) ───

// Redondeo a miles estilo Excel ROUND(x/1000)*1000 (igual que la BASE:
// Math.round hace half-up, mismo resultado que Excel para positivos).
function redondearMiles(v: number): number {
  return Math.round(v / 1000) * 1000;
}

// REDONDEO COMERCIAL HACIA ARRIBA: siempre al millar superior (el
// cliente nunca paga de menos). Igual que redondeoComercial del plan
// SAFRA / CHEQUE / SIN ENTREGA del cotizador.
// Ej: 4.295.147 → 4.296.000 · 1.548.000 → 1.548.000 (ya exacto).
export function redondeoComercial(v: number): number {
  return Math.ceil(Math.max(0, v) / 1000) * 1000;
}

// ─── Márgenes de cuotas (misma regla de tramos de la BASE) ───

// Margen (%) de la cuota N con la misma regla de tramos de la BASE:
// cuota 1-6 suma pct1A6 por cuota, 7-13 suma pct7A13, 14-30 suma pct14A30.
// Los % van en NÚMEROS LEGIBLES (10 = 10%): lo que suma acá es lo que el
// admin ve en la Base. Ej: pctContado=10, pct1A6=2 → margen cuota 3 = 16 (%).
export function margenParaCuota(
  pctContado: number,
  pct1A6: number,
  pct7A13: number,
  pct14A30: number,
  cuotas: number
): number {
  const n = Math.max(1, Math.min(30, Math.floor(cuotas || 1)));
  let margen = pctContado;
  for (let i = 1; i <= n; i++) {
    const tramo = i <= 6 ? pct1A6 : i <= 13 ? pct7A13 : pct14A30;
    margen += tramo;
  }
  return margen;
}

// ─── SIN ENTREGA: recargo por días (misma regla del cotizador) ───
// 0-30 días → 0% (plazo de gracia) · 31-60 días → 3% · >60 → no permitido.
// Devuelve null si la fecha no sirve (igual que calcularMargenPorcentaje
// del sales-panel, pero con la fecha YA convertida a días).
export function recargoSinEntrega(dias: number | null): number | null {
  if (dias === null || dias < 0) return null;
  if (dias <= 30) return 0;
  if (dias <= 60) return 3;
  return null;
}

// ─── Interfaces de entrada / salida ───

// Parámetros del cálculo — todo lo que la pantalla ya tiene en mano.
export interface ParamsPedidoEspecial {
  // Costo ingresado por el vendedor, SIEMPRE en la moneda indicada.
  costo: number;
  modoCosto: "usd" | "gs";
  // Tasa activa US$→Gs de la Base (solo se usa si modoCosto = "usd").
  cambioUS: number;
  // % de la combinación proveedor + tipo de producto (Base del admin).
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number; // MAYORISTA (% técnico sobre el costo)
  pctSafra: number; // SAFRA (tasa de interés MENSUAL, 7 = 7%)
  // Plan elegido + parámetros por plan.
  plan: PlanPedidoEspecial;
  cuotas: number; // cuotas_*: 1-30 (se recorta a rango)
  // cuotas_sin_entrega: días entre HOY y la 1ª cuota (0-60). La pantalla
  // lo calcula con la fecha elegida; null = fecha inválida/ausente.
  diasSinEntrega: number | null;
  // SAFRA: entrada inicial en Gs (0 = sin entrada) y cantidad de
  // refuerzos mensuales (1-18, uno por mes).
  safraEntrada: number;
  safraMeses: number;
  // CHEQUE: cantidad (1-20) y fechas de vencimiento ISO "YYYY-MM-DD"
  // (la pantalla las genera a 30 días y deja editarlas).
  chequesCantidad: number;
  chequesFechas: string[];
  // CHEQUE: ¿el tipo de producto es MOTO/MOTOS? (tasa 1.5% vs 3%)
  esMoto: boolean;
  // CHEQUE: fecha de emisión ISO (hoy en el dispositivo del vendedor).
  fechaEmision: string;
}

// Fila del cronograma SAFRA (misma estructura que el plan SAFRA real).
export interface FilaCronogramaEspecial {
  mes: number;
  concepto: string; // "ENTRADA" · "Refuerzo" · "PAGO FINAL"
  saldoInicial: number;
  pago: number;
  interes: number;
  saldoFinal: number;
  // Pago COMERCIAL que se muestra en pantalla: igual que `pago` en todas
  // las filas MENOS en la última con pago, donde se cobra el interés
  // acumulado del plan (capital + intereses, al millar superior) — igual
  // que el PAGO FINAL del plan SAFRA del sistema. Así la suma de las
  // filas = TOTAL DEL PLAN (pagos + intereses).
  pagoMostrado: number;
}

// Fila de resultado del plan CHEQUE.
export interface ChequeEspecial {
  numero: number;
  fecha: string; // ISO "YYYY-MM-DD"
  valor: number;
}

// Resultado del cálculo — con el desglose para mostrar en pantalla.
export interface ResultadoPedidoEspecial {
  // Costo convertido a Gs (tal cual, sin redondear).
  costoGs: number;
  // Costo base redondeado a miles = COSTO PROD. de la BASE (col T).
  // (contado / cuotas; mayorista usa el costo GS directo como la col CV).
  costoProd: number;
  // Tasa US$→Gs usada (para mostrar "cambio aplicado" en pantalla).
  cambioUSUsado: number;
  plan: PlanPedidoEspecial;
  cuotas: number;
  // % de margen aplicado sobre el costo (contado / cuotas / base safra-cheque).
  margenAplicado: number;
  // VALOR AL CONTADO del pedido (costo × (1+%contado), a miles).
  // En SAFRA y CHEQUE es la BASE que se financia (como priceContado).
  valorContado: number;
  // Valor de CADA cuota (cuotas_con_entrega / cuotas_sin_entrega; 0 otros).
  cuotaValor: number;
  // MONTO PRINCIPAL del plan elegido:
  //   contado → valorContado · cuotas → cuota × N · mayorista → valorTecnico
  //   safra → total pagado (entrada + refuerzos) · cheque → cheques × N
  total: number;
  // ── CUOTAS SIN ENTREGA ──
  recargoSinEntregaPct: number; // 0 (0-30 días) o 3 (31-60 días)
  // ── MAYORISTA ──
  valorTecnico: number; // Costo Gs × (1 + %técnico) — col CV de la BASE
  // ── SAFRA ──
  cronograma: FilaCronogramaEspecial[];
  totalIntereses: number;
  // ── CHEQUE ──
  cheques: ChequeEspecial[];
  tasaChequePct: number; // 1.5 (MOTO) o 3 (resto)
  plazoPromedioMeses: number;
}

// ─── SAFRA: cronograma mes a mes (puerto de plan-safra.ts) ───
// La MISMA lógica del plan SAFRA del sistema, reducida a UN producto:
//   · interés mensual = saldo al inicio del mes × (tasa %/100) — se muestra
//     por mes y se cobra ENTERO con el PAGO FINAL (igual que el plan real:
//     el saldo/cuadre interno es de CAPITAL, el interés se suma al final).
//   · refuerzos mensuales AUTO-CALCULADOS con dos pasadas para que el plan
//     SIEMPRE cuadre (saldo final = 0): pasada 1 estima con la mitad del
//     peor caso, pasada 2 ajusta el último refuerzo.
//   · refuerzos con redondeo comercial al millar superior y el PAGO FINAL
//     comercial (capital + intereses) también al millar superior.
function calcularSafraInterna(
  baseContado: number,
  pctSafraMensual: number,
  entrada: number,
  meses: number
): {
  cronograma: FilaCronogramaEspecial[];
  totalIntereses: number;
  totalPagado: number;
  totalPlan: number;
} {
  const tasa = Math.max(0, pctSafraMensual) / 100;
  const nRefuerzos = Math.max(1, Math.min(18, Math.floor(meses || 1)));
  const entradaValor = Math.max(0, Math.round(entrada || 0));

  // Una pasada completa del cronograma con unos valores de refuerzo dados
  // (o auto-estimados si refuerzosPrevia es null).
  const ejecutar = (
    refuerzosPrevia: number[] | null
  ): { filas: FilaCronogramaEspecial[]; intereses: number; pagado: number; saldoFinal: number; refuerzos: number[] } => {
    let saldo = baseContado;
    let intereses = 0;
    let pagado = 0;
    const filas: FilaCronogramaEspecial[] = [];
    const refuerzos: number[] = new Array(nRefuerzos).fill(0);

    // ENTRADA (mes 0): se descuenta del saldo ANTES de calcular intereses.
    if (entradaValor > 0 && entradaValor < baseContado) {
      const saldoInicialMes0 = saldo;
      saldo -= entradaValor;
      pagado += entradaValor;
      filas.push({
        mes: 0,
        concepto: "ENTRADA",
        saldoInicial: Math.round(saldoInicialMes0),
        pago: entradaValor,
        interes: 0,
        saldoFinal: Math.round(saldo),
        pagoMostrado: entradaValor,
      });
    }

    // Valores de los refuerzos: pasada 1 AUTO-ESTIMA con la mitad del peor
    // caso (interés estimado = saldo × tasa × meses × 0.5), mismo criterio
    // del plan SAFRA; el ÚLTIMO refuerzo absorbe el resto.
    if (saldo > 0) {
      if (refuerzosPrevia) {
        for (let i = 0; i < nRefuerzos; i++) refuerzos[i] = refuerzosPrevia[i] || 0;
      } else {
        const interesEstimado = saldo * tasa * nRefuerzos * 0.5;
        const totalAPagar = saldo + interesEstimado;
        const valorPorRefuerzo = redondeoComercial(totalAPagar / nRefuerzos);
        for (let i = 0; i < nRefuerzos; i++) {
          if (i === nRefuerzos - 1) {
            const sumaOtros = valorPorRefuerzo * (nRefuerzos - 1);
            refuerzos[i] = redondeoComercial(totalAPagar - sumaOtros);
          } else {
            refuerzos[i] = valorPorRefuerzo;
          }
        }
      }
    }

    // Iteración mes a mes (1..N): interés mensual sobre el saldo RESTANTE.
    for (let mes = 1; mes <= nRefuerzos; mes++) {
      if (saldo <= 0) break;
      const saldoInicialMes = saldo;
      const interesMes = saldo * tasa;
      intereses += interesMes;
      const pago = refuerzos[mes - 1] || 0;
      saldo -= pago;
      pagado += pago;
      filas.push({
        mes,
        concepto: mes === nRefuerzos ? "PAGO FINAL" : "Refuerzo",
        saldoInicial: Math.round(saldoInicialMes),
        pago,
        interes: Math.round(interesMes),
        saldoFinal: Math.round(saldo),
        pagoMostrado: pago,
      });
    }
    return { filas, intereses, pagado, saldoFinal: saldo, refuerzos };
  };

  // PASADA 1 y (si hace falta) PASADA 2 para cuadrar el plan a saldo 0.
  let r = ejecutar(null);
  if (Math.abs(r.saldoFinal) > 1) {
    const ajuste = Math.round(r.saldoFinal);
    const corregidos = [...r.refuerzos];
    corregidos[nRefuerzos - 1] = redondeoComercial(corregidos[nRefuerzos - 1] + ajuste);
    r = ejecutar(corregidos);
  }

  // ── PAGO FINAL COMERCIAL (igual que el plan SAFRA del sistema) ──
  // El interés acumulado del plan se cobra con el ÚLTIMO pago: PAGO FINAL
  // = capital + intereses, redondeado al millar superior. La ENTRADA no se
  // toca (valor cargado por el vendedor, exacto). Si la única fila con
  // pago es la ENTRADA (sin refuerzos pagados), se muestra sin tocar.
  const filas = r.filas;
  const interesesRedondeados = Math.round(r.intereses);
  const filasConPago = filas.filter((f) => f.pago > 0);
  const ultimaFilaPago = filasConPago.length > 0 ? filasConPago[filasConPago.length - 1] : null;
  const esEntradaUnica =
    filasConPago.length === 1 && ultimaFilaPago?.mes === 0;
  const aplicaRedondeoFinal = !!ultimaFilaPago && !esEntradaUnica;
  const pagoFinalCapital = aplicaRedondeoFinal ? ultimaFilaPago.pago : 0;
  const pagoFinalComercial = aplicaRedondeoFinal
    ? redondeoComercial(pagoFinalCapital + interesesRedondeados)
    : 0;
  for (const f of filas) {
    if (aplicaRedondeoFinal && f === ultimaFilaPago) f.pagoMostrado = pagoFinalComercial;
    else f.pagoMostrado = f.pago;
  }

  return {
    cronograma: filas,
    totalIntereses: interesesRedondeados,
    totalPagado: r.pagado,
    // Total del Plan = suma de las filas COMERCIALES mostradas (igual que
    // el plan real: totalPagos − capital del último + PAGO FINAL comercial;
    // sin última fila comercial: al menos base + intereses).
    totalPlan: Math.round(
      aplicaRedondeoFinal
        ? r.pagado - pagoFinalCapital + pagoFinalComercial
        : Math.max(baseContado + interesesRedondeados, r.pagado)
    ),
  };
}

// ─── CHEQUE: valor de cada cheque (puerto de store/cheque.ts) ───
// La MISMA lógica del plan CON CHEQUE del sistema:
//   1. Tasa mensual: 1.5% si es MOTO (acá por el TIPO: "MOTO"/"MOTOS"),
//      3% para el resto (en el plan real: marcas KENTON/SUZUKI vs general).
//   2. Plazo promedio en meses = promedio de (días hasta cada cheque / 30).
//   3. Interés total = base × tasa × plazo promedio.
//   4. Valor de cada cheque = (base + interés) / cantidad, redondeado AL
//      MILLAR SUPERIOR; todos los cheques con el MISMO valor.
function calcularChequeInterna(
  baseContado: number,
  esMoto: boolean,
  fechas: string[],
  fechaEmisionISO: string
): { cheques: ChequeEspecial[]; total: number; tasaPct: number; plazoPromedioMeses: number } {
  const tasa = esMoto ? 0.015 : 0.03;
  const fechasValidas = fechas
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")))
    .sort((a, b) => a.localeCompare(b));
  const cantidad = fechasValidas.length;
  if (baseContado <= 0 || cantidad === 0) {
    return { cheques: [], total: 0, tasaPct: tasa * 100, plazoPromedioMeses: 0 };
  }

  // Fecha de emisión parseada LOCAL (sin UTC, igual que el plan CHEQUE).
  const [ey, em, ed] = fechaEmisionISO.split("-").map(Number);
  const emision = new Date(ey || 2026, (em || 1) - 1, ed || 1);

  let totalMeses = 0;
  for (const f of fechasValidas) {
    const [cy, cm, cd] = f.split("-").map(Number);
    const fc = new Date(cy, cm - 1, cd);
    const dias = Math.ceil((fc.getTime() - emision.getTime()) / (1000 * 60 * 60 * 24));
    totalMeses += dias / 30;
  }
  const plazoPromedio = totalMeses / cantidad;

  const interesTotal = baseContado * tasa * plazoPromedio;
  const totalBruto = baseContado + interesTotal;
  const valorPorCheque = redondeoComercial(totalBruto / cantidad);
  const cheques = fechasValidas.map((f, i) => ({ numero: i + 1, fecha: f, valor: valorPorCheque }));
  return {
    cheques,
    total: valorPorCheque * cantidad,
    tasaPct: tasa * 100,
    plazoPromedioMeses: plazoPromedio,
  };
}

// ─── Cálculo principal — NUNCA lanza: valida acá adentro y devuelve
// null si falta algo (la pantalla ya valida antes, esto es cinturón y
// tirantes). ───
export function calcularPedidoEspecial(
  p: ParamsPedidoEspecial
): ResultadoPedidoEspecial | null {
  const costo = Number(p.costo);
  if (!Number.isFinite(costo) || costo <= 0) return null;

  const cambioUS = Number(p.cambioUS);
  if (!Number.isFinite(cambioUS) || cambioUS <= 0) return null;

  // 1) Costo a Gs (US$ × tasa activa, o directo en Gs).
  const costoGs = p.modoCosto === "usd" ? costo * cambioUS : costo;

  // 2) COSTO PROD. de la BASE: redondeo a miles (col T).
  const costoProd = redondearMiles(costoGs);

  // 3) VALOR AL CONTADO del pedido (col BG): costoProd × (1 + %contado).
  //    Es la base de financiamiento de SAFRA y CHEQUE (como priceContado).
  const pctContado = Number(p.pctContado) || 0;
  const valorContado = redondearMiles(costoProd + costoProd * (pctContado / 100));

  const base = {
    costoGs,
    costoProd,
    cambioUSUsado: cambioUS,
    plan: p.plan,
    cuotas: 0,
    margenAplicado: 0,
    valorContado,
    cuotaValor: 0,
    total: 0,
    recargoSinEntregaPct: 0,
    valorTecnico: 0,
    cronograma: [] as FilaCronogramaEspecial[],
    totalIntereses: 0,
    cheques: [] as ChequeEspecial[],
    tasaChequePct: 0,
    plazoPromedioMeses: 0,
  };

  // ═══ CONTADO ═══
  if (p.plan === "contado") {
    return { ...base, margenAplicado: pctContado, total: valorContado };
  }

  // ═══ CUOTAS (CON o SIN ENTREGA) ═══
  if (p.plan === "cuotas_con_entrega" || p.plan === "cuotas_sin_entrega") {
    const n = Math.max(1, Math.min(30, Math.floor(p.cuotas || 1)));
    const margenBase = margenParaCuota(
      pctContado,
      Number(p.pct1A6) || 0,
      Number(p.pct7A13) || 0,
      Number(p.pct14A30) || 0,
      n
    );
    const totalBase = costoProd + costoProd * (margenBase / 100);
    const cuotaBase = redondearMiles(totalBase / n);

    // SIN ENTREGA: recargo del 3% solo si la 1ª cuota arranca a 31-60
    // días (misma regla del cotizador). 0-30 días = valor exacto igual
    // a CON ENTREGA; más de 60 días = plan inválido (null).
    if (p.plan === "cuotas_sin_entrega") {
      const recargo = recargoSinEntrega(p.diasSinEntrega);
      if (recargo === null) return null;
      const cuota =
        recargo > 0 ? redondeoComercial(cuotaBase * (1 + recargo / 100)) : cuotaBase;
      return {
        ...base,
        cuotas: n,
        margenAplicado: margenBase,
        cuotaValor: cuota,
        total: cuota * n,
        recargoSinEntregaPct: recargo,
      };
    }

    return {
      ...base,
      cuotas: n,
      margenAplicado: margenBase,
      cuotaValor: cuotaBase,
      total: cuotaBase * n,
    };
  }

  // ═══ MAYORISTA ═══
  // MISMA fórmula de la col CV de la BASE: Valor Técnico =
  // Costo Gs × (1 + Margen P/Técnico). Sin cuotas, sin redondeo a miles
  // (la BASE tampoco lo redondea; el plan MAYORISTA suma tal cual).
  if (p.plan === "mayorista") {
    const pctTecnico = Number(p.pctTecnico) || 0;
    const valorTecnico = Math.round(costoGs * (1 + pctTecnico / 100));
    return { ...base, margenAplicado: pctTecnico, valorTecnico, total: valorTecnico };
  }

  // ═══ SAFRA ═══
  // Base financiable = VALOR AL CONTADO (como el plan SAFRA real financia
  // el priceContado). Entrada opcional + refuerzos mensuales; interés
  // MENSUAL sobre el saldo restante con la tasa de la combinación.
  if (p.plan === "safra") {
    if (valorContado <= 0) return null;
    const entrada = Math.max(0, Number(p.safraEntrada) || 0);
    if (entrada >= valorContado) return null; // la entrada no puede pagar todo
    const meses = Number(p.safraMeses) || 1;
    const safra = calcularSafraInterna(valorContado, Number(p.pctSafra) || 0, entrada, meses);
    return {
      ...base,
      margenAplicado: pctContado,
      cronograma: safra.cronograma,
      totalIntereses: safra.totalIntereses,
      total: safra.totalPlan,
    };
  }

  // ═══ CHEQUE ═══
  // Base financiable = VALOR AL CONTADO; tasa 1.5% mensual si el TIPO es
  // MOTO/MOTOS, 3% resto; plazo promedio = promedio de días/30 de cada
  // cheque; todos los cheques con el MISMO valor (al millar superior).
  if (p.plan === "cheque") {
    if (valorContado <= 0) return null;
    const cheque = calcularChequeInterna(
      valorContado,
      !!p.esMoto,
      Array.isArray(p.chequesFechas) ? p.chequesFechas : [],
      p.fechaEmision || new Date().toISOString().slice(0, 10)
    );
    return {
      ...base,
      margenAplicado: pctContado,
      cheques: cheque.cheques,
      tasaChequePct: cheque.tasaPct,
      plazoPromedioMeses: cheque.plazoPromedioMeses,
      total: cheque.total,
      cuotas: cheque.cheques.length,
    };
  }

  return null;
}

// ─── Detección de MOTO por el TIPO DE PRODUCTO (plan CHEQUE) ───
// El plan CON CHEQUE real detecta motos por marca (KENTON / SUZUKI en el
// nombre). En el pedido especial no hay producto de la BASE: se usa el
// TIPO DE PRODUCTO elegido ("MOTO", "MOTOS") — misma intención de negocio.
export function esTipoMoto(tipoProducto: string): boolean {
  return String(tipoProducto || "").toUpperCase().includes("MOTO");
}

// ─── Fechas por defecto del plan CHEQUE ───
// Igual que generarCampos del plan CHEQUE: cheques a 30 días entre sí,
// empezando por emisión + 30. Helper PURO (sin estado) para la pantalla.
export function generarFechasCheques(cantidad: number, fechaEmisionISO: string): string[] {
  const n = Math.max(1, Math.min(20, Math.floor(cantidad || 1)));
  const [ey, em, ed] = (fechaEmisionISO || "").split("-").map(Number);
  const base = new Date(ey || 2026, (em || 1) - 1, ed || 1);
  const salida: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + 30 * i);
    salida.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return salida;
}

// Límite del plan CHEQUE: plazo máximo de 180 días desde la emisión
// (la misma regla que valida plan-cheque.tsx).
export function diasDesdeEmision(fechaISO: string, fechaEmisionISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || ""))) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  const [ey, em, ed] = fechaEmisionISO.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  const e = new Date(ey || 2026, (em || 1) - 1, ed || 1);
  return Math.ceil((f.getTime() - e.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Días entre HOY y una fecha ISO "YYYY-MM-DD" (para SIN ENTREGA) ───
// Misma mecánica de calcularDiasDiferidos del sales-panel: parseo manual
// LOCAL (nunca new Date(string), que interpreta UTC y mueve el día).
export function diasHastaFecha(fechaISO: string, hoy = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || ""))) return null;
  const [a, m, d] = fechaISO.split("-").map(Number);
  const inicio = new Date(a, m - 1, d);
  if (isNaN(inicio.getTime())) return null;
  inicio.setHours(0, 0, 0, 0);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  h.setHours(0, 0, 0, 0);
  return Math.ceil((inicio.getTime() - h.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── FORMATEO AUTOMÁTICO del monto mientras se escribe (Task 113 v3,
// pedido del dueño: "en la barra de poner costo quiero que aplique el
// puntito automático para separar decimales y etc"). ───
// Mientras el vendedor escribe, la pantalla separa SOLA los miles con
// PUNTO (estilo Paraguay / la BASE: 15000000 → "15.000.000") y acepta
// la COMA como separador decimal (2.500,50). El resultado siempre lo
// parsea igual parseCosto de la pantalla — mismo convenio de siempre.
//   "15000000"   → "15.000.000"
//   "2500,5"     → "2.500,5"
//   "2500,505"   → "2.500,50"   (recorta a 2 decimales)
//   "1.500.000"  → "1.500.000"  (pegado con puntos: mismo valor)
//   "abc"        → ""           (solo dígitos y coma)
// Es IDEMPOTENTE: formatear algo ya formateado devuelve lo mismo, así
// el input controlado no pelea con el store.
export function formatearMontoInput(raw: string, maxDecimales = 2): string {
  // Solo dígitos y coma (fuera espacios, letras, guiones…).
  let s = String(raw ?? "").replace(/[^\d,]/g, "");
  if (!s) return "";
  // Máximo UNA coma: lo que va después es la parte decimal.
  const iComa = s.indexOf(",");
  if (iComa !== -1) {
    const entero = s.slice(0, iComa);
    const decimales = s
      .slice(iComa + 1)
      .replace(/,/g, "")
      .slice(0, Math.max(0, maxDecimales));
    s = `${entero || "0"},${decimales}`;
  }
  const [entero, decimales] = s.split(",");
  // Sin ceros a la izquierda ("007" → "7") y cota sanitaria de 15 dígitos.
  const digitos = (entero || "").replace(/^0+(?=\d)/, "").slice(0, 15);
  // Puntito de miles cada 3 dígitos (solo en la parte entera).
  const conPuntos = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimales !== undefined ? `${conPuntos},${decimales}` : conPuntos;
}
