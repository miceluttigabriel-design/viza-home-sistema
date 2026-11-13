#!/usr/bin/env node
// ============================================================
// T182 — VERIFICACIÓN: LAS 3 LÍNEAS DE CONEXIÓN DE KATUETE
// Pedido del dueño:
//   "para la sucursal de Katuete las líneas no tenemos todas... podés agregar
//    las dos líneas faltantes y que todas las líneas de conexión queden bien
//    en el pie de la sucursal, linkadas en la parte de abajo".
//
// Regla aplicada:
//   · La sucursal KATUETE (extra de La Base / Central) tiene las MISMAS 3
//     líneas que las demás sucursales: pedidos, físico/logística y sincro.
//   · Las 3 bajan desde Central y terminan en el PIE del edificio de Katuete
//     (parte de abajo), sin quedar tapadas por el cuadrito de sucursal.
//   · Hay un solo edificio de Katuete (sin duplicados).
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t182-verificar-katuete-lineas.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};

const orq = readFileSync("src/components/viza/orquestador.tsx", "utf8");

console.log("═══ T182 · KATUETE CON SUS 3 LÍNEAS DE CONEXIÓN ═══");

// ── 1. Las 3 líneas de conexión existen ──
console.log("\n[1] Las 3 líneas de conexión (pedidos / físico / sincro)");
const katuete = /Central → Katuete \(sucursal extra\)[\s\S]{0,600}?Cuadrito de sucursal → edificio de Katuete/.exec(orq)?.[0] ?? "";
check("existe el bloque de conexión de Katuete", katuete.length > 0);
check("línea de PEDIDOS al pie de Katuete",
  /<Linea d="M 640 528 C 520 610, 500 760, 600 828" t="pedidos" \/>/.test(katuete));
check("línea FÍSICO/LOGÍSTICA al pie de Katuete",
  /<Linea d="M 665 545 C 540 630, 520 790, 630 843" t="fisico" \/>/.test(katuete));
check("línea de SINCRONIZACIÓN al pie de Katuete",
  /<Linea d="M 680 556 C 545 655, 525 810, 660 858" t="sync" \/>/.test(katuete));
check("son 3 líneas en total (antes había 1 sola)",
  (katuete.match(/<Linea /g) || []).length === 3);

// ── 2. Las líneas llegan al pie (parte de abajo) del edificio ──
console.log("\n[2] Las líneas se enlazan abajo, en el pie del edificio");
const puntas = [...katuete.matchAll(/C [^"]*?(\d+) (\d+)" t="/g)].map((m) => Number(m[2]));
check("las 3 puntas terminan en la parte de abajo (y >= 820)", puntas.length === 3 && puntas.every((y) => y >= 820));
check("ninguna línea termina sobre el cuadrito (y 640..696)", puntas.every((y) => y < 640 || y > 696));
check("el cuadrito sigue enlazado al edificio (720,696 → 720,710)",
  /<Linea d="M 720 696 L 720 710" t="pedidos" ida=\{false\} \/>/.test(orq));

// ── 3. Un solo edificio de Katuete (sin duplicado) ──
console.log("\n[3] Un solo edificio de Katuete");
const edificiosKatuete = [...orq.matchAll(/<Edificio x=\{720\} y=\{770\} \/>/g)].length;
check("está el edificio de Katuete debajo del cuadrito", edificiosKatuete === 1);
check("ya no está el edificio duplicado (600,480)", !/<Edificio x=\{600\} y=\{480\}/.test(orq));

// ── 4. El resto del diagrama sigue entero ──
console.log("\n[4] Resto del diagrama sin cambios");
check("lienzo W=1340 · H=940", /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("siguen las 3 líneas de Saltos del Guairá",
  /M 972 640 C 900 630, 880 530, 800 485/.test(orq));
check("siguen las sucursales NUEVA ESPERANZA / LA PALOMA", /NUEVA ESPERANZA/.test(orq) && /LA PALOMA/.test(orq));
check("el cuadrito KATUETE sigue en su lugar", /katueteExtra: \{ x: 600, y: 640, w: 240, h: 56 \}/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
