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
import { sendBackupEmail } from "@/lib/backup-mail";

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
        { error: "No autorizado. Se requiere CRON_SECRET (Bearer) o sesión de admin." },
        { status: 401 }
      );
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
