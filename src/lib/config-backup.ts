// ─── CONFIG DE LAS COPIAS DE SEGURIDAD AUTOMÁTICAS (Task 134) ───
// Guarda el INTERRUPTOR ON/OFF de los backups automáticos que el
// dueño controla desde la Base (chip COPIAS DE SEGURIDAD, solo
// Supremo). Cuando está ACTIVADO, el sistema envía la copia de la
// base por correo a viza@viza.com.py tres veces al día:
//   · 08:00 (mañana)
//   · 14:00 (tarde)
//   · 23:00 (noche)
// — hora de Paraguay (America/Asuncion). Los horarios viven en
// vercel.json (Vercel Cron, zona UTC) y en src/instrumentation.ts
// (scheduler self-hosted con node-cron, zona America/Asuncion).
//
// Se guarda en la tabla APARTE "ConfigBackup" (UNA sola fila, id
// "ACTIVA"). Ni el modelo Product ni ninguna otra tabla se tocan.
//
// TABLA AUTO-GESTIONADA (mismo patrón probado de TasaCambio, ver
// src/lib/tasas-cambio.ts): si la tabla todavía no existe en la
// base, la PRIMERA operación que la usa la crea SOLA con SQL
// idempotente (CREATE TABLE IF NOT EXISTS). Así el interruptor
// funciona SOLO, sin pasos manuales ni órdenes de pasos (el dueño
// no tiene que correr prisma db push). Y NUNCA rompe la app: si
// algo falla al leer, getConfigBackup() devuelve el default
// (DESACTIVADO) — o sea, sin envíos automáticos hasta que se
// pueda leer el estado real.
import { db } from "@/lib/db";

// Default = DESACTIVADO (pedido del dueño: los envíos arrancan
// recién cuando él lo activa — "al habilitarlo ya queda activo").
export const CONFIG_BACKUP_DEFAULT = {
  activado: false,
} as const;

export interface ConfigBackup {
  activado: boolean;
}

// Id fijo de la ÚNICA fila de configuración. Siempre se usa la misma.
export const CONFIG_BACKUP_ACTIVA_ID = "ACTIVA";

// Estado por instancia de serverless (evita repetir el DDL en cada
// request). "lista" = tabla verificada/creada en esta instancia.
// "sinDDL" = no se pudo crear (sin permisos u otro motivo) → no reintentar.
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes. Usa los mismos nombres de
// tabla/columna que generaría `npx prisma db push` con el schema del repo,
// así que correr el db push después no ve ninguna diferencia.
export async function ensureTablaConfigBackup(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "ConfigBackup" (
         "id" TEXT NOT NULL,
         "activado" BOOLEAN NOT NULL DEFAULT false,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "actualizadoPor" TEXT NOT NULL DEFAULT 'SISTEMA',
         CONSTRAINT "ConfigBackup_pkey" PRIMARY KEY ("id")
       )`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura del interruptor ON/OFF ───
// NUNCA lanza y NUNCA rompe: si la tabla no existe → se crea sola y
// reintenta; si aun así falla → default (DESACTIVADO). La llaman el
// cron (para decidir si envía) y la Base (para pintar el chip) sin miedo.
export async function getConfigBackup(): Promise<ConfigBackup> {
  const intentar = async (): Promise<ConfigBackup> => {
    const fila = await db.configBackup.findUnique({
      where: { id: CONFIG_BACKUP_ACTIVA_ID },
      select: { activado: true },
    });
    // Sin fila todavía = el dueño nunca tocó el interruptor → default.
    if (!fila) return { ...CONFIG_BACKUP_DEFAULT };
    return { activado: fila.activado === true };
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return { ...CONFIG_BACKUP_DEFAULT };
    if (!(await ensureTablaConfigBackup())) return { ...CONFIG_BACKUP_DEFAULT };
  }
  try {
    return await intentar();
  } catch {
    return { ...CONFIG_BACKUP_DEFAULT };
  }
}

// ─── Meta informativa (para pintar "última actualización" en la Base) ───
// Igual de blanda que getConfigBackup: si falla, devuelve null y la UI
// simplemente no muestra la línea de meta.
export interface ConfigBackupMeta {
  activado: boolean;
  updatedAt: Date | null;
  actualizadoPor: string | null;
  // true si todavía nadie tocó el interruptor (está en el default)
  esDefault: boolean;
}

export async function getConfigBackupConMeta(): Promise<ConfigBackupMeta> {
  const intentar = async (): Promise<ConfigBackupMeta> => {
    const fila = await db.configBackup.findUnique({
      where: { id: CONFIG_BACKUP_ACTIVA_ID },
    });
    if (!fila) {
      return {
        ...CONFIG_BACKUP_DEFAULT,
        updatedAt: null,
        actualizadoPor: null,
        esDefault: true,
      };
    }
    return {
      activado: fila.activado === true,
      updatedAt: fila.updatedAt ?? null,
      actualizadoPor: fila.actualizadoPor ?? null,
      esDefault: false,
    };
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      return { ...CONFIG_BACKUP_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
    }
    if (!(await ensureTablaConfigBackup())) {
      return { ...CONFIG_BACKUP_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
    }
  }
  try {
    return await intentar();
  } catch {
    return { ...CONFIG_BACKUP_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
  }
}

// ─── Guardado (upsert de la fila ACTIVA) ───
// Devuelve el estado guardado o null si NO se pudo persistir. El que
// llama decide: el chip de la Base muestra error si no se pudo guardar
// (no conviene decir "activado" si el cron no lo va a ver), pero un
// fallo acá jamás tumba la app.
export async function guardarConfigBackup(
  activado: boolean,
  actualizadoPor: string
): Promise<ConfigBackup | null> {
  const intentar = () =>
    db.configBackup.upsert({
      where: { id: CONFIG_BACKUP_ACTIVA_ID },
      update: { activado, actualizadoPor },
      create: { id: CONFIG_BACKUP_ACTIVA_ID, activado, actualizadoPor },
      select: { activado: true },
    });
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return null;
    if (!(await ensureTablaConfigBackup())) return null;
  }
  try {
    return await intentar();
  } catch {
    return null;
  }
}
