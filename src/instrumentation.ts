// ============================================================
// Task 112: INSTRUMENTATION HOOK de Next.js.
// Arranca el scheduler node-cron SOLO cuando la app se corre
// self-hosted (bun start / standalone / PM2). En Vercel se SALTA
// (process.env.VERCEL está definido) porque ahí usa Vercel Cron
// configurado en vercel.json — node-cron no persiste en serverless.
//
// HORARIOS (zona America/Asuncion — Paraguay, configurable con
// BACKUP_CRON_TZ; en Vercel son UTC en vercel.json) — Task 134,
// pedidos por el dueño:
//   - 08:00  (mañana)
//   - 14:00  (tarde, 2 de la tarde)
//   - 23:00  (noche, 11 de la noche)
//
// INTERRUPTOR (Task 134): antes de mandar se consulta ConfigBackup
// (chip COPIAS DE SEGURIDAD de la Base) — si el dueño lo tiene
// DESACTIVADO, el envío se salta. Sin embargo el endpoint llamado a
// mano (logueado en el navegador) manda SIEMPRE.
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
    const tz = process.env.BACKUP_CRON_TZ || "America/Asuncion";

    // Función que genera el Excel y manda el correo. Reutiliza las
    // mismas libs que el endpoint /api/cron/backup-excel — así el
    // resultado es idéntico venga de Vercel Cron o de node-cron.
    // Task 134: respeta el INTERRUPTOR de la Base (ConfigBackup) — si el
    // dueño lo desactivó, nada sale por acá (los envíos manuales del
    // endpoint logueado siguen funcionando).
    const runBackup = async (origen: string) => {
      const t0 = Date.now();
      try {
        const { getConfigBackup } = await import("./lib/config-backup");
        const configBackup = await getConfigBackup();
        if (!configBackup.activado) {
          console.log(`[BACKUP-AUTO] Saltado (${origen}): copias de seguridad DESACTIVADAS en la Base (ConfigBackup).`);
          return;
        }
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
    // Task 134 (pedido del dueño): 08:00 mañana, 14:00 tarde y 23:00 noche.
    cron.schedule("0 8 * * *", () => runBackup("mañana-08:00"), {
      timezone: tz,
      name: "viza-backup-manana",
    });
    cron.schedule("0 14 * * *", () => runBackup("tarde-14:00"), {
      timezone: tz,
      name: "viza-backup-tarde",
    });
    cron.schedule("0 23 * * *", () => runBackup("noche-23:00"), {
      timezone: tz,
      name: "viza-backup-noche",
    });

    console.log(
      `[BACKUP-AUTO] Scheduler iniciado (TZ=${tz}) — 08:00, 14:00, 23:00. ` +
        `Endpoint manual: GET /api/cron/backup-excel`
    );
  } catch (e) {
    console.error("[BACKUP-AUTO] No se pudo iniciar el scheduler:", e);
  }
}
