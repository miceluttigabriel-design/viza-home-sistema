// ============================================================
// Task 112: ENVÍO DEL BACKUP POR CORREO AL REPRESENTANTE.
// Usa nodemailer + SMTP (configurable: Gmail, SendGrid, Mailgun,
// Zoho, etc.). El Excel (.xlsx) va como adjunto.
//
// SEGURIDAD: el correo lleva TODA la base menos PasswordLog y el
// campo `password` de User. Aun así, mandar credenciales por correo
// es sensible: el representante debe tener un correo seguro (no
// compartido) y conviene habilitar 2FA en la cuenta SMTP.
// ============================================================

import nodemailer from "nodemailer";
import type { BackupStats } from "./backup-excel";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

// ============================================================
// CORREOS FIJOS DEL PEDIDO (Task 112, corrección del dueño):
//   - ENVÍA:  viza.cobranza@viza.com.py
//   - RECIBE: viza@viza.com.py
// Van como DEFAULT acá abajo para que el backup funcione aunque
// falte una variable de entorno. Se pueden sobreescribir con
// BACKUP_EMAIL_TO (destino) y SMTP_FROM (remitente visible).
// ============================================================
const EMAIL_ENVIA_DEFAULT = "viza.cobranza@viza.com.py";
const EMAIL_RECIBE_DEFAULT = "viza@viza.com.py";

function leerSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER || EMAIL_ENVIA_DEFAULT;
  const pass = process.env.SMTP_PASS;
  const from =
    process.env.SMTP_FROM || `VIZA HOME Backup <${EMAIL_ENVIA_DEFAULT}>`;
  const portStr = process.env.SMTP_PORT;
  if (!host || !pass) return null;
  const port = portStr ? parseInt(portStr, 10) : 465;
  // 465 = secure (TLS implícito); 587 = STARTTLS; otro = assume secure si 465
  const secure = port === 465;
  return { host, port, secure, user, pass, from };
}

// ============================================================
// DIAGNÓSTICO (Task 133, pedido del dueño: "no consegui poner bien"):
// Devuelve QUÉ variables faltan y QUÉ valores no secretos se van a usar,
// para que el endpoint /api/cron/backup-excel (y su modo ?test=1) puedan
// mostrarle al dueño AL INSTANTE qué le falta cargar en Vercel — sin
// mostrar jamás la contraseña (SMTP_PASS solo va como presente/ausente).
// ============================================================
export interface SmtpDiagnostico {
  smtpHost: string | null; // valor de SMTP_HOST (no es secreto) o null si falta
  smtpPassPresente: boolean; // true si SMTP_PASS está cargada (el VALOR nunca se devuelve)
  smtpUser: string; // usuario SMTP que se va a usar (default: viza.cobranza@viza.com.py)
  smtpFrom: string; // remitente visible que se va a usar
  smtpPort: number; // puerto que se va a usar (default: 465)
  destino: string; // correo que RECIBE el backup (default: viza@viza.com.py)
  faltantes: string[]; // nombres exactos de las variables que faltan cargar
  listo: boolean; // true si ya se puede enviar (host + pass presentes)
}

export function diagnosticoSmtp(): SmtpDiagnostico {
  const host = process.env.SMTP_HOST || null;
  const passPresente = !!process.env.SMTP_PASS;
  const user = process.env.SMTP_USER || EMAIL_ENVIA_DEFAULT;
  const from = process.env.SMTP_FROM || `VIZA HOME Backup <${EMAIL_ENVIA_DEFAULT}>`;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const destino = process.env.BACKUP_EMAIL_TO || EMAIL_RECIBE_DEFAULT;
  const faltantes: string[] = [];
  if (!host) faltantes.push("SMTP_HOST");
  if (!passPresente) faltantes.push("SMTP_PASS");
  return {
    smtpHost: host,
    smtpPassPresente: passPresente,
    smtpUser: user,
    smtpFrom: from,
    smtpPort: port,
    destino,
    faltantes,
    listo: faltantes.length === 0,
  };
}

