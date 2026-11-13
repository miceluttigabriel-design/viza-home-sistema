#!/usr/bin/env node
// ============================================================
// T172 — VERIFICACIÓN: LIMPIEZA VISUAL DEL ORQUESTADOR ISOMÉTRICO
// Pedido del dueño:
//   · "MÁS QUE UNA TIENDA, UN ECOSISTEMA QUE TE CONECTA ... podés eliminar".
//   · "EL CUADRO DE REFERENCIAS ELIMINA TAMBIÉN".
// Además se re-verifica que la limpieza NO haya roto lo de la Task 171
// (Stock General bloqueado para usuarios COMUNES).
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t172-verificar-orquestador-limpieza.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const orq = leer("src/components/viza/orquestador.tsx");
const page = leer("src/app/page.tsx");

console.log("═══ T172 · LIMPIEZA VISUAL DEL ORQUESTADOR ═══");

// ── 1. Frase eliminada ──
console.log("\n[1] Lema 'MÁS QUE UNA TIENDA...' eliminado");
check("ya no queda 'MÁS QUE UNA TIENDA'", !/MÁS QUE UNA TIENDA/.test(orq));
check("ya no queda 'QUE TE CONECTA'", !/QUE TE CONECTA/.test(orq));
check("ya no queda el bloque del Lema", !/\{\/\* Lema \*\/\}/.test(orq));

// ── 2. Cuadro de REFERENCIAS eliminado ──
console.log("\n[2] Cuadro de referencias eliminado");
check("ya no existe el título REFERENCIAS", !/REFERENCIAS/.test(orq));
check("ya no se dibuja la leyenda (LEYENDA)", !/LEYENDA/.test(orq));
check("ya no queda el rectángulo de la leyenda",
  !/x="470" y="620" width="400" height="142"/.test(orq));
check("las líneas de colores siguen dibujándose (solo se quitó la leyenda)",
  /function Linea\(/.test(orq) && /<Linea d=/.test(orq));

// ── 3. El orquestador isométrico sigue entero ──
console.log("\n[3] Diseño isométrico intacto");
check("sigue el lienzo escalable", /const W = 1340/.test(orq) && /const H = 940/.test(orq));
check("siguen los edificios isométricos", /function Edificio\(/.test(orq));
check("siguen las sucursales", /NUEVA ESPERANZA/.test(orq) && /SALTOS DEL GUAIRA/.test(orq));
check("siguen los módulos STOCK / COTIZADOR / CRM",
  /place\(R\.stock\)/.test(orq) && /place\(R\.cotiz\)/.test(orq) && /place\(R\.crm\)/.test(orq));

// ── 4. Task 171 no se rompió con la limpieza ──
console.log("\n[4] Accesos de la Task 171 conservados");
check("onGoStock sigue siendo opcional", /onGoStock\?: \(\) => void/.test(orq));
check("StockCard sigue aceptando onClick opcional",
  /function StockCard\(\{ onClick \}: \{ onClick\?: \(\) => void \}\)/.test(orq));
check("StockCard se muestra bloqueado sin permiso",
  /bloqueado=\{!onClick\}/.test(orq) && /SIN ACCESO/.test(orq));
check("page.tsx sigue pasando onGoStock solo con permiso",
  /onGoStock=\{accesos\.puedeVerStock \? \(\) => irA\("stock"\) : undefined\}/.test(page));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
