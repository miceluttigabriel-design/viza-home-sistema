#!/usr/bin/env node
// ============================================================
// T171 — VERIFICACIÓN: STOCK GENERAL NO DISPONIBLE PARA USUARIOS COMUNES
// Pedido del dueño: "el stock general no debe estar disponible para
// usuarios comunes ok amigo".
//
// Regla aplicada:
//   · SUPREMO / ADMIN / VIP / ESPECIAL → siguen entrando a STOCK GENERAL.
//   · COMÚN                           → cuadro visible pero BLOQUEADO y la
//                                       API /api/stock/general responde 403.
// El bloqueo se valida en el SERVIDOR (no solo en la pantalla).
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t171-verificar-stock-general-comun.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const accesos = leer("src/lib/acceso-modulos.ts");
const page = leer("src/app/page.tsx");
const orq = leer("src/components/viza/orquestador.tsx");
const api = leer("src/app/api/stock/general/route.ts");

console.log("═══ T171 · STOCK GENERAL SOLO PARA USUARIOS AUTORIZADOS ═══");

// ── 1. Matriz de accesos ──
console.log("\n[1] Matriz de accesos (client-safe)");
check("el COMÚN queda definido como 'ni supremo/admin/VIP/ESPECIAL'",
  /const esComun = !esSupremo && !esAdmin && !esVip && !esEspecial/.test(accesos));
check("puedeVerStock ya NO es true para todos",
  !/puedeVerStock: true/.test(accesos));
check("puedeVerStock queda habilitado salvo para el COMÚN",
  /puedeVerStock: !esComun/.test(accesos));
check("el archivo documenta la Task 171",
  /Task 171/.test(accesos));
check("ESPECIAL sigue clasificado aparte del COMÚN",
  /role === "especial" \|\| !!ENCARGADOS_SUCURSAL\[email\]/.test(accesos));

// ── 2. Pantalla: el Orquestador no entrega la navegación al COMÚN ──
console.log("\n[2] Orquestador y guarda de vistas");
check("page.tsx pasa onGoStock solo si puedeVerStock",
  /onGoStock=\{accesos\.puedeVerStock \? \(\) => irA\("stock"\) : undefined\}/.test(page));
check("la vista 'stock' sigue protegida por la guarda de permisos",
  /pedida === "stock" && accesos\.puedeVerStock/.test(page) &&
    /permitida \? pedida : "orquestador"/.test(page));
check("el Orquestador acepta onGoStock opcional",
  /onGoStock\?: \(\) => void/.test(orq));
check("StockCard acepta onClick opcional",
  /function StockCard\(\{ onClick \}: \{ onClick\?: \(\) => void \}\)/.test(orq));
check("StockCard se muestra BLOQUEADO sin permiso",
  /bloqueado=\{!onClick\}/.test(orq));
check("el cuadro bloqueado avisa RESTRINGIDO en vez de SYSTEM ONLINE",
  /RESTRINGIDO/.test(orq) && /onClick \?[\s\S]*?SYSTEM ONLINE[\s\S]*?: \(/.test(orq));
check("se renderiza igual en el diagrama y en celular (sin permiso no rompe)",
  /place\(R\.stock\)[\s\S]*?<StockCard onClick=\{onGoStock\}/.test(orq) &&
    /lg:hidden[\s\S]*?<StockCard onClick=\{onGoStock\}/.test(orq));

// ── 3. Servidor: /api/stock/general rechaza al COMÚN ──
console.log("\n[3] API /api/stock/general: bloqueo en el servidor");
check("re-valida con la misma matriz accesosDeUsuario()",
  /import \{ accesosDeUsuario \} from "@\/lib\/acceso-modulos"/.test(api) &&
    /const accesos = accesosDeUsuario\(\{/.test(api));
check("devuelve 403 si !puedeVerStock",
  /if \(!accesos\.puedeVerStock\)[\s\S]*?status: 403/.test(api));
check("el 403 se resuelve después del login y antes de leer datos",
  api.indexOf("accesosDeUsuario({") < api.indexOf("new URL(req.url)"));
check("sigue exigiendo sesión (401 sin login)",
  /if \(!session\)[\s\S]*?status: 401/.test(api));
check("el endpoint sigue siendo SOLO LECTURA",
  !/export async function (POST|PUT|PATCH|DELETE)/.test(api));

// ── 4. Lo que NO se toca ──
console.log("\n[4] Accesos que se mantienen");
check("la Base sigue con su regla propia (supremo/admin/VIP)",
  /puedeVerBase: esSupremo \|\| esAdminRol \|\| esVip/.test(accesos));
check("el CRM sigue habilitado para todos (con recorte del servidor)",
  /puedeVerCrm: true/.test(accesos));
check("el Cotizador sigue habilitado para todos",
  /puedeVerCotizador: true/.test(accesos));
check("los demás endpoints de stock ya tenían su propio candado",
  /puedeIrAStockGeneral/.test(leer("src/app/api/stock/distribucion/route.ts")) &&
    /puedeUsarEncargadoCompra/.test(leer("src/app/api/stock/compra/route.ts")));
check("la importación de planilla sigue siendo solo del supremo",
  /role !== "supremo_admin"/.test(leer("src/app/api/products/import-stock/apply/route.ts")));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
