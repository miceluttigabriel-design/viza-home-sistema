// ─────────────────────────────────────────────────────────────────────
// Task 127 — Verificación: Módulo de Distribución Inteligente de
// Inventario + botón IR A STOCK GENERAL solo para viza@viza.com.py.
//
// Uso: bun scripts/t127-verificar-distribucion.mjs  (o node)
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

console.log("\n=== T127 · DISTRIBUCIÓN INTELIGENTE + ACCESO VILMAR ===\n");

// ── 1. Schema: tabla aparte ProductStockIdeal (patrón StockSucursal) ──
console.log("[1] prisma/schema.prisma");
const schema = leer("prisma/schema.prisma");
check("model ProductStockIdeal existe", /model ProductStockIdeal \{/.test(schema));
check("campos productId/sucursal/ideal", /model ProductStockIdeal \{[\s\S]*?productId[\s\S]*?sucursal[\s\S]*?ideal[\s\S]*?\n\}/.test(schema));
check("UNIQUE(productId, sucursal) + índice", /model ProductStockIdeal \{[\s\S]*?@@unique\(\[productId, sucursal\]\)[\s\S]*?@@index\(\[sucursal\]\)[\s\S]*?\n\}/.test(schema));

// ── 2. Lib stock-ideal.ts (tabla auto-gestionada, best-effort) ──
console.log("\n[2] src/lib/stock-ideal.ts");
const LIB = "src/lib/stock-ideal.ts";
check("existe", existsSync(join(RAIZ, LIB)));
if (existsSync(join(RAIZ, LIB))) {
  const lib = leer(LIB);
  check("ensureTablaProductStockIdeal con CREATE TABLE IF NOT EXISTS", /CREATE TABLE IF NOT EXISTS "ProductStockIdeal"/.test(lib));
  check("leerIdeales (solo ideal > 0)", /export async function leerIdeales/.test(lib) && /ideal: \{ gt: 0 \}/.test(lib));
  check("productIdsConIdeal (distinct)", /export async function productIdsConIdeal/.test(lib) && /distinct: \["productId"\]/.test(lib));
  check("guardarIdeales upsert + borra ideal 0", /export async function guardarIdeales/.test(lib) && /productStockIdeal\.upsert/.test(lib) && /deleteMany/.test(lib));
}

// ── 3. Lib acceso-stock-general.ts (SOLO viza@viza.com.py) ──
console.log("\n[3] src/lib/acceso-stock-general.ts");
const ACC = "src/lib/acceso-stock-general.ts";
check("existe", existsSync(join(RAIZ, ACC)));
if (existsSync(join(RAIZ, ACC))) {
  const acc = leer(ACC);
  check("lista con SOLO viza@viza.com.py", /EMAILS_ACCESO_STOCK_GENERAL = \["viza@viza\.com\.py"\]/.test(acc));
  check("puedeIrAStockGeneral por email", /export function puedeIrAStockGeneral/.test(acc));
}

// ── 4. API /api/stock/ideal (configurar el ideal) ──
console.log("\n[4] src/app/api/stock/ideal/route.ts");
const ideal = leer("src/app/api/stock/ideal/route.ts");
check("GET lista productos con saldos + ideales + cores", /export async function GET/.test(ideal) && /leerSaldosSucursal/.test(ideal) && /leerIdeales/.test(ideal) && /leerCores/.test(ideal));
check("PUT guarda tanda (solo admin/supremo)", /export async function PUT/.test(ideal) && /supremo_admin/.test(ideal));
check("bloquea usuarios de consulta (solo lectura)", /esEmailSoloLectura/.test(ideal));
check("force-dynamic", /export const dynamic = "force-dynamic";/.test(ideal));

// ── 5. API /api/stock/distribucion (el algoritmo) ──
console.log("\n[5] src/app/api/stock/distribucion/route.ts");
const dist = leer("src/app/api/stock/distribucion/route.ts");
check("autoriza supremo/admin + puedeIrAStockGeneral (Vilmar)", /puedeIrAStockGeneral\(email\)/.test(dist));
check("calcula excedente = saldo − ideal", /saldo - idealRedondeado/.test(dist));
check("calcula déficit = ideal − saldo", /idealRedondeado - saldo/.test(dist));
check("CANTIDAD = min(excedente, déficit) — greedy", /Math\.min\(disponible, faltaRestante\)/.test(dist));
check("nodos sin ideal NO participan (seguridad)", /continue;/.test(dist) && /NO participa/i.test(dist));
check("sin órdenes de compra: faltante queda REPORTADO", /faltanteNoCubierto/.test(dist) && /sucursalesConFaltante/.test(dist));
check("fila con COD/PRODUCTO/COLOR/TIPO/ORIGEN/DESTINO/CANTIDAD", /sku[\s\S]*producto[\s\S]*color[\s\S]*tipo[\s\S]*origen[\s\S]*destino[\s\S]*cantidad/.test(dist.slice(dist.indexOf("interface FilaTransferencia"), dist.indexOf("export async function"))));
check("COLOR sale de la columna CORES de la Base", /leerCores/.test(dist));
check("force-dynamic", /export const dynamic = "force-dynamic";/.test(dist));

// ── 6. UI en STOCK GENERAL (botón + modal de 2 modos) ──
console.log("\n[6] src/components/viza/stock-general.tsx");
const stock = leer("src/components/viza/stock-general.tsx");
check("botón DISTRIBUCIÓN INTELIGENTE en el header", /DISTRIBUCIÓN INTELIGENTE/.test(stock) && /abrirDistribucion/.test(stock));
check("modal con tabla COD · PRODUCTO · COLOR · ORIGEN · DESTINO · CANTIDAD", /COD[\s\S]*PRODUCTO[\s\S]*COLOR[\s\S]*SUCURSAL ORIGEN \(SOBRA\)[\s\S]*SUCURSAL DESTINO \(FALTA\)[\s\S]*CANTIDAD A TRANSFERIR/.test(stock));
check("pantalla CONFIGURAR STOCK IDEAL con inputs por nodo", /CONFIGURAR STOCK IDEAL/.test(stock) && /valorIdeal\(/.test(stock) && /setValorIdeal\(/.test(stock));
check("GUARDAR IDEALES → PUT + recalcula reporte", /method: "PUT"/.test(stock) && /guardarIdealesHandler/.test(stock) && /cargarDistribucion\(\)/.test(stock));
check("IMPORTAR INVENTARIO sigue solo supremo", /esSupremo && \(\s*<>[\s\S]*IMPORTAR INVENTARIO/.test(stock));
check("ORQUESTADOR solo supremo (ahora también exige la prop)", /esSupremo && onGoOrquestador/.test(stock));
check("BASE solo si llega onGoBase (Vilmar colaborador no lo ve)", /\{onGoBase && \(/.test(stock));
check("DISTRIBUCIÓN visible para supremo Y habilitado (no gated por esSupremo)", stock.indexOf("abrirDistribucion") < stock.indexOf("esSupremo && ("));

// ── 7. Botón IR A STOCK GENERAL — SOLO Vilmar ──
console.log("\n[7] Botón IR A STOCK GENERAL (solo viza@viza.com.py)");
const admin = leer("src/components/viza/admin-panel.tsx");
const sales = leer("src/components/viza/sales-panel.tsx");
const page = leer("src/app/page.tsx");
check("admin-panel: prop onGoStock + botón gated", /onGoStock\?: \(\) => void;/.test(admin) && /\{onGoStock && \(/.test(admin));
check("sales-panel: prop onGoStock + botón gated", /onGoStock\?: \(\) => void;/.test(sales) && /\{onGoStock && \(/.test(sales));
check("page.tsx: importa puedeIrAStockGeneral", /import \{ puedeIrAStockGeneral \} from "@\/lib\/acceso-stock-general";/.test(page));
check("page.tsx: vista stock SOLO con verStockGeneral (2 ramas)", (page.match(/view === "stock" && verStockGeneral/g) || []).length === 2);
check("page.tsx: pasa onGoStock solo si verStockGeneral", (page.match(/verStockGeneral \? \(\) => setAdminView\("stock"\) : undefined/g) || []).length === 2);

// ── 8. Nada del sistema se rompió ──
console.log("\n[8] Preservado del sistema");
check("Task 126 replicación intacta en stock-general", /suscribirseAEdicionesProductos/.test(stock));
check("Task 124 COLS_BASE intacta (10 columnas de la Base)", (() => {
  const m = stock.match(/const COLS_BASE[\s\S]*?\n\];/);
  if (!m) return false;
  const keys = [...m[0].matchAll(/key: "(\w+)"/g)].map((x) => x[1]);
  return JSON.stringify(keys) === JSON.stringify(["fabricante", "categoria", "subGrupo", "marca", "tipo", "modelo", "capacidad", "cores", "referencia", "name"]);
})());
check("Vista stock general sigue SOLO LECTURA de productos (el único PUT es el de IDEALES)", (() => {
  const puts = (stock.match(/method: "PUT"/g) || []).length;
  const putsIdeales = (stock.match(/fetch\("\/api\/stock\/ideal", \{\s*method: "PUT"/g) || []).length;
  const hayPatch = /method: "PATCH"/.test(stock);
  return hayPatch === false && puts === putsIdeales && puts === 1;
})());
check("sin db push forzado (tabla se crea sola con SQL idempotente)", /CREATE TABLE IF NOT EXISTS/.test(leer(LIB)));

console.log(`\n═══ RESULTADO: ${ok} OK · ${fail} FALLO ═══`);
if (fail > 0) {
  console.error("\nT127: hay checks en rojo — revisar arriba.\n");
  process.exit(1);
}
console.log("T127: distribución inteligente + acceso Vilmar verificados.\n");
