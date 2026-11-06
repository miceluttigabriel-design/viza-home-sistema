// ============================================================
// T114 — PRUEBA INTERACTIVA DEL OJITO DEL COSTO
// (bun scripts/t114-test.ts)
//
// Renderiza el componente REAL CostoInterno en un DOM de verdad
// (happy-dom, igual que un navegador) y hace CLIC en el ojito:
//   1. Estado inicial: montos REALES "Gs 95.000" + icono Eye.
//   2. CLIC → montos "Gs •••••", el número real desaparece de TODO el
//      cuadro, icono EyeOff, título "Costo oculto · clic para ver",
//      aria-pressed="true" y la preferencia queda GUARDADA en el
//      localStorage del usuario (persist de zustand).
//   3. Otro CLIC → todo vuelve a verse.
//   4. Sin productos → null (igual que siempre).
// ============================================================
import { Window } from "happy-dom";
import type { CostoInternoItem } from "../src/components/viza/costo-interno";

// ── DOM global ANTES de importar react-dom/client ──
const win = new Window({ url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const k of [
  "window", "document", "navigator", "localStorage", "sessionStorage",
  "HTMLElement", "HTMLIFrameElement", "HTMLImageElement", "HTMLInputElement",
  "SVGElement", "Element", "Node", "NodeList", "MutationObserver",
  "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "EventTarget",
  "customElements", "getComputedStyle", "matchMedia", "history", "location",
  "XMLHttpRequest", "fetch", "alert", "confirm", "prompt",
]) {
  g[k] = (win as unknown as Record<string, unknown>)[k];
}
g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
g.cancelAnimationFrame = (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>);
g.IS_REACT_ACT_ENVIRONMENT = false;

const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CostoInterno } = await import(
  "../src/components/viza/costo-interno"
);
const { useCostoOcultoStore, COSTO_OCULTO_TXT } = await import(
  "../src/store/costo-oculto"
);

let fallos = 0;
function check(nombre: string, cond: boolean, detalle?: string) {
  if (cond) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
const flush = () => new Promise((r) => setTimeout(r, 30));

const items: CostoInternoItem[] = [
  { key: "1", name: "CASCO PRO TORK SPORT MOTO 788 AZUL", quantity: 1, cost: 95_000 },
  { key: "2", name: "PRODUCTO SIN COSTO", quantity: 2, cost: 0 },
];

const container = win.document.createElement("div");
win.document.body.appendChild(container);
const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
root.render(createElement(CostoInterno, { items }));
await flush();

console.log("[1] Estado VISIBLE (como siempre)");
let html = container.innerHTML;
check('muestra el monto real "Gs 95.000"', html.includes("Gs 95.000"));
check('título "COSTO DE PRODUCTOS · SOLO VENDEDOR"', html.toUpperCase().includes("COSTO DE PRODUCTOS · SOLO VENDEDOR"));
check("icono Eye (no tachado)", html.includes("lucide-eye") && !html.includes("lucide-eye-off"));
check('etiqueta "NO SALE EN EL PDF" intacta', html.toUpperCase().includes("NO SALE EN EL PDF"));
check('los "—" de filas sin costo salen', html.includes("—"));
check("es un BOTÓN clickeable con aria-pressed=false", html.includes('aria-pressed="false"'));

console.log("[2] CLIC en el ojito → OCULTO");
const btn = container.querySelector("button");
check("encontró el botón del ojito", !!btn);
btn!.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
await flush();
html = container.innerHTML;
check("store quedó oculto", useCostoOcultoStore.getState().oculto === true);
check('montos enmascarados "Gs •••••"', html.includes(COSTO_OCULTO_TXT));
check("el número real NO aparece en NINGUNA parte", !html.includes("95.000"));
const mascaras = html.match(/Gs •••••/g)?.length ?? 0;
check(`la máscara sale en la fila Y en el total (${mascaras} ≥ 2)`, mascaras >= 2);
check('título "COSTO OCULTO · CLIC PARA VER"', html.toUpperCase().includes("COSTO OCULTO · CLIC PARA VER"));
check("icono EyeOff (tachado)", html.includes("lucide-eye-off"));
check('los nombres de productos SIGUEN visibles (no son secreto)', html.includes("CASCO PRO TORK SPORT MOTO 788 AZUL"));
check('los "—" de filas sin costo siguen', html.includes("—"));
check("aria-pressed=true", html.includes('aria-pressed="true"'));
// Persistencia (mismo mecanismo del carrito: zustand persist + storage por
// usuario "anon" en este DOM de prueba).
const guardado = win.localStorage.getItem("viza-costo-oculto-user-anon") || "";
check("preferencia GUARDADA en localStorage (oculto:true)", guardado.includes('"oculto":true'), guardado.slice(0, 80));

console.log("[3] Otro CLIC → VUELVE A VERSE");
btn!.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
await flush();
html = container.innerHTML;
check("store quedó visible", useCostoOcultoStore.getState().oculto === false);
check('montos reales de vuelta "Gs 95.000"', html.includes("Gs 95.000"));
check("icono Eye de vuelta", !html.includes("lucide-eye-off"));
check("sin máscara en ninguna parte", !html.includes(COSTO_OCULTO_TXT));

console.log("[4] Sin productos → null (igual que siempre)");
const container2 = win.document.createElement("div");
win.document.body.appendChild(container2);
const root2 = createRoot(container2 as unknown as Parameters<typeof createRoot>[0]);
root2.render(createElement(CostoInterno, { items: [] }));
await flush();
check("no hay productos → no renderiza nada", container2.innerHTML === "");

console.log(fallos === 0 ? "\nTODO OK ✓" : `\nFALLOS: ${fallos} ✗`);
process.exit(fallos === 0 ? 0 : 1);
