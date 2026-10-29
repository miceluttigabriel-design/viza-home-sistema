// Task 96/96b — Prueba de la lógica "% ADD + GASTOS ADM 1%" y la excepción
// TRANSPORTER CHACOMER/KENTON. Réplica EXACTA de src/lib/gasto-adm.ts + las
// reglas de defaults de los endpoints (POST /api/products, import ERP,
// import-stock) + la tabla de casos del preview/apply del botón.
"use strict";

// ─── Réplica de src/lib/gasto-adm.ts ───
const GASTO_ADM_DEFAULT = 0.01;
const PCT_ADD_DEFAULT = 0.01;
const TOL = 1e-9;

function yaEsGastoAdmDefault(admPct) {
  return admPct !== null && admPct !== undefined && Math.abs(admPct - GASTO_ADM_DEFAULT) < TOL;
}

function yaEsAddPctDefault(addPct) {
  return addPct !== null && addPct !== undefined && Math.abs(addPct - PCT_ADD_DEFAULT) < TOL;
}

function tieneAddPctPropio(addPct) {
  return addPct !== null && addPct !== undefined && Math.abs(addPct) > TOL;
}

function esTransporterChacomerKenton(p) {
  if (!p) return false;
  const limpiar = (s) =>
    String(s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  // Task 96b: SUBCADENA (cubre TRANSPORTER, TRANSPORTERS, TRANSPORTER110)
  const nombre = ` ${limpiar(p.name)} `;
  if (!nombre.includes("TRANSPORTER")) return false;
  const textoMarca = [
    limpiar(p.brand),
    limpiar(p.fabricante),
    limpiar(p.marca),
    limpiar(p.modelo),
    nombre,
  ].join(" ");
  return textoMarca.includes("CHACOMER") || textoMarca.includes("KENTON");
}

function naceConMargenDefault(data) {
  if (!esTransporterChacomerKenton(data)) {
    if (data.admPct === null || data.admPct === undefined) data.admPct = GASTO_ADM_DEFAULT;
    if (data.addPct === null || data.addPct === undefined) data.addPct = PCT_ADD_DEFAULT;
  }
  return data;
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
check("TRANSPORTERS en plural (KENTON) → excluido (Task 96b)", esTransporterChacomerKenton({ name: "TRANSPORTERS 200", brand: "KENTON" }), true);
check("TRANSPORTER110 pegado (CHACOMER) → excluido (Task 96b)", esTransporterChacomerKenton({ name: "TRANSPORTER110 CHACOMER" }), true);
check("marca dentro del nombre (TRANSPORTER CHACOMER) → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 110 CHACOMER" }), true);
check("marca en fabricante → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 150", fabricante: "KENTON" }), true);
check("marca en campo marca → excluido", esTransporterChacomerKenton({ name: "TRANSPORTER", marca: "Chacomer" }), true);
check("acentos/espacios raros (TRANSPORTER-150 KENTON) → excluido", esTransporterChacomerKenton({ name: "transporter-150", modelo: "kenton  " }), true);

check("moto KENTON normal (sin TRANSPORTER) → NO excluido", esTransporterChacomerKenton({ name: "MOTO KENTON RX 150", brand: "KENTON" }), false);
check("TRANSPORTER sin marca CHACOMER/KENTON → NO excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 150", brand: "OTRAMARCA" }), false);
check("TRANSPORTER sin marca alguna → NO excluido", esTransporterChacomerKenton({ name: "TRANSPORTER 200" }), false);
check("CHACOMER sin TRANSPORTER → NO excluido", esTransporterChacomerKenton({ name: "CUATRICICLO 110", brand: "CHACOMER" }), false);
check("TRANSPORTADORA (no es TRANSPORTER) → NO excluido", esTransporterChacomerKenton({ name: "TRANSPORTADORA DE CARGA", brand: "CHACOMER" }), false);
check("producto vacío → NO excluido", esTransporterChacomerKenton({}), false);
check("null → NO excluido", esTransporterChacomerKenton(null), false);

