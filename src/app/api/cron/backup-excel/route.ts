// ============================================================
// Task 112: ENDPOINT DE BACKUP AUTOMÁTICO.
// GET /api/cron/backup-excel
//
// Lo llama Vercel Cron (3 veces al día: 06:00, 14:00, 22:00 hora
// de Montevideo) y también el scheduler node-cron cuando la app se
// corre self-hosted (bun start / standalone) sin Vercel.
//
// AUTENTICACIÓN (una de las dos):
//   1. Header Authorization: Bearer <CRON_SECRET>  (Vercel Cron lo envía solo)
//   2. Sesión activa de un admin o supremo_admin (para testeo manual
//      desde el navegador: entrar a /api/cron/backup-excel logueado
//      como admin).
//
// Respuesta 200 con JSON: { ok, filename, sizeBytes, sent, stats }
// Errores: 401 (no autorizado), 500 (SMTP/excel falló).
// ============================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateBackupExcel } from "@/lib/backup-excel";
import { sendBackupEmail, diagnosticoSmtp, probarSmtp } from "@/lib/backup-mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // si no hay secreto configurado, no se acepta vía Bearer
  if (!authHeader) return false;
  // Acepta "Bearer <token>" o "<token>" pelado
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  // comparación de tiempo constante para evitar timing attacks
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: Request) {
  try {
    // ===== AUTENTICACIÓN =====
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const viaBearer = authorize(authHeader);

    let viaSession = false;
    if (!viaBearer) {
      const session = await getServerSession(authOptions);
      const role = (session?.user as any)?.role;
      if (session && (role === "admin" || role === "supremo_admin")) {
        viaSession = true;
      }
    }

    if (!viaBearer && !viaSession) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Se requiere CRON_SECRET (Bearer) o sesión de admin.",
          // Task 133: pista directa — si esto lo llamó Vercel Cron y da 401,
          // casi seguro falta cargar CRON_SECRET en Vercel (Vercel lo envía
          // solo como header Authorization: Bearer <CRON_SECRET> cuando esa
          // variable existe). Sin esa variable, el cron queda afuera y el
          // backup nunca corre: cargarla en Settings → Environment Variables.
          pista: process.env.CRON_SECRET
            ? "CRON_SECRET está cargado pero el token no coincidió."
            : "CRON_SECRET NO está cargado en las variables de entorno: Vercel Cron queda afuera (401). Cargalo en Vercel (Settings → Environment Variables) y re-deploy.",
        },
        { status: 401 }
      );
    }

    // ===== MODO TEST (Task 133) =====
    // GET /api/cron/backup-excel?test=1 → NO genera el Excel: solo prueba
    // la conexión SMTP y manda un correo chiquito de prueba al destino
    // (viza@viza.com.py). Sirve para validar host/usuario/contraseña en 10
    // segundos después de cargar las variables, sin esperar el cron y sin
    // generar el archivo grande. Devuelve además el DIAGNÓSTICO completo de
    // variables (sin secretos) para ver al instante qué falta.
    const modoTest = new URL(req.url).searchParams.get("test") === "1";
    if (modoTest) {
      const resultado = await probarSmtp();
      return NextResponse.json({
        ok: resultado.ok,
        modo: "test",
        prueba: resultado,
        diagnostico: diagnosticoSmtp(),
      });
    }

    // ===== GENERAR EXCEL =====
    const { buffer, filename, stats } = await generateBackupExcel();

    // ===== ENVIAR POR CORREO =====
    // Si SMTP/BACKUP_EMAIL_TO no están configurados, devolvemos 200 pero
    // marcando sent=false con un mensaje claro — así el cron no falla
    // ruidosamente si el jefe todavía no configuró el correo.
    let sendInfo: { to: string; messageId: string; accepted: boolean } | null = null;
    let sendError: string | null = null;
    try {
      sendInfo = await sendBackupEmail(buffer, filename, stats);
    } catch (e) {
      sendError = (e as Error).message;
      console.error("[BACKUP-AUTO] Error enviando correo:", sendError);
    }

    return NextResponse.json({
      ok: true,
      filename,
      sizeBytes: stats.sizeBytes,
      sizeKb: Math.round(stats.sizeBytes / 1024),
      sent: sendInfo?.accepted === true,
      messageId: sendInfo?.messageId ?? null,
      to: sendInfo?.to ?? null,
      sendError,
      // Task 133: diagnóstico de variables (sin secretos) SIEMPRE en la
      // respuesta — si el correo no salió, acá se ve al instante qué falta
      // cargar en Vercel.
      diagnostico: diagnosticoSmtp(),
      stats: {
        fecha: stats.fecha,
        durationMs: stats.durationMs,
        totalFilas: stats.totalFilas,
        hojas: stats.hojas,
      },
    });
  } catch (error) {
    console.error("[BACKUP-AUTO] Error general:", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
