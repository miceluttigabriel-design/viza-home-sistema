#!/usr/bin/env node
// ============================================================
// T183 — VERIFICACIÓN: MÓDULOS EN COLUMNA A LA IZQUIERDA
// Pedido del dueño:
//   "quiero poner los botones con los cuadros todos en la extremidad
//    izquierda... donde figura MÓDULOS DEL SISTEMA pero desde arriba bien
//    abajo del header y con las líneas de conexiones, todos los botones uno
//    abajo del otro".
//
// Regla aplicada:
//   · El panel MÓDULOS DEL SISTEMA va a la EXTREMA IZQUIERDA y arranca arriba,
//     bien abajo del header (x=16, y=8).
//   · Los 3 botones van en UNA sola columna, uno abajo del otro:
//     STOCK GENERAL → COTIZADOR → CRM.
//   · Cada botón conserva su línea de conexión hacia Central.
//   · Para liberar ese lugar, la sucursal NUEVA ESPERANZA pasó abajo a la
//     izquierda (cuadrito + edificio), con sus 3 líneas.
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t183-verificar-modulos-columna-izquierda.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};

const orq = readFileSync("src/components/viza/orquestador.tsx", "utf8");

console.log("═══ T183 · MÓDULOS EN COLUMNA A LA IZQUIERDA, DEBAJO DEL HEADER ═══");

// ── 1. Panel arriba a la izquierda ──
console.log("\n[1] Panel de módulos a la extrema izquierda y arriba");
check("el panel arranca arriba a la izquierda (16, 8)", /panelMod: \{ x: 16, y: 8, w: 300, h: 292 \}/.test(orq));
check("el título MÓDULOS DEL SISTEMA va arriba (top: 20)", /left: R\.panelMod\.x, top: 20, width: R\.panelMod\.w/.test(orq));
check("el panel ya no está en el medio (y=448)", !/panelMod: \{ x: 20, y: 448/.test(orq));

// ── 2. Los 3 botones uno abajo del otro ──
console.log("\n[2] Los 3 botones en una sola columna");
check("STOCK GENERAL arriba (32, 44)", /stock: \{ x: 32, y: 44, w: 268, h: 70 \}/.test(orq));
check("COTIZADOR en medio (32, 124)", /cotiz: \{ x: 32, y: 124, w: 268, h: 70 \}/.test(orq));
check("CRM abajo (32, 204)", /crm: \{ x: 32, y: 204, w: 268, h: 70 \}/.test(orq));
check("los 3 comparten la misma columna (x=32)",
  ["stock", "cotiz", "crm"].every((k) => new RegExp(`${k}: \\{ x: 32,`).test(orq)));
check("ya no están lado a lado (stock 36,498 / cotiz 222,498)",
  !/stock: \{ x: 36, y: 498/.test(orq) && !/cotiz: \{ x: 222, y: 498/.test(orq));

// ── 3. Líneas de conexión de los módulos ──
console.log("\n[3] Cada botón conserva su línea hacia Central");
check("existe el bloque de conexión de módulos",
  /Módulos \(columna izquierda\) ↔ Central/.test(orq));
check("las 3 líneas salen de la columna (x=308) y llegan a Central",
  /M 308 79 C 395 130, 455 250, 504 372/.test(orq) &&
    /M 308 159 C 400 200, 460 285, 506 392/.test(orq) &&
    /M 308 239 C 405 275, 465 320, 508 412/.test(orq));

// ── 4. Nueva Esperanza reubicada para liberar el lugar ──
console.log("\n[4] Nueva Esperanza abajo a la izquierda");
check("el cuadrito de Nueva Esperanza bajó (60, 600)", /neBanner: \{ x: 60, y: 600, w: 300, h: 56 \}/.test(orq));
check("el edificio de Nueva Esperanza bajó (230, 740)", /<Edificio x=\{230\} y=\{740\} \/>/.test(orq));
check("Nueva Esperanza conserva sus 3 líneas",
  /M 352 748 C 420 700, 460 560, 500 468/.test(orq) &&
    /M 360 770 C 432 725, 470 580, 506 482/.test(orq) &&
    /M 368 792 C 442 750, 480 600, 512 496/.test(orq));
check("el edificio entra en el lienzo (740 + 126 <= 940)",
  740 + 126 <= 940);

// ── 5. Lo demás sigue igual ──
console.log("\n[5] Resto del ecosistema intacto");
check("lienzo W=1340 · H=940", /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("La Base sigue en el centro", /base: \{ x: 500, y: 178, w: 340, h: 76 \}/.test(orq));
check("los departamentos siguen arriba", /panelTop: \{ x: 420, y: 6, w: 500, h: 128 \}/.test(orq));
check("Katuete sigue con sus 3 líneas", /M 680 556 C 545 655, 525 810, 660 858/.test(orq));
check("La Paloma y Saltos del Guairá siguen en su lugar",
  /lpBanner: \{ x: 960, y: 140/.test(orq) && /sgBanner: \{ x: 960, y: 496/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
