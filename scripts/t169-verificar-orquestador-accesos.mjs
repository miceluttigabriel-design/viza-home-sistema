#!/usr/bin/env node
// ============================================================
// T169 — VERIFICACIÓN: ORQUESTADOR PARA TODOS + CRM COMO MÓDULO
// Pedido del dueño:
//   · "quiero un cuadro del CRM abajo de COTIZADOR y de ahi vamos
//     eliminar el buton CRM del panel de ventas de usuarios especiales
//     y también de la Base".
//   · "el ORQUESTADOR queda visible para todos los usuarios".
//   · ESPECIAL (4 encargados): Cotizador + CRM de SU sucursal + Stock.
//   · COMÚN: Cotizador + CRM con SOLO sus propios presupuestos.
//     Task 171 (pedido del dueño): el COMÚN ya NO tiene Stock General.
//   · Los demás módulos quedan VISIBLES pero BLOQUEADOS.
//   · VIP: CRM general SOLO LECTURA + Base SOLO LECTURA.
// El recorte del CRM de un COMÚN se hace EN EL SERVIDOR.
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t169-verificar-orquestador-accesos.mjs
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
const crm = leer("src/components/viza/crm-panel.tsx");
const api = leer("src/app/api/crm/ranking/route.ts");
const admin = leer("src/components/viza/admin-panel.tsx");
const ventas = leer("src/components/viza/sales-panel.tsx");

console.log("═══ T169 · ORQUESTADOR PARA TODOS + CRM COMO MÓDULO ═══");

// ── 1. Matriz única de accesos (client-safe) ──
console.log("\n[1] src/lib/acceso-modulos.ts: una sola fuente de verdad");
check("existe accesosDeUsuario()", /export function accesosDeUsuario/.test(accesos));
check("no toca Prisma ni la base (solo listas estáticas)",
  !/from "\.\/prisma"/.test(accesos) && !/@prisma\/client/.test(accesos));
check("prioridad Supremo > VIP > Admin > ESPECIAL > COMÚN",
  /esSupremo\s*\?\s*"SUPREMO"[\s\S]*?esVip[\s\S]*?"VIP"[\s\S]*?esAdminRol[\s\S]*?"ADMIN"[\s\S]*?esEspecial[\s\S]*?"ESPECIAL"[\s\S]*?"COMÚN"/.test(accesos));
check("modoCrm = general para supremo/admin/VIP",
  /esSupremo \|\| esAdminRol \|\| esVip[\s\S]*?\? "general"/.test(accesos));
check("modoCrm = sucursal para ESPECIAL", /esEspecial[\s\S]*?\? "sucursal"/.test(accesos));
check("modoCrm = personal para COMÚN (fallback final)", /: "personal"/.test(accesos));
check("Cotizador y CRM habilitados para TODOS; Stock NO para el COMÚN (Task 171)",
  /puedeVerCotizador: true/.test(accesos) &&
    /puedeVerCrm: true/.test(accesos) &&
    /puedeVerStock: !esComun/.test(accesos));
check("Base reservada a supremo/admin/VIP",
  /puedeVerBase: esSupremo \|\| esAdminRol \|\| esVip/.test(accesos));
check("ESPECIAL y COMÚN NO pueden asignar sucursal en el CRM",
  /puedeAsignarSucursalCrm: \(esSupremo \|\| esAdminRol\) && !esVip/.test(accesos));
check("CRM de VIP/ESPECIAL/COMÚN es solo lectura",
  /crmSoloLectura: esVip \|\| esEspecial \|\| esComun/.test(accesos));
check("Base del VIP es solo lectura", /baseSoloLectura: esVip/.test(accesos));
check("GDA/Gestión sigue solo para el supremo", /puedeVerGestion: esSupremo/.test(accesos));
check("ESPECIAL se detecta por rol O por la lista de encargados",
  /role === "especial" \|\| !!ENCARGADOS_SUCURSAL\[email\]/.test(accesos));

