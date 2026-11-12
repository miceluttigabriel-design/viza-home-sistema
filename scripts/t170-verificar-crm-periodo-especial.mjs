#!/usr/bin/env node
// ============================================================
// T170 — VERIFICACIÓN: CRM POR PERÍODO + FILTRO PEDIDO ESPECIAL
// Pedidos del dueño:
//   · "el plan pedido especial quiero como filtro dentro del CRM ...
//     no quiero el historial allá abajo, queda difícil de visualizar".
//   · "dentro del CRM queremos consultar por fecha dentro de cada mes
//     cuántos presupuestos se emitirán ... y ya dejé el filtro de consulta
//     para ver el total de presupuestos del mes pasado".
// Checks estáticos sobre los archivos.
// Correr:  node scripts/t170-verificar-crm-periodo-especial.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const crm = leer("src/components/viza/crm-panel.tsx");
const api = leer("src/app/api/crm/ranking/route.ts");

console.log("═══ T170 · CRM POR PERÍODO + FILTRO PEDIDO ESPECIAL ═══");

// ── 1. Filtro PEDIDO ESPECIAL dentro del CRM ──
console.log("\n[1] PEDIDO ESPECIAL como filtro de plan");
check("el filtro de plan incluye ESPECIAL",
  /"TODOS",\s*"CUOTA",\s*"CONTADO",\s*"MAYORISTA",\s*"SAFRA",\s*"CHEQUE",\s*"ESPECIAL"/.test(crm));
check("la etiqueta visible dice PEDIDO ESPECIAL",
  /p === "ESPECIAL" \? "PEDIDO ESPECIAL" : p/.test(crm));
check("las píldoras de plan usan la etiqueta visible",
  /CRM_PLANES\.map\(\(pl\)[\s\S]*?labelPlan\(pl\)/.test(crm));
check("la API entrega porPlan.ESPECIAL",
  /rec\.ESPECIAL = Number\(e\.count\)/.test(api));
check("ESPECIAL cuenta TODOS los pedidos especiales del período",
  /for \(const e of especialesTotales\)[\s\S]*?rec\.ESPECIAL/.test(api));

// ── 2. Se eliminó el historial de abajo ──
console.log("\n[2] Ya no hay tabla de historial debajo del ranking");
check("no existe la sección PEDIDOS ESPECIALES EMITIDOS",
  !/PEDIDOS ESPECIALES EMITIDOS/.test(crm));
check("no queda el estado pedidos ni pedidosVista",
  !/setPedidos/.test(crm) && !/pedidosVista/.test(crm));
check("no queda la interface CrmPedidoEspecial",
  !/interface CrmPedidoEspecial/.test(crm));

// ── 3. Filtro por período (mes pasado por defecto) ──
console.log("\n[3] Consulta por fecha dentro de cada mes");
check("existe rangoMes() para calcular el mes calendario",
  /const rangoMes = \(offset: number\)/.test(crm));
check("arranca en el MES PASADO", /useState\(\(\) => rangoMes\(-1\)\)/.test(crm));
check("el estado inicial marca el preset MES PASADO",
  /useState<"MES_PASADO" \| "MES_ACTUAL" \| "TODO" \| "OTRO">\(\s*"MES_PASADO"/.test(crm));
check("tiene atajos MES PASADO / MES ACTUAL / TODO",
  /aplicarPreset\("MES_PASADO"\)/.test(crm) &&
    /aplicarPreset\("MES_ACTUAL"\)/.test(crm) &&
    /aplicarPreset\("TODO"\)/.test(crm));
check("tiene inputs de fecha DESDE y HASTA",
  /type="date"/.test(crm) && /DESDE/.test(crm) && /HASTA/.test(crm));
check("el pedido a la API manda desde y hasta",
  /params\.set\("desde", desde\)/.test(crm) && /params\.set\("hasta", hasta\)/.test(crm));
check("muestra el TOTAL DEL PERÍODO",
  /TOTAL DEL PERÍODO: \{totalGeneral\}/.test(crm));
check("el resumen del pie muestra el período elegido",
  /\{etiquetaPeriodo\}/.test(crm));

// ── 4. La API respeta el período en TODOS los totales ──
console.log("\n[4] /api/crm/ranking: filtro de fechas en el servidor");
check("lee desde/hasta de la URL", /searchParams\.get\("desde"\)/.test(api) &&
  /searchParams\.get\("hasta"\)/.test(api));
check("valida el formato YYYY-MM-DD", /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(api));
check("interpreta las fechas en hora de Paraguay (UTC-3)",
  /T00:00:00\.000-03:00/.test(api) && /T23:59:59\.999-03:00/.test(api));
check("filtra los QUOTES emitidos por fecha",
  /db\.quote\.groupBy\(\{[\s\S]*?where: filtroFecha/.test(api));
check("filtra los APROBADOS por fecha",
  /where: \{ status: "aprobada", \.\.\.filtroFecha \}/.test(api));
check("filtra el desglose por plan por fecha",
  /db\.quote\.findMany\(\{\s*where: filtroFecha/.test(api));
check("los PEDIDOS ESPECIALES se filtran por fecha en SQL",
  /filtroFechaSql/.test(api) &&
    /["']createdAt["'] >= \$\{desdeFecha\}/.test(api) &&
    /["']createdAt["'] <= \$\{hastaFecha\}/.test(api));
check("el total general del período sale del ranking ya filtrado",
  /totalGeneral: ranking\.reduce\(\(acc, r\) => acc \+ r\.total, 0\)/.test(api));
check("sin fechas se mantiene todo el histórico",
  /const hayPeriodo = !!\(desdeFecha \|\| hastaFecha\)/.test(api));
check("el alcance por usuario/CENTRAL sigue intacto",
  /esVistaPersonal = !isAdmin && !esConsulta && !sucursalEncargado/.test(api) &&
    /usersCrm = users\.filter\([\s\S]*?sucursalDe\(u\.email\) !== "CENTRAL"/.test(api));

console.log(`\n═══ Resultado: ${ok} OK · ${fallo} FALLO ═══`);
process.exit(fallo === 0 ? 0 : 1);
