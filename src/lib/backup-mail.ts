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
    throw new Error(
      "SMTP no configurado. Faltan SMTP_HOST y SMTP_PASS en las variables de entorno."
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
    timeZone: process.env.BACKUP_CRON_TZ || "America/Montevideo",
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

  const info = await transporter.sendMail({
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
