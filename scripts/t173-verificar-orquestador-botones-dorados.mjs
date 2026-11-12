#!/usr/bin/env node
// ============================================================
// T173 — VERIFICACIÓN: BOTONES DE LAS OPCIONES DEL ORQUESTADOR
// Pedido del dueño:
//   "los botones del Orquestador, las opciones, pone en DORADO color de
//    VIZA y escrita en NEGRO, los botones de las opciones dentro de los
//    cuadros".
//
// Regla aplicada: la opción ABRIR de cada cuadro se dibuja como botón con
// el degradado DORADO VIZA (#b89853 → #D9B86B) y la letra NEGRA.
// Los estados SIN ACCESO / EN DESARROLLO no se pintan como botón.
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

console.log("═══ T173 · BOTONES DE OPCIONES EN DORADO VIZA ═══");

// ── 1. La opción ABRIR es un botón dorado con letra negra ──
console.log("\n[1] Estilo del botón ABRIR");
check("usa el degradado DORADO VIZA (#b89853 → #D9B86B)",
  /linear-gradient\(135deg, #b89853 0%, #D9B86B 100%\)/.test(orq));
check("la letra va en NEGRO", /color: "#000000"/.test(orq));
check("se dibuja como botón redondeado (rounded-md)", /rounded-md/.test(orq));
check("mantiene el texto ABRIR y la flecha", /ABRIR <ArrowRight/.test(orq));
check("tiene hover suave (group-hover)", /group-hover:translate-x-0\.5/.test(orq));

// ── 2. Se aplica a TODOS los cuadros ──
console.log("\n[2] Todos los cuadros usan la misma tarjeta");
check("el botón vive dentro del componente compartido Tarjeta",
  /function Tarjeta\(/.test(orq) && /const cuerpo = \(/.test(orq));
check("La Base usa Tarjeta", /function BaseCard[\s\S]*?<Tarjeta/.test(orq));
check("Stock usa Tarjeta", /function StockCard[\s\S]*?<Tarjeta/.test(orq));
check("Cotizador usa Tarjeta", /function CotizadorCard[\s\S]*?<Tarjeta/.test(orq));
check("CRM usa Tarjeta", /function CrmCard[\s\S]*?<Tarjeta/.test(orq));
check("Distribución usa Tarjeta", /function DistriCard[\s\S]*?<Tarjeta/.test(orq));
check("Compra usa Tarjeta", /function CompraCard[\s\S]*?<Tarjeta/.test(orq));

// ── 3. Los estados bloqueados NO se pintan como botón dorado ──
console.log("\n[3] Estados bloqueados / en desarrollo intactos");
check("SIN ACCESO sigue en gris", /SIN ACCESO/.test(orq) && /text-slate-400/.test(orq));
check("EN DESARROLLO sigue en gris", /EN DESARROLLO/.test(orq) && /text-slate-500/.test(orq));
check("el dorado solo aparece cuando hay onClick",
  /\{onClick \? \([\s\S]{0,500}?ABRIR[\s\S]{0,900}?\) : bloqueado \?/.test(orq));

// ── 4. No se rompió lo anterior ──
console.log("\n[4] Tareas anteriores conservadas");
check("sigue sin el lema 'MÁS QUE UNA TIENDA'", !/MÁS QUE UNA TIENDA/.test(orq));
check("sigue sin el cuadro REFERENCIAS", !/REFERENCIAS/.test(orq));
check("onGoStock sigue opcional (Task 171)", /onGoStock\?: \(\) => void/.test(orq));
check("StockCard sigue bloqueado sin permiso (Task 171)",
  /function StockCard\(\{ onClick \}: \{ onClick\?: \(\) => void \}\)[\s\S]{0,600}?bloqueado=\{!onClick\}/.test(orq));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
