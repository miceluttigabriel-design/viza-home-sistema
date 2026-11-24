#!/usr/bin/env bun
// ============================================================================
// T187 — PLAN CUOTA: el PDF debe respetar la casilla CON ENTREGA
// ----------------------------------------------------------------------------
// Caso reportado por el dueño:
//   "cuando incluir precio contado en el presupuesto sale el plan con entrega
//    por ejemplo, y apenas plan sin entrega está marcado".
//
// Causa: el panel conserva los planes CON ENTREGA calculados aunque la casilla
// esté desmarcada. El route del PDF los recorría todos cuando había contado, y
// los dibujaba con la etiqueta CON ENTREGA.
//
// Esta prueba verifica:
//   1. La decisión pura de filas (contado / con entrega / sin entrega).
//   2. El caso exacto del dueño: contado + SOLO sin entrega marcado.
//   3. Contado solo: no repite la sección de financiación.
//   4. El route usa el helper y ya no recorre body.planes sin filtrar.
//   5. El payload del panel no envía planes CON ENTREGA si están ocultos.
//
// Correr:  bun scripts/t187-verificar-plan-cuota-contado.ts
// ============================================================================
import { readFileSync } from "fs";
import {
  resolverFilasFinanciacion,
  type PlanPresupuesto,
} from "../src/lib/pdf/presupuesto-planes";

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

const plan = (
  letra: string,
  cuotas: number,
  valorPorCuota = 100_000
): PlanPresupuesto => ({
  letra,
  cuotas,
  valorPorCuota,
  total: valorPorCuota * cuotas,
});

// Plan A contado + planes B/C con entrega (calculados en el panel).
const planesConContado = [plan("A", 1, 5_000_000), plan("B", 6), plan("C", 12)];
const planesSinContado = [plan("B", 6), plan("C", 12)];
const sinEntrega = [plan("B", 6, 110_000)];

console.log("═══ T187 · PLAN CUOTA · CONTADO + CON/SIN ENTREGA ═══");

// ── 1. Todas las opciones visibles ──
console.log("\n[1] Contado + CON ENTREGA + SIN ENTREGA marcados");
{
  const r = resolverFilasFinanciacion({
    planes: planesConContado,
    planesSinEntrega: sinEntrega,
    mostrarConEntrega: true,
    mostrarSinEntrega: true,
    entregaPersonalizada: 300_000,
  });
  check("dibuja la fila CONTADO", r.contado.length === 1);
  check("dibuja los 2 planes CON ENTREGA", r.conEntrega.length === 2);
  check("dibuja el plan SIN ENTREGA", r.sinEntrega.length === 1);
  check("conserva la entrega inicial personalizada", r.entregaInicial === 300_000);
  check("no es 'solo contado'", r.soloContado === false);
  check("hay opciones para dibujar", r.hayOpciones === true);
}

// ── 2. CASO DEL DUEÑO: contado incluido + SOLO sin entrega marcado ──
console.log("\n[2] Caso reportado: contado incluido y SOLO 'SIN ENTREGA' marcado");
{
  const r = resolverFilasFinanciacion({
    planes: planesConContado, // el panel todavía manda B/C calculados
    planesSinEntrega: sinEntrega,
    mostrarConEntrega: false, // casilla CON ENTREGA desmarcada
    mostrarSinEntrega: true,
    entregaPersonalizada: 300_000,
  });
  check("NO dibuja ningún plan CON ENTREGA", r.conEntrega.length === 0);
  check("SÍ dibuja la fila CONTADO", r.contado.length === 1);
  check("SÍ dibuja el plan SIN ENTREGA", r.sinEntrega.length === 1);
  check("la entrega inicial no se cuela (queda en 0)", r.entregaInicial === 0);
  check("no es 'solo contado' (también hay sin entrega)", r.soloContado === false);
  check("hay opciones para dibujar", r.hayOpciones === true);
}