// ============================================================
// TRADUCTOR DE ERRORES SMTP (Task 135, pedido del dueño): el error
// "Invalid login: 535 5.7.3 AUTHENTICATION UNSUCCESSFUL" salió en
// pantalla PELADO y no le dijo QUÉ hacer. pistaSmtp() toma el mensaje
// crudo del servidor y devuelve instrucciones concretas en español:
//   · 535 5.7.3 / Authentication unsuccessful → la firma clásica de
//     Outlook/Microsoft 365 con el "SMTP autenticado" DESACTIVADO en
//     el buzón (Microsoft lo apaga por defecto) — acá está el paso a
//     paso para activarlo, y la alternativa Brevo.
//   · 5.7.9 / app password → contraseña de aplicación (Gmail).
//   · 5.7.1 / relay denied → remitente no autorizado (SMTP_FROM).
//   · EDNS/ECONN/ETIMEDOUT → host o puerto mal.
//   · resto de EAUTH/535 → usuario o contraseña mal.
// Se usa en probarSmtp() y en sendBackupEmail(): el toast de la Base
// y el modo ?test=1 muestran SIEMPRE qué hacer, nunca el texto pelado.
// ============================================================
export function pistaSmtp(msg: string): string {
  const m = (msg || "").toLowerCase();

  // ── Outlook / Microsoft 365: 535 5.7.3 Authentication unsuccessful ──
  // Es EL error exacto que le apareció al dueño (BL3APR03...PROD.OUTLOOK.COM).
  // 1ª causa: buzón con SMTP AUTH desactivado (default de Microsoft).
  // 2ª causa: contraseña mal en SMTP_PASS.
  if (m.includes("5.7.3") || m.includes("authentication unsuccessful")) {
    return (
      "Microsoft RECHAZÓ el usuario/contraseña (535 5.7.3). Con buzones de Outlook/Microsoft 365 la causa #1 es que el buzón tiene el 'SMTP autenticado' DESACTIVADO (Microsoft lo apaga por defecto). " +
      "Activalo: admin.microsoft.com → Usuarios activos → el buzón que envía → pestaña CORREO → 'Administrar aplicaciones de correo electrónico' → tildar SMTP AUTENTICADO → Guardar (demora unos minutos en aplicar). " +
      "Causa #2: la contraseña cargada en SMTP_PASS no es la del buzón — recargala sin espacios. " +
      "Alternativa sin tocar Microsoft (recomendada): cuenta gratis en brevo.com (300 correos/día) y cambiar SMTP_HOST=smtp-relay.brevo.com · SMTP_PORT=587 · SMTP_USER y SMTP_PASS con la clave SMTP de Brevo — pasos completos en el LEEME Task 135. " +
      "Después probá rápido abriendo /api/cron/backup-excel?test=1 logueado como Supremo."
    );
  }

  // ── Gmail/Workspace: 534 5.7.9 → pide Contraseña de aplicación ──
  if (
    m.includes("5.7.9") ||
    m.includes("application-specific") ||
    m.includes("app password") ||
    m.includes("contraseña de aplicación")
  ) {
    return (
      "El servidor pide CONTRASEÑA DE APLICACIÓN (5.7.9): la contraseña normal no sirve. " +
      "En Gmail/Workspace: cuenta Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación → crear una de 16 letras y cargarla en SMTP_PASS."
    );
  }

  // ── Remitente no autorizado (relay denied / 5.7.1) ──
  if (m.includes("5.7.1") || m.includes("relay")) {
    return (
      "El servidor no permite enviar desde ese remitente (5.7.1): SMTP_FROM tiene que coincidir con el buzón que autentica (SMTP_USER) o estar autorizado en el proveedor."
    );
  }

  // ── No conecta: host o puerto mal ──
  if (
    m.includes("edns") ||
    m.includes("econn") ||
    m.includes("etimedout") ||
    m.includes("eai_again")
  ) {
    return (
      "No se pudo conectar al servidor SMTP: revisá SMTP_HOST y SMTP_PORT " +
      "(Outlook: smtp.office365.com y puerto 587 · Brevo: smtp-relay.brevo.com y 587 · Gmail: smtp.gmail.com y 465)."
    );
  }

  // ── Resto de errores de login (535 genérico / EAUTH) ──
  if (m.includes("eauth") || m.includes("invalid login") || m.includes("535")) {
    return (
      "Login rechazado por el servidor SMTP: revisá SMTP_USER (el correo COMPLETO del buzón) y SMTP_PASS (sin espacios). " +
      "Probá después abriendo /api/cron/backup-excel?test=1 logueado como Supremo."
    );
  }

  // ── Fallback: cualquier otro error SMTP ──
  return (
    "Revisá las variables SMTP en Vercel (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) y probá abriendo /api/cron/backup-excel?test=1 logueado como Supremo."
  );
}

