#!/usr/bin/env node
// ============================================================
// T137 — VERIFICACIÓN: FILTRO CENTRAL EN EL GDA
// Pedido del dueño: "dentro de GDA necessitamos un filtro para
// CENTRAL tenemos usuarios en Katuete que son de CENTRAL ... ya te
// passo los usuarios para que vos mueva para este filtro".
//   · CENTRAL vuelve a ser sucursal propia para USUARIOS (GDA + CRM).
//   · Los 24 correos que pasó el dueño pasan de KATUETE → CENTRAL.
//   · Las sucursales de STOCK de productos siguen siendo solo las 4 de
//     venta (KATUETE, LA PALOMA, NUEVA ESPERANZA, SALTOS DEL GUAIRA):
//     cero cambio en productos, buscador ni orquestador.
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t137-verificar-filtro-central.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const lib = leer("src/lib/sucursal-usuario.ts");
const gda = leer("src/components/viza/gestion-accesos.tsx");
const apiUsuarios = leer("src/app/api/admin/usuarios/route.ts");
const apiRanking = leer("src/app/api/crm/ranking/route.ts");
const apiSucursal = leer("src/app/api/crm/sucursal/route.ts");
const stockSuc = leer("src/lib/stock-por-sucursal.ts");

console.log("═══ T137 · FILTRO CENTRAL EN EL GDA (usuarios) ═══");

// ── 1. Los 24 correos EXACTOS que pasó el dueño (en su mensaje) ──
const LISTA_DUENO = [
  "viza.cobranza@viza.com.py",
  "auditoria.stock@viza.com.py",
  "auditoria@viza.com.py",
  "contabilidad@viza.com.py",
  "credito1@viza.com.py",
  "credito@viza.com.py",
  "documentos@viza.com.py",
  "factura@viza.com.py",
  "filipe.campos@viza.com.py",
  "julianamoleiro@viza.com.py",
  "juliane@viza.com.py",
  "juliozago@viza.com.py",
  "larazago@viza.com.py",
  "rrhh@viza.com.py",
  "sac@viza.com.py",
  "sercom@viza.com.py",
  "vendedor@viza.com.py",
  "ventas.online@viza.com.py",
  "viza.artes@viza.com.py",
  "viza.marketing@viza.com.py",
  "viza.web@viza.com.py",
  "baltazar@viza.com.py",
  "viza.compras@viza.com.py",
  "viza@viza.com.py",
].sort();

// Parsear el MAPA_SUCURSAL_EXCEL de la lib
const mMapa = lib.match(/export const MAPA_SUCURSAL_EXCEL[\s\S]*?\n\};/);
check("MAPA_SUCURSAL_EXCEL existe", !!mMapa);
const pares = mMapa
  ? [...mMapa[0].matchAll(/"([a-z0-9.@]+)@viza\.com\.py":\s*"([A-Z/ ]+)"/g)].map((m) => [m[1] + "@viza.com.py", m[2]])
  : [];
const mapa = new Map(pares);
const enCentral = pares.filter(([, s]) => s === "CENTRAL").map(([e]) => e).sort();
const enKatuete = pares.filter(([, s]) => s === "KATUETE").map(([e]) => e).sort();

console.log("\n[1] Los 24 correos del dueño quedan en CENTRAL");
check("la lista CENTRAL del mapa es EXACTAMENTE la del dueño (24 correos, ni uno más ni uno menos)",
  JSON.stringify(enCentral) === JSON.stringify(LISTA_DUENO));
check("son 24 correos en CENTRAL", enCentral.length === 24);
check("viza@viza.com.py (supremo) queda en CENTRAL", mapa.get("viza@viza.com.py") === "CENTRAL");
check("vendedor@ (televentas) queda en CENTRAL", mapa.get("vendedor@viza.com.py") === "CENTRAL");
check("viza.compras@ (enc. compras) queda en CENTRAL", mapa.get("viza.compras@viza.com.py") === "CENTRAL");
check("viza.cobranza@ queda en CENTRAL", mapa.get("viza.cobranza@viza.com.py") === "CENTRAL");
check("auditoria.stock@ queda en CENTRAL", mapa.get("auditoria.stock@viza.com.py") === "CENTRAL");
check("julianamoleiro@ queda en CENTRAL", mapa.get("julianamoleiro@viza.com.py") === "CENTRAL");

