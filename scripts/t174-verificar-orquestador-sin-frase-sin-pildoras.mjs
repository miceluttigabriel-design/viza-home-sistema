#!/usr/bin/env node
// ============================================================
// T174 — VERIFICACIÓN: LIMPIEZA VISUAL DEL ORQUESTADOR (FRASE Y PÍLDORAS)
// Pedido del dueño:
//   · "UN SOLO ECOSISTEMA, TODOS LOS CANALES. > podes borrar esta frase".
//   · "en los botones amigo hay unos cuadritos escrito > online > ranking y
//     etc este quiero que lo quites".
//
// Regla aplicada:
//   · Se eliminó la frase "UN SOLO ECOSISTEMA, TODOS LOS CANALES." del
//     encabezado del Orquestador.
//   · Se eliminaron las píldoras/cuadritos (ONLINE, RANKING, NÚCLEO,
//     4 PLANES, ACTIVO, SIN ACCESO) de todos los cuadros.
//   · Los cuadros siguen en DORADO VIZA con escritura en NEGRO (Task 173).
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t174-verificar-orquestador-sin-frase-sin-pildoras.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const orq = leer("src/components/viza/orquestador.tsx");

console.log("═══ T174 · ORQUESTADOR SIN FRASE NI PÍLDORAS ═══");

// ── 1. Frase eliminada ──
console.log("\n[1] Frase 'UN SOLO ECOSISTEMA, TODOS LOS CANALES.' eliminada");
check("ya no queda la frase", !/UN SOLO ECOSISTEMA/.test(orq) && !/TODOS LOS CANALES/.test(orq));
check("el encabezado sigue con el título VIZA HOME", /VIZA HOME/.test(orq));

// ── 2. Píldoras eliminadas ──
console.log("\n[2] Cuadritos/píldoras eliminadas");
check("ya no existe el componente Pill", !/function Pill/.test(orq));
check("no queda la prop badge en Tarjeta", !/badge: ReactNode/.test(orq) && !/badge=\{/.test(orq));
check("ya no queda el texto ONLINE", !/ONLINE/.test(orq));
check("ya no queda el texto RANKING", !/RANKING/.test(orq));
check("ya no queda el texto NÚCLEO", !/NÚCLEO/.test(orq));
check("ya no queda el texto 4 PLANES", !/4 PLANES/.test(orq));
check("ya no queda el texto ACTIVO", !/ACTIVO/.test(orq));
check("ya no queda el texto SIN ACCESO como píldora",
  !/<Pill>SIN ACCESO<\/Pill>/.test(orq));

// ── 3. Los cuadros siguen en dorado con letra negra ──
console.log("\n[3] Estilo dorado VIZA conservado");
check("fondo dorado VIZA", /linear-gradient\(135deg, #b89853 0%, #D9B86B 55%, #efd89d 100%\)/.test(orq));
check("escritura del título en negro", /className="[^"]*text-black[^"]*">\{titulo\}/.test(orq));
check("los íconos van en negro", /style=\{\{ color: "#000" \}\}/.test(orq));

// ── 4. Los cuadros siguen siendo clickeables ──
console.log("\n[4] Cuadros siguen siendo botones");
check("onClick en el button de cada cuadro",
  /return onClick \? \(\s*<button type="button" onClick=\{onClick\}/.test(orq));
check("La Base, Stock, Cotizador, CRM, Distribución, Compra siguen",
  /function BaseCard/.test(orq) && /function StockCard/.test(orq) &&
    /function CotizadorCard/.test(orq) && /function CrmCard/.test(orq) &&
    /function DistriCard/.test(orq) && /function CompraCard/.test(orq));

// ── 5. Tareas anteriores no rotas ──
console.log("\n[5] Tareas anteriores conservadas");
check("sigue sin el lema 'MÁS QUE UNA TIENDA'", !/MÁS QUE UNA TIENDA/.test(orq));
check("sigue sin el cuadro REFERENCIAS", !/REFERENCIAS/.test(orq));
check("onGoStock sigue opcional (Task 171)", /onGoStock\?: \(\) => void/.test(orq));
check("StockCard sigue bloqueado sin permiso (Task 171)",
  /function StockCard\(\{ onClick \}: \{ onClick\?: \(\) => void \}\)[\s\S]{0,700}?bloqueado=\{!onClick\}/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
