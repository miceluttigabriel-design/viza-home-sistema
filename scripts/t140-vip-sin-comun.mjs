#!/usr/bin/env node
// ============================================================
// T140 — VERIFICACIÓN: TIPO VIP (dorado) SOLO en la tabla, sin
// el select COMÚN al lado. Respuesta al dueño:
// "viza.compras@viza.com.py ponele usuario VIP amigo en dourado
// esta bien por favor !!! filipe.campos@viza.com.py este ya esta
// como VIP ok amigo . el TIPO de usuario si es VIP no necessita
// aparecer do lado COMUN amigo ok !!!"
// Correr:  node scripts/t140-vip-sin-comun.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const enc = leer("src/lib/encargados-sucursal.ts");
const gda = leer("src/components/viza/gestion-accesos.tsx");
const lib = leer("src/lib/sucursal-usuario.ts");
const ranking = leer("src/app/api/crm/ranking/route.ts");
const sales = leer("src/components/viza/sales-panel.tsx");

console.log("═══ T140 · VIP DORADO SOLO — SIN COMÚN AL LADO ═══");

// ── 1. viza.compras@ y filipe.campos@ siguen VIP (Task 139 intacta) ──
console.log("\n[1] viza.compras@ ya es VIP (lista USUARIOS_VIP intacta)");
const mVip = enc.match(/export const USUARIOS_VIP: Record<string, string> = \{[\s\S]*?\n\};/);
const paresVip = mVip
  ? [...mVip[0].matchAll(/"([a-z0-9.@]+)@viza\.com\.py":\s*"([A-Z/ ]+)"/g)].map((m) => [m[1] + "@viza.com.py", m[2]])
  : [];
const mapaVip = new Map(paresVip);
check("viza.compras@ está en USUARIOS_VIP (ya era VIP desde la Task 139)", mapaVip.get("viza.compras@viza.com.py") === "CENTRAL");
check("filipe.campos@ está en USUARIOS_VIP", mapaVip.get("filipe.campos@viza.com.py") === "CENTRAL");
check("USUARIOS_VIP sigue con EXACTAMENTE esos 2", paresVip.length === 2);
check("los VIP NO están en ENCARGADOS_SUCURSAL (sin CRM de regalo)",
  !/filipe\.campos@viza\.com\.py|viza\.compras@viza\.com\.py/.test(
    (enc.match(/export const ENCARGADOS_SUCURSAL: Record<string, string> = \{[\s\S]*?\n\};/) || [""])[0]));

// ── 2. La tabla del GDA: el TIPO aparece SOLO ──
console.log("\n[2] Tabla del GDA: ESPECIAL/VIP solos, sin el select COMÚN al lado");
check("rama propia del ternario para ESPECIAL/VIP (pill sola)",
  /\) : rb\.label === "ESPECIAL" \|\| rb\.label === "VIP" \? \(/.test(gda));
check("la pill ESPECIAL/VIP conserva el estilo redondeado de siempre",
  /\) : rb\.label === "ESPECIAL" \|\| rb\.label === "VIP" \? \(\s*\n\s*<span\s*\n\s*className=\{`inline-flex items-center px-2 py-0\.5 rounded-full border text-\[10px\] font-bold uppercase tracking-wide \$\{rb\.cls\}`\}/.test(gda));
check("ya no existe el envoltorio pill+select (nada queda 'do lado' de COMÚN)",
  !/<span className="inline-flex items-center gap-1\.5">/.test(gda));
check("el select COMÚN/ADMIN sigue para el RESTO de los usuarios",
  /<option value="colaborador">COMÚN<\/option>\s*\n\s*<option value="admin">ADMIN<\/option>/.test(gda));
check("el select conserva cambiarRol (COMÚN ↔ ADMIN funcional para el resto)",
  /onChange=\{\(e\) => cambiarRol\(u, e\.target\.value\)\}/.test(gda));
check("los supremos siguen con etiqueta fija",
  /u\.role === "supremo_admin" \? \([\s\S]{0,300}rb\.label\s*\}\s*<\/span>\s*\) : rb\.label/.test(gda));
