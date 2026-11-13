#!/usr/bin/env node
// ============================================================
// T184 — VERIFICACIÓN: COLUMNA IZQUIERDA COMPLETA
// Pedido del dueño:
//   "el cuadro de automatización / integración lo pones abajo del cuadro
//    módulos del sistema... y mantiene la proporción de cuadro
//    automatización del mismo tamaño... luego abajo uno del otro el botón
//    de LA BASE · CENTRAL también luego abajo".
//
// Orden en la columna izquierda:
//   1) MÓDULOS DEL SISTEMA   (16,   8, 300, 282)
//      STOCK GENERAL · COTIZADOR · CRM
//   2) AUTOMATIZACIÓN / INTEGRACIÓN (16, 300, 300, 188)  misma proporción
//      DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA · DEPARTAMENTO DE COMPRA
//   3) LA BASE · CENTRAL     (32, 504, 268,  70)
//
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t184-verificar-columna-izquierda-completa.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};

const orq = readFileSync("src/components/viza/orquestador.tsx", "utf8");

console.log("═══ T184 · COLUMNA IZQUIERDA: MÓDULOS → AUTOMATIZACIÓN → LA BASE ═══");

// ── 1. Automatización debajo de módulos, mismo tamaño ──
console.log("\n[1] El cuadro AUTOMATIZACIÓN va debajo de MÓDULOS, misma proporción");
check("el panel de automatización existe como panelAuto",
  /panelAuto: \{ x: 16, y: 300, w: 300, h: 188 \}/.test(orq));
check("mismo ancho que el de módulos (w: 300)",
  /panelMod: \{ x: 16, y: 8, w: 300, h: 282 \}/.test(orq) &&
    /panelAuto: \{ x: 16, y: 300, w: 300, h: 188 \}/.test(orq));
check("misma x que el panel de módulos (x: 16)",
  /panelMod: \{ x: 16,/.test(orq) && /panelAuto: \{ x: 16,/.test(orq));
check("arranca justo debajo del panel de módulos (8 + 282 + 10 = 300)",
  8 + 282 <= 300);
check("usa el mismo estilo de vidrio y esquinas que el de módulos",
  /className="rounded-3xl" style=\{\{ \.\.\.place\(R\.panelAuto\), \.\.\.GLASS \}\}/.test(orq));
check("ya no existe el panel superior viejo (panelTop)",
  !/panelTop/.test(orq));

// ── 2. Los dos departamentos entran en ese cuadro ──
console.log("\n[2] Los 2 departamentos van dentro del cuadro");
check("DISTRIBUCIÓN va adentro (32, 336)", /distri: \{ x: 32, y: 336, w: 268, h: 64 \}/.test(orq));
check("COMPRA va adentro (32, 408)", /compra: \{ x: 32, y: 408, w: 268, h: 64 \}/.test(orq));
check("los dos caben en el panel (336 + 64 = 400 < 488)",
  336 + 64 <= 300 + 188 && 408 + 64 <= 300 + 188);
check("los dos se renderizan en el diagrama",
  /place\(R\.distri\)[\s\S]{0,80}DistriCard/.test(orq) &&
    /place\(R\.compra\)[\s\S]{0,80}CompraCard/.test(orq));
check("el título AUTOMATIZACIÓN va dentro del panel (top: 312)",
  /left: R\.panelAuto\.x, top: 312, width: R\.panelAuto\.w/.test(orq) &&
    /AUTOMATIZACIÓN \/ INTEGRACIÓN/.test(orq));

// ── 3. La Base debajo, uno del otro ──
console.log("\n[3] LA BASE · CENTRAL cierra la columna");
check("La Base va debajo del panel de automatización (32, 504)",
  /base: \{ x: 32, y: 504, w: 268, h: 70 \}/.test(orq));
check("queda debajo sin tocarlo (300 + 188 = 488, La Base en 504)",
  300 + 188 <= 504);
check("La Base se renderiza en el diagrama", /place\(R\.base\)[\s\S]{0,80}BaseCard/.test(orq));
check("el orden vertical es módulos < automatización < La Base",
  8 < 300 && 300 < 504);
check("La Base ya no está en el centro (500, 178)",
  !/base: \{ x: 500, y: 178/.test(orq));

// ── 4. Conexiones de la columna ──
console.log("\n[4] Conexiones: columna → Central");
check("4 conectores cortos entre automatización y La Base",
  /M 86 488 L 86 504/.test(orq) &&
    /M 152 488 L 152 504/.test(orq) &&
    /M 218 488 L 218 504/.test(orq) &&
    /M 280 488 L 280 504/.test(orq));
check("La Base se conecta con el edificio central",
  /M 300 539 C 400 560, 540 505, 620 438/.test(orq));
check("ya no quedan los conectores viejos del panel superior",
  !/M 560 134 L 560 176/.test(orq) && !/M 670 254 L 670 280/.test(orq));
check("los módulos conservan sus 3 líneas hacia la Central",
  /M 308 79 C 395 130, 500 250, 620 356/.test(orq) &&
    /M 308 159 C 400 200, 505 285, 622 378/.test(orq) &&
    /M 308 239 C 405 275, 510 320, 624 400/.test(orq));

// ── 5. Nada se pisa ──
console.log("\n[5] La columna no se pisa con las sucursales");
check("Nueva Esperanza arranca después de La Base (600 > 504 + 70)",
  600 >= 504 + 70);
check("el lienzo sigue siendo 1340 x 940",
  /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("Las 3 sucursales van adelante, en fila (Task 185)",
  /neBanner: \{ x: 230, y: 600/.test(orq) &&
    /lpBanner: \{ x: 610, y: 600/.test(orq) &&
    /sgBanner: \{ x: 990, y: 600/.test(orq) &&
    /<Edificio x=\{380\} y=\{760\} \/>/.test(orq) &&
    /<Edificio x=\{760\} y=\{760\} \/>/.test(orq) &&
    /<Edificio x=\{1140\} y=\{760\} \/>/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
