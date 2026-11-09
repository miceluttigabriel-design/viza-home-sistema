#!/usr/bin/env node
// ============================================================
// T136 (v2) — VERIFICACIÓN: MARCA AL LADO DERECHO DE PROVEDOR
// (entre PROVEDOR y GRUPO: COD > PROVEDOR > MARCA > GRUPO > ...)
// + columna FIJA, en la Base (admin-panel.tsx) y en Stock General
// (stock-general.tsx — espejo exigido por la Task 124).
// v1 quedó descartada (el dueño aclaró el lado: derecho, no frente).
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t136-verificar-marca-frente-provedor.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const admin = leer("src/components/viza/admin-panel.tsx");
const stock = leer("src/components/viza/stock-general.tsx");

console.log("═══ T136 (v2) · MARCA AL LADO DERECHO DE PROVEDOR + FIJA ═══");

// ── Extraer orden de COLUMNS (Base) y COLS_BASE (Stock General) ──
const mColums = admin.match(/const COLUMNS[^[]*\[([\s\S]*?)\];/);
if (!mColums) { console.log("  ✗ No encuentro COLUMNS en admin-panel.tsx"); process.exit(1); }
const ordenBase = [...mColums[1].matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);

const mCols = stock.match(/const COLS_BASE[^[]*\[([\s\S]*?)\];/);
if (!mCols) { console.log("  ✗ No encuentro COLS_BASE en stock-general.tsx"); process.exit(1); }
const ordenStock = [...mCols[1].matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);

// ── MARCA al lado derecho de PROVEDOR en LA BASE ──
const iMarcaB = ordenBase.indexOf("marca");
const iProvB = ordenBase.indexOf("fabricante");
const iGrupoB = ordenBase.indexOf("categoria");
check("LA BASE: orden pedido del dueño COD > PROVEDOR > MARCA > GRUPO",
  iProvB === 0 && iMarcaB === iProvB + 1 && iGrupoB === iMarcaB + 1);
check("LA BASE: MARCA NO quedó a la izquierda de PROVEDOR (v1 descartada)",
  iMarcaB > iProvB);
check("LA BASE: el resto del orden no cambió (GRUPO > SUB-GRUPO > TIPO > MODELO > CAPACIDAD > CORES > REF.FABRICA)",
  (() => {
    const rest = ordenBase.slice(iGrupoB, ordenBase.indexOf("name"));
    return JSON.stringify(rest) === JSON.stringify(["categoria", "subGrupo", "tipo", "modelo", "capacidad", "cores", "referencia"]);
  })());

// ── MARCA al lado derecho de PROVEDOR en STOCK GENERAL (espejo T124) ──
const iMarcaS = ordenStock.indexOf("marca");
const iProvS = ordenStock.indexOf("fabricante");
const iGrupoS = ordenStock.indexOf("categoria");
check("STOCK GENERAL: orden PROVEDOR > MARCA > GRUPO", iProvS === 0 && iMarcaS === iProvS + 1 && iGrupoS === iMarcaS + 1);
check("STOCK GENERAL: espejo EXACTO del orden de la Base (Task 124 sigue cumplida)",
  JSON.stringify(ordenStock.slice(0, 10)) === JSON.stringify(ordenBase.slice(0, 10)));

// ── FROZEN_COLUMNS: MARCA fija en la 2ª posición y orden espejado ──
const mFrozen = admin.match(/const FROZEN_COLUMNS[^[]*\[([\s\S]*?)\];/);
if (!mFrozen) { console.log("  ✗ No encuentro FROZEN_COLUMNS en admin-panel.tsx"); process.exit(1); }
const frozenKeys = [...mFrozen[1].matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
check("FROZEN_COLUMNS: PROVEDOR sigue primera fija y MARCA la segunda (lado derecho de PROVEDOR)",
  frozenKeys[0] === "fabricante" && frozenKeys[1] === "marca");
check("FROZEN_COLUMNS: MARCA sigue FIJA (no se perdió al reordenar)", frozenKeys.includes("marca"));
check("FROZEN_COLUMNS: orden espeja EXACTAMENTE a COLUMNS (posiciones sticky correctas)",
  JSON.stringify(frozenKeys) === JSON.stringify(ordenBase.slice(0, frozenKeys.length)));
check("FROZEN_COLUMNS: las 9 fijas de siempre siguen presentes (nada se borró)",
  JSON.stringify([...frozenKeys].sort()) === JSON.stringify(["marca", "fabricante", "categoria", "subGrupo", "tipo", "modelo", "capacidad", "cores", "referencia"].sort()));
const anchos = [...mFrozen[1].matchAll(/width: (\d+)/g)].map((m) => Number(m[1]));
const totalFrozen = anchos.reduce((a, b) => a + b, 0);
check(`FROZEN_COLUMNS: anchos intactos, total ${totalFrozen}px (era 1040px + ACCIONES/COD)`, totalFrozen === 1040);
check("FROZEN_COLUMNS: MARCA conserva su ancho de 100px",
  /key: "marca", width: 100/.test(admin));

// ── No se tocó nada más ──
check("LA BASE: labels intactos (MARCA sigue siendo MARCA, PROVEDOR sigue siendo PROVEDOR)",
  mColums[1].includes('key: "marca", label: "MARCA"') && mColums[1].includes('key: "fabricante", label: "PROVEDOR"'));
check("LA BASE: DESCRIPCION sigue FUERA de las fijas (scrollea normal)",
  !frozenKeys.includes("name"));
check("STOCK GENERAL: labels intactos", mCols[1].includes('key: "marca", label: "MARCA"') && mCols[1].includes('key: "fabricante", label: "PROVEDOR"'));

console.log(`\nResultado: ${ok} OK · ${fallo} FALLO`);
process.exit(fallo === 0 ? 0 : 1);
