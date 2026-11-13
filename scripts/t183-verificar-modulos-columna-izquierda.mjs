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
check("el panel arranca arriba a la izquierda (16, 8)", /panelMod: \{ x: 16, y: 8, w: 300, h: 282 \}/.test(orq));
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
check("las 3 líneas salen de la columna (x=308) y llegan a la Central",
  /M 308 79 C 395 130, 500 250, 620 356/.test(orq) &&
    /M 308 159 C 400 200, 505 285, 622 378/.test(orq) &&
    /M 308 239 C 405 275, 510 320, 624 400/.test(orq));

// ── 4. Nueva Esperanza adelante, en la fila de sucursales ──
console.log("\n[4] Nueva Esperanza adelante, en la fila frente a la Central");
check("el cuadrito de Nueva Esperanza quedó en la fila (230, 600)", /neBanner: \{ x: 230, y: 600, w: 300, h: 56 \}/.test(orq));
check("el edificio de Nueva Esperanza quedó adelante (380, 760)", /<Edificio x=\{380\} y=\{760\} \/>/.test(orq));
check("Nueva Esperanza conserva sus 3 líneas",
  /M 530 612 C 570 600, 592 520, 626 452/.test(orq) &&
    /M 530 630 C 575 620, 606 545, 640 470/.test(orq) &&
    /M 530 648 C 582 640, 620 570, 654 488/.test(orq));
check("el edificio entra en el lienzo (760 + 126 <= 940)",
  760 + 126 <= 940);

// ── 5. Lo demás sigue igual ──
console.log("\n[5] Resto del ecosistema intacto");
check("lienzo W=1340 · H=940", /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("La Base ahora cierra la columna izquierda (32, 504)", /base: \{ x: 32, y: 504, w: 268, h: 70 \}/.test(orq));
check("los departamentos ahora van en la columna, debajo de los módulos (Task 184)",
  /panelAuto: \{ x: 16, y: 300, w: 300, h: 188 \}/.test(orq));
check("La Base cierra la columna, debajo de automatización (Task 184)",
  /base: \{ x: 32, y: 504, w: 268, h: 70 \}/.test(orq));
check("los módulos conservan sus 3 líneas hacia la Central",
  /M 308 79 C 395 130, 500 250, 620 356/.test(orq) &&
    /M 308 159 C 400 200, 505 285, 622 378/.test(orq) &&
    /M 308 239 C 405 275, 510 320, 624 400/.test(orq));
check("Katuete es la Casa Central de 2 pisos (Task 185)",
  /<Edificio x=\{780\} y=\{320\} s=\{1\.4\} h=\{70\} pisos=\{2\} central \/>/.test(orq) &&
    !/<Edificio x=\{720\} y=\{770\}/.test(orq));
check("La Paloma y Saltos del Guairá siguen adelante, en la fila",
  /lpBanner: \{ x: 610, y: 600/.test(orq) && /sgBanner: \{ x: 990, y: 600/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
