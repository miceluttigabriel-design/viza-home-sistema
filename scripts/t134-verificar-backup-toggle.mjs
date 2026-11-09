#!/usr/bin/env node
// ============================================================
// T134 — VERIFICACIÓN: EXPORTAR EXCEL solo Supremo + interruptor
// ON/OFF de las copias de seguridad + horarios 08:00 / 14:00 /
// 23:00 hora de Paraguay.
// Checks estáticos sobre los archivos (sin SMTP real).
// Correr:  node scripts/t134-verificar-backup-toggle.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const schema = leer("prisma/schema.prisma");
const config = leer("src/lib/config-backup.ts");
const permisos = leer("src/lib/permisos-backup.ts");
const apiConfig = leer("src/app/api/config-backup/route.ts");
const route = leer("src/app/api/cron/backup-excel/route.ts");
const instr = leer("src/instrumentation.ts");
const vercel = leer("vercel.json");
const mail = leer("src/lib/backup-mail.ts");
const admin = leer("src/components/viza/admin-panel.tsx");
const exportApi = leer("src/app/api/products/export/route.ts");

console.log("═══ T134 · EXPORTAR EXCEL SOLO SUPREMO + INTERRUPTOR BACKUP + HORARIOS ═══");

console.log("\n── A · EXPORTAR EXCEL solo Supremo (pedido del dueño) ──");
check("botón EXPORTAR EXCEL detrás de isSupremo && !esLectura", admin.includes("{isSupremo && !esLectura && (") && admin.indexOf("btn-export-excel") > admin.indexOf("isSupremo && !esLectura && ("));
check("API /api/products/export exige supremo_admin (ya no admin)", exportApi.includes('role !== "supremo_admin"') && !exportApi.includes("Solo admin o supremo_admin"));
check("API export: mensaje claro solo Supremo", exportApi.includes("Solo el Supremo Admin puede exportar la base"));
check("comentario Task 134 en el botón", admin.includes("el boton exportar excel es apenas para Supremo"));

console.log("\n── B · Tabla ConfigBackup (auto-gestionada, patrón TasaCambio) ──");
check("modelo ConfigBackup en el schema", schema.includes("model ConfigBackup"));
check("campo activado Boolean default false", /activado\s+Boolean\s+@default\(false\)/.test(schema));
check("config-backup.ts: CREATE TABLE IF NOT EXISTS ConfigBackup (no hace falta db push)", config.includes('CREATE TABLE IF NOT EXISTS "ConfigBackup"'));
check("config-backup.ts: id ACTIVA (fila única)", config.includes('CONFIG_BACKUP_ACTIVA_ID = "ACTIVA"'));
check("config-backup.ts: default DESACTIVADO (el dueño lo activa)", config.includes("CONFIG_BACKUP_DEFAULT") && config.includes("activado: false"));
check("config-backup.ts: lectura NUNCA rompe (fallback default)", config.includes("esErrorTablaFaltante") && config.includes("return { ...CONFIG_BACKUP_DEFAULT }"));
check("config-backup.ts: upsert guardarConfigBackup", config.includes("export async function guardarConfigBackup"));

console.log("\n── C · Permisos del interruptor (solo Supremo / viza@viza.com.py) ──");
check("permisos-backup.ts existe con lista de emails", permisos.includes("EMAILS_QUE_EDITAN_BACKUP") && permisos.includes('"viza@viza.com.py"'));
check("puedeEditarBackup() acepta supremo_admin", permisos.includes('=== "supremo_admin"'));
check("API /api/config-backup valida con puedeEditarBackup", apiConfig.includes("puedeEditarBackup("));
check("API config-backup: usuarios SOLO LECTURA bloqueados", apiConfig.includes("esEmailSoloLectura("));
check("API config-backup: PUT devuelve diagnosticoSmtp (avisa faltantes al activar)", apiConfig.includes("diagnostico: diagnosticoSmtp()"));

