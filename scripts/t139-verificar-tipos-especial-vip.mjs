#!/usr/bin/env node
// ============================================================
// T139 — VERIFICACIÓN: TIPO ESPECIAL (4 encargados) + TIPO VIP
// (filipe.campos y viza.compras) + CUADRITO SIN SUCURSAL BORRADO
// Pedido del dueño: "filipe.campos@viza.com.py / viza.compras@viza.com.py
// estos dos usuarios el TIPO vas a poner como VIP ... jeyson@ /
// antonio.fagner@ / danwillian@ / librado@ vas a poner como usuario tipo
// ESPECIAL ... y tiene que borrar este cuadrito SIN SUCURSAL tanbien".
// Correr:  node scripts/t139-verificar-tipos-especial-vip.mjs
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

console.log("═══ T139 · TIPOS ESPECIAL / VIP + CUADRITO SIN SUCURSAL FUERA ═══");

// ── 1. VIP: filipe.campos@ y viza.compras@ ──
console.log("\n[1] USUARIOS_VIP = filipe.campos@ + viza.compras@ (solo etiqueta)");
const mVip = enc.match(/export const USUARIOS_VIP: Record<string, string> = \{[\s\S]*?\n\};/);
const paresVip = mVip
  ? [...mVip[0].matchAll(/"([a-z0-9.@]+)@viza\.com\.py":\s*"([A-Z/ ]+)"/g)].map((m) => [m[1] + "@viza.com.py", m[2]])
  : [];
const mapaVip = new Map(paresVip);
check("la lista USUARIOS_VIP existe y es client-safe", !!mVip);
check("filipe.campos@ está en USUARIOS_VIP", mapaVip.get("filipe.campos@viza.com.py") === "CENTRAL");
check("viza.compras@ está en USUARIOS_VIP", mapaVip.get("viza.compras@viza.com.py") === "CENTRAL");
check("USUARIOS_VIP tiene EXACTAMENTE esos 2 (nada más)", paresVip.length === 2);

// ── 2. ESPECIAL: los 4 encargados del CRM, acceso intacto ──
console.log("\n[2] ENCARGADOS_SUCURSAL intacto (el acceso al CRM NO cambia)");
const mEnc = enc.match(/export const ENCARGADOS_SUCURSAL: Record<string, string> = \{[\s\S]*?\n\};/);
const paresEnc = mEnc
  ? [...mEnc[0].matchAll(/"([a-z0-9.@]+)@viza\.com\.py":\s*"([A-Z/ ]+)"/g)].map((m) => [m[1] + "@viza.com.py", m[2]])
  : [];
const mapaEnc = new Map(paresEnc);
check("jeyson@ sigue encargado de KATUETE", mapaEnc.get("jeyson@viza.com.py") === "KATUETE");
check("antonio.fagner@ sigue encargado de LA PALOMA", mapaEnc.get("antonio.fagner@viza.com.py") === "LA PALOMA");
check("danwillian@ sigue encargado de NUEVA ESPERANZA", mapaEnc.get("danwillian@viza.com.py") === "NUEVA ESPERANZA");
check("librado@ sigue encargado de SALTOS DEL GUAIRA", mapaEnc.get("librado@viza.com.py") === "SALTOS DEL GUAIRA");
check("ENCARGADOS_SUCURSAL tiene EXACTAMENTE esos 4 (nada más)", paresEnc.length === 4);
check("los VIP NO entraron a la lista de encargados (sin acceso al CRM de regalo)",
  !mapaEnc.has("filipe.campos@viza.com.py") && !mapaEnc.has("viza.compras@viza.com.py"));
check("la API del CRM sigue usando ENCARGADOS_SUCURSAL (acceso intacto)",
  /ENCARGADOS_SUCURSAL/.test(ranking));
check("el panel de ventas sigue usando ENCARGADOS_SUCURSAL (botón CRM intacto)",
  /ENCARGADOS_SUCURSAL/.test(sales));

