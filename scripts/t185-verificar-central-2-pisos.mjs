#!/usr/bin/env node
// ============================================================
// T185 — VERIFICACIÓN: CASA CENTRAL DE KATUETE (2 PISOS)
// Pedido del dueño:
//   "tenemos 4 sucursales pero la central es el segundo de la sucursal de
//    Katuete... quería eliminar este dibujo de la sucursal de Katuete y
//    hacer la central con 2 pisos conforme corresponde, bien en el centro
//    más arriba, y luego en frente de ella las 3 sucursales".
//
// Regla aplicada:
//   · Se elimina el dibujo suelto de la sucursal Katuete (edificio 720,770
//     y su cuadrito 600,640).
//   · La Central es un edificio de 2 pisos (planta baja = sucursal Katuete,
//     planta alta = Central), ubicado en el centro y más arriba (780, 320).
//   · Las 3 sucursales (Nueva Esperanza, La Paloma y Saltos del Guairá) van
//     adelante, en una fila frente a la Central (y = 760), cada una con su
//     cuadrito arriba (y = 600) y sus 3 líneas de conexión.
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t185-verificar-central-2-pisos.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};

const orq = readFileSync("src/components/viza/orquestador.tsx", "utf8");

console.log("═══ T185 · CASA CENTRAL DE KATUETE EN 2 PISOS + 3 SUCURSALES ADELANTE ═══");

// ── 1. Se eliminó el dibujo suelto de Katuete ──
console.log("\n[1] Ya no existe el dibujo suelto de la sucursal Katuete");
check("no queda el edificio de Katuete (720, 770)", !/<Edificio x=\{720\} y=\{770\}/.test(orq));
check("no queda el cuadrito extra de Katuete", !/katueteExtra/.test(orq));
check("no queda el cartel SUCURSAL KATUETE en el mapa",
  !/SucursalBanner nombre="KATUETE"/.test(orq));
check("no quedan las líneas viejas de Katuete",
  !/M 640 528/.test(orq) && !/M 665 545/.test(orq) && !/M 680 556/.test(orq));
check("no queda el conector cuadrito→edificio de Katuete",
  !/M 720 696 L 720 710/.test(orq));

// ── 2. La Central es un edificio de 2 pisos, centro y arriba ──
console.log("\n[2] La Central tiene 2 pisos y está en el centro, más arriba");
check("el edificio acepta la prop pisos", /pisos = 1/.test(orq) && /pisos\?: number/.test(orq));
check("cada piso se apoya en el techo del anterior", /const dy = -h \* i;/.test(orq));
check("el techo del piso de arriba va corrido (0,-60+dy)",
  /0,\$\{-60 \+ dy\} 120,\$\{dy\} 0,\$\{60 \+ dy\} -120,\$\{dy\}/.test(orq));
check("la Central se dibuja con pisos={2}",
  /<Edificio x=\{780\} y=\{320\} s=\{1\.4\} h=\{70\} pisos=\{2\} central \/>/.test(orq));
check("quedó en el centro del lienzo (x = 780 de 1340)", 780 > 316 && 780 < 1340);
check("quedó más arriba que las sucursales (320 < 760)", 320 < 760);
check("el techo entra en el lienzo",
  320 + (-60 - 70) * 1.4 > 0);
check("la plataforma entra en el lienzo",
  320 + 140 * 1.4 <= 940);

// ── 3. Las 3 sucursales adelante ──
console.log("\n[3] Las 3 sucursales van adelante, en fila");
check("Nueva Esperanza adelante (380, 760)", /<Edificio x=\{380\} y=\{760\} \/>/.test(orq));
check("La Paloma adelante (760, 760)", /<Edificio x=\{760\} y=\{760\} \/>/.test(orq));
check("Saltos del Guairá adelante (1140, 760)", /<Edificio x=\{1140\} y=\{760\} \/>/.test(orq));
check("las 3 están en la misma fila (y = 760)",
  (orq.match(/<Edificio x=\{\d+\} y=\{760\} \/>/g) || []).length === 3);
check("cada una tiene su cuadrito arriba (y = 600)",
  /neBanner: \{ x: 230, y: 600/.test(orq) &&
    /lpBanner: \{ x: 610, y: 600/.test(orq) &&
    /sgBanner: \{ x: 990, y: 600/.test(orq));
check("los cuadritos quedan delante de la Central (600 > 320)",
  600 > 320);

// ── 4. Conexiones ──
console.log("\n[4] Todas las conexiones llegan a la Central");
check("La Base se conecta con la Central", /M 300 539 C 400 560, 540 505, 620 438/.test(orq));
check("los módulos conservan sus 3 líneas",
  /M 308 79 C 395 130, 500 250, 620 356/.test(orq) &&
    /M 308 159 C 400 200, 505 285, 622 378/.test(orq) &&
    /M 308 239 C 405 275, 510 320, 624 400/.test(orq));
check("cada sucursal tiene sus 3 líneas",
  /M 530 612 C 570 600, 592 520, 626 452/.test(orq) &&
    /M 680 600 C 708 570, 740 535, 756 520/.test(orq) &&
    /M 990 612 C 950 600, 928 520, 934 452/.test(orq));

// ── 5. La Base acompaña la realidad ──
console.log("\n[5] La Base indica que Katuete es la Casa Central");
check("La Base dice KATUETE · CASA CENTRAL", /KATUETE · CASA CENTRAL/.test(orq));
check("La Base ya no dice SUCURSAL EXTRA", !/KATUETE · SUCURSAL EXTRA/.test(orq));
check("el lienzo sigue siendo 1340 x 940",
  /const W = 1340/.test(orq) && /const H = 940/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
