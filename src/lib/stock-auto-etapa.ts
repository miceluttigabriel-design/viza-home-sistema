// ============================================================================
//  STOCK AUTOMATICO - ETAPA EN VIVO
// ----------------------------------------------------------------------------
//  El agente avisa en que paso esta (exportando / preview / aplicando) para
//  que el panel no muestre un boton girando sin explicacion.
//
//  Tabla aparte, auto-gestionada (mismo patron que ConfigStockAuto): si no
//  existe, la primera escritura la crea. NUNCA se toca ConfigStockAuto, asi
//  que no hace falta migracion ni `prisma db push`.
// ============================================================================
import { db } from "@/lib/db";

const ETAPA_ID = "ACTIVA";

// Si la etapa quedo vieja (la PC se colgo a mitad de camino), se ignora.
const ETAPA_VIGENTE_MINUTOS = 15;

export interface EtapaStockAuto {
  etapa: string | null;
  mensaje: string | null;
  desde: string | null;
}

let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

async function ensureTablaEtapa(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "StockAutoEtapa" (
         "id" TEXT NOT NULL,
         "etapa" TEXT,
         "mensaje" TEXT,
         "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "StockAutoEtapa_pkey" PRIMARY KEY ("id")
       )`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

const aIso = (v: Date | null | undefined): string | null =>
  v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : null;

// El agente informa en que anda. etapa vacia = limpiar (quedo en espera).
export async function registrarEtapaStockAuto(
  etapa: string | null,
  mensaje: string | null = null
): Promise<void> {
  const limpia = (etapa || "").trim().slice(0, 40) || null;
  const texto = (mensaje || "").trim().slice(0, 200) || null;
  try {
    const ok = await ensureTablaEtapa();
    if (!ok) return;
    await db.$executeRawUnsafe(
      `INSERT INTO "StockAutoEtapa" ("id", "etapa", "mensaje", "desde")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "etapa" = EXCLUDED."etapa",
         "mensaje" = EXCLUDED."mensaje",
         "desde" = NOW()`,
      ETAPA_ID,
      limpia,
      texto
    );
  } catch {
    // La etapa es informativa: si falla, no rompe nada.
  }
}

// Lee la etapa vigente. Si la ultima tiene mas de 15 minutos, se descarta
// (la PC pudo haberse colgado y no queremos un "EXPORTANDO" eterno).
export async function getEtapaStockAuto(): Promise<EtapaStockAuto> {
  const vacia: EtapaStockAuto = { etapa: null, mensaje: null, desde: null };
  try {
    const ok = await ensureTablaEtapa();
    if (!ok) return vacia;

    const filas = await db.$queryRawUnsafe<
      Array<{ etapa: string | null; mensaje: string | null; desde: Date | null; vieja: boolean }>
    >(
      `SELECT "etapa", "mensaje", "desde",
              ("desde" < NOW() - make_interval(mins => $2::int)) AS "vieja"
         FROM "StockAutoEtapa"
        WHERE "id" = $1
        LIMIT 1`,
      ETAPA_ID,
      ETAPA_VIGENTE_MINUTOS
    );

    const f = filas?.[0];
    if (!f || f.vieja || !f.etapa) return vacia;
    return { etapa: f.etapa, mensaje: f.mensaje ?? null, desde: aIso(f.desde) };
  } catch {
    return vacia;
  }
}
