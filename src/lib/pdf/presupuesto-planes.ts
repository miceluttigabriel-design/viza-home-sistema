// ============================================================================
// PRESUPUESTO · OPCIONES DE FINANCIACIÓN QUE SE DIBUJAN EN EL PDF
// ----------------------------------------------------------------------------
// El panel de ventas conserva los planes CON ENTREGA ya calculados aunque el
// vendedor desmarque la casilla (así no pierde el cálculo si la vuelve a
// marcar). Eso significa que "plan calculado" NO es lo mismo que "plan
// visible": el PDF debe decidir por las casillas mostrarConEntrega /
// mostrarSinEntrega.
//
// Esta función es PURA (no dibuja nada) y la usa el route del presupuesto para
// que la fila CONTADO, las filas CON ENTREGA y las SIN ENTREGA salgan una sola
// vez y solo cuando corresponden.
// ============================================================================

export interface PlanPresupuesto {
  letra: string;
  cuotas: number;
  valorPorCuota: number;
  total: number;
  entregaPersonalizada?: number;
}

export interface PlanesPresupuestoInput {
  planes?: PlanPresupuesto[] | null;
  planesSinEntrega?: PlanPresupuesto[] | null;
  mostrarConEntrega?: boolean;
  mostrarSinEntrega?: boolean;
}

export interface FilasFinanciacion {
  contado: PlanPresupuesto[];
  conEntrega: PlanPresupuesto[];
  sinEntrega: PlanPresupuesto[];
  entregaInicial: number;
  // El contado es la única opción visible: no se repite la sección de
  // financiación porque el TOTAL CONTADO ya muestra ese mismo valor.
  soloContado: boolean;
  // false = no hay ninguna fila visible (se muestra "CONSULTE OPCIONES...").
  hayOpciones: boolean;
}

export function resolverFilasFinanciacion(
  input: PlanesPresupuestoInput
): FilasFinanciacion {
  const planes = input.planes ?? [];

  const contado = planes.filter((p) => p.cuotas === 1);
  // Si la casilla CON ENTREGA está desmarcada, los planes de cuotas NO se
  // dibujan aunque vengan calculados en el payload.
  const conEntrega =
    input.mostrarConEntrega === false
      ? []
      : planes.filter((p) => p.cuotas > 1);
  const sinEntrega =
    input.mostrarSinEntrega === false
      ? []
      : input.planesSinEntrega ?? [];

  const entregaInicial = Math.max(
    0,
    Math.round(
      conEntrega.find((p) => (p.entregaPersonalizada ?? 0) > 0)
        ?.entregaPersonalizada ?? 0
    )
  );

  const soloContado =
    contado.length > 0 && conEntrega.length === 0 && sinEntrega.length === 0;
  const hayOpciones =
    contado.length > 0 || conEntrega.length > 0 || sinEntrega.length > 0;

  return {
    contado,
    conEntrega,
    sinEntrega,
    entregaInicial,
    soloContado,
    hayOpciones,
  };
}
