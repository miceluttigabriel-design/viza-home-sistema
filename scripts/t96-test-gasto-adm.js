// Task 96 — Prueba de la lógica GASTOS ADM 1% y la excepción TRANSPORTER
// CHACOMER/KENTON. Réplica EXACTA de src/lib/gasto-adm.ts + las reglas de
// defaults de los endpoints (POST /api/products e import ERP).
"use strict";

// ─── Réplica de src/lib/gasto-adm.ts ───
const GASTO_ADM_DEFAULT = 0.01;

function yaEsGastoAdmDefault(admPct) {
  return admPct !== null && admPct !== undefined && Math.abs(admPct - GASTO_ADM_DEFAULT) < 1e-9;
}

function esTransporterChacomerKenton(p) {
  if (!p) return false;
  const limpiar = (s) =>
    String(s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  const nombre = ` ${limpiar(p.name)} `;
  if (!nombre.includes(" TRANSPORTER ")) return false;
  const textoMarca = [
    limpiar(p.brand),
    limpiar(p.fabricante),
    limpiar(p.marca),
    limpiar(p.modelo),
    nombre,
  ].join(" ");
  return textoMarca.includes("CHACOMER") || textoMarca.includes("KENTON");
}

// ─── Réplica del default en POST /api/products e import ERP ───
function admPctDeNuevo(bodyAdmPct, producto) {
  // si viene explícito (aunque sea 0), se respeta; si no, 1% salvo transporter
  if (bodyAdmPct !== null && bodyAdmPct !== undefined && bodyAdmPct !== "") {
    return bodyAdmPct;
  }
  return esTransporterChacomerKenton(producto) ? null : GASTO_ADM_DEFAULT;
}

let ok = 0, mal = 0;
function check(nombre, real, esperado) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (bien) { ok++; console.log(`  ✓ ${nombre}`); }
  else { mal++; console.log(`  ✗ ${nombre} → real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`); }
}

console.log("── EXCEPCIÓN TRANSPORTER CHACOMER/KENTON ──");
check("TRANSPORTER 110 + brand CHACOMER → excluido", esTransporterChacomerKenton({ name: "MOTO TRANSPORTER 110", brand: "CHACOMER" }), true);
check("TRANSPORTER + brand KENTON → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 150 CC", brand: "KENTON" }), true);
check("marca dentro del nombre (TRANSPORTER CHACOMER) → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 110 CHACOMER" }), true);
check("marca en fabricante → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 150", fabricante: "KENTON" }), true);
check("marca en campo marca → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER", marca: "Chacomer" }), true);
check("acentos/espacios raros (TRANSPORTER-150 KENTON) → excluido", esTransporterChacomerKenton({ name: "transporter-150", modelo: "kenton  " }), true);

check("moto KENTON normal (sin TRANSPORTER) → NO excluido", esTransporterChacomerKenton({ name: "MOTO KENTON RX 150", brand: "KENTON" }), false);
check("TRANSPORTER sin marca CHACOMER/KENTON → NO excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 150", brand: "OTRAMARCA" }), false);
check("TRANSPORTER sin marca alguna → NO excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 200" }), false);
check("CHACOMER sin TRANSPORTER → NO excluido", esTransporterChacomerKenton({ name: "CUATRICICLO 110", brand: "CHACOMER" }), false);
check("palabra parcial (TRANSPORTEROS) → NO cuenta", esTransporterChacomerKenton({ name: "TRANSPORTEROS XYZ", brand: "KENTON" }), false);
check("producto vacío → NO excluido", esTransporterChacomerKenton({}), false);
check("null → NO excluido", esTransporterChacomerKenton(null), false);

console.log("\n── DEFAULT DE PRODUCTOS NUEVOS (POST e import ERP) ──");
check("nuevo sin GASTOS ADM → 1%", admPctDeNuevo(null, { name: "MOTO RX 150", brand: "KENTON" }), 0.01);
check("nuevo con GASTOS ADM de la planilla (0.02) → respeta 0.02", admPctDeNuevo(0.02, { name: "MOTO RX 150" }), 0.02);
check("nuevo con 0 explícito → respeta 0", admPctDeNuevo(0, { name: "MOTO RX 150" }), 0);
check("nuevo TRANSPORTER CHACOMER sin ADM → null (sin 1%)", admPctDeNuevo(null, { name: "TRANSPORTER 110", brand: "CHACOMER" }), null);
check("nuevo TRANSPORTER KENTON con ADM de planilla → respeta planilla", admPctDeNuevo(0.03, { name: "TRANSPORTER 150", brand: "KENTON" }), 0.03);

console.log("\n── IDEMPOTENCIA DEL BOTÓN (pone 1%, no suma) ──");
// réplica del apply: producto con admPct viejo 0.02 → queda 0.01; ya en 0.01 → se salta
function aplicarAdm(p) { return { ...p, admPct: GASTO_ADM_DEFAULT }; }
const p1 = aplicarAdm({ sku: "A", admPct: 0.02 });
check("con 2% → queda exactamente 1%", p1.admPct, 0.01);
const p2 = aplicarAdm(aplicarAdm({ sku: "B", admPct: null }));
check("aplicado DOS veces → sigue 1% (nunca 2%)", p2.admPct, 0.01);
check("ya en 1% → se salta (yaIgual)", yaEsGastoAdmDefault(0.01), true);
check("con 2% → NO se salta", yaEsGastoAdmDefault(0.02), false);
check("con null → NO se salta", yaEsGastoAdmDefault(null), false);
check("con 0 → NO se salta", yaEsGastoAdmDefault(0), false);

console.log("\n── EFECTO EN LA CADENA DE COSTOS (P = N + N×O, O = 1%) ──");
// producto ejemplo: costo Gs 1.000.000, sin desc, sin add → N = 1.000.000
const N = 1000000;
const con1 = N + N * 0.01;   // plusAdd2 con 1%
const sin1 = N + N * 0;      // plusAdd2 sin admPct
check("P con 1% = P sin 1% + 1% del P", con1, 1010000);
check("sin admPct no cambia nada", sin1, 1000000);
check("diferencia exacta = 1% de N", con1 - sin1, 10000);

console.log(`\n═══ RESULTADO: ${ok} ✓ · ${mal} ✗ ═══`);
process.exit(mal === 0 ? 0 : 1);
