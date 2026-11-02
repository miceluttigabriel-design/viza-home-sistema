// Smoke test Task 113 — fórmula del PEDIDO ESPECIAL contra valores
// calculados A MANO con la lógica del Excel de la BASE (recalculate de
// la importación: margen acumulativo por tramos + redondeo a miles).
// Correr: bun scripts/smoke-pedido-especial.ts
import {
  calcularPedidoEspecial,
  margenParaCuota,
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
};

// CONTADO: 6.000.000 × 1.10 = 6.600.000
const r1 = calcularPedidoEspecial({ ...base1, plan: "contado", cuotas: 0 });
check("C1 contado precio", r1?.valorContado, 6_600_000);
check("C1 costoProd", r1?.costoProd, 6_000_000);

// CUOTAS 3: margen = 10+2+2+2 = 16 → 6.960.000 / 3 = 2.320.000 (exacto)
const r3 = calcularPedidoEspecial({ ...base1, plan: "cuotas", cuotas: 3 });
check("C1 cuota3", r3?.cuotaValor, 2_320_000);
check("C1 total3", r3?.total, 6_960_000);
check("C1 margen3", r3?.margenAplicado, 16);

// CUOTAS 10: margen = 10 + 6×2 + 4×1.5 = 28 → 7.680.000 / 10 = 768.000
const r10 = calcularPedidoEspecial({ ...base1, plan: "cuotas", cuotas: 10 });
check("C1 cuota10", r10?.cuotaValor, 768_000);
check("C1 margen10", r10?.margenAplicado, 28);

// CUOTAS 20: margen = 10+12+10.5+7 = 39.5 → 8.370.000 / 20 = 418.500
// → ROUND(418,5) = 419 → cuota 419.000 (redondeo de la CUOTA, como BASE)
const r20 = calcularPedidoEspecial({ ...base1, plan: "cuotas", cuotas: 20 });
check("C1 cuota20", r20?.cuotaValor, 419_000);
check("C1 total20", r20?.total, 419_000 * 20);

// Bordes de tramos: 6/7/13/14
check("tramo 6", margenParaCuota(10, 2, 1.5, 1, 6), 10 + 6 * 2);
check("tramo 7", margenParaCuota(10, 2, 1.5, 1, 7), 10 + 12 + 1.5);
check("tramo 13", margenParaCuota(10, 2, 1.5, 1, 13), 10 + 12 + 7 * 1.5);
check("tramo 14", margenParaCuota(10, 2, 1.5, 1, 14), 10 + 12 + 10.5 + 1);

// === CASO 2: costo GS no redondo 1.500.500 → costoProd = 1.501.000 ===
const r2 = calcularPedidoEspecial({
  costo: 1_500_500, modoCosto: "gs", cambioUS: 6000,
  pctContado: 0, pct1A6: 0, pct7A13: 0, pct14A30: 0,
  plan: "contado", cuotas: 0,
});
check("C2 costoProd redondeo a miles", r2?.costoProd, 1_501_000);
check("C2 contado 0%", r2?.valorContado, 1_501_000);

// === CASO 3: cuota fuera de rango se recorta (0 → 1, 99 → 30) ===
check("clamp 0→1", margenParaCuota(10, 2, 1.5, 1, 0), 12);
check("clamp 99→30", margenParaCuota(10, 2, 1.5, 1, 99), 10 + 12 + 10.5 + 17);

// === CASO 4: costo inválido → null (sin lanzar) ===
check("costo 0 → null", calcularPedidoEspecial({ ...base1, costo: 0, plan: "contado", cuotas: 0 }), null);
check("costo negativo → null", calcularPedidoEspecial({ ...base1, costo: -5, plan: "contado", cuotas: 0 }), null);

if (fallas > 0) {
  console.error(`\n${fallas} VERIFICACIONES FALLARON`);
  process.exit(1);
}
console.log("\nTODO OK — la fórmula replica el Excel de la BASE");
