#!/usr/bin/env node
// ============================================================
// T138 — VERIFICACIÓN: FLORENCIO → LA PALOMA + CREAR USUARIO CON
// SUCURSAL + FILTRO SIN SUCURSAL FUERA
// Pedido del dueño: "ventas.florencio@viza.com.py este tiene que mover
// amigo a La Paloma ... y la opcion de crear usuario debe tanbien aparecer
// para poner la sucursal ... para que no quede usuario sin sucursal y el
// filtro de sin sucursal ya podes borrar apos mover el colaborar".
// Correr:  node scripts/t138-verificar-usuario-paloma.mjs
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
const api = leer("src/app/api/admin/usuarios/route.ts");

console.log("═══ T138 · FLORENCIO A LA PALOMA + CREAR CON SUCURSAL ═══");

// ── 1. ventas.florencio@ → LA PALOMA ──
console.log("\n[1] ventas.florencio@ queda en LA PALOMA");
const mMapa = lib.match(/export const MAPA_SUCURSAL_EXCEL[\s\S]*?\n\};/);
const pares = mMapa
  ? [...mMapa[0].matchAll(/"([a-z0-9.@]+)@viza\.com\.py":\s*"([A-Z/ ]+)"/g)].map((m) => [m[1] + "@viza.com.py", m[2]])
  : [];
const mapa = new Map(pares);
check("ventas.florencio@ = LA PALOMA en el mapa de la planilla", mapa.get("ventas.florencio@viza.com.py") === "LA PALOMA");
check("florencio aparece UNA sola vez en el mapa (sin duplicado)",
  pares.filter(([e]) => e === "ventas.florencio@viza.com.py").length === 1);
const paloma = pares.filter(([, s]) => s === "LA PALOMA").map(([e]) => e).sort();
check("LA PALOMA ahora tiene 12 usuarios (11 + florencio)", paloma.length === 12);
const CENTRALES = pares.filter(([, s]) => s === "CENTRAL").map(([e]) => e).sort();
check("la CENTRAL de la T137 sigue intacta (24 correos)", CENTRALES.length === 24);
const katuete = pares.filter(([, s]) => s === "KATUETE").length;
check("KATUETE sigue con sus 12", katuete === 12);

// ── 2. Sector VENTAS para florencio (solo referencia visual del GDA) ──
console.log("\n[2] SECTOR de florencio = VENTAS en el GDA");
const mSector = gda.match(/const MAPA_SECTOR_EXCEL[\s\S]*?\n\};/);
const sectorFlorencio = mSector ? mSector[0].match(/"ventas\.florencio@viza\.com\.py":\s*"([A-Z. ]+)"/) : null;
check("MAPA_SECTOR_EXCEL tiene ventas.florencio@ = VENTAS", !!sectorFlorencio && sectorFlorencio[1] === "VENTAS");

// ── 3. CREAR USUARIO con SUCURSAL obligatoria ──
console.log("\n[3] CREAR USUARIO con SUCURSAL obligatoria");
check("estado crearSucursal existe", /const \[crearSucursal, setCrearSucursal\] = useState\(""\);/.test(gda));
check("el modal tiene el select de sucursal con — ELEGIR SUCURSAL —",
  /Sucursal \(obligatoria\)[\s\S]*?<option value="">— ELEGIR SUCURSAL —<\/option>/.test(gda));
check("las opciones del select salen de SUCURSALES_GDA (CENTRAL + 4 de venta)",
  /Sucursal \(obligatoria\)[\s\S]*?\{SUCURSALES_GDA\.map\(\(s\) => \(/.test(gda));
check("el botón CREAR USUARIO queda deshabilitado sin sucursal",
  /disabled=\{creando \|\| !crearEmail\.trim\(\) \|\| !crearContrasena\.trim\(\) \|\| !crearSucursal\}/.test(gda));
check("crearUsuario valida la sucursal antes de enviar", /if \(!crearSucursal\) \{\s*\n\s*toast\.error\("Elegí la SUCURSAL/.test(gda));
check("el cuerpo del POST manda la sucursal", /role: crearRol,\s*\n\s*sucursal: crearSucursal,/.test(gda));
check("tras crear, el select vuelve a vacío (listo para el próximo)", /setCrearSucursal\(""\);/.test(gda));

// ── 4. La API asigna la sucursal al crear ──
console.log("\n[4] POST /api/admin/usuarios asigna la sucursal");
check("la API importa asignarSucursal + SUCURSALES_USUARIO",
  /import \{[\s\S]*asignarSucursal,[\s\S]*SUCURSALES_USUARIO,[\s\S]*\} from "@\/lib\/sucursal-usuario";/.test(api));
check("el POST acepta sucursal en el body", /sucursal\?: string;/.test(api));
check("valida contra SUCURSALES_USUARIO (400 si no es válida)",
  /SUCURSALES_USUARIO as readonly string\[\]\)\.includes\(sucursalNueva\)/.test(api));
check("llama asignarSucursal(email, sucursal) tras crear el usuario",
  /await asignarSucursal\(created\.email, sucursalNueva\);/.test(api));
check("la respuesta informa sucursal/sucursalAsignada", /sucursalAsignada,/.test(api));
check("si la sucursal falla, el usuario IGUAL queda creado (best-effort, no rompe)",
  /let sucursalAsignada = false;/.test(api));

// ── 5. Filtro SIN SUCURSAL borrado del GDA ──
console.log("\n[5] Filtro SIN SUCURSAL borrado (pedido del dueño)");
check("el <select> del filtro ya NO tiene la opción SIN SUCURSAL",
  !/<option value=\{SIN_SUCURSAL\}>/.test(gda));
check("SUCURSALES_USUARIO sigue con CENTRAL + 4 de venta (sin cambios T137)",
  /export const SUCURSALES_USUARIO = \["CENTRAL", \.\.\.SUCURSALES_VIZA\] as const;/.test(lib));
check("la tarjeta de conteo SIN SUCURSAL sigue (por si algún viejo queda, muestra 0)",
  /sucursalDe\(u\) === SIN_SUCURSAL\)\.length/.test(gda));

// ── 6. Nada más se rompió ──
console.log("\n[6] Preservado del sistema");
check("la tabla sigue agrupando por sucursal con cabecera", /tipo: "sucursal"; key: string; nombre: string; cantidad: number/.test(gda));
check("el TXT descargable sigue agrupando", /const sucConocidas = SUCURSALES_GDA\.filter/.test(gda));
check("la migración CENTRAL (T137) sigue llamada en la API", /await migrarCentral\(\);/.test(api));
check("el GET de la API sigue sembrando la planilla", /await sembrarDesdeExcel\(/.test(api));
check("migrarCentral sigue existiendo en la lib", /export async function migrarCentral\(\)/.test(lib));
check("las sucursales de STOCK siguen siendo 4 (SUCURSALES_VIZA sin CENTRAL)",
  /export const SUCURSALES_VIZA = \[\s*\n\s*"KATUETE",\s*\n\s*"LA PALOMA",\s*\n\s*"NUEVA ESPERANZA",\s*\n\s*"SALTOS DEL GUAIRA",\s*\n\s*\] as const;/.test(lib));

// ── Resumen ──
console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
