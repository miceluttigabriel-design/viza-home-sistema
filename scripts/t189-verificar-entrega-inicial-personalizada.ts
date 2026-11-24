#!/usr/bin/env bun
import { readFileSync } from "fs";
import {
  aplicarEntregaInicial,
  valorBasePlanEstandar,
} from "../src/lib/entrega-inicial";
import { resolverFilasFinanciacion } from "../src/lib/pdf/presupuesto-planes";

let ok = 0;
let fallo = 0;
const check = (nombre: string, cond: boolean, detalle = "") => {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  } else {
    fallo++;
    console.error(`  ✗ FALLO: ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const plan6 = { cuotas: 6, valorPorCuota: 1_000_000, total: 6_000_000 };

console.log("═══ T189 · PLAN CUOTA NORMAL · ENTREGA INICIAL ═══");

console.log("\n[1] Entrega vacía o igual a la 1ª cuota: plan estándar");
for (const entrega of [0, 1_000_000]) {
  const r = aplicarEntregaInicial(plan6, entrega);
  check(
    `entrega ${entrega}: conserva cuota y total`,
    r.valorPorCuota === plan6.valorPorCuota &&
      r.total === plan6.total &&
      r.entregaPersonalizada === 0
  );
}

console.log("\n[2] Entrega mayor: baja la cuota Y el total del plan");
{
  const r = aplicarEntregaInicial(plan6, 2_000_000);
  check("cuota baja de 1.000.000 a 785.000", r.valorPorCuota === 785_000);
  check("registra la entrega personalizada", r.entregaPersonalizada === 2_000_000);
  check(
    "total = entrega + 5 cuotas y es MENOR al estándar",
    r.total === 5_925_000 && r.total < plan6.total
  );
}

console.log("\n[3] Entrega MENOR: la cuota y el total suben (financia más)");
{
  // Caso del dueño: la cuota es 300.000 y el cliente tiene 250.000.
  const plan = { cuotas: 6, valorPorCuota: 300_000, total: 1_800_000 };
  const r = aplicarEntregaInicial(plan, 250_000);
  check("cuota sube de 300.000 a 311.000", r.valorPorCuota === 311_000);
  check("total sube a 1.805.000", r.total === 1_805_000);
  check("registra la entrega personalizada", r.entregaPersonalizada === 250_000);
  check(
    "la cuota resultante es mayor a la estándar",
    r.valorPorCuota > plan.valorPorCuota && r.total > plan.total
  );
}

console.log("\n[4] El redondeo nunca hace pagar de más por entregar de más");
{
  const r = aplicarEntregaInicial(plan6, 1_000_001);
  check(
    "si el redondeo no permite bajar, conserva el plan estándar",
    r.valorPorCuota === 1_000_000 &&
      r.total === plan6.total &&
      r.entregaPersonalizada === 0
  );
}

console.log("\n[5] El margen se calcula sobre el saldo (no sobre el total)");
{
  const base = valorBasePlanEstandar(plan6);
  check(
    "el valor base del plan no lleva el interés de las cuotas financiadas",
    Math.abs(base - 5_651_162.790697674) < 0.01,
    `base ${base.toFixed(2)}`
  );
  const r = aplicarEntregaInicial(plan6, 2_000_000);
  const esperado = Math.ceil(
    ((base - 2_000_000) * (1 + 5 * 0.015)) / 5 / 1000
  ) * 1000;
  check(
    "la cuota sale del saldo financiado",
    r.valorPorCuota === esperado,
    `cuota ${r.valorPorCuota}`
  );
}

console.log("\n[6] Con varios planes, cada uno se mueve según su 1ª cuota");
const estandares = [
  plan6,
  { cuotas: 12, valorPorCuota: 600_000, total: 7_200_000 },
];
const calculados = estandares.map((p) => aplicarEntregaInicial(p, 800_000));
check(
  "el plan de 6 (cuota 1.000.000) SUBE a 1.043.000",
  calculados[0].valorPorCuota === 1_043_000 &&
    calculados[0].entregaPersonalizada === 800_000
);
check(
  "el plan de 12 (cuota 600.000) BAJA a 579.000",
  calculados[1].valorPorCuota === 579_000 &&
    calculados[1].entregaPersonalizada === 800_000
);
check(
  "el plan de 6 sube su total y el de 12 lo baja",
  calculados[0].total === 6_015_000 &&
    calculados[0].total > estandares[0].total &&
    calculados[1].total === 7_169_000 &&
    calculados[1].total < estandares[1].total
);

console.log("\n[7] Caso del dueño: 6 cuotas, entrega 2.300.000");
{
  const plan = { cuotas: 6, valorPorCuota: 1_018_000, total: 6_108_000 };
  const r = aplicarEntregaInicial(plan, 2_300_000);
  check("cuota 743.000 (antes 762.000)", r.valorPorCuota === 743_000);
  check("total 6.015.000 (antes 6.110.000)", r.total === 6_015_000);
  check("el cliente ahorra 95.000", 6_110_000 - r.total === 95_000);
  const r3 = aplicarEntregaInicial(plan, 3_000_000);
  check("con 3.000.000: cuota 592.000", r3.valorPorCuota === 592_000);
  check("con 3.000.000: total 5.960.000", r3.total === 5_960_000);
}

console.log("\n[8] El PDF distingue los planes personalizados y estándar");
{
  const r = resolverFilasFinanciacion({
    planes: calculados.map((p, i) => ({ ...p, letra: String.fromCharCode(65 + i) })),
    mostrarConEntrega: true,
  });
  check("usa la entrega del plan personalizado", r.entregaInicial === 800_000);
  check(
    "conserva la marca individual de cada plan",
    r.conEntrega[0].entregaPersonalizada === 800_000 &&
      r.conEntrega[1].entregaPersonalizada === 800_000
  );
}

console.log("\n[9] Integración con el PLAN CUOTA normal");
const panel = readFileSync("src/components/viza/sales-panel.tsx", "utf8");
check("aplica el cálculo a cada resultado", /aplicarEntregaInicial\(r, entregaExtra\)/.test(panel));
check("no usa una cuota mínima global", !/minCuotaEstandar/.test(panel));
check("la pantalla usa la entrega de cada plan", /p\.entregaPersonalizada \?\? 0/.test(panel));
check(
  "valida contra el valor base (no contra el total con interés)",
  /valorBasePlanEstandar\(r\)/.test(panel)
);

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
