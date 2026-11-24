#!/usr/bin/env bun
// ============================================================================
// T189 — PLAN CUOTA: entrega inicial personalizada solo cuando supera la
// cuota estándar (así la cuota baja y el margen se mantiene)
// ----------------------------------------------------------------------------
// Caso reportado por el dueño:
//   "en PLAN CUOTA con entrega inicial, al agregar la entrega inicial apenas
//    agarra la entrega y divide las cuotas por el total del plan. Lo que
//    queremos es que al dar la entrega sus cuotas bajen el valor mensualmente,
//    siempre con redondeo de cuotas iguales. Esto no es válido para el plan
//    común que tiene la entrega inicial igual al valor de la cuota; aplica
//    apenas en valores diferentes de la cuota para arriba."
//
// Regla:
//   - Se calcula sobre el saldo restante (total - entrega) repartido entre
//     las cuotas restantes, con redondeo comercial al millar superior.
//   - Solo se aplica si la entrega supera la cuota estándar (así la cuota
//     baja). Si es igual o menor, se mantiene el plan estándar.
//   - El margen de las cuotas no cambia (se preserva proporcionalmente).
//
// Correr:  bun scripts/t189-verificar-entrega-inicial-personalizada.ts
// ============================================================================
import { readFileSync } from "fs";

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

console.log("═══ T189 · ENTREGA INICIAL PERSONALIZADA ═══");

const panel = readFileSync("src/components/viza/sales-panel.tsx", "utf8");

console.log("\n[1] Cuota estándar de referencia");
check(
  "se calcula minCuotaEstandar desde los planes",
  /const minCuotaEstandar = useMemo/.test(panel)
);
check(
  "usa getItemPriceN para la cuota estándar",
  /itemsFinanciablesBase\.reduce\(\s*\n\s*\(s, it\) => s \+ getItemPriceN\(it, p\.cuotas\) \* it\.quantity/.test(panel)
);

console.log("\n[2] La entrega solo baja las cuotas cuando supera la cuota estándar");
check(
  "existe la bandera esEntregaCustom",
  /const esEntregaCustom =/.test(panel)
);
check(
  "se compara contra minCuotaEstandar",
  /entregaExtra > minCuotaEstandar/.test(panel)
);
check(
  "el cálculo usa el saldo restante (total - entrega)",
  /const restante = Math\.max\(0, r\.total - entregaExtra\)/.test(panel)
);
check(
  "reparte entre las cuotas restantes (cuotas - 1)",
  /const cuotasRestantes = Math\.max\(1, r\.cuotas - 1\)/.test(panel)
);
check(
  "aplica redondeo comercial (millar superior)",
  /const valorPorCuotaAjust = redondeoComercial\(restante \/ cuotasRestantes\)/.test(panel)
);
check(
  "el total del plan se mantiene (entrega + cuotas redondeadas)",
  /total: entregaExtra \+ valorPorCuotaAjust \* cuotasRestantes/.test(panel)
);

console.log("\n[3] El plan estándar se mantiene si la entrega no supera la cuota");
check(
  "si no es custom, usa resultados (plan estándar)",
  /setCalculatedPlanes\(resultados\)/.test(panel)
);
check(
  "avisa al vendedor cuando la entrega no supera la cuota",
  /La entrega no supera el valor de la cuota: se usará el plan estándar\./.test(panel)
);

console.log("\n[4] El PDF solo recibe la entrega cuando es custom");
check(
  "payload entregaPersonalizada compara contra minCuotaEstandar",
  /Math\.max\(0, Math\.round\(entregaPersonalizada \|\| 0\)\) >\s*\n\s*minCuotaEstandar/.test(panel)
);

console.log("\n[5] La base de costo también respeta la regla");
check(
  "construirBasePorItem gatea con minCuotaEstandar",
  /entregaExtraBase > minCuotaEstandar && sumaTotal > 0/.test(panel)
);

console.log("\n[6] La UI solo muestra 'entrega personalizada' cuando es custom");
check(
  "aviso de entrega inicial personalizada gateado",
  /mostrarConEntrega && Math\.round\(entregaPersonalizada \|\| 0\) > minCuotaEstandar && \(/.test(panel)
);

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