console.log("\n── NACIMIENTO CON LA MARGEN (los 3 puntos de creación) ──");
// POST manual: body falsy → null → default
check("nuevo sin nada → nace con ADM 1% y ADD 1%", (() => { const d = naceConMargenDefault({ name: "MOTO RX 150", brand: "KENTON", admPct: null, addPct: null }); return [d.admPct, d.addPct]; })(), [0.01, 0.01]);
check("nuevo con ADM propio (0.02) → respeta ADM, ADD default", (() => { const d = naceConMargenDefault({ name: "MOTO RX", admPct: 0.02, addPct: null }); return [d.admPct, d.addPct]; })(), [0.02, 0.01]);
check("nuevo con ADD propio (0.25 refuerzo) → respeta ADD", (() => { const d = naceConMargenDefault({ name: "MOTO RX", admPct: null, addPct: 0.25 }); return [d.admPct, d.addPct]; })(), [0.01, 0.25]);
check("planilla con 0 explícito → respeta 0 (AMBOS)", (() => { const d = naceConMargenDefault({ name: "MOTO RX", admPct: 0, addPct: 0 }); return [d.admPct, d.addPct]; })(), [0, 0]);
check("TRANSPORTER CHACOMER sin nada → nace SIN margen", (() => { const d = naceConMargenDefault({ name: "TRANSPORTER 110", brand: "CHACOMER", admPct: null, addPct: null }); return [d.admPct, d.addPct]; })(), [null, null]);
check("TRANSPORTER KENTON con planilla → respeta planilla", (() => { const d = naceConMargenDefault({ name: "TRANSPORTER 150", brand: "KENTON", admPct: 0.03, addPct: null }); return [d.admPct, d.addPct]; })(), [0.03, null]);
check("import-stock (sin admPct/addPct) → nace con 1% y 1%", (() => { const d = naceConMargenDefault({ name: "CASCO X12", brand: null }); return [d.admPct, d.addPct]; })(), [0.01, 0.01]);

console.log("\n── TABLA DE CASOS DEL BOTÓN (preview y apply deciden IGUAL) ──");
// Réplica EXACTA de la decisión por producto en preview/apply:
function decidir(p) {
  if (esTransporterChacomerKenton(p)) return { accion: "excluido" };
  const necesitaAdm = !yaEsGastoAdmDefault(p.admPct);
  const addPropio = tieneAddPctPropio(p.addPct);
  const necesitaAdd = !addPropio && !yaEsAddPctDefault(p.addPct);
  if (!necesitaAdm && !necesitaAdd) return { accion: "yaIgual", addPropio };
  return { accion: "actualizar", poneAdm: necesitaAdm, poneAdd: necesitaAdd, addPropio };
}
// Caso A: todo en 1% → nada
check("A: ADM 1% + ADD 1% → yaIgual", decidir({ name: "P", admPct: 0.01, addPct: 0.01 }), { accion: "yaIgual", addPropio: true });
// Caso B: ADM 1%, ADD vacío → pone ADD
check("B: ADM 1% + ADD vacío → actualiza SOLO ADD", decidir({ name: "P", admPct: 0.01, addPct: null }), { accion: "actualizar", poneAdm: false, poneAdd: true, addPropio: false });
check("B2: ADM 1% + ADD 0 → actualiza SOLO ADD", decidir({ name: "P", admPct: 0.01, addPct: 0 }), { accion: "actualizar", poneAdm: false, poneAdd: true, addPropio: false });
// Caso C: nada → pone ambos
check("C: sin nada → actualiza AMBOS", decidir({ name: "P", admPct: null, addPct: null }), { accion: "actualizar", poneAdm: true, poneAdd: true, addPropio: false });
// Caso D: ADM viejo + ADD propio → pone SOLO ADM, respeta ADD
check("D: ADM 2% + ADD propio 25% → actualiza SOLO ADM (respeta ADD)", decidir({ name: "P", admPct: 0.02, addPct: 0.25 }), { accion: "actualizar", poneAdm: true, poneAdd: false, addPropio: true });
// Caso E: todo ok + ADD propio → nada (pero informado)
check("E: ADM 1% + ADD propio → yaIgual", decidir({ name: "P", admPct: 0.01, addPct: 0.15 }), { accion: "yaIgual", addPropio: true });
// Transporters SIEMPRE excluidos, con cualquier estado
check("T1: TRANSPORTER con todo vacío → excluido", decidir({ name: "TRANSPORTER 110", brand: "CHACOMER", admPct: null, addPct: null }), { accion: "excluido" });
check("T2: TRANSPORTER con 5% → excluido (no se revierte ni se toca)", decidir({ name: "TRANSPORTER 200", brand: "KENTON", admPct: 0.05, addPct: 0.05 }), { accion: "excluido" });

