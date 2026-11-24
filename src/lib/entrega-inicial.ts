// ============================================================================
// PLAN CUOTA · ENTREGA INICIAL PERSONALIZADA
// ----------------------------------------------------------------------------
// La 1ª cuota del plan (la entrada) no lleva interés; las N-1 cuotas
// restantes sí llevan el margen de la planilla CRED CALCULO: 1,5% por cuota
// financiada. Por eso el valor BASE del plan (precio de lista, sin interés) es
//
//   base = entrada estándar + (total estándar − entrada estándar) / (1 + (N−1)×1,5%)
//
// Si el cliente entrega MÁS que la 1ª cuota, esa entrega se descuenta del
// valor base y el margen se aplica SOLO al saldo que queda financiado. Así la
// cuota y el TOTAL del plan BAJAN (el cliente paga menos interés) y entregar
// de más siempre le conviene.
//
// Antes la entrega se restaba del total que YA tenía el interés adentro: el
// total nunca bajaba y la entrega grande solo repartía la deuda.
//
// Reglas que se conservan:
//  · Entrega vacía / menor o igual a la 1ª cuota → plan estándar sin cambios.
//  · La cuota NUNCA sube: si el redondeo no permite bajarla, queda estándar.
//  · Si la entrega cubre todo el valor base, no hay saldo que financiar y el
//    plan queda estándar (el panel avisa antes de calcular).
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
    monto <= entradaEstandar
  ) {
    return estandar;
  }

  const base = valorBasePlanEstandar(plan);
  const saldo = base - monto;
  if (saldo <= 0) return estandar;

  // El margen se aplica al saldo, no al total con interés.
  const factor = 1 + (n - 1) * MARGEN_CUOTA_MENSUAL;
  // −1e-9 evita que el ruido de coma flotante suba un millar de más cuando el
  // resultado ya es múltiplo exacto de 1.000.
  const valorPorCuota =
    Math.ceil((saldo * factor) / (n - 1) / 1000 - 1e-9) * 1000;

  // La cuota nunca sube respecto de la estándar (regla del dueño): si el
  // redondeo no permite bajarla, se conserva el plan de siempre.
  if (valorPorCuota >= entradaEstandar) return estandar;

  return {
    cuotas: n,
    valorPorCuota,
    total: monto + valorPorCuota * (n - 1),
    entregaPersonalizada: monto,
  };
}