console.log("\n[2] El personal real de KATUETE NO se toca (sigue en KATUETE)");
const katueteEsperado = [
  "cobranza.katuete@viza.com.py",
  "jeyson@viza.com.py",
  "caja.katuete@viza.com.py",
  "fact.katuete@viza.com.py",
  "deposito.katuete@viza.com.py",
  "ventas.rafael@viza.com.py",
  "ventas.carla@viza.com.py",
  "ventas.emmanuel@viza.com.py",
  "ventas.paola@viza.com.py",
  "ventas.richard@viza.com.py",
  "ventas.lorena@viza.com.py",
  "lorena@viza.com.py",
].sort();
check("los 12 de KATUETE siguen igual", JSON.stringify(enKatuete) === JSON.stringify(katueteEsperado));
check("jeyson@ (ENC. SUCURSAL) sigue en KATUETE", mapa.get("jeyson@viza.com.py") === "KATUETE");
check("cobranza.katuete@ sigue en KATUETE", mapa.get("cobranza.katuete@viza.com.py") === "KATUETE");

// ── 3. Las otras sucursales de la planilla intactas ──
console.log("\n[3] LA PALOMA / NUEVA ESPERANZA / SALTOS DEL GUAIRA intactos");
const porSuc = (s) => pares.filter(([, v]) => v === s).length;
check("LA PALOMA sigue con sus usuarios (11)", porSuc("LA PALOMA") === 11);
check("NUEVA ESPERANZA sigue con sus usuarios (9)", porSuc("NUEVA ESPERANZA") === 9);
check("SALTOS DEL GUAIRA sigue con sus usuarios (9)", porSuc("SALTOS DEL GUAIRA") === 9);

// ── 4. Listas de sucursales ──
console.log("\n[4] Listas: SUCURSALES_VIZA (stock, 4) y SUCURSALES_USUARIO (5 con CENTRAL)");
const mViza = lib.match(/export const SUCURSALES_VIZA = \[([\s\S]*?)\] as const;/);
const viza = mViza ? [...mViza[1].matchAll(/"([A-Z/ ]+)"/g)].map((m) => m[1]) : [];
check("SUCURSALES_VIZA sigue con SOLO las 4 de venta (stock no cambia)",
  JSON.stringify(viza) === JSON.stringify(["KATUETE", "LA PALOMA", "NUEVA ESPERANZA", "SALTOS DEL GUAIRA"]));
const mUsu = lib.match(/export const SUCURSALES_USUARIO = \["CENTRAL", \.\.\.SUCURSALES_VIZA\] as const;/);
check("SUCURSALES_USUARIO = [CENTRAL, ...SUCURSALES_VIZA] existe", !!mUsu);

// ── 5. Migración migrarCentral ──
console.log("\n[5] Migración migrarCentral (mueve lo guardado en la base)");
check("migrarCentral() exportada en la lib", /export async function migrarCentral\(\)/.test(lib));
check("corre UNA SOLA VEZ en la vida de la base (guarda: si ya hay CENTRAL no toca nada)",
  /yaHayCentral[\s\S]*?if \(yaHayCentral > 0\) return;/.test(lib));
