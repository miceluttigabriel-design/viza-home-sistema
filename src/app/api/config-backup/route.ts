// ─── COPIAS DE SEGURIDAD AUTOMÁTICAS — API (Task 134, pedido del dueño) ───
//
// GET  /api/config-backup
//   Cualquier usuario logueado: devuelve el estado del interruptor
//   ON/OFF de los backups automáticos ({ activado } + meta informativa
//   de cuándo/quién lo movió). Si todavía nadie lo tocó, devuelve el
//   default (DESACTIVADO).
//
// PUT  /api/config-backup
//   SOLO supremo_admin y el email viza@viza.com.py (lista única en
//   src/lib/permisos-backup.ts — la misma que valida la UI) y NUNCA
//   usuarios de consulta: guarda el nuevo estado del interruptor.
//   Body: { "activado": true } o { "activado": false }.
//   Con ACTIVADO el cron de Vercel envía la copia de la base por correo
//   a viza@viza.com.py tres veces al día (08:00, 14:00 y 23:00, hora de
//   Paraguay). La respuesta incluye el DIAGNÓSTICO SMTP de T133 (sin
//   secretos): si al activar faltan variables en Vercel (SMTP_HOST /
//   SMTP_PASS), el dueño lo ve AL INSTANTE en el toast de la Base.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { puedeEditarBackup } from "@/lib/permisos-backup";
import { getConfigBackupConMeta, guardarConfigBackup } from "@/lib/config-backup";
import { diagnosticoSmtp } from "@/lib/backup-mail";

// ─── GET: estado del interruptor (cualquier usuario logueado) ───
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const meta = await getConfigBackupConMeta();
    return NextResponse.json({
      activado: meta.activado,
      updatedAt: meta.updatedAt,
      actualizadoPor: meta.actualizadoPor,
      esDefault: meta.esDefault,
    });
  } catch (error) {
    console.error("Error leyendo config de backup:", error);
    // Degradado: default (desactivado). La Base sigue funcionando igual.
    return NextResponse.json({ activado: false, esDefault: true });
  }
}

// ─── PUT: mover el interruptor ON/OFF (solo Supremo / viza@viza.com.py) ───
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Task 134 (pedido del dueño): el interruptor es SOLO del supremo_admin
    // y del email viza@viza.com.py (lista única en src/lib/permisos-backup.ts,
    // la misma que usa la UI — UI y backend deciden SIEMPRE lo mismo).
    if (!puedeEditarBackup((session.user as any)?.role, (session.user as any)?.email)) {
      return NextResponse.json(
        { error: "Solo el Supremo Admin o viza@viza.com.py pueden mover el interruptor de copias de seguridad" },
        { status: 403 }
      );
    }
    // Usuarios de consulta SOLO LECTURA jamás modifican nada (manda encima
    // de todo, aunque el email estuviera en la lista de editores).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede mover el interruptor de copias de seguridad" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const activado = body?.activado === true; // estricto: cualquier otra cosa = false

    const editorName =
      (session.user as any)?.name || (session.user as any)?.email || "admin";

    const guardado = await guardarConfigBackup(activado, editorName);
    if (guardado === null) {
      return NextResponse.json(
        { error: "No se pudo guardar el estado en la base (intenta de nuevo)" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      activado: guardado.activado,
      // Task 133: diagnóstico de variables SMTP (sin secretos) — si se
      // ACTIVA y faltan variables en Vercel, el dueño lo ve al instante.
      diagnostico: diagnosticoSmtp(),
    });
  } catch (error) {
    console.error("Error guardando config de backup:", error);
    return NextResponse.json(
      { error: "Error al guardar el estado de las copias de seguridad (intenta de nuevo)" },
      { status: 500 }
    );
  }
}
