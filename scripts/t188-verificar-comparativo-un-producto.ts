#!/usr/bin/env bun
// ============================================================================
// T188 — PRESUPUESTO: sin comparativo por producto cuando hay UN SOLO producto
// ----------------------------------------------------------------------------
// Caso reportado por el dueño:
//   "apenas contado y sin entrega inicial está marcado y tiene apenas un
//    producto, pero sale el comparativo de cuotas; esa información queda
//    medio vidriosa en el presupuesto".
//
// Con un solo producto financiable el comparativo repite exactamente los
// mismos valores de la tabla OPCIONES DE FINANCIACIÓN. Ahora se dibuja recién
// desde 2 productos financiables (los regalos no cuentan).
//
// Correr:  bun scripts/t188-verificar-comparativo-un-producto.ts
// ============================================================================
import { readFileSync } from "fs";
import { debeMostrarComparativo } from "../src/lib/pdf/presupuesto-comparativo";

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

console.log("═══ T188 · COMPARATIVO SOLO CON 2+ PRODUCTOS ═══");

console.log("\n[1] Un solo producto: NO se dibuja el comparativo");
check(
  "1 producto normal no alcanza",
  debeMostrarComparativo([{ regalo: false }]) === false
);
check(
  "1 producto + casco regalo tampoco alcanza",
  debeMostrarComparativo([{ regalo: false }, { regalo: true }]) === false
);
check(
  "sin productos no se dibuja",
  debeMostrarComparativo([]) === false
);
check(
  "solo regalos no se dibuja",
  debeMostrarComparativo([{ regalo: true }, { regalo: true }]) === false
);

console.log("\n[2] Dos o más productos financiables: SÍ se dibuja");
check(
  "2 productos normales",
  debeMostrarComparativo([{ regalo: false }, { regalo: false }]) === true
);
check(
  "2 productos + 1 regalo",
  debeMostrarComparativo([
    { regalo: false },
    { regalo: false },
    { regalo: true },
  ]) === true
);

console.log("\n[3] El route del PDF usa la regla");
const route = readFileSync("src/app/api/quotes/pdf/route.ts", "utf8");
check("importa debeMostrarComparativo", /debeMostrarComparativo/.test(route));
check(
  "la llama antes de dibujar el comparativo",
  /debeMostrarComparativo\(compItems\)/.test(route)
);
check(
  "ya no se conforma con que exista un compItem",
  !/!soloContado && compItems\.length > 0/.test(route)
);

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