// ── 2. Orquestador: inicio de todos + cuadro CRM debajo de COTIZADOR ──
console.log("\n[2] Orquestador: cuadro CRM debajo del COTIZADOR");
check("usa la matriz compartida accesosDeUsuario()",
  /import \{ accesosDeUsuario \} from "@\/lib\/acceso-modulos"/.test(orq));
check("prop onGoCrm obligatoria", /onGoCrm: \(\) => void/.test(orq));
check("existe CrmCard", /function CrmCard/.test(orq));
check("el CRM está debajo del COTIZADOR en el panel de módulos",
  /crm: \{ x: 36, y: 590, w: 358, h: 76 \}/.test(orq) &&
    /cotiz: \{ x: 222, y: 498, w: 172, h: 76 \}/.test(orq));
check("el lienzo crece para que entre el CRM", /const H = 940/.test(orq));
check("los módulos se conectan con el núcleo (flujo Módulos ↔ Central)",
  /Módulos ↔ Central/.test(orq) && /place\(R\.crm\)/.test(orq));
check("el CRM se renderiza en el diagrama", /place\(R\.crm\)[\s\S]{0,80}CrmCard/.test(orq));
check("el CRM se renderiza también en celular/tablet",
  /lg:hidden[\s\S]*?<CrmCard onClick=\{onGoCrm\}/.test(orq));
check("DISTRIBUCIÓN usa onGoDistribucion (sin caer a Stock para todos)",
  /DistriCard onClick=\{onGoDistribucion\}/.test(orq) &&
    !/DistriCard onClick=\{onGoStock\}/.test(orq));
check("COMPRA usa onGoCompra (sin caer a Stock)",
  /CompraCard[\s\S]{0,120}onClick=\{onGoCompra\}/.test(orq) &&
    !/onGoCompra \|\| onGoStock/.test(orq));
check("las tarjetas bloqueadas se ven pero no se abren (SIN ACCESO)",
  /bloqueado\?: boolean/.test(orq) &&
    /SIN ACCESO/.test(orq) &&
    /bloqueado=\{!onClick\}/.test(orq));

// ── 3. page.tsx: aterrizaje en el Orquestador + vista CRM con guardas ──
console.log("\n[3] page.tsx: inicio unificado y guardas de acceso");
check("importa accesosDeUsuario", /import \{ accesosDeUsuario \} from "@\/lib\/acceso-modulos"/.test(page));
check("importa el módulo CRM", /import \{ CrmPanel \}/.test(page));
check("sin sesión navegada SIEMPRE arranca en el ORQUESTADOR",
  /adminView \?\? "orquestador"/.test(page));
check("existe la vista crm y renderiza CrmPanel",
  /"crm"/.test(page) && /<CrmPanel/.test(page));
check("el modo del CRM sale de la matriz (general/sucursal/personal)",
  /modo=\{accesos\.modoCrm\}/.test(page));
check("puedeAsignar y soloLectura salen de la matriz",
  /puedeAsignar=\{accesos\.puedeAsignarSucursalCrm\}/.test(page) &&
    /soloLectura=\{accesos\.crmSoloLectura\}/.test(page));
check("el CRM vuelve al ORQUESTADOR",
  /<CrmPanel[\s\S]*?onVolver=\{\(\) => irA\("orquestador"\)\}/.test(page));
check("una vista forzada sin permiso cae al ORQUESTADOR",
  /const permitida =/.test(page) && /permitida \? pedida : "orquestador"/.test(page));
