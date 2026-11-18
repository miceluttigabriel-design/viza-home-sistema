// ============================================================================
//  STOCK AUTOMATICO - TURNO ENTRE LA PC PRINCIPAL Y LA RESERVA
// ----------------------------------------------------------------------------
//  El robot puede estar instalado en mas de una PC (escritorio + notebook).
//  El CtrCredito admite UNA sola sesion por vez, asi que NUNCA pueden
//  exportar/importar las dos al mismo tiempo.
//
//  Solucion: una fila unica ("ACTIVA") en la tabla StockAutoTurno guarda
//  quien tiene el turno y cuando latio por ultima vez. Cada PC, en cada
//  vuelta (1 minuto), intenta renovar el turno con un UPDATE atomico:
//
//    - si la fila es suya            -> renueva y sigue activa
//    - si la fila vencio (> 6 min)   -> la toma y pasa a estar activa
//    - si otra PC latio hace poco    -> no toca nada y queda en espera
//
//  No hay carrera posible: Postgres resuelve el UPDATE ... WHERE en una sola
//  operacion. Si la PC activa se apaga o se queda sin internet, la reserva
//  toma el turno sola a los ~6 minutos. Cuando la primera vuelve, ve el
//  turno ocupado y espera (no se pelean por el ERP).
//
//  La tabla se crea sola la primera vez (mismo patron que ConfigStockAuto),
//  asi que no hace falta correr migraciones ni tocar el panel.
// ============================================================================
import { db } from "@/lib/db";

// Id fijo de la UNICA fila de turno.
export const TURNO_ID = "ACTIVA";

// Minutos sin latido para considerar que la PC activa "salio". El agente
// renueva cada minuto, asi que 6 minutos tolera cortes cortos de red sin
// dejar el stock sin actualizar demasiado tiempo.
export const TURNO_MINUTOS = 6;

const MAX_PC = 80;

export interface TurnoStockAuto {
  pcActiva: string | null;
  edadSegundos: number | null;
  venceEnSegundos: number | null;
}

export interface ResultadoTurno extends TurnoStockAuto {
  activo: boolean;
}

interface FilaTurno {
  pc: string;
  heartbeat: Date;
}

interface FilaEdad {
  pc: string;
  edadSegundos: number | string | null;
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let tablaLista = false;

// Crea la tabla si no existe. Idempotente: SOLO agrega una tabla nueva, jamas
// toca datos existentes. Si falla, se reintenta en la proxima llamada.
async function ensureTablaTurnoStockAuto(): Promise<boolean> {
  if (tablaLista) return true;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "StockAutoTurno" (
         "id" TEXT NOT NULL,
         "pc" TEXT NOT NULL,
         "heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "StockAutoTurno_pkey" PRIMARY KEY ("id")
       )`
    );
    tablaLista = true;
    return true;
  } catch {
    return false;
  }
}

function limpiarPc(pc: string): string {
  return String(pc || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PC);
}

// Lee quien tiene el turno ahora, sin intentar tomarlo.
export async function leerTurnoStockAuto(): Promise<TurnoStockAuto | null> {
  const ok = await ensureTablaTurnoStockAuto();
  if (!ok) return null;

  try {
    const filas = await db.$queryRawUnsafe<FilaEdad[]>(
      `SELECT "pc",
              EXTRACT(EPOCH FROM (NOW() - "heartbeat"))::int AS "edadSegundos"
         FROM "StockAutoTurno"
        WHERE "id" = $1
        LIMIT 1`,
      TURNO_ID
    );

    const f = filas?.[0];
    if (!f) return { pcActiva: null, edadSegundos: null, venceEnSegundos: null };

    const edad = Math.max(0, Math.trunc(Number(f.edadSegundos) || 0));
    return {
      pcActiva: f.pc,
      edadSegundos: edad,
      venceEnSegundos: Math.max(0, TURNO_MINUTOS * 60 - edad),
    };
  } catch {
    return null;
  }
}

// Intenta tomar/renovar el turno para esta PC. Devuelve null si no se pudo
// consultar la base (el agente NO debe actualizar stock sin confirmar turno).
export async function tomarTurnoStockAuto(pc: string): Promise<ResultadoTurno | null> {
  const nombre = limpiarPc(pc);
  if (!nombre) return null;

  const ok = await ensureTablaTurnoStockAuto();
  if (!ok) return null;

  try {
    // UPDATE atomico: solo actualiza si la fila ya es de esta PC o si el
    // latido de la otra PC vencio. Si el WHERE no se cumple, RETURNING no
    // devuelve ninguna fila y esta PC queda en espera.
    const filas = await db.$queryRawUnsafe<FilaTurno[]>(
      `INSERT INTO "StockAutoTurno" ("id", "pc", "heartbeat", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "pc" = EXCLUDED."pc",
         "heartbeat" = NOW(),
         "updatedAt" = NOW()
       WHERE "StockAutoTurno"."pc" = EXCLUDED."pc"
          OR "StockAutoTurno"."heartbeat" < NOW() - make_interval(mins => $3::int)
       RETURNING "pc", "heartbeat"`,
      TURNO_ID,
      nombre,
      TURNO_MINUTOS
    );

    if (filas?.[0]) {
      return {
        activo: true,
        pcActiva: filas[0].pc,
        edadSegundos: 0,
        venceEnSegundos: TURNO_MINUTOS * 60,
      };
    }

    const actual = await leerTurnoStockAuto();
    if (!actual) return null;
    return { activo: false, ...actual };
  } catch {
    return null;
  }
}
