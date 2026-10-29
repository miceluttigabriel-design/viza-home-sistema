// Task 95 — Prueba de la lógica de VENCIMIENTO del #HASHTAG y del filtro
// del CRM. Réplica EXACTA de las funciones de src/lib/hashtag-formato.ts
// (copiadas a mano para correr en Node sin TS) + replicación del where del
// ranking. Verifica los casos del pedido del dueño:
//   1) el vendedor ve el # hasta el ÚLTIMO día de la fecha
//   2) al día siguiente de la fecha el # desaparece para el vendedor
//   3) la celda en la base va ROJA cuando vence hoy o ya venció
//   4) hashtag sin fecha = siempre visible, nunca rojo
//   5) CRM: inactivos y admin/supremo_admin quedan fuera del ranking
"use strict";

// ─── Réplica de src/lib/hashtag-formato.ts (solo lo necesario) ───
function hoyParaguay(hoyFijo) {
  if (hoyFijo) return hoyFijo; // inyectable para probar sin reloj
  return new Date().toISOString().slice(0, 10);
}
function estadoHashtag(fecha, hoy) {
  if (!fecha) return "sinFecha";
  const hoyStr = hoy || hoyParaguay();
  if (fecha > hoyStr) return "vigente";
  if (fecha === hoyStr) return "venceHoy";
  return "vencido";
}
function hashtagVisibleParaVendedor(fecha, hoy) {
  return estadoHashtag(fecha, hoy) !== "vencido";
}
function hashtagCeldaRoja(fecha, hoy) {
  const e = estadoHashtag(fecha, hoy);
  return e === "venceHoy" || e === "vencido";
}

// ─── Réplica del filtro del GET /api/products (Task 95) ───
function filtrarParaVendedor(hashtags, hoy) {
  const out = {};
  for (const [pid, h] of Object.entries(hashtags)) {
    if (hashtagVisibleParaVendedor(h.fecha, hoy)) out[pid] = h;
  }
  return out;
}

// ─── Réplica del where del ranking (Task 95) ───
function pasaAlRanking(u) {
  return u.active === true && !["admin", "supremo_admin"].includes(u.role);
}

let ok = 0, mal = 0;
function check(nombre, real, esperado) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (bien) { ok++; console.log(`  ✓ ${nombre}`); }
  else { mal++; console.log(`  ✗ ${nombre} → real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`); }
}

const HOY = "2026-10-29"; // día del pedido (jueves, hora Paraguay)
console.log(`HOY fijo de prueba: ${HOY}\n`);

console.log("── ESTADO DEL HASHTAG (estadoHashtag) ──");
check("sin fecha → sinFecha", estadoHashtag(null, HOY), "sinFecha");
check("fecha vacía → sinFecha", estadoHashtag("", HOY), "sinFecha");
check("futura 30/11 → vigente", estadoHashtag("2026-11-30", HOY), "vigente");
check("mañana → vigente", estadoHashtag("2026-10-30", HOY), "vigente");
check("HOY → venceHoy", estadoHashtag("2026-10-29", HOY), "venceHoy");
check("ayer → vencido", estadoHashtag("2026-10-28", HOY), "vencido");
check("mes pasado → vencido", estadoHashtag("2026-09-15", HOY), "vencido");
check("año pasado → vencido", estadoHashtag("2025-12-31", HOY), "vencido");

console.log("\n── VISIBILIDAD PARA EL VENDEDOR (el premio dura hasta el último día) ──");
check("sin fecha → VISIBLE", hashtagVisibleParaVendedor(null, HOY), true);
check("futura → VISIBLE", hashtagVisibleParaVendedor("2026-11-30", HOY), true);
check("HOY (último día) → VISIBLE", hashtagVisibleParaVendedor("2026-10-29", HOY), true);
check("ayer → INVISIBLE (desaparece solo)", hashtagVisibleParaVendedor("2026-10-28", HOY), false);

console.log("\n── CELDA ROJA EN LA BASE ──");
check("sin fecha → NO roja", hashtagCeldaRoja(null, HOY), false);
check("futura → NO roja", hashtagCeldaRoja("2026-11-30", HOY), false);
check("vence HOY → ROJA", hashtagCeldaRoja("2026-10-29", HOY), true);
check("vencida → ROJA", hashtagCeldaRoja("2026-10-28", HOY), true);

console.log("\n── FILTRO DEL API DE PRODUCTOS (lo que recibe cada quién) ──");
const base = {
  p1: { valor: 100000, fecha: "2026-11-30" }, // vigente
  p2: { valor: 200000, fecha: "2026-10-29" }, // vence hoy
  p3: { valor: 300000, fecha: "2026-10-28" }, // vencido ayer
  p4: { valor: 400000, fecha: null },         // sin fecha
};
const paraVendedor = filtrarParaVendedor(base, HOY);
check("vendedor: p1 vigente visible", !!paraVendedor.p1, true);
check("vendedor: p2 (vence hoy) visible", !!paraVendedor.p2, true);
check("vendedor: p3 (vencido) NO visible", paraVendedor.p3 === undefined, true);
check("vendedor: p4 sin fecha visible", !!paraVendedor.p4, true);

console.log("\n── COMPARACIÓN DE STRINGS ROBUSTA (sin Date, sin timezone) ──");
check("año distinto: 2027-01-01 vs 2026-12-31 → vigente", estadoHashtag("2027-01-01", "2026-12-31"), "vigente");
check("cambio de mes: 2026-11-01 vs 2026-10-31 → vigente", estadoHashtag("2026-11-01", "2026-10-31"), "vigente");
// Nota: formato "29/10/2026" NO puede existir en la tabla — el PATCH
// /api/products/[id]/hashtag valida /^\d{4}-\d{2}-\d{2}$/ al guardar.
check("formato ISO siempre: 2026-10-29 bien formado → venceHoy", estadoHashtag("2026-10-29", HOY), "venceHoy");

console.log("\n── WHERE DEL RANKING CRM (inactivos y ADM/SUPREMO fuera) ──");
const usuarios = [
  { name: "Vendedor Activo", role: "user", active: true },
  { name: "Vendedor Inactivo", role: "user", active: false },
  { name: "SUPREMO", role: "supremo_admin", active: true },
  { name: "ADM Central", role: "admin", active: true },
  { name: "ADM Inactivo", role: "admin", active: false },
  { name: "VIP Encargado", role: "user", active: true },
  { name: "Colaborador", role: "colaborador", active: true },
];
const enRanking = usuarios.filter(pasaAlRanking).map((u) => u.name);
check("quedan solo vendedores/vip/colaborador activos", enRanking, ["Vendedor Activo", "VIP Encargado", "Colaborador"]);
check("SUPREMO fuera", enRanking.includes("SUPREMO"), false);
check("ADM fuera (activo)", enRanking.includes("ADM Central"), false);
check("ADM inactivo fuera (doble filtro)", enRanking.includes("ADM Inactivo"), false);
check("vendedor inactivo fuera", enRanking.includes("Vendedor Inactivo"), false);

console.log(`\n═══ RESULTADO: ${ok} ✓ · ${mal} ✗ ═══`);
process.exit(mal === 0 ? 0 : 1);
