#!/usr/bin/env node
// ============================================================
// T135 — VERIFICACIÓN: TRADUCTOR DE ERRORES SMTP (pistaSmtp).
// El dueño recibió "Invalid login: 535 5.7.3 AUTHENTICATION
// UNSUCCESSFUL" pelado en pantalla. Ahora el sistema traduce el
// error a instrucciones concretas (activar SMTP autenticado en
// Microsoft / usar Brevo / contraseña de aplicación, etc.).
// Checks estáticos sobre los archivos (sin SMTP real).
// Correr:  node scripts/t135-verificar-diagnostico-smtp.mjs
// ============================================================
import { readFileSync } from "fs";

let ok = 0, fallo = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ FALLO: ${nombre}`); }
};
const leer = (p) => readFileSync(p, "utf8");

const mail = leer("src/lib/backup-mail.ts");
const admin = leer("src/components/viza/admin-panel.tsx");

console.log("═══ T135 · TRADUCTOR DE ERRORES SMTP EN EL BACKUP ═══");

// ── pistaSmtp existe y cubre los casos ──
check("pistaSmtp() exportada en backup-mail.ts",
  mail.includes("export function pistaSmtp(msg: string): string"));
check("cubre el error 535 5.7.3 (Outlook/Microsoft 365)",
  mail.includes('"5.7.3"') && mail.includes("authentication unsuccessful"));
check("la pista 5.7.3 explica activar 'SMTP autenticado' en admin.microsoft.com",
  mail.includes("SMTP autenticado") && mail.includes("admin.microsoft.com"));
check("la pista 5.7.3 ofrece la alternativa Brevo (smtp-relay.brevo.com)",
  mail.includes("brevo.com") && mail.includes("smtp-relay.brevo.com"));
check("cubre 5.7.9 / contraseña de aplicación (Gmail)",
  mail.includes('"5.7.9"') && mail.includes("Contraseñas de aplicación"));
check("cubre 5.7.1 / relay denied (remitente no autorizado)",
  mail.includes('"5.7.1"') && mail.includes("SMTP_FROM"));
check("cubre errores de conexión (EDNS/ECONN/ETIMEDOUT → host/puerto)",
  mail.includes("etimedout") && mail.includes("smtp.office365.com y puerto 587"));
check("cubre login genérico (EAUTH/Invalid login/535)",
  mail.includes("eauth") && mail.includes("Login rechazado"));
check("siempre sugiere el modo test ?test=1 en las pistas de login",
  (mail.match(/backup-excel\?test=1/g) || []).length >= 3);

// ── pistaSmtp se USA en los 3 puntos de envío ──
const usos = (mail.match(/pistaSmtp\(/g) || []).length;
check(`pistaSmtp se usa en probarSmtp (verify + sendMail) y sendBackupEmail (${usos} usos ≥ 4)`,
  usos >= 4);
check("sendBackupEmail envuelve sendMail y reenvía con la pista + detalle técnico",
  mail.includes("Detalle técnico del servidor"));
check("probarSmtp (verify) devuelve pistaSmtp en detalle",
  mail.includes("detalle: pistaSmtp(msg)"));
check("probarSmtp (envío) devuelve pistaSmtp en detalle",
  mail.includes("fue rechazado por ${cfg.host}: ${pistaSmtp(msg)}"));

// ── el toast de la Base da tiempo para leer la pista ──
check("toast de ENVIAR COPIA AHORA dura 20 s (pista completa legible)",
  admin.includes("duration: 20000") && admin.includes("Task 135: 20 segundos"));

// ── no se rompió nada de las tareas previas ──
check("diagnosticoSmtp() sigue exportado (Task 133)",
  mail.includes("export function diagnosticoSmtp"));
check("destino default sigue siendo viza@viza.com.py (pedido del dueño)",
  mail.includes('EMAIL_RECIBE_DEFAULT = "viza@viza.com.py"'));
check("remitente default sigue siendo viza.cobranza@viza.com.py",
  mail.includes('EMAIL_ENVIA_DEFAULT = "viza.cobranza@viza.com.py"'));

console.log(`\nResultado: ${ok} OK · ${fallo} FALLO`);
process.exit(fallo === 0 ? 0 : 1);
