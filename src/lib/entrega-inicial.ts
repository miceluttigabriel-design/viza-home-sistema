export interface PlanEntregaEstandar {
  cuotas: number;
  valorPorCuota: number;
  total: number;
}

export interface PlanEntregaCalculado extends PlanEntregaEstandar {
  entregaPersonalizada: number;
}

export function aplicarEntregaInicial(
  plan: PlanEntregaEstandar,
  entrega: number
): PlanEntregaCalculado {
  const estandar = { ...plan, entregaPersonalizada: 0 };
  const monto = Math.max(0, Math.round(entrega || 0));
  if (
    plan.cuotas <= 1 ||
    plan.total <= 0 ||
    monto <= plan.valorPorCuota ||
    monto >= plan.total
  ) {
    return estandar;
  }

  const cuotasRestantes = plan.cuotas - 1;
  const valorPorCuota =
    Math.ceil((plan.total - monto) / cuotasRestantes / 1000) * 1000;
  if (valorPorCuota >= plan.valorPorCuota) return estandar;

  return {
    cuotas: plan.cuotas,
    valorPorCuota,
    total: monto + valorPorCuota * cuotasRestantes,
    entregaPersonalizada: monto,
  };
}
