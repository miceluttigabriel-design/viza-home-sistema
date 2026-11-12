#!/usr/bin/env node
// ============================================================
// T173 — VERIFICACIÓN: CUADROS DEL ORQUESTADOR EN DORADO VIZA
// Pedido del dueño:
//   "los cuadros de STOCK GENERAL, COTIZADOR y los demás en DORADO y la
//    escritura en NEGRO (CRM por ejemplo escrito en negro). El botón
//    ABRIR no hace falta".
//
// Regla aplicada: cada cuadro (La Base, Stock General, Cotizador, CRM y los
// Departamentos) se pinta con el degradado DORADO VIZA y todo su texto va en
// NEGRO. Se quitó el botón/etiqueta ABRIR: el cuadro entero es el botón.
// Checks estáticos sobre el archivo.
// Correr:  node scripts/t173-verificar-orquestador-botones-dorados.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const orq = leer("src/components/viza/orquestador.tsx");

console.log("═══ T173 · CUADROS DEL ORQUESTADOR EN DORADO VIZA ═══");

// ── 1. Los cuadros van en DORADO ──
console.log("\n[1] Fondo dorado VIZA");
check("usa el degradado DORADO VIZA (#b89853 → #D9B86B)",
  /linear-gradient\(135deg, #b89853 0%, #D9B86B 55%, #efd89d 100%\)/.test(orq));
check("borde y brillo dorados", /#8a6d2f/.test(orq) && /rgba\(217,184,107,0\.40\)/.test(orq));
check("ya no usa el fondo de cristal azul en la tarjeta",
  !/\.\.\.GLASS,\s*\n\s*border: `1\.5px solid \$\{c\}99`/.test(orq));

// ── 2. La escritura va en NEGRO ──
console.log("\n[2] Escritura en negro");
check("el título del cuadro es negro", /className="[^"]*text-black[^"]*">\{titulo\}/.test(orq));
check("los íconos también van en negro", /style=\{\{ color: "#000" \}\}/.test(orq));
check("las píldoras (RANKING, NÚCLEO, etc.) van en negro",
  /color: "#000000"/.test(orq) && /background: "rgba\(0,0,0,0\.10\)"/.test(orq));
check("SIN ACCESO se lee en negro", /text-black\/70/.test(orq));
check("EN DESARROLLO se lee en negro", /text-black\/60/.test(orq));

// ── 3. El botón ABRIR ya no existe ──
console.log("\n[3] Se quitó el botón ABRIR");
check("ya no se escribe la palabra ABRIR", !/ABRIR/.test(orq));
check("ya no se importa ArrowRight", !/ArrowRight/.test(orq));
check("ya no queda el span dorado del botón anterior",
  !/group-hover:translate-x-0\.5/.test(orq));
check("el cuadro entero sigue siendo el botón (onClick en el button)",
  /return onClick \? \(\s*<button type="button" onClick=\{onClick\}/.test(orq));

// ── 4. Se aplica a TODOS los cuadros ──
console.log("\n[4] Todos los cuadros usan la misma tarjeta");
check("el estilo vive en el componente compartido Tarjeta",
  /function Tarjeta\(/.test(orq) && /const estilo: CSSProperties = \{/.test(orq));
check("La Base usa Tarjeta", /function BaseCard[\s\S]*?<Tarjeta/.test(orq));
check("Stock usa Tarjeta", /function StockCard[\s\S]*?<Tarjeta/.test(orq));
check("Cotizador usa Tarjeta", /function CotizadorCard[\s\S]*?<Tarjeta/.test(orq));
check("CRM usa Tarjeta", /function CrmCard[\s\S]*?<Tarjeta/.test(orq));
check("Distribución usa Tarjeta", /function DistriCard[\s\S]*?<Tarjeta/.test(orq));
check("Compra usa Tarjeta", /function CompraCard[\s\S]*?<Tarjeta/.test(orq));

// ── 5. No se rompió lo anterior ──
console.log("\n[5] Tareas anteriores conservadas");
check("sigue sin el lema 'MÁS QUE UNA TIENDA'", !/MÁS QUE UNA TIENDA/.test(orq));
check("sigue sin el cuadro REFERENCIAS", !/REFERENCIAS/.test(orq));
check("onGoStock sigue opcional (Task 171)", /onGoStock\?: \(\) => void/.test(orq));
check("StockCard sigue bloqueado sin permiso (Task 171)",
  /function StockCard\(\{ onClick \}: \{ onClick\?: \(\) => void \}\)[\s\S]{0,700}?bloqueado=\{!onClick\}/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
