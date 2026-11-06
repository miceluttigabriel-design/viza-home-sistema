// ─────────────────────────────────────────────────────────────────────
// Task 126 — Verificación: LA BASE replica AL INSTANTE en STOCK GENERAL
// (pedido del dueño: "cada vez que um producto sea editado y guardado
// quiero que el mismo replique en el stock... incluso los registros...
// toda edicion hecha y guardada en estas colunas hay que replicar en el
// stock general").
//
// Uso: bun scripts/t126-verificar-replicacion.mjs  (o node)
// Salida: N/N checks OK — corta con código 1 si algo falta.
// ─────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const leer = (p) => readFileSync(join(RAIZ, p), "utf8");

let ok = 0;
let fail = 0;
const check = (nombre, cond) => {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fail++;
    console.error(`  ✗ ${nombre}`);
  }
};

console.log("\n=== T126 · REPLICACIÓN BASE → STOCK GENERAL ===\n");

// ── 1. La lib de replicación existe con los 2 lados ──
console.log("[1] src/lib/replicacion-productos.ts");
const LIB = "src/lib/replicacion-productos.ts";
check("existe el archivo de la lib", existsSync(join(RAIZ, LIB)));
if (existsSync(join(RAIZ, LIB))) {
  const lib = leer(LIB);
  check("emisor avisarProductoEditado exportado", /export function avisarProductoEditado/.test(lib));
  check("receptor suscribirseAEdicionesProductos exportado", /export function suscribirseAEdicionesProductos/.test(lib));
  check("mismo pestaña: CustomEvent", /dispatchEvent\(\s*new CustomEvent/.test(lib));
  check("otras pestañas: BroadcastChannel", /BroadcastChannel/.test(lib));
  check("respaldo multi-pestaña: localStorage + storage", /localStorage\.setItem/.test(lib) && /"storage"/.test(lib));
  check("interface DetalleEdicionProducto con columnas + accion", /interface DetalleEdicionProducto[\s\S]*columnas: string\[\][\s\S]*accion\?/.test(lib));
}

// ── 2. LA BASE emite el aviso justo después de guardar bien ──
console.log("\n[2] src/components/viza/admin-panel.tsx (LA BASE emite)");
const admin = leer("src/components/viza/admin-panel.tsx");
check("import avisarProductoEditado", /import \{ avisarProductoEditado \} from "@\/lib\/replicacion-productos"/.test(admin));
const zonaHandleSave = admin.slice(admin.indexOf("const handleSave"), admin.indexOf("const handleDelete"));
check("handleSave llama avisarProductoEditado DESPUÉS del success", /toast\.success\(`\$\{product\.name\} guardado`\)[\s\S]{0,600}avisarProductoEditado\(\{[\s\S]{0,400}accion: "guardado"/.test(zonaHandleSave));
check("el aviso lleva las columnas tocadas (dirty)", zonaHandleSave.includes("columnas: Object.keys(changes)"));
check("el aviso lleva el registro de edición (por: ultimaEdicionPor)", zonaHandleSave.includes("ultimaEdicionPor"));
const desdeDelete = admin.indexOf("const handleDelete");
const zonaHandleDelete = admin.slice(desdeDelete, admin.indexOf("// ─── IMPORTAR VALOR", desdeDelete));
check("handleDelete también avisa (baja → sale del stock)", /avisarProductoEditado\(\{[\s\S]{0,300}accion: "eliminado"/.test(zonaHandleDelete));

// ── 3. STOCK GENERAL escucha y refresca solo ──
console.log("\n[3] src/components/viza/stock-general.tsx (STOCK GENERAL escucha)");
const stock = leer("src/components/viza/stock-general.tsx");
check("import suscribirseAEdicionesProductos", /import \{ suscribirseAEdicionesProductos \} from "@\/lib\/replicacion-productos"/.test(stock));
check("se suscribe en un useEffect con cleanup", /const dejarDeEscuchar = suscribirseAEdicionesProductos\(\(\) => \{\s*recargarRef\.current\(\);\s*\}\);\s*return dejarDeEscuchar;/.test(stock));
check("ref fresco: recargarRef.current = cargarDatos", /recargarRef\.current = cargarDatos;/.test(stock));
check("cinturón extra: refresca al volver a la pestaña (focus)", /window\.addEventListener\("focus", recargarSiVisible\)/.test(stock));
check("cinturón extra: refresca al volver a la pestaña (visibilitychange)", /document\.addEventListener\("visibilitychange", recargarSiVisible\)/.test(stock));
check("no refresca si la pestaña está OCULTA (sin GET al vicio)", /if \(typeof document !== "undefined" && document\.hidden\) return;/.test(stock));
check("fetch del stock con cache no-store", /fetch\(`\/api\/stock\/general\?\$\{params\.toString\(\)\}`, \{\s*cache: "no-store",\s*\}\)/.test(stock));

// ── 4. La API de stock responde SIEMPRE en vivo ──
console.log("\n[4] src/app/api/stock/general/route.ts (API en vivo)");
const api = leer("src/app/api/stock/general/route.ts");
check("export const dynamic = force-dynamic", /export const dynamic = "force-dynamic";/.test(api));

// ── 5. Nada de lo anterior rompe la vista (solo lectura intacta) ──
console.log("\n[5] Vista STOCK GENERAL sigue SOLO LECTURA y con las columnas de la Base (T124)");
check("sin PUT/PATCH/POST de productos desde la vista stock", !/(method:\s*["'](PUT|PATCH)["'])/.test(stock));
check("COLS_BASE sigue con las 10 columnas de la Base en orden", (() => {
  const m = stock.match(/const COLS_BASE[\s\S]*?\n\];/);
  if (!m) return false;
  const keys = [...m[0].matchAll(/key: "(\w+)"/g)].map((x) => x[1]);
  const esperado = ["fabricante", "categoria", "subGrupo", "marca", "tipo", "modelo", "capacidad", "cores", "referencia", "name"];
  return JSON.stringify(keys) === JSON.stringify(esperado);
})());

console.log(`\n═══ RESULTADO: ${ok} OK · ${fail} FALLO ═══`);
if (fail > 0) {
  console.error("\nT126: hay checks en rojo — revisar arriba.\n");
  process.exit(1);
}
console.log("T126: LA BASE replica al instante en STOCK GENERAL — todo verificado.\n");