// ── 3. Contado solo, con planes ocultos en el payload ──
console.log("\n[3] Contado solo: no se repite la sección de financiación");
{
  const r = resolverFilasFinanciacion({
    planes: planesConContado,
    planesSinEntrega: sinEntrega,
    mostrarConEntrega: false,
    mostrarSinEntrega: false,
  });
  check("dibuja la fila CONTADO", r.contado.length === 1);
  check("oculta los planes CON ENTREGA", r.conEntrega.length === 0);
  check("oculta los planes SIN ENTREGA", r.sinEntrega.length === 0);
  check("marca 'solo contado'", r.soloContado === true);
  check("hay opciones (el TOTAL CONTADO ya alcanza)", r.hayOpciones === true);
}

// ── 4. Nada visible (solo planes ocultos, sin contado) ──
console.log("\n[4] Nada marcado: mensaje 'CONSULTE OPCIONES DE FINANCIACIÓN'");
{
  const r = resolverFilasFinanciacion({
    planes: planesSinContado,
    planesSinEntrega: null,
    mostrarConEntrega: false,
    mostrarSinEntrega: false,
  });
  check("no hay filas visibles", r.hayOpciones === false);
  check("no es 'solo contado'", r.soloContado === false);
}

// ── 5. Sin contado + SOLO sin entrega ──
console.log("\n[5] Sin contado y SOLO 'SIN ENTREGA' marcado");
{
  const r = resolverFilasFinanciacion({
    planes: planesSinContado,
    planesSinEntrega: sinEntrega,
    mostrarConEntrega: false,
    mostrarSinEntrega: true,
  });
  check("oculta los planes CON ENTREGA", r.conEntrega.length === 0);
  check("dibuja el plan SIN ENTREGA", r.sinEntrega.length === 1);
  check("hay opciones para dibujar", r.hayOpciones === true);
}

// ── 6. Casilla SIN ENTREGA desmarcada ──
console.log("\n[6] Casilla SIN ENTREGA desmarcada");
{
  const r = resolverFilasFinanciacion({
    planes: planesConContado,
    planesSinEntrega: sinEntrega,
    mostrarConEntrega: true,
    mostrarSinEntrega: false,
  });
  check("dibuja CONTADO + CON ENTREGA", r.contado.length === 1 && r.conEntrega.length === 2);
  check("NO dibuja SIN ENTREGA", r.sinEntrega.length === 0);
}

// ── 7. Integración: el route usa el helper y no recorre body.planes ──
console.log("\n[7] El PDF usa la decisión filtrada");
const route = readFileSync("src/app/api/quotes/pdf/route.ts", "utf8");
check("importa resolverFilasFinanciacion", /resolverFilasFinanciacion/.test(route));
check("lo llama con el body del presupuesto", /resolverFilasFinanciacion\(body\)/.test(route));
check("dibuja planes CONTADO filtrados", /planesContado\.forEach/.test(route));
check("dibuja planes CON ENTREGA filtrados", /planesConEntrega\.forEach/.test(route));
check("dibuja planes SIN ENTREGA filtrados", /planesSinEntrega\.forEach/.test(route));
check("NO recorre body.planes sin filtrar", !/body\.planes\.forEach/.test(route));
check("el comparativo usa los planes filtrados", /const planesColCon = planesConEntrega;/.test(route));

// ── 8. Integración: el panel no manda planes CON ENTREGA ocultos ──
console.log("\n[8] El payload del panel respeta la casilla");
const panel = readFileSync("src/components/viza/sales-panel.tsx", "utf8");
check(
  "calcula los planes CON ENTREGA solo si mostrarConEntrega",
  /if \(mostrarConEntrega\) \{\s*calculatedPlanes\.forEach/.test(panel)
);
check(
  "sigue enviando la bandera mostrarConEntrega al PDF",
  /mostrarConEntrega,/.test(panel)
);

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