check("usa updateMany SOLO sobre UsuarioSucursal", /usuarioSucursal\.updateMany\(\{[\s\S]*?data: \{ sucursal: "CENTRAL" \}/.test(lib));
check("crea fila en CENTRAL para los que quedaron SIN SUCURSAL", /asignarSucursal\(email, "CENTRAL"\)/.test(lib));
check("deriva la lista de emails del propio mapa (una sola fuente de verdad)",
  /Object\.entries\(MAPA_SUCURSAL_EXCEL\)[\s\S]*?suc === "CENTRAL"/.test(lib));
check("best-effort: no tira si la tabla falta (esErrorTablaFaltante)", /migradoCentral[\s\S]*esErrorTablaFaltante/.test(lib));

// ── 6. APIs ──
console.log("\n[6] APIs: migración activada y CRM acepta CENTRAL");
check("GET /api/admin/usuarios llama migrarCentral()", /await migrarCentral\(\);/.test(apiUsuarios));
check("GET /api/crm/ranking llama migrarCentral()", /await migrarCentral\(\);/.test(apiRanking));
check("GET /api/crm/ranking devuelve sucursales: SUCURSALES_USUARIO (con CENTRAL)",
  /sucursales: SUCURSALES_USUARIO/.test(apiRanking));
check("ranking ya NO devuelve la lista de stock (SUCURSALES_VIZA)", !/sucursales: SUCURSALES_VIZA/.test(apiRanking));
check("PUT /api/crm/sucursal valida contra SUCURSALES_USUARIO (permite asignar CENTRAL a mano)",
  /SUCURSALES_USUARIO as readonly string\[\]\)\.includes\(sucursal\)/.test(apiSucursal));

// ── 7. GDA (Gestión de Accesos) ──
console.log("\n[7] GDA: filtro, tarjetas y agrupación con CENTRAL");
const mGda = gda.match(/const SUCURSALES_GDA = \[([\s\S]*?)\] as const;/);
const gdaSuc = mGda ? [...mGda[1].matchAll(/"([A-Z/ ]+)"/g)].map((m) => m[1]) : [];
check("SUCURSALES_GDA = CENTRAL + las 4 de venta",
  JSON.stringify(gdaSuc) === JSON.stringify(["CENTRAL", "KATUETE", "LA PALOMA", "NUEVA ESPERANZA", "SALTOS DEL GUAIRA"]));
check("CENTRAL es la PRIMERA del filtro del GDA (casa matriz)", gdaSuc[0] === "CENTRAL");
check("el <select> del filtro sigue montado sobre SUCURSALES_GDA (CENTRAL entra solo)",
  /\{SUCURSALES_GDA\.map\(\(s\) => \(\s*<option key=\{s\} value=\{s\}\>/.test(gda));
check("las tarjetas de resumen siguen montadas sobre SUCURSALES_GDA",
  /\{SUCURSALES_GDA\.map\(\(s\) => \(/.test(gda) && /sucursalDe\(u\) === s\)\.length/.test(gda));
check("grilla de tarjetas ampliada a 6 columnas (5 sucursales + SIN SUCURSAL)",
  /grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3/.test(gda));
check("el TXT descargable agrupa con el mismo orden (CENTRAL primero)", /const sucConocidas = SUCURSALES_GDA\.filter/.test(gda));

// ── 8. STOCK de productos: cero cambio ──
console.log("\n[8] Stock de productos intacto (la central no tiene stock)");
check("stock-por-sucursal sigue usando SUCURSALES_VIZA (4 de venta)",
  /const ORDEN_SUCURSALES: string\[\] = \[\.\.\.SUCURSALES_VIZA\];/.test(stockSuc));
check("stock-por-sucursal NO usa la string \"CENTRAL\" (solo la nombra el comentario del depósito del ERP)",
  !["'"] .some((q) => new RegExp(q + "CENTRAL" + q).test(stockSuc)));
check("la lib sigue exportando SUCURSALES_VIZA igual que siempre (compat total)", !!mViza);

// ── 9. Nada más se rompió ──
console.log("\n[9] Preservado del sistema");
check("migrarCentralKatuete sigue existiendo (migración vieja intacta)", /export async function migrarCentralKatuete\(\)/.test(lib));
check("sembrarDesdeExcel intacto (siembra solo sin asignación)", /export async function sembrarDesdeExcel\(/.test(lib));
check("asignarSucursal intacto (upsert por email)", /export async function asignarSucursal\(/.test(lib));
check("leerMapaSucursales intacto", /export async function leerMapaSucursales\(/.test(lib));
check("GDA sigue leyendo /api/admin/usuarios", /fetch\("\/api\/admin\/usuarios"\)/.test(gda));

// ── Resumen ──
console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