check("comentario Task 140 documenta la mejora",
  /Task 140/.test(gda));
check("el pedido literal del dueño queda guardado en el comentario",
  /do lado COMUN/.test(gda));

// ── 3. VIP dorado ("en dourado esta bien") + ESPECIAL verde ──
console.log("\n[3] Colores: VIP dorado · ESPECIAL verde esmeralda");
check("VIP conserva su dorado (bg-yellow-100/text-yellow-800/border-yellow-400)",
  /return \{ label: "VIP", cls: "bg-yellow-100 text-yellow-800 border-yellow-400" \};/.test(gda));
check("ESPECIAL conserva su verde esmeralda",
  /return \{ label: "ESPECIAL", cls: "bg-emerald-100 text-emerald-800 border-emerald-400" \};/.test(gda));
check("esVip() sigue saliendo de USUARIOS_VIP",
  /function esVip\(email: string\): boolean \{\s*\n\s*return !!USUARIOS_VIP\[\(email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\];/.test(gda));
check("esEspecial() sigue saliendo de ENCARGADOS_SUCURSAL",
  /function esEspecial\(email: string\): boolean \{\s*\n\s*return !!ENCARGADOS_SUCURSAL\[\(email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\];/.test(gda));

// ── 4. Preservado del sistema (Tasks 137/138/139) ──
console.log("\n[4] Preservado de las Tasks anteriores");
check("ventas.florencio@ sigue en LA PALOMA (T138)",
  /"ventas\.florencio@viza\.com\.py": "LA PALOMA"/.test(lib));
check("SUCURSALES_VIZA sigue con las 4 de venta sin CENTRAL (stock intacto)",
  /export const SUCURSALES_VIZA = \[\s*\n\s*"KATUETE",\s*\n\s*"LA PALOMA",\s*\n\s*"NUEVA ESPERANZA",\s*\n\s*"SALTOS DEL GUAIRA",\s*\n\s*\] as const;/.test(lib));
check("SUCURSALES_USUARIO sigue con CENTRAL + 4 (T137)",
  /export const SUCURSALES_USUARIO = \["CENTRAL", \.\.\.SUCURSALES_VIZA\] as const;/.test(lib));
check("el CREAR USUARIO sigue exigiendo sucursal (T138)",
  /disabled=\{creando \|\| !crearEmail\.trim\(\) \|\| !crearContrasena\.trim\(\) \|\| !crearSucursal\}/.test(gda));
check("tarjetas de tipo siguen en 6 columnas (T139)",
  /grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6/.test(gda));
check("la tarjeta COMÚN sigue excluyendo ESPECIAL y VIP (T139)",
  />\s*COMÚN\s*<\/div>[\s\S]{0,300}!esEspecial\(u\.email\) && !esVip\(u\.email\)/.test(gda));
check("el filtro SIN SUCURSAL sigue fuera (T138)",
  !/<option value=\{SIN_SUCURSAL\}>/.test(gda));
check("el cuadrito SIN SUCURSAL sigue borrado (T139)",
  !/text-stone-400 mt-1">\s*\{usuarios\.filter\(\(u\) => sucursalDe\(u\) === SIN_SUCURSAL\)/.test(gda));
check("el filtro de rol sigue con TODOS/SUPREMO/ADMIN/COMÚN (sin cambios)",
  /<option value="todos">TODOS<\/option>[\s\S]{0,60}?<option value="supremo_admin">SUPREMO ADMIN<\/option>[\s\S]{0,60}?<option value="admin">ADMIN<\/option>[\s\S]{0,160}?<option value="colaborador">COMÚN<\/option>/.test(gda));
check("el CRM sigue intacto para los encargados (API ranking)",
  /ENCARGADOS_SUCURSAL/.test(ranking));
check("el botón CRM sigue intacto en el panel de ventas",
  /ENCARGADOS_SUCURSAL/.test(sales));

// ── Resumen ──
console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
