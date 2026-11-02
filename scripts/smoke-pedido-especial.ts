// Smoke test Task 113 v2 — fórmulas del PEDIDO ESPECIAL contra valores
// calculados A MANO con la lógica REAL de cada plan del sistema:
//   · CONTADO / CUOTAS  → Excel de la BASE (margen acumulativo por tramos
//                          + redondeo a miles), igual que la importación.
//   · CUOTAS SIN ENTREGA → cotizador: 0-30 días igual, 31-60 días +3%
//                          (redondeo comercial al millar superior).
//   · MAYORISTA          → col CV de la BASE: Costo Gs × (1 + % técnico).
//   · SAFRA              → plan-safra.ts: interés mensual sobre el saldo,
//                          refuerzos auto en dos pasadas, PAGO FINAL =
//                          capital + intereses al millar superior.
//   · CHEQUE             → store/cheque.ts: tasa 1.5% MOTO / 3% resto,
//                          plazo promedio (días/30), cheques iguales al
//                          millar superior.
// Correr: bun scripts/smoke-pedido-especial.ts
import {
  calcularPedidoEspecial,
  margenParaCuota,
  esTipoMoto,
  generarFechasCheques,
  diasDesdeEmision,
  diasHastaFecha,
  redondeoComercial,
} from "../src/lib/pedido-especial-calc";

let fallas = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas++;
  console.log(`${ok ? "OK " : "FALLA"} ${nombre}: obtenido=${JSON.stringify(obtenido)} esperado=${JSON.stringify(esperado)}`);
}

// === CASO 1: costo US$ 1000, cambio 6000 → Gs 6.000.000 ===
// % config: contado 10, 1-6: 2, 7-13: 1.5, 14-30: 1
const base1 = {
  costo: 1000, modoCosto: "usd" as const, cambioUS: 6000,
  pctContado: 10, pct1A6: 2, pct7A13: 1.5, pct14A30: 1,
  pctTecnico: 5, pctSafra: 7,
  fechaEmision: "2026-11-03",
};

