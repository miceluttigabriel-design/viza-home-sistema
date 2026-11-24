// ============================================================================
// PLAN CUOTA · ENTREGA INICIAL PERSONALIZADA
// ----------------------------------------------------------------------------
// La 1ª cuota del plan (la entrada) no lleva interés; las N-1 cuotas
// restantes sí llevan el margen de la planilla CRED CALCULO: 1,5% por cuota
// financiada. Por eso el valor BASE del plan (precio de lista, sin interés) es
//
//   base = entrada estándar + (total estándar − entrada estándar) / (1 + (N−1)×1,5%)
//
// La entrega del cliente se descuenta de ese valor base y el margen se aplica
// SOLO al saldo que queda financiado:
//
//   · Entrega MAYOR que la 1ª cuota → se financia menos: la cuota y el TOTAL
//     del plan BAJAN (el cliente paga menos interés).
//   · Entrega MENOR que la 1ª cuota (ej.: la cuota es 300.000 y el cliente
//     tiene 250.000) → se financia más: la cuota y el TOTAL SUBEN, siempre con
//     la misma tasa de 1,5% por cuota financiada.
//   · Entrega vacía o exactamente igual a la 1ª cuota → plan de siempre.
//
// Antes la entrega se restaba del total que YA tenía el interés adentro: el
// total nunca bajaba y entregar de más no le convenía al cliente.
//
// Reglas:
//  · Si la entrega cubre todo el valor base, no hay saldo que financiar y el
//    plan queda estándar (el panel avisa antes de calcular).
//  · Si la entrega es mayor a la 1ª cuota, el redondeo al millar nunca puede
//    dejar el total por encima del estándar: en ese caso se conserva el plan.
// ============================================================================

// Misma tasa de la planilla: P26 = CUOTAS × 1,5%.
export const MARGEN_CUOTA_MENSUAL = 0.015;

export interface PlanEntregaEstandar {
  cuotas: number;
  valorPorCuota: number;
  total: number;
}

export interface PlanEntregaCalculado extends PlanEntregaEstandar {
  entregaPersonalizada: number;
}

// Valor base (precio de lista, sin el interés de las cuotas financiadas) que
// implica un plan estándar. La entrada no lleva margen.
export function valorBasePlanEstandar(plan: PlanEntregaEstandar): number {
  const n = Math.max(1, Math.floor(Number(plan.cuotas) || 1));
  const total = Math.max(0, Number(plan.total) || 0);
  const entrada = Math.max(0, Number(plan.valorPorCuota) || 0);
  if (n <= 1 || total <= 0) return total;
  const financiado = Math.max(0, total - entrada);
  return entrada + financiado / (1 + (n - 1) * MARGEN_CUOTA_MENSUAL);
}

export function aplicarEntregaInicial(
  plan: PlanEntregaEstandar,
  entrega: number
): PlanEntregaCalculado {
  const estandar = { ...plan, entregaPersonalizada: 0 };
  const monto = Math.max(0, Math.round(entrega || 0));
  const n = Math.floor(Number(plan.cuotas) || 0);
  const entradaEstandar = Number(plan.valorPorCuota) || 0;
  if (
    n <= 1 ||
    plan.total <= 0 ||
    entradaEstandar <= 0 ||
    monto <= 0
  ) {
    return estandar;
  }

  // Entrega exactamente igual a la 1ª cuota: plan de siempre, sin cambios.
  if (monto === entradaEstandar) return estandar;

  const base = valorBasePlanEstandar(plan);
  const saldo = base - monto;
  if (saldo <= 0) return estandar;

  // El margen se aplica al saldo, no al total con interés. Si la entrega es
  // menor a la 1ª cuota, el saldo (y la cuota) sube; si es mayor, baja.
  const factor = 1 + (n - 1) * MARGEN_CUOTA_MENSUAL;
  // −1e-9 evita que el ruido de coma flotante suba un millar de más cuando el
  // resultado ya es múltiplo exacto de 1.000.
  const valorPorCuota =
    Math.ceil((saldo * factor) / (n - 1) / 1000 - 1e-9) * 1000;
  const total = monto + valorPorCuota * (n - 1);

  // Con entrega MAYOR, el redondeo al millar no puede dejar el total por
  // encima del estándar (sería pagar más por entregar más): se conserva el
  // plan de siempre. Con entrega MENOR el total sube a propósito.
  if (monto > entradaEstandar && total >= plan.total) return estandar;

  return {
    cuotas: n,
    valorPorCuota,
    total,
    entregaPersonalizada: monto,
  };
}
