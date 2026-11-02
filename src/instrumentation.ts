// ============================================================
// Task 112: INSTRUMENTATION HOOK de Next.js.
// Arranca el scheduler node-cron SOLO cuando la app se corre
// self-hosted (bun start / standalone / PM2). En Vercel se SALTA
// (process.env.VERCEL está definido) porque ahí usa Vercel Cron
// configurado en vercel.json — node-cron no persiste en serverless.
//
// HORARIOS (zona America/Montevideo, configurable con
// BACKUP_CRON_TZ) — corregidos por el dueño:
//   - 06:00  (mañana)
//   - 14:00  (tarde, 2 de la tarde)
//   - 22:00  (noche, 10 de la noche)
//
// Para desactivar el scheduler self-hosted sin tocar código:
//   BACKUP_CRON_ENABLED="false"
// ============================================================

declare global {
  var __vizaBackupCronStarted: boolean | undefined;
}

export async function register() {
  // Solo en runtime Node.js (no Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // En Vercel se usa Vercel Cron (vercel.json) — acá no hacemos nada.
  if (process.env.VERCEL) return;

  // Desactivación manual vía env.
  if (process.env.BACKUP_CRON_ENABLED === "false") {
    console.log("[BACKUP-AUTO] Scheduler desactivado (BACKUP_CRON_ENABLED=false).");
    return;
  }

  // Evitar doble-arranque en dev con HMR.
  if (globalThis.__vizaBackupCronStarted) return;
  globalThis.__vizaBackupCronStarted = true;

  try {
    const cron = (await import("node-cron")).default;
    const tz = process.env.BACKUP_CRON_TZ || "America/Montevideo";

    // Función que genera el Excel y manda el correo. Reutiliza las
    // mismas libs que el endpoint /api/cron/backup-excel — así el
    // resultado es idéntico venga de Vercel Cron o de node-cron.
    const runBackup = async (origen: string) => {
      const t0 = Date.now();
      try {
        console.log(`[BACKUP-AUTO] Iniciando backup (${origen})...`);
        const { generateBackupExcel } = await import("./lib/backup-excel");
        const { sendBackupEmail } = await import("./lib/backup-mail");
        const { buffer, filename, stats } = await generateBackupExcel();
        await sendBackupEmail(buffer, filename, stats);
        console.log(
          `[BACKUP-AUTO] OK (${origen}) — ${filename} · ${Math.round(
            stats.sizeBytes / 1024
          )}KB · ${stats.totalFilas} filas · ${Date.now() - t0}ms`
        );
      } catch (e) {
        console.error(`[BACKUP-AUTO] ERROR (${origen}):`, e);
      }
    };

    // 3 schedules en zona horaria local (configurable).
    cron.schedule("0 6 * * *", () => runBackup("mañana-06:00"), {
      timezone: tz,
      name: "viza-backup-manana",
    });
    cron.schedule("0 14 * * *", () => runBackup("tarde-14:00"), {
      timezone: tz,
      name: "viza-backup-tarde",
    });
    cron.schedule("0 22 * * *", () => runBackup("noche-22:00"), {
      timezone: tz,
      name: "viza-backup-noche",
    });

    console.log(
      `[BACKUP-AUTO] Scheduler iniciado (TZ=${tz}) — 06:00, 14:00, 22:00. ` +
        `Endpoint manual: GET /api/cron/backup-excel`
    );
  } catch (e) {
    console.error("[BACKUP-AUTO] No se pudo iniciar el scheduler:", e);
  }
}