// ── 3. GDA: etiquetas ESPECIAL y VIP ──
console.log("\n[3] Etiquetas en el GDA");
check("el GDA importa USUARIOS_VIP", /import \{ USUARIOS_VIP \} from "@\/lib\/encargados-sucursal";/.test(gda));
check("esEspecial() existe y sale de ENCARGADOS_SUCURSAL",
  /function esEspecial\(email: string\): boolean \{\s*\n\s*return !!ENCARGADOS_SUCURSAL\[\(email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\];/.test(gda));
check("esVip() ahora sale de USUARIOS_VIP (ya no de encargados)",
  /function esVip\(email: string\): boolean \{\s*\n\s*return !!USUARIOS_VIP\[\(email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\];/.test(gda));
const mTipo = gda.match(/function tipoUsuario\(role: string, email\?: string\): string \{[\s\S]*?\n\}/);
check("tipoUsuario: SUPREMO → ADMIN → ESPECIAL → VIP → COMÚN (orden correcto)",
  !!mTipo
  && mTipo[0].indexOf('return "SUPREMO"') < mTipo[0].indexOf('return "ADMIN"')
  && mTipo[0].indexOf('return "ADMIN"') < mTipo[0].indexOf('return "ESPECIAL"')
  && mTipo[0].indexOf('return "ESPECIAL"') < mTipo[0].indexOf('return "VIP"')
  && mTipo[0].indexOf('return "VIP"') < mTipo[0].indexOf('return "COMÚN"'));
check("roleBadge: ESPECIAL con color esmeralda",
  /return \{ label: "ESPECIAL", cls: "bg-emerald-100 text-emerald-800 border-emerald-400" \};/.test(gda));
check("roleBadge: VIP conserva su dorado (yellow)",
  /return \{ label: "VIP", cls: "bg-yellow-100 text-yellow-800 border-yellow-400" \};/.test(gda));
check("roleBadge evalúa ESPECIAL antes que VIP",
  gda.indexOf("if (email && esEspecial(email))") !== -1
  && gda.indexOf("if (email && esEspecial(email))") < gda.indexOf("if (email && esVip(email))"));

// ── 4. Tarjetas de resumen por tipo (ahora 6) ──
console.log("\n[4] Tarjetas: TOTAL / SUPREMO / ADMIN / ESPECIAL (CRM) / VIP / COMÚN");
check("tarjeta ESPECIAL (CRM) con color esmeralda", /ESPECIAL \(CRM\)/.test(gda) && /text-emerald-700/.test(gda) && /text-emerald-600/.test(gda));
check("tarjeta VIP aparte (dorado)", /text-yellow-700[\s\S]{0,120}>\s*VIP\s*<\/div>/.test(gda));
check("ya no existe la tarjeta 'VIP (CRM)' vieja", !/VIP \(CRM\)\s*<\/div>[\s\S]{0,200}text-yellow-600[\s\S]{0,200}esVip/.test(gda.replace(/Task 139[^*]*\*\//g, "")));
check("ESPECIAL (CRM) cuenta con esEspecial", /ESPECIAL \(CRM\)[\s\S]{0,300}esEspecial\(u\.email\)/.test(gda));
check("la tarjeta VIP NO cuenta a los encargados (excluyentes)",
  />\s*VIP\s*<\/div>[\s\S]{0,300}!esEspecial\(u\.email\) && esVip\(u\.email\)/.test(gda));
check("la tarjeta COMÚN excluye ESPECIAL y VIP",
  />\s*COMÚN\s*<\/div>[\s\S]{0,300}!esEspecial\(u\.email\) && !esVip\(u\.email\)/.test(gda));
check("la grilla de tarjetas de tipo es de 6 columnas (lg:grid-cols-6)",
  /Tarjeta de resumen[\s\S]{0,400}grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6/.test(gda));

// ── 5. Pill ESPECIAL/VIP en la tabla (al lado del select de rol) ──
console.log("\n[5] Pill ESPECIAL/VIP junto al select de rol en la tabla");
check("la tabla muestra la pill solo para ESPECIAL o VIP",
  /\(rb\.label === "ESPECIAL" \|\| rb\.label === "VIP"\)/.test(gda));
check("el select de rol sigue existiendo (COMÚN ↔ ADMIN, Task 82)",
  /<option value="colaborador">COMÚN<\/option>\s*\n\s*<option value="admin">ADMIN<\/option>/.test(gda));
check("los supremos siguen con etiqueta fija (sin select)",
  /u\.role === "supremo_admin" \? \([\s\S]{0,300}rb\.label\s*\}\s*<\/span>\s*\) : \(/.test(gda));

// ── 6. TXT descargable ──
console.log("\n[6] Listado TXT con el vocabulario nuevo");
check("la leyenda de TIPO menciona ESPECIAL y VIP",
  /TIPO DE USUARIO: SUPREMO = acceso total · ADMIN = Admin \+ Ventas · ESPECIAL = encargado que ve el CRM de su sucursal · VIP = destacado de la central · COMÚN = solo Ventas\./.test(gda));
check("los totales por tipo incluyen ESPECIAL", /Por tipo:\s+Supremo: \$\{nSupremos\} · Admin: \$\{nAdmins\} · ESPECIAL: \$\{nEspecial\} · VIP: \$\{nVip\} · Común: \$\{nComunes\}/.test(gda));
check("nEspecial se calcula con esEspecial", /const nEspecial = usuarios\.filter\(\(u\) => esComun\(u\.role\) && esEspecial\(u\.email\)\)\.length;/.test(gda));

// ── 7. Cuadrito SIN SUCURSAL borrado ──
console.log("\n[7] Cuadrito SIN SUCURSAL borrado (pedido del dueño)");
check("NO existe la tarjeta SIN SUCURSAL",
  !/text-stone-400 mt-1">\s*\{usuarios\.filter\(\(u\) => sucursalDe\(u\) === SIN_SUCURSAL\)/.test(gda));
check("las tarjetas de sucursal quedan en 5 columnas (lg:grid-cols-5)",
  /lg:grid-cols-5 gap-3">\s*\n\s*\{SUCURSALES_GDA\.map/.test(gda));
check("el filtro SIN SUCURSAL sigue fuera (T138)",
  !/<option value=\{SIN_SUCURSAL\}>/.test(gda));
check("el grupo defensivo de la tabla queda (solo si existiera alguno)",
  /grupos\.has\(SIN_SUCURSAL\) \? \[SIN_SUCURSAL\] : \[\]/.test(gda));

// ── 8. Preservado del sistema ──
console.log("\n[8] Preservado de las Tasks anteriores");
check("ventas.florencio@ sigue en LA PALOMA (T138)",
  /"ventas\.florencio@viza\.com\.py": "LA PALOMA"/.test(lib));
check("SUCURSALES_VIZA sigue con las 4 de venta sin CENTRAL (stock intacto)",
  /export const SUCURSALES_VIZA = \[\s*\n\s*"KATUETE",\s*\n\s*"LA PALOMA",\s*\n\s*"NUEVA ESPERANZA",\s*\n\s*"SALTOS DEL GUAIRA",\s*\n\s*\] as const;/.test(lib));
check("SUCURSALES_USUARIO sigue con CENTRAL + 4 (T137)",
  /export const SUCURSALES_USUARIO = \["CENTRAL", \.\.\.SUCURSALES_VIZA\] as const;/.test(lib));
check("el CREAR USUARIO sigue exigiendo sucursal (T138)",
  /disabled=\{creando \|\| !crearEmail\.trim\(\) \|\| !crearContrasena\.trim\(\) \|\| !crearSucursal\}/.test(gda));
check("el CREAR USUARIO sigue ofreciendo los TIPOS COMÚN / ADMIN / SUPREMO",
  /<option value="colaborador">COMÚN \(colaborador\)<\/option>\s*\n\s*<option value="admin">ADMIN<\/option>\s*\n\s*<option value="supremo_admin">SUPREMO ADMIN<\/option>/.test(gda));
check("el sector ENC. SUCURSAL de los 4 encargados queda igual (planilla FUN.VIZA)",
  (gda.match(/"jeyson@viza\.com\.py": "ENC\. SUCURSAL"/g) || []).length === 1
  && (gda.match(/"librado@viza\.com\.py": "ENC\. SUCURSAL"/g) || []).length === 1);

// ── Resumen ──
console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