console.log("\n── D · Interruptor ON/OFF en la Base (UI) ──");
check("chip COPIAS DE SEGURIDAD en admin-panel", admin.includes("COPIAS DE SEGURIDAD:") && admin.includes("<Switch"));
check("switch lee el estado de /api/config-backup", admin.includes('fetch("/api/config-backup")'));
check("switch guarda con PUT { activado }", admin.includes("body: JSON.stringify({ activado: nuevoEstado })"));
check("toast al activar sin variables SMTP (faltantes)", admin.includes("Copias ACTIVADAS — pero faltan variables en Vercel"));
check("chip muestra ACTIVADAS / DESACTIVADAS", admin.includes('"ACTIVADAS" : "DESACTIVADAS"'));
check("botón ENVIAR COPIA AHORA", admin.includes("ENVIAR COPIA AHORA") && admin.includes("btn-backup-ahora"));
check("ENVIAR COPIA AHORA llama al endpoint del backup", admin.includes('fetch("/api/cron/backup-excel")'));
check("icons nuevos importados (DatabaseBackup / Send)", admin.includes("DatabaseBackup,") && admin.includes("Send,"));
check("Switch importado de ui/switch", admin.includes('import { Switch } from "@/components/ui/switch";'));
check("chip y botón solo Supremo (no admins comunes)", (admin.match(/isSupremo && !esLectura && \(/g) || []).length >= 3);

console.log("\n── E · El cron respeta el interruptor ──");
check("route importa getConfigBackup", route.includes('import { getConfigBackup } from "@/lib/config-backup"'));
check("cron automático (Bearer) salta si está DESACTIVADO", route.includes("if (viaBearer && !configBackup.activado)"));
check("respuesta skipped con motivo claro", route.includes("skipped: true") && route.includes("COPIAS DE SEGURIDAD"));
check("respuesta normal informa origen + backupActivado", route.includes("origen: viaBearer") && route.includes("backupActivado: configBackup.activado"));
check("envío manual (sesión) sale SIEMPRE (acción explícita)", route.indexOf("const configBackup = await getConfigBackup();") < route.indexOf("GENERAR EXCEL"));
check("scheduler self-hosted también consulta ConfigBackup", instr.includes("getConfigBackup") && instr.includes("copias de seguridad DESACTIVADAS"));

console.log("\n── F · Horarios 08:00 / 14:00 / 23:00 hora de Paraguay ──");
check("vercel.json: cron 11:00 UTC = 08:00 PY", vercel.includes('"schedule": "0 11 * * *"'));
check("vercel.json: cron 17:00 UTC = 14:00 PY", vercel.includes('"schedule": "0 17 * * *"'));
check("vercel.json: cron 02:00 UTC = 23:00 PY", vercel.includes('"schedule": "0 2 * * *"'));
check("vercel.json: ya NO queda el horario viejo 09:00 UTC (06:00)", !vercel.includes('"schedule": "0 9 * * *"'));
check("vercel.json: ya NO queda el horario viejo 01:00 UTC (22:00)", !vercel.includes('"schedule": "0 1 * * *"'));
check("instrumentation: node-cron 08:00 / 14:00 / 23:00", instr.includes('"0 8 * * *"') && instr.includes('"0 14 * * *"') && instr.includes('"0 23 * * *"'));
check("instrumentation: ya no queda 06:00 ni 22:00", !instr.includes('"0 6 * * *"') && !instr.includes('"0 22 * * *"'));
check("timezone America/Asuncion (Paraguay) por defecto", instr.includes("America/Asuncion") && mail.includes("America/Asuncion"));
check("correos mencionan los horarios nuevos (08:00, 14:00 y 23:00)", mail.includes("08:00, 14:00 y 23:00"));
check("correos ya no mencionan los horarios viejos (06:00 / 22:00)", !mail.includes("06:00, 14:00 y 22:00"));

console.log("\n── G · Correos y backup intactos (T112/T133) ──");
check("ENVÍA sigue default viza.cobranza@viza.com.py", mail.includes('EMAIL_ENVIA_DEFAULT = "viza.cobranza@viza.com.py"'));
check("RECIBE sigue default viza@viza.com.py", mail.includes('EMAIL_RECIBE_DEFAULT = "viza@viza.com.py"'));
check("modo ?test=1 de T133 sigue (probar SMTP)", route.includes('searchParams.get("test") === "1"') && route.includes("probarSmtp()"));
check("diagnóstico sin secretos sigue (T133)", route.includes("diagnostico: diagnosticoSmtp()"));
check("Excel con hojas Stock Ideal y Pedido Especial Tipos (T133)", leer("src/lib/backup-excel.ts").includes('"Stock Ideal"') && leer("src/lib/backup-excel.ts").includes('"Pedido Especial Tipos"'));
check("3 crons en vercel.json apuntando al endpoint", (vercel.match(/"path": "\/api\/cron\/backup-excel"/g) || []).length === 3);

console.log(`\n═══ RESULTADO: ${ok} ✓ · ${fallo} ✗ ═══`);
if (fallo > 0) process.exit(1);
console.log("T134: EXPORTAR EXCEL solo Supremo + interruptor ON/OFF + horarios 08:00/14:00/23:00 verificados.");
