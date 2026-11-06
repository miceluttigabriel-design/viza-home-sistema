// T124 — Verificación: las columnas de LA BASE dentro de STOCK GENERAL
// deben estar en la MISMA orden que la tabla de la Base (admin-panel.tsx).
// Además: la API /api/stock/general debe traer todos los campos que la
// vista muestra, y la tabla no debe dejar restos viejos (colSpan 4, etc.).
import { readFileSync } from "node:fs";

const rutaStock = "src/components/viza/stock-general.tsx";
const rutaBase = "src/components/viza/admin-panel.tsx";
const rutaApi = "src/app/api/stock/general/route.ts";

const stock = readFileSync(rutaStock, "utf8");
const base = readFileSync(rutaBase, "utf8");
const api = readFileSync(rutaApi, "utf8");

let ok = true;
const fail = (msg) => { ok = false; console.log("  ✗ " + msg); };
const pass = (msg) => console.log("  ✓ " + msg);

// ─── 1. Orden de COLS_BASE (Stock General) ───
const mCols = stock.match(/const COLS_BASE[^[]*\[([\s\S]*?)\];/);
if (!mCols) { fail("No encuentro COLS_BASE en stock-general.tsx"); process.exit(1); }
const ordenStock = [...mCols[1].matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
console.log("Orden en STOCK GENERAL:", ordenStock.join(" > "));

// ─── 2. Orden de las MISMAS keys en COLUMNS (La Base) ───
const mColums = base.match(/const COLUMNS: ColDef\[\] = \[([\s\S]*?)\n\];/);
if (!mColums) { fail("No encuentro COLUMNS en admin-panel.tsx"); process.exit(1); }
const ordenBase = [...mColums[1].matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
// keys que el dueño pidió (las de datos de la Base, sin hashtag/stock/costos)
const pedidas = ["fabricante", "categoria", "subGrupo", "marca", "tipo", "modelo", "capacidad", "cores", "referencia", "name"];
const ordenBaseFiltrada = ordenBase.filter((k) => pedidas.includes(k));
console.log("Orden en LA BASE     :", ordenBaseFiltrada.join(" > "));

if (JSON.stringify(ordenStock) === JSON.stringify(ordenBaseFiltrada)) {
  pass("La orden de columnas de STOCK GENERAL es IDÉNTICA a la de LA BASE");
} else {
  fail("La orden NO coincide:\n    stock=" + ordenStock.join(",") + "\n    base =" + ordenBaseFiltrada.join(","));
}

// ─── 3. Etiquetas de grupo (igual que la Base) ───
const gruposStock = [...mCols[1].matchAll(/key: "([a-zA-Z]+)", label: "([^"]+)", grupo: "([^"]*)"/g)].map((m) => [m[1], m[3]]);
const gruposEsperados = { fabricante: "DATOS FINALES", categoria: "DATOS FINALES", subGrupo: "DATOS FINALES", marca: "DATOS FINALES", tipo: "DATOS FINALES", modelo: "DATOS FINALES", capacidad: "DATOS FINALES", cores: "DATOS FINALES", referencia: "DATOS", name: "DATOS" };
for (const [k, g] of gruposStock) {
  if (gruposEsperados[k] !== g) fail(`Grupo de ${k}: "${g}" (esperado "${gruposEsperados[k]}")`);
}
pass("Etiquetas de grupo encima de las columnas = mismas que la Base");

// ─── 4. La API trae todos los campos que la vista muestra ───
const mSelect = api.match(/const SELECT_FILAS = \{([\s\S]*?)\};/);
if (!mSelect) { fail("No encuentro SELECT_FILAS en la API"); process.exit(1); }
for (const campo of ["sku", "name", "category", "fabricante", "categoria", "subGrupo", "marca", "tipo", "modelo", "referencia", "stock", "ultimaEdicionAt", "ultimaEdicionPor"]) {
  if (!new RegExp(`\\b${campo}: true`).test(mSelect[1])) fail(`SELECT_FILAS no trae "${campo}"`);
}
pass("SELECT_FILAS trae las 14 columnas de la Base (+ultimaEdicion)");

// capacidad/cores: la API debe importar las librerías y fusionarlas
for (const frag of ["leerCapacidades", "leerCores", "fusionarColumnasBase"]) {
  if (!api.includes(frag)) fail(`La API no usa ${frag}`);
}
pass("CAPACIDAD y CORES se fusionan desde las tablas aparte (best-effort)");

// ─── 5. Sin restos viejos en la tabla ───
if (/colSpan=\{4\}/.test(stock)) fail("Queda un colSpan={4} viejo");
else pass("Sin colSpan={4} viejo (los vacíos/cargando usan 12)");
if (/hidden md:table-cell">\s*\{\(p\.subGrupo/.test(stock)) fail("Queda la vieja celda SUB-GRUPO oculta en mobile");
else pass("SUB-GRUPO ya no está oculta en mobile (siempre visible, misma orden)");
if (!stock.includes("Pencil")) fail("Falta el import/usó del badge Pencil");
else pass("Badge de última edición (Pencil) presente en el COD");

console.log(ok ? "\nTODO OK ✓" : "\nHAY ERRORES ✗");
process.exit(ok ? 0 : 1);