console.log("\n── EL APPLY NO PISA EL % ADD PROPIO (merged) ──");
// réplica del apply para el caso D: merged respeta addPct del producto
function aplicarA(p) {
  const d = decidir(p);
  if (d.accion !== "actualizar") return { ...p };
  const merged = { ...p };
  if (d.poneAdm) merged.admPct = GASTO_ADM_DEFAULT;
  if (d.poneAdd) merged.addPct = PCT_ADD_DEFAULT;
  return merged;
}
const pD = aplicarA({ sku: "D", admPct: 0.02, addPct: 0.25 });
check("caso D tras aplicar: ADM=1%, ADD propio 25% INTACTO", [pD.admPct, pD.addPct], [0.01, 0.25]);
const pB = aplicarA({ sku: "B", admPct: 0.01, addPct: null });
check("caso B tras aplicar: ADM sigue 1%, ADD=1%", [pB.admPct, pB.addPct], [0.01, 0.01]);
const pB2 = aplicarA(aplicarA({ sku: "B2", admPct: null, addPct: null }));
check("aplicado DOS veces → exactamente 1% y 1% (nunca 2%)", [pB2.admPct, pB2.addPct], [0.01, 0.01]);
const pT = aplicarA({ sku: "T", name: "TRANSPORTER 110", brand: "CHACOMER", admPct: 0.07, addPct: 0.07 });
check("TRANSPORTER tras aplicar → EXACTAMENTE igual (7% y 7%)", [pT.admPct, pT.addPct], [0.07, 0.07]);

console.log("\n── IDEMPOTENCIA / TOLERANCIA ──");
check("yaIgual con 1% flotante (0.010000000001)", yaEsGastoAdmDefault(0.01 + 1e-10), true);
check("con 2% → NO se salta (ADM)", yaEsGastoAdmDefault(0.02), false);
check("con null → NO se salta (ADM)", yaEsGastoAdmDefault(null), false);
check("con 0 → NO se salta (ADM)", yaEsGastoAdmDefault(0), false);
check("yaIgual con 1% flotante (ADD)", yaEsAddPctDefault(0.01 + 1e-10), true);
check("con null → NO se salta (ADD)", yaEsAddPctDefault(null), false);
check("addPctPropio: null → NO", tieneAddPctPropio(null), false);
check("addPctPropio: 0 → NO (cuenta como vacío)", tieneAddPctPropio(0), false);
check("addPctPropio: 0.25 → SÍ", tieneAddPctPropio(0.25), true);
check("addPctPropio: negativo explícito → SÍ (se respeta)", tieneAddPctPropio(-0.05), true);

console.log("\n── EFECTO EN LA CADENA DE COSTOS (N = L+L×M; P = N+N×O; AMBOS 1%) ──");
// producto ejemplo: costo Gs 1.000.000, sin desc → L = 1.000.000
const L = 1000000;
const N_con = L + L * 0.01;   // plusAdd con % ADD 1%
const P_con = N_con + N_con * 0.01; // plusAdd2 con GASTOS ADM 1%
check("con ambos 1%: P = L × 1.01 × 1.01", P_con, 1020100);
check("diferencia vs sin nada = 2.01% de L", P_con - L, 20100);
check("solo ADM 1% (caso D): P = L × 1.01", L + L * 0.01 + (L + L * 0.01) * 0, 1010000);

console.log(`\n═══ RESULTADO: ${ok} ✓ · ${mal} ✗ ═══`);
process.exit(mal === 0 ? 0 : 1);
