#!/usr/bin/env bun
import { readFileSync } from "fs";
import { aplicarEntregaInicial } from "../src/lib/entrega-inicial";
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

console.log("\n[1] Entrega menor o igual: plan estándar sin cambios");
for (const entrega of [900_000, 1_000_000]) {
  const r = aplicarEntregaInicial(plan6, entrega);
  check(
    `entrega ${entrega}: conserva cuota y total`,
    r.valorPorCuota === plan6.valorPorCuota &&
      r.total === plan6.total &&
      r.entregaPersonalizada === 0
  );
}

console.log("\n[2] Entrega mayor: recalcula y baja la cuota");
{
  const r = aplicarEntregaInicial(plan6, 2_000_000);
  check("cuota baja de 1.000.000 a 800.000", r.valorPorCuota === 800_000);
  check("registra la entrega personalizada", r.entregaPersonalizada === 2_000_000);
  check("total = entrega + 5 cuotas", r.total === 6_000_000);
}

console.log("\n[3] El redondeo nunca hace subir la cuota");
{
  const r = aplicarEntregaInicial(plan6, 1_000_001);
  check(
    "si el redondeo no permite bajar, conserva el plan estándar",
    r.valorPorCuota === 1_000_000 && r.entregaPersonalizada === 0
  );
}

console.log("\n[4] Con varios planes, la decisión es individual");
const estandares = [
  plan6,
  { cuotas: 12, valorPorCuota: 600_000, total: 7_200_000 },
];
const calculados = estandares.map((p) => aplicarEntregaInicial(p, 800_000));
check(
  "el plan de 6 mantiene su cuota de 1.000.000",
  calculados[0].valorPorCuota === 1_000_000 &&
    calculados[0].entregaPersonalizada === 0
);
check(
  "el plan de 12 baja su cuota a 582.000",
  calculados[1].valorPorCuota === 582_000 &&
    calculados[1].entregaPersonalizada === 800_000
);
check(
  "ninguna cuota supera su valor estándar",
  calculados.every((p, i) => p.valorPorCuota <= estandares[i].valorPorCuota)
);

console.log("\n[5] El PDF distingue los planes personalizados y estándar");
{
  const r = resolverFilasFinanciacion({
    planes: calculados.map((p, i) => ({ ...p, letra: String.fromCharCode(65 + i) })),
    mostrarConEntrega: true,
  });
  check("usa la entrega del plan personalizado", r.entregaInicial === 800_000);
  check(
    "conserva la marca individual de cada plan",
    (r.conEntrega[0].entregaPersonalizada ?? 0) === 0 &&
      r.conEntrega[1].entregaPersonalizada === 800_000
  );
}

console.log("\n[6] Integración con el PLAN CUOTA normal");
const panel = readFileSync("src/components/viza/sales-panel.tsx", "utf8");
check("aplica el cálculo a cada resultado", /aplicarEntregaInicial\(r, entregaExtra\)/.test(panel));
check("no usa una cuota mínima global", !/minCuotaEstandar/.test(panel));
check("la pantalla usa la entrega de cada plan", /p\.entregaPersonalizada \?\? 0/.test(panel));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
