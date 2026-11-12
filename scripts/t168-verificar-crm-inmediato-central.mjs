#!/usr/bin/env node
// ============================================================
// T168 — VERIFICACIÓN: CRM INMEDIATO + CENTRAL FUERA DEL RANKING
// Pedido del dueño: "todos los presupuestos generados ... con excepción
// de los usuarios de central sean actualizados de inmediato en el CRM
// ... después de emitir el presupuesto ... de cada usuario menos los
// usuarios de Central".
//   · Todo presupuesto emitido (carrito y los 4 PDFs) queda registrado
//     en Quote aunque el número secuencial choque con el de otro
//     vendedor (la numeración es por usuario, la columna es @unique).
//   · El CRM se refresca solo (5 s + al volver a la ventana) sin cerrar
//     y volver a abrir el modal.
//   · CENTRAL no aparece en el ranking, no suma al total y sus pedidos
//     especiales tampoco se listan.
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t168-verificar-crm-inmediato-central.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const lib = leer("src/lib/guardar-quote.ts");
const apiQuotes = leer("src/app/api/quotes/route.ts");
const pdf = leer("src/app/api/quotes/pdf/route.ts");
const safra = leer("src/app/api/quotes/safra-pdf/route.ts");
const cheque = leer("src/app/api/quotes/cheque-pdf/route.ts");
const mayorista = leer("src/app/api/quotes/mayorista-pdf/route.ts");
const ranking = leer("src/app/api/crm/ranking/route.ts");
const panel = leer("src/components/viza/admin-panel.tsx");
const sucursal = leer("src/lib/sucursal-usuario.ts");
const schema = leer("prisma/schema.prisma");

console.log("═══ T168 · CRM INMEDIATO + CENTRAL FUERA DEL RANKING ═══");

// ── 1. La causa raíz: numeración por usuario vs quoteNumber @unique ──
console.log("\n[1] Causa raíz (numeración por usuario / unique global)");
check("Quote.quoteNumber sigue siendo @unique GLOBAL (no se tocó el schema)",
  /quoteNumber\s+String\s+@unique/.test(schema));
check("QuoteSequence es por (plan, userId): dos vendedores pueden tener el mismo número",
  /@@unique\(\[plan, userId\]\)/.test(schema) || /plan_userId/.test(schema));

// ── 2. Helper de emisión: número único con sufijo interno ──
console.log("\n[2] guardar-quote.ts: registro garantizado de la emisión");
check("existe crearQuoteConNumeroUnico()", /export async function crearQuoteConNumeroUnico/.test(lib));
check("reintenta SOLO ante P2002 (duplicado), no ante cualquier error",
  /esNumeroDuplicado[\s\S]*?P2002/.test(lib));
