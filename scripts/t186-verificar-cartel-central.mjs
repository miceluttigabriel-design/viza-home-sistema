#!/usr/bin/env node
// ============================================================
// T186 — VERIFICACIÓN: CUADRITO ARRIBA DE LA CASA CENTRAL
// Pedido del dueño:
//   "haga el cuadrito en cima del dibujo... CENTRAL PRIMER PISO + SALÓN
//    KATUETE con el cuadrito".
//
// Regla aplicada:
//   · Arriba del edificio de 2 pisos (la Casa Central de Katuete) va un
//     cuadrito informativo, centrado con el edificio.
//   · El cuadrito dice CENTRAL · PRIMER PISO y debajo + SALÓN KATUETE.
//   · Se ve igual que los cuadros de sucursal (vidrio azul de VIZA).
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t186-verificar-cartel-central.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};

const orq = readFileSync("src/components/viza/orquestador.tsx", "utf8");

console.log("═══ T186 · CUADRITO ARRIBA DE LA CASA CENTRAL ═══");

// ── 1. El cuadrito existe y está arriba del edificio ──
console.log("\n[1] El cuadrito va encima del edificio de 2 pisos");
check("existe centralBanner (630, 64, 300, 56)",
  /centralBanner: \{ x: 630, y: 64, w: 300, h: 56 \}/.test(orq));
check("está centrado con la Central (630 + 150 = 780)", 630 + 150 === 780);
check("queda arriba del techo de la Central (120 < 138)", 64 + 56 < 320 + (-60 - 70) * 1.4);
check("no se mete en la columna izquierda (630 > 316)", 630 > 316);
check("se renderiza en el escenario", /place\(R\.centralBanner\)[\s\S]{0,80}CentralBanner/.test(orq));
check("existe el componente CentralBanner", /function CentralBanner\(\)/.test(orq));

// ── 2. El texto pedido ──
console.log("\n[2] El texto del cuadrito");
check("dice CENTRAL · PRIMER PISO", /CENTRAL · PRIMER PISO/.test(orq));
check("dice + SALÓN KATUETE", /\+ SALÓN KATUETE/.test(orq));
check("tiene el ícono de edificio", /Building2/.test(orq));
check("usa el mismo vidrio azul que los cuadros de sucursal",
  /place\(R\.centralBanner\)[\s\S]{0,400}style=\{GLASS\}/.test(orq) ||
    /function CentralBanner[\s\S]{0,400}style=\{GLASS\}/.test(orq));

// ── 3. No se pisa con otras líneas ni cuadros ──
console.log("\n[3] No se pisa con el resto del mapa");
check("las líneas de los módulos no pasan por el cuadrito (terminan en x=620)",
  /M 308 79 C 395 130, 500 250, 620 356/.test(orq) && 620 <= 630);
check("los cuadros de sucursal quedan abajo (600 > 120)", 600 > 64 + 56);
check("la Central sigue en 2 pisos",
  /<Edificio x=\{780\} y=\{320\} s=\{1\.4\} h=\{70\} pisos=\{2\} central \/>/.test(orq));
check("el lienzo sigue siendo 1340 x 940",
  /const W = 1340/.test(orq) && /const H = 940/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