// ============================================================
// PRUEBA RÁPIDA DE SMTP (Task 133): conecta al servidor SMTP y envía
// un correo chiquito de prueba (sin adjunto, sin generar el Excel).
// La usa el modo ?test=1 del endpoint — así el dueño valida host/
// usuario/contraseña en 10 segundos, sin esperar el cron.
// ============================================================
export async function probarSmtp(): Promise<{
  ok: boolean;
  conexion: string; // "conectado y autenticado" | error legible
  enviadoA: string | null; // a quién le llegó el correo de prueba
  detalle: string; // mensaje amigable para el dueño
}> {
  const cfg = leerSmtpConfig();
  if (!cfg) {
    const diag = diagnosticoSmtp();
    return {
      ok: false,
      conexion: `faltan variables: ${diag.faltantes.join(", ")}`,
      enviadoA: null,
      detalle:
        `Cargá en Vercel las variables ${diag.faltantes.join(", ")} ` +
        `(Settings → Environment Variables) y volvé a probar. ` +
        `Usuario que se usaría: ${diag.smtpUser} · Puerto: ${diag.smtpPort}.`,
    };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  try {
    await transporter.verify();
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return {
      ok: false,
      conexion: msg,
      enviadoA: null,
      // Task 135: instrucciones concretas según el error (535 5.7.3 →
      // activar SMTP autenticado en Microsoft, 5.7.9 → contraseña de
      // aplicación, etc.) en vez del texto pelado del servidor.
      detalle: pistaSmtp(msg),
    };
  }

  const to = process.env.BACKUP_EMAIL_TO || EMAIL_RECIBE_DEFAULT;
  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject: "VIZA HOME — prueba de correo del backup (no responder)",
      text:
        "Este es un correo de PRUEBA del backup automático. Si lo recibiste, " +
        "el correo está bien configurado: los backups van a llegar a esta " +
        "casilla 3 veces por día (08:00, 14:00 y 23:00, hora de Paraguay), " +
        "mientras las COPIAS DE SEGURIDAD estén ACTIVADAS en la Base.",
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return {
      ok: false,
      conexion: "conectado y autenticado, pero el envío falló",
      enviadoA: null,
      // Task 135: pista traducida (incluye el caso "el envío fue
      // rechazado por remitente no autorizado" — 5.7.1).
      detalle: `El envío a ${to} fue rechazado por ${cfg.host}: ${pistaSmtp(msg)}`,
    };
  }

  return {
    ok: true,
    conexion: "conectado y autenticado",
    enviadoA: to,
    detalle:
      `Todo funcionó: el correo de prueba llegó a ${to}. Los backups van a ` +
      `salir por acá (adjunto Excel) 3 veces por día.`,
  };
}

export interface SendResult {
  to: string;
  messageId: string;
  accepted: boolean;
}