check("la Base solo se pinta si puedeVerBase",
  /onGoBase=\{accesos\.puedeVerBase \?/.test(page));
check("Compras sigue limitada por la lista de emails",
  /verEncargadoCompra \? \(\) => irA\("compra"\) : undefined/.test(page));
check("GDA solo si esSupremo", /onGoGestion=\{accesos\.esSupremo \?/.test(page));
check("el Orquestador recibe onGoCrm para todos y onGoStock solo con permiso (Task 171)",
  /onGoCrm=\{\(\) => irA\("crm"\)\}/.test(page) &&
    /onGoStock=\{accesos\.puedeVerStock \? \(\) => irA\("stock"\) : undefined\}/.test(page));

// ── 4. Módulo CRM completo ──
console.log("\n[4] crm-panel.tsx: módulo de página completa");
check("tiene botón ORQUESTADOR para volver", /ORQUESTADOR/.test(crm) && /onVolver/.test(crm));
check("tres alcances: general / sucursal / personal",
  /"general" \| "sucursal" \| "personal"/.test(crm));
check("pide el ranking a la API sin caché",
  /fetch\(`\/api\/crm\/ranking\$\{qs \? `\?\$\{qs\}` : ""\}`,\s*\{\s*cache: "no-store"/.test(crm));
check("refresca cada 5 s y al volver a la ventana",
  /setInterval\([\s\S]*?5000\)/.test(crm) && /addEventListener\("focus"/.test(crm));
check("el modo personal muestra solo el conteo propio", /Mis presupuestos emitidos/.test(crm));
check("el modo general permite asignar sucursal solo con puedeAsignar",
  /puedeAsignar && !soloLectura/.test(crm));
check("las pills de sucursal excluyen CENTRAL",
  /sucursales\.filter\(\(s\) => s !== "CENTRAL"\)/.test(crm));

// ── 5. Servidor: alcance del CRM recortado en la API ──
console.log("\n[5] /api/crm/ranking: alcance validado en el servidor");
check("ya NO devuelve 403 a un usuario común",
  !/Sin permiso para el CRM/.test(api));
check("detecta la vista PERSONAL (sin admin, consulta ni encargado)",
  /esVistaPersonal = !isAdmin && !esConsulta && !sucursalEncargado/.test(api));
check("la vista personal arma la fila con los datos del PROPIO usuario",
  /const filaPropia = propio/.test(api));
check("la vista personal devuelve SOLO su fila",
  /ranking: filaPropia \? \[filaPropia\] : \[\]/.test(api));
check("la vista personal devuelve SOLO sus pedidos especiales",
  /pedidosPropios = todosPedidosEspeciales\.filter\(/.test(api));
check("la vista del encargado sigue recortada a su sucursal",
  /rankingSucursal = ranking\.filter\(\s*\(r\) => r\.sucursal === sucursalEncargado/.test(api));
check("CENTRAL sigue fuera del ranking y de los pedidos",
  /usersCrm = users\.filter\([\s\S]*?sucursalDe\(u\.email\) !== "CENTRAL"/.test(api) &&
    /pedidosEspeciales = todosPedidosEspeciales\.filter\(/.test(api));
check("la asignación de sucursal sigue siendo admin/supremo",
  /role !== "admin" && role !== "supremo_admin"/.test(leer("src/app/api/crm/sucursal/route.ts")));

// ── 6. Se quitaron los botones viejos de CRM ──
console.log("\n[6] La Base y el panel de ventas ya NO tienen botón CRM");
check("admin-panel: sin botón abrirCrm",
  !/abrirCrm/.test(admin) && !/onClick=\{abrirCrm\}/.test(admin));
check("admin-panel: sin modal crmOpen ni fetch del ranking",
  !/crmOpen/.test(admin) && !/\/api\/crm\/ranking/.test(admin));
check("sales-panel: sin botón abrirCrmSucursal",
  !/abrirCrmSucursal/.test(ventas) && !/crmAbierto/.test(ventas));
check("sales-panel: sin fetch del ranking",
  !/\/api\/crm\/ranking/.test(ventas));
check("sales-panel conserva el alcance del encargado para el PEDIDO ESPECIAL",
  /esEncargadoCrm/.test(ventas) && /sucursalEncargadoEfectiva/.test(ventas));
check("no quedaron restos del modal CRM en ninguno de los dos paneles",
  !/CRM · PRESUPUESTOS/.test(ventas) && !/MODAL CRM/.test(admin) && !/MODAL CRM/.test(ventas));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
