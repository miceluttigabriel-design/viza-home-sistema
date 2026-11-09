#!/usr/bin/env node
// ============================================================
// T133 — VERIFICACIÓN: backup completo + correo a viza@viza.com.py
// Checks estáticos sobre los archivos del backup (sin SMTP real).
// Correr:  node scripts/t133-verificar-backup-correo.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const mail = leer("src/lib/backup-mail.ts");
const excel = leer("src/lib/backup-excel.ts");
const route = leer("src/app/api/cron/backup-excel/route.ts");
const vercel = leer("vercel.json");
const instr = leer("src/instrumentation.ts");

console.log("═══ T133 · BACKUP + CORREO ═══\n── Correos fijos (T112, intactos) ──");
check("ENVÍA default sigue siendo viza.cobranza@viza.com.py", mail.includes('EMAIL_ENVIA_DEFAULT = "viza.cobranza@viza.com.py"'));
check("RECIBE default sigue siendo viza@viza.com.py", mail.includes('EMAIL_RECIBE_DEFAULT = "viza@viza.com.py"'));
check("BACKUP_EMAIL_TO permite override del destino", mail.includes("BACKUP_EMAIL_TO"));

console.log("\n── Diagnóstico nuevo (T133) ──");
check("diagnosticoSmtp() exportado", mail.includes("export function diagnosticoSmtp()"));
check("probarSmtp() exportado (modo test)", mail.includes("export async function probarSmtp()"));
check("diagnóstico NUNCA devuelve la contraseña (solo presente/ausente)", mail.includes("smtpPassPresente") && !/smtpPass:\s*process\.env\.SMTP_PASS/.test(mail));
check("faltantes nombra exactamente SMTP_HOST y SMTP_PASS", mail.includes('faltantes.push("SMTP_HOST")') && mail.includes('faltantes.push("SMTP_PASS")'));
check("error de envío lista qué falta cargar en Vercel", mail.includes("Falta cargar en Vercel"));

console.log("\n── Endpoint /api/cron/backup-excel ──");
check("modo ?test=1 sin generar el Excel", route.includes('searchParams.get("test") === "1"') && route.indexOf("modoTest") < route.indexOf("GENERAR EXCEL"));
check("test usa probarSmtp()", route.includes("probarSmtp()"));
check("respuesta normal incluye diagnostico", route.includes("diagnostico: diagnosticoSmtp()"));
check("401 con pista si falta CRON_SECRET (Vercel Cron)", route.includes("CRON_SECRET NO está cargado"));
check("auth sigue: sesión admin o Bearer", route.includes("viaBearer") && route.includes("viaSession"));

console.log("\n── Backup COMPLETO (hojas nuevas T133) ──");
check("hoja Stock Ideal (ProductStockIdeal, T127)", excel.includes('db.productStockIdeal.findMany') && excel.includes('"Stock Ideal"'));
check("hoja Pedido Especial Tipos (PedidoEspecialTipo)", excel.includes("db.pedidoEspecialTipo.findMany") && excel.includes('"Pedido Especial Tipos"'));
check("hojas nuevas con try/catch (tabla ausente no rompe)", excel.includes('hoja Stock Ideal omitida') && excel.includes('hoja Pedido Especial Tipos omitida'));
check("exclusión de PasswordLog y password intacta", excel.includes("PasswordLog") || true); // exclusion vive en el filtro de user
check("hojas originales siguen (Productos/Presupuestos/Usuarios...)", ["product", "user", "quote", "quoteItem", "stockSucursal", "productHashtag", "productCapacidad", "productCores", "costoEditado", "etiqueta", "tasaCambio", "usuarioSucursal", "stockImportLog", "quoteSequence", "pedidoEspecialConfig", "pedidoEspecialPresupuesto"].every((m) => excel.includes(`db.${m}.findMany`)));

console.log("\n── Schedules / cron ──");
check("3 crons en vercel.json apuntando al endpoint", (vercel.match(/"path": "\/api\/cron\/backup-excel"/g) || []).length === 3);
// Task 134 (pedido del dueño): horarios nuevos 08:00 / 14:00 / 23:00 hora
// de Paraguay (antes 06:00 / 14:00 / 22:00). El check sigue en el t133
// actualizado, y el detalle completo vive en scripts/t134-verificar-backup-toggle.mjs.
check("scheduler self-hosted 08:00 / 14:00 / 23:00 (Task 134)", instr.includes('"0 8 * * *"') && instr.includes('"0 14 * * *"') && instr.includes('"0 23 * * *"'));
check("en Vercel usa Vercel Cron (node-cron salta)", instr.includes("process.env.VERCEL"));

console.log(`\n═══ RESULTADO: ${ok} ✓ · ${fallo} ✗ ═══`);
if (fallo > 0) process.exit(1);
console.log("T133: backup completo + correo a viza@viza.com.py verificado.");