// CONTADO: 6.000.000 × 1.10 = 6.600.000
const r1 = calcularPedidoEspecial({ ...base1, plan: "contado", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("C1 contado precio", r1?.valorContado, 6_600_000);
check("C1 costoProd", r1?.costoProd, 6_000_000);

// CUOTAS CON ENTREGA 3: margen = 10+2+2+2 = 16 → 6.960.000 / 3 = 2.320.000
const r3 = calcularPedidoEspecial({ ...base1, plan: "cuotas_con_entrega", cuotas: 3, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("C1 cuota3", r3?.cuotaValor, 2_320_000);
check("C1 total3", r3?.total, 6_960_000);
check("C1 margen3", r3?.margenAplicado, 16);

// CUOTAS CON ENTREGA 10: margen = 10 + 6×2 + 4×1.5 = 28 → 7.680.000 / 10 = 768.000
const r10 = calcularPedidoEspecial({ ...base1, plan: "cuotas_con_entrega", cuotas: 10, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("C1 cuota10", r10?.cuotaValor, 768_000);
check("C1 margen10", r10?.margenAplicado, 28);

// CUOTAS CON ENTREGA 20: margen = 10+12+10.5+7 = 39.5 → 8.370.000 / 20 = 418.500
// → ROUND(418,5) = 419 → cuota 419.000 (redondeo de la CUOTA, como BASE)
const r20 = calcularPedidoEspecial({ ...base1, plan: "cuotas_con_entrega", cuotas: 20, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("C1 cuota20", r20?.cuotaValor, 419_000);
check("C1 total20", r20?.total, 419_000 * 20);

// Bordes de tramos: 6/7/13/14
check("tramo 6", margenParaCuota(10, 2, 1.5, 1, 6), 10 + 6 * 2);
check("tramo 7", margenParaCuota(10, 2, 1.5, 1, 7), 10 + 12 + 1.5);
check("tramo 13", margenParaCuota(10, 2, 1.5, 1, 13), 10 + 12 + 7 * 1.5);
check("tramo 14", margenParaCuota(10, 2, 1.5, 1, 14), 10 + 12 + 10.5 + 1);

// === CUOTAS SIN ENTREGA (cuota base 10 cuotas = 768.000) ===
// 10 días → sin recargo (0-30) → igual que CON ENTREGA
const rse10 = calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 10, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SE 10 días cuota", rse10?.cuotaValor, 768_000);
check("SE 10 días recargo", rse10?.recargoSinEntregaPct, 0);
// 45 días → recargo 3% → 768.000 × 1.03 = 791.040 → AL MILLAR SUPERIOR = 792.000
const rse45 = calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 45, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SE 45 días cuota", rse45?.cuotaValor, 792_000);
check("SE 45 días recargo", rse45?.recargoSinEntregaPct, 3);
check("SE 45 días total", rse45?.total, 792_000 * 10);
// 31 días (borde) → recarga
const rse31 = calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 31, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SE 31 días recargo", rse31?.recargoSinEntregaPct, 3);
// 30 días (borde) → no recarga
const rse30 = calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 30, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SE 30 días recargo", rse30?.recargoSinEntregaPct, 0);
// 60 días (borde) → recarga · 61/90 días → null (no permitido)
check("SE 60 días válido", calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 60, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false })?.recargoSinEntregaPct, 3);
check("SE 61 días → null", calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: 61, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false }), null);
check("SE fecha pasada → null", calcularPedidoEspecial({ ...base1, plan: "cuotas_sin_entrega", cuotas: 10, diasSinEntrega: -3, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false }), null);

// === MAYORISTA (col CV de la BASE: Costo Gs × (1 + % técnico)) ===
// 6.000.000 × 1.05 = 6.300.000
const rm = calcularPedidoEspecial({ ...base1, plan: "mayorista", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("MAYORISTA 5%", rm?.valorTecnico, 6_300_000);
check("MAYORISTA total", rm?.total, 6_300_000);
// Usa el Costo GS directo (col G), SIN redondear a miles (igual que la BASE):
// 1.500.500 × 1.05 = 1.575.525
const rm2 = calcularPedidoEspecial({
  costo: 1_500_500, modoCosto: "gs", cambioUS: 6000,
  pctContado: 10, pct1A6: 2, pct7A13: 1.5, pct14A30: 1,
  pctTecnico: 5, pctSafra: 7, plan: "mayorista", cuotas: 0,
  diasSinEntrega: null, safraEntrada: 0, safraMeses: 6,
  chequesCantidad: 0, chequesFechas: [], esMoto: false,
  fechaEmision: "2026-11-03",
});
check("MAYORISTA costo GS sin redondear", rm2?.valorTecnico, 1_575_525);

// === SAFRA sin entrada (base = valor contado 6.600.000, tasa 7% mensual,
// 3 refuerzos mensuales) — a mano con el algoritmo de plan-safra.ts: ===
// PASADA 1: interés estimado = 6.600.000×0.07×3×0.5 = 693.000
//   → totalAPagar 7.293.000 → refuerzo = 2.431.000 (cada uno)
//   m1: int 462.000 · saldo 4.169.000 | m2: int 291.830 · saldo 1.738.000
//   m3: int 121.660 · saldo −693.000 → PASADA 2: último = 1.738.000 → saldo 0
// Intereses totales = 875.490 · PAGO FINAL comercial = 1.738.000 + 875.490
// = 2.613.490 → AL MILLAR SUPERIOR = 2.614.000
// TOTAL DEL PLAN = 2.431.000 + 2.431.000 + 2.614.000 = 7.476.000
const rs = calcularPedidoEspecial({ ...base1, plan: "safra", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 3, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SAFRA filas", rs?.cronograma.length, 3);
check("SAFRA m1 pago", rs?.cronograma[0]?.pago, 2_431_000);
check("SAFRA m1 interés", rs?.cronograma[0]?.interes, 462_000);
check("SAFRA m1 saldo", rs?.cronograma[0]?.saldoFinal, 4_169_000);
check("SAFRA m2 interés", rs?.cronograma[1]?.interes, 291_830);
check("SAFRA m3 pago (capital)", rs?.cronograma[2]?.pago, 1_738_000);
check("SAFRA m3 saldo final 0", rs?.cronograma[2]?.saldoFinal, 0);
check("SAFRA m3 PAGO FINAL comercial", rs?.cronograma[2]?.pagoMostrado, 2_614_000);
check("SAFRA m3 concepto", rs?.cronograma[2]?.concepto, "PAGO FINAL");
check("SAFRA total intereses", rs?.totalIntereses, 875_490);
check("SAFRA total plan", rs?.total, 7_476_000);

// === SAFRA con entrada (base 6.600.000, tasa 7%, entrada 1.000.000,
// 2 refuerzos) — a mano: ===
// saldo tras entrada 5.600.000 · estimado 392.000 → refuerzo 2.996.000
// m1: int 392.000 · saldo 2.604.000 | m2: int 182.280 · saldo −392.000
// → PASADA 2: último 2.604.000 → saldo 0
// intereses 574.280 · PAGO FINAL comercial = 2.604.000+574.280 = 3.178.280
// → 3.179.000 · TOTAL = 1.000.000 + 2.996.000 + 3.179.000 = 7.175.000
const rs2 = calcularPedidoEspecial({ ...base1, plan: "safra", cuotas: 0, diasSinEntrega: null, safraEntrada: 1_000_000, safraMeses: 2, chequesCantidad: 0, chequesFechas: [], esMoto: false });
check("SAFRA2 entrada fila", rs2?.cronograma[0]?.concepto, "ENTRADA");
check("SAFRA2 entrada pago", rs2?.cronograma[0]?.pago, 1_000_000);
check("SAFRA2 filas", rs2?.cronograma.length, 3);
check("SAFRA2 m1 interés", rs2?.cronograma[1]?.interes, 392_000);
check("SAFRA2 m2 pago capital", rs2?.cronograma[2]?.pago, 2_604_000);
check("SAFRA2 m2 pago comercial", rs2?.cronograma[2]?.pagoMostrado, 3_179_000);
check("SAFRA2 intereses", rs2?.totalIntereses, 574_280);
check("SAFRA2 total plan", rs2?.total, 7_175_000);
// La entrada no puede pagar todo el plan:
check("SAFRA entrada >= base → null", calcularPedidoEspecial({ ...base1, plan: "safra", cuotas: 0, diasSinEntrega: null, safraEntrada: 6_600_000, safraMeses: 3, chequesCantidad: 0, chequesFechas: [], esMoto: false }), null);

// === CHEQUE (base = valor contado 6.600.000) ===
// General (3% mensual), 3 cheques a 30/60/90 días → plazo promedio 2 meses:
// interés = 6.600.000 × 0.03 × 2 = 396.000 → total 6.996.000
// valor = ceil(6.996.000/3) = 2.332.000 (exacto)
const fechas3 = generarFechasCheques(3, "2026-11-03");
check("cheques fechas generadas", fechas3, ["2026-12-03", "2027-01-02", "2027-02-01"]);
const rc = calcularPedidoEspecial({ ...base1, plan: "cheque", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 3, chequesFechas: fechas3, esMoto: false });
check("CHEQUE general valor", rc?.cheques[0]?.valor, 2_332_000);
check("CHEQUE general total", rc?.total, 6_996_000);
check("CHEQUE general tasa", rc?.tasaChequePct, 3);
check("CHEQUE plazo promedio", rc?.plazoPromedioMeses, 2);
check("CHEQUE cantidad", rc?.cheques.length, 3);
// MOTO (1.5%): interés = 6.600.000 × 0.015 × 2 = 198.000 → total 6.798.000
// valor = 2.266.000 exacto
const rcm = calcularPedidoEspecial({ ...base1, plan: "cheque", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 3, chequesFechas: fechas3, esMoto: true });
check("CHEQUE moto valor", rcm?.cheques[0]?.valor, 2_266_000);
check("CHEQUE moto tasa", rcm?.tasaChequePct, 1.5);
// Sin fechas → sin cheques (la pantalla pide generarlas)
const rc0 = calcularPedidoEspecial({ ...base1, plan: "cheque", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 3, chequesFechas: [], esMoto: false });
check("CHEQUE sin fechas → vacío", rc0?.cheques, []);

// === CASO 2: costo GS no redondo 1.500.500 → costoProd = 1.501.000 ===
const r2 = calcularPedidoEspecial({
  costo: 1_500_500, modoCosto: "gs", cambioUS: 6000,
  pctContado: 0, pct1A6: 0, pct7A13: 0, pct14A30: 0,
  pctTecnico: 0, pctSafra: 0,
  plan: "contado", cuotas: 0,
  diasSinEntrega: null, safraEntrada: 0, safraMeses: 6,
  chequesCantidad: 0, chequesFechas: [], esMoto: false,
  fechaEmision: "2026-11-03",
});
check("C2 costoProd redondeo a miles", r2?.costoProd, 1_501_000);
check("C2 contado 0%", r2?.valorContado, 1_501_000);

// === CASO 3: cuota fuera de rango se recorta (0 → 1, 99 → 30) ===
check("clamp 0→1", margenParaCuota(10, 2, 1.5, 1, 0), 12);
check("clamp 99→30", margenParaCuota(10, 2, 1.5, 1, 99), 10 + 12 + 10.5 + 17);

// === CASO 4: costo inválido → null (sin lanzar) ===
check("costo 0 → null", calcularPedidoEspecial({ ...base1, costo: 0, plan: "contado", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false }), null);
check("costo negativo → null", calcularPedidoEspecial({ ...base1, costo: -5, plan: "contado", cuotas: 0, diasSinEntrega: null, safraEntrada: 0, safraMeses: 6, chequesCantidad: 0, chequesFechas: [], esMoto: false }), null);

// === HELPERS ===
check("redondeoComercial 4.295.147", redondeoComercial(4_295_147), 4_296_000);
check("redondeoComercial exacto", redondeoComercial(1_548_000), 1_548_000);
check("esTipoMoto MOTOS", esTipoMoto("MOTOS"), true);
check("esTipoMoto MOTO", esTipoMoto("MOTO"), true);
check("esTipoMoto HELADERA", esTipoMoto("HELADERA"), false);
check("esTipoMoto vacío", esTipoMoto(""), false);
check("diasDesdeEmision 30d", diasDesdeEmision("2026-12-03", "2026-11-03"), 30);
check("diasDesdeEmision 181d", diasDesdeEmision("2027-05-03", "2026-11-03"), 181);
check("diasHastaFecha ISO mal", diasHastaFecha("03/11/2026"), null);
const hoyReal = new Date();
const manana = new Date(hoyReal.getFullYear(), hoyReal.getMonth(), hoyReal.getDate() + 1);
const mananaISO = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
check("diasHastaFecha mañana", diasHastaFecha(mananaISO), 1);

if (fallas > 0) {
  console.error(`\n${fallas} VERIFICACIONES FALLARON`);
  process.exit(1);
}
console.log("\nTODO OK — los 6 planes replican la lógica real del sistema");