export async function sendBackupEmail(
  buffer: Buffer,
  filename: string,
  stats: BackupStats
): Promise<SendResult> {
  const cfg = leerSmtpConfig();
  if (!cfg) {
    const diag = diagnosticoSmtp();
    throw new Error(
      `SMTP no configurado. Falta cargar en Vercel: ${diag.faltantes.join(", ")}. ` +
        `Usuario que se usaría: ${diag.smtpUser} · Destino: ${diag.destino}.`
    );
  }

  // Destino: default viza@viza.com.py (pedido del dueño), override con env.
  const to = process.env.BACKUP_EMAIL_TO || EMAIL_RECIBE_DEFAULT;

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  // Formatear fecha/hora legible para el asunto y el cuerpo
  const fechaLegible = new Date(stats.fecha).toLocaleString("es-PY", {
    timeZone: process.env.BACKUP_CRON_TZ || "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sizeKb = (stats.sizeBytes / 1024).toFixed(0);
  const sizeMb = (stats.sizeBytes / 1024 / 1024).toFixed(2);

  const listaHojas = stats.hojas
    .map((h) => `  • ${h.nombre}: ${h.filas.toLocaleString("es-PY")} filas`)
    .join("\n");

  const texto = `Backup automático de la base VIZA HOME E.A.S.

Fecha y hora: ${fechaLegible}
Archivo: ${filename}
Tamaño: ${sizeKb} KB (${sizeMb} MB)
Tiempo de generación: ${stats.durationMs} ms
Total de filas: ${stats.totalFilas.toLocaleString("es-PY")}

Hojas incluidas:
${listaHojas}

NOTA: Por seguridad, este backup EXCLUYE la tabla PasswordLog y el
campo 'password' de los usuarios. Si necesitás restaurar contraseñas,
usá los scripts de reseteo del repositorio.

— Generado automáticamente por VIZA HOME E.A.S (Task 112)`;

  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
<h2 style="color: #1a56db;">Backup automático — VIZA HOME E.A.S</h2>
<table style="border-collapse: collapse; margin: 12px 0;">
<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Fecha y hora:</td><td>${fechaLegible}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Archivo:</td><td>${filename}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Tamaño:</td><td>${sizeKb} KB (${sizeMb} MB)</td></tr>
<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Tiempo de generación:</td><td>${stats.durationMs} ms</td></tr>
<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Total de filas:</td><td>${stats.totalFilas.toLocaleString("es-PY")}</td></tr>
</table>
<h3 style="margin-top: 16px;">Hojas incluidas</h3>
<ul style="margin: 0; padding-left: 20px;">
${stats.hojas.map((h) => `<li><b>${h.nombre}</b>: ${h.filas.toLocaleString("es-PY")} filas</li>`).join("\n")}
</ul>
<p style="margin-top: 16px; font-size: 12px; color: #666;">
Por seguridad, este backup EXCLUYE la tabla PasswordLog y el campo <code>password</code> de los usuarios.
</p>
<hr style="margin-top: 16px; border: none; border-top: 1px solid #ddd;">
<p style="font-size: 12px; color: #999;">Generado automáticamente por VIZA HOME E.A.S (Task 112)</p>
</div>`;

  // Task 135: si el servidor rechaza el envío (p. ej. 535 5.7.3 de
  // Outlook con el SMTP autenticado desactivado), NO devolvemos el
  // mensaje pelado: le agregamos la PISTA traducida con el paso a
  // paso. El toast de la Base y el cron muestran la instrucción.
  let info;
  try {
    info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject: `Backup VIZA HOME — ${fechaLegible}`,
      text: texto,
      html,
      attachments: [
        {
          filename,
          content: buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    throw new Error(
      `${pistaSmtp(msg)} — Detalle técnico del servidor: ${msg}`
    );
  }

  const accepted = info.accepted?.length > 0;
  if (!accepted) {
    throw new Error(`El correo fue rechazado por el servidor SMTP: ${info.response}`);
  }

  return {
    to,
    messageId: info.messageId,
    accepted: true,
  };
}