check("hasta 3 candidatos: original, +usuario y +usuario+marca de tiempo",
  /candidatos = \[\s*numeroBase,[\s\S]*?numeroBase[\s\S]*?numeroBase/.test(lib));
check("el sufijo NO cambia el prefijo del plan (PRESUPUESTO/MAYOR/SAFRA/CHEQUE)",
  /SEPARADOR_SUFIJO/.test(lib) && !/numeroBase\.toUpperCase\(\).*replace/.test(lib));
check("existe resolverUserIdEmision() (respaldo por email si el JWT no trae id)",
  /export async function resolverUserIdEmision/.test(lib));
check("resolverUserIdEmision busca el usuario por email en minúscula",
  /findUnique\(\{[\s\S]*?where: \{ email \}/.test(lib) && /toLowerCase\(\)/.test(lib));
check("resolverUserIdEmision NUNCA lanza (catch devuelve null)", /catch \{[\s\S]*?return null;/.test(lib));
check("guardarQuoteEmitido acepta userEmail", /guardarQuoteEmitido[\s\S]*?userEmail\?: string \| null/.test(lib));
check("guardarQuoteEmitido resuelve el userId ANTES de crear la fila",
  /const userId = await resolverUserIdEmision\(params\.userId, params\.userEmail\)/.test(lib));
check("si no hay usuario avisa en el log pero registra igual",
  /console\.warn\([\s\S]*?sin usuario identificable/.test(lib));
check("crea la fila con el número del helper", /crearQuoteConNumeroUnico\(params\.quoteNumber, userId/.test(lib));
check("conserva status emitida_contado (Task 111)", /contadoSolo \? "emitida_contado" : "emitida"/.test(lib));

// ── 3. Carrito: mismo helper y número visible intacto ──
console.log("\n[3] POST /api/quotes (carrito)");
check("resuelve el usuario por id + email", /resolverUserIdEmision\([\s\S]*?session\.user\?\.email/.test(apiQuotes));
check("genera el secuencial con el userId YA resuelto",
  /nextSequentialQuoteNumber\("PRESUPUESTO", userId\)/.test(apiQuotes));
check("crea la Quote con crearQuoteConNumeroUnico()", /crearQuoteConNumeroUnico\(quoteNumber, userId/.test(apiQuotes));
check("la respuesta mantiene el número VISIBLE (sin sufijo interno)",
  /quote: \{ \.\.\.quote, quoteNumber \}/.test(apiQuotes));

// ── 4. Los 4 PDFs pasan el email de la sesión ──
console.log("\n[4] Emisión de PDFs: userEmail en los 4 planes");
for (const [nombre, src] of [
  ["PRESUPUESTO", pdf],
  ["SAFRA", safra],
  ["CHEQUE", cheque],
  ["MAYORISTA", mayorista],
]) {
  check(`${nombre}: guardarQuoteEmitido recibe userEmail: session.user?.email`,
    /userEmail: session\.user\?\.email/.test(src));
  check(`${nombre}: sigue guardando el userId de la sesión`,
    /userId: \(session\.user as any\)\?\.id/.test(src));
}

// ── 5. CRM: CENTRAL afuera del ranking y del total ──
console.log("\n[5] /api/crm/ranking: exclusión de CENTRAL");
check("importa MAPA_SUCURSAL_EXCEL (fallback antes de que exista UsuarioSucursal)",
  /MAPA_SUCURSAL_EXCEL/.test(ranking));
check("sucursalDe() usa la asignación guardada y, si falta, la planilla",
  /const sucursalDe[\s\S]*?mapaSuc\.get\(key\) \|\| MAPA_SUCURSAL_EXCEL\[key\]/.test(ranking));
check("usersCrm excluye CENTRAL", /usersCrm = users\.filter\([\s\S]*?sucursalDe\(u\.email\) !== "CENTRAL"/.test(ranking));
check("el ranking se arma SOLO con usersCrm", /const ranking = usersCrm/.test(ranking));
check("emailToUserId (pedidos especiales) solo con usersCrm", /for \(const u of usersCrm\)/.test(ranking));
check("los pedidos especiales de CENTRAL tampoco se listan",
  /listarPresupuestosCrm\(\{[\s\S]*?\.filter\(\(p\) => sucursalDe\(p\.vendedorEmail\) !== "CENTRAL"\)/.test(ranking));
check("el total general sale del ranking ya filtrado",
  /totalGeneral: ranking\.reduce\(\(acc, r\) => acc \+ r\.total, 0\)/.test(ranking));
check("ya NO se usa el conteo global que incluía a CENTRAL",
  !/totalGeneralQuotes/.test(ranking) && !/totalEspeciales/.test(ranking));
check("la vista del encargado mantiene su total recortado por sucursal",
  /const totalSucursal = rankingSucursal\.reduce\(/.test(ranking));
check("SUCURSALES_USUARIO se sigue devolviendo para el select de asignación",
  /sucursales: SUCURSALES_USUARIO/.test(ranking));
check("SUCURSALES_USUARIO sigue incluyendo CENTRAL (asignación manual intacta)",
  /export const SUCURSALES_USUARIO = \["CENTRAL", \.\.\.SUCURSALES_VIZA\]/.test(sucursal));

// ── 6. Panel: refresco automático + pills sin CENTRAL ──
console.log("\n[6] Modal CRM: refresco inmediato y filtros");
check("existe cargarCrm(silent) reutilizable", /const cargarCrm = useCallback\(async \(silent = false\)/.test(panel));
check("abrirCrm usa cargarCrm(false)", /await cargarCrm\(false\)/.test(panel));
check("refresca SOLO cada 5 segundos mientras el modal está abierto",
  /setInterval\([\s\S]*?\}, 5000\)/.test(panel));
check("también refresca al volver a la ventana (focus)", /addEventListener\("focus"/.test(panel));
check("el refresco automático es silencioso (no spinner ni toast repetido)",
  /if \(!silent\) setCrmLoading\(true\)/.test(panel) && /if \(!silent\) toast\.error/.test(panel));
check("pausa el refresco mientras se guarda una sucursal", /if \(!crmGuardandoSuc\) void cargarCrm\(true\)/.test(panel));
check("las pills de filtro excluyen CENTRAL",
  /const filtros = \["GENERAL", \.\.\.crmSucursales\.filter\(\(s\) => s !== "CENTRAL"\)\]/.test(panel));
check("el select de asignación SIGUE ofreciendo CENTRAL (usa crmSucursales)",
  /\{crmSucursales\.map\(\(s\) => \(/.test(panel));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
