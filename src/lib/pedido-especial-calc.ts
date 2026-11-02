// ============================================================
// PEDIDO ESPECIAL (Task 113, pedido del dueño) — CÁLCULO
// Fórmulas compartidas (cliente + servidor), PURAS: sin imports de
// Prisma ni de Next, así las usa igual la pantalla del vendedor,
// el modal de la Base y cualquier PDF futuro.
//
// EL DUEÑO CONFIRMÓ (Task 113): "de acuerdo al % de nuestra base
// usado para aquel tipo de producto y proveedor genera el plan" —
// la fórmula es LA MISMA de la BASE de productos:
//
//   · El costo que carga el vendedor (US$ o Gs) se convierte a Gs
//     con la tasa activa (TasaCambio.cambioUS) y se redondea a
//     miles: COSTO PROD. (col T del Excel: ROUND(base/1000)*1000).
//   · Margen del CONTADO = pctContado (col AB).
//   · Margen de la cuota N = pctContado + suma ACUMULATIVA de los
//     tramos de la BASE: pct1A6 (cols 1-6), pct7A13 (cols 7-13),
//     pct14A30 (cols 14-30) — el MISMO bucle de recalculate() que
//     usan la importación y la edición de la Base.
//   · Precio CONTADO = ROUND((costo + costo×%contado)/1000)*1000
//     (col BG).
//   · Cuota N = ROUND((costo + costo×%margenN)/1000/N)*1000 (cols
//     BH..CK) — se redondea EL VALOR DE CADA CUOTA a miles.
//   · TOTAL del plan = cuota × N (enteros, exacto).
//
// IMPORTANTE sobre unidades: en la BD de productos los márgenes se
// guardan como FRACCIÓN (0.10 = 10%) porque el Excel los trae así y
// recalculate() los multiplica directo. En la config del PEDIDO
// ESPECIAL los % se guardan como NÚMEROS LEGIBLES (10 = 10%, 2.5 =
// 2.5%) — lo que el admin escribe en el modal de la Base es lo que
// hay en la tabla. Por eso acá se divide por 100 al aplicar el %.
// ============================================================

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

// Redondeo a miles estilo Excel ROUND(x/1000)*1000 (igual que la BASE:
// Math.round hace half-up, mismo resultado que Excel para positivos).
function redondearMiles(v: number): number {
  return Math.round(v / 1000) * 1000;
}

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
  // Tipo de plan elegido: contado o cuotas (1-30).
  plan: "contado" | "cuotas";
  cuotas: number; // solo se usa si plan = "cuotas"
}

// Resultado del cálculo — con el desglose para mostrar en pantalla.
export interface ResultadoPedidoEspecial {
  // Costo convertido a Gs (tal cual, sin redondear).
  costoGs: number;
  // Costo base redondeado a miles = COSTO PROD. de la BASE (col T).
  costoProd: number;
  // % de margen aplicado según el plan elegido.
  margenAplicado: number;
  // Tasa US$→Gs usada (para mostrar "cambio aplicado" en pantalla).
  cambioUSUsado: number;
  plan: "contado" | "cuotas";
  cuotas: number;
  // plan = "contado": valorContado tiene el precio al contado.
  // plan = "cuotas": cuotaValor × cuotas = total (cuotaValor = valor
  // de CADA cuota, redondeado a miles como la BASE).
  valorContado: number; // 0 si plan = "cuotas"
  cuotaValor: number; // 0 si plan = "contado"
  total: number; // contado: valorContado · cuotas: cuotaValor × cuotas
}

// Cálculo principal — NUNCA lanza: valida acá adentro y devuelve null
// si falta algo (la pantalla ya valida antes, esto es cinturón y tirantes).
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

  if (p.plan === "contado") {
    const margenPct = Number(p.pctContado) || 0;
    const fraccion = margenPct / 100;
    const valorContado = redondearMiles(costoProd + costoProd * fraccion);
    return {
      costoGs,
      costoProd,
      margenAplicado: margenPct,
      cambioUSUsado: cambioUS,
      plan: "contado",
      cuotas: 0,
      valorContado,
      cuotaValor: 0,
      total: valorContado,
    };
  }

  // Cuotas: margen acumulativo por tramos + cuota redondeada a miles.
  const n = Math.max(1, Math.min(30, Math.floor(p.cuotas || 1)));
  const margenPct = margenParaCuota(
    Number(p.pctContado) || 0,
    Number(p.pct1A6) || 0,
    Number(p.pct7A13) || 0,
    Number(p.pct14A30) || 0,
    n
  );
  const fraccion = margenPct / 100;
  const totalBase = costoProd + costoProd * fraccion;
  const cuotaValor = redondearMiles(totalBase / n);
  return {
    costoGs,
    costoProd,
    margenAplicado: margenPct,
    cambioUSUsado: cambioUS,
    plan: "cuotas",
    cuotas: n,
    valorContado: 0,
    cuotaValor,
    total: cuotaValor * n,
  };
}
