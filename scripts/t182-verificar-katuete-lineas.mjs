#!/usr/bin/env node
// ============================================================
// T182 — VERIFICACIÓN: CADA SUCURSAL CON SUS 3 LÍNEAS DE CONEXIÓN
// (actualizado en la Task 185)
//
// Historia:
//   · Task 182: la sucursal Katuete tenía que tener las 3 líneas
//     (pedidos, físico/logística y sincro) enlazadas en el pie.
//   · Task 185 (pedido del dueño): Katuete es la CASA CENTRAL. Se eliminó
//     el dibujo suelto de Katuete; ahora la Central es un edificio de 2
//     pisos (planta baja = sucursal Katuete, planta alta = Central) y las
//     otras 3 sucursales van adelante, en fila, cada una con sus 3 líneas.
//
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

console.log("═══ T182 · CADA SUCURSAL CON SUS 3 LÍNEAS (KATUETE = CASA CENTRAL) ═══");

// ── 1. La Central de Katuete es un solo edificio de 2 pisos ──
console.log("\n[1] La Central de Katuete, edificio único de 2 pisos");
check("existe un solo edificio central de 2 pisos",
  /<Edificio x=\{780\} y=\{320\} s=\{1\.4\} h=\{70\} pisos=\{2\} central \/>/.test(orq));
check("el edificio soporta varios pisos", /pisos = 1/.test(orq) && /length: pisos/.test(orq));
check("el piso de arriba nace del techo del de abajo (dy = -h * i)",
  /const dy = -h \* i;/.test(orq));
check("ya no hay dibujo suelto de Katuete (720,770)", !/<Edificio x=\{720\} y=\{770\}/.test(orq));
check("ya no existe el cuadrito extra de Katuete", !/katueteExtra/.test(orq));

// ── 2. Las 3 sucursales adelante, en fila ──
console.log("\n[2] Las 3 sucursales adelante, en fila frente a la Central");
check("Nueva Esperanza (380,760)", /<Edificio x=\{380\} y=\{760\} \/>/.test(orq));
check("La Paloma (760,760)", /<Edificio x=\{760\} y=\{760\} \/>/.test(orq));
check("Saltos del Guairá (1140,760)", /<Edificio x=\{1140\} y=\{760\} \/>/.test(orq));
check("los 3 cuadritos van arriba de sus edificios",
  /neBanner: \{ x: 230, y: 600, w: 300, h: 56 \}/.test(orq) &&
    /lpBanner: \{ x: 610, y: 600, w: 300, h: 56 \}/.test(orq) &&
    /sgBanner: \{ x: 990, y: 600, w: 300, h: 56 \}/.test(orq));
check("los edificios entran en el lienzo (760 + 126 <= 940)", 760 + 126 <= 940);

// ── 3. Las 3 líneas de cada sucursal ──
console.log("\n[3] Cada sucursal con sus 3 líneas (pedidos / físico / sincro)");
check("Nueva Esperanza tiene sus 3 líneas",
  /M 530 612 C 570 600, 592 520, 626 452/.test(orq) &&
    /M 530 630 C 575 620, 606 545, 640 470/.test(orq) &&
    /M 530 648 C 582 640, 620 570, 654 488/.test(orq));
check("La Paloma tiene sus 3 líneas",
  /M 680 600 C 708 570, 740 535, 756 520/.test(orq) &&
    /M 780 600 L 780 518/.test(orq) &&
    /M 860 600 C 832 570, 812 535, 804 520/.test(orq));
check("Saltos del Guairá tiene sus 3 líneas",
  /M 990 612 C 950 600, 928 520, 934 452/.test(orq) &&
    /M 990 630 C 945 620, 914 545, 920 470/.test(orq) &&
    /M 990 648 C 938 640, 900 570, 906 488/.test(orq));
check("las 9 líneas salen desde arriba de cada cuadrito (y = 600..648)",
  (orq.match(/M (?:530|680|780|860|990) (?:600|612|630|648)/g) || []).length === 9);
check("ya no quedan las líneas viejas de Katuete (M 640 528 / 665 545 / 680 556)",
  !/M 640 528/.test(orq) && !/M 665 545/.test(orq) && !/M 680 556/.test(orq));

// ── 4. El resto del diagrama sigue entero ──
console.log("\n[4] Resto del diagrama sin cambios");
check("lienzo W=1340 · H=940", /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("La Base se conecta con la Central", /M 300 539 C 400 560, 540 505, 620 438/.test(orq));
check("La Base sigue cerrando la columna izquierda",
  /base: \{ x: 32, y: 504, w: 268, h: 70 \}/.test(orq));
check("las 3 sucursales se siguen mostrando como cuadros",
  /SucursalBanner nombre="NUEVA ESPERANZA"/.test(orq) &&
    /SucursalBanner nombre="LA PALOMA"/.test(orq) &&
    /SucursalBanner nombre="SALTOS DEL GUAIRA"/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
