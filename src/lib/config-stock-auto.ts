// ============================================================================
//  STOCK AUTOMATICO (CtrCredito -> sistema.viza.com.py) - CONFIGURACION
// ----------------------------------------------------------------------------
//  Guarda el INTERRUPTOR ON/OFF y el estado de la ultima corrida del robot
//  que exporta el inventario del CtrCredito y lo importa en STOCK GENERAL
//  (el mismo boton IMPORTAR PLANILLA, pero sin que nadie lo apriete).
//
//  El robot corre en la PC de la empresa (el CtrCredito vive en la red
//  interna 170.233.219.8, no se puede llamar desde Vercel). Esa PC consulta
//  esta configuracion cada minuto:
//      - si "habilitado" = false  -> no hace nada
//      - si "pedidoManual" tiene fecha nueva -> corre YA (boton del panel)
//      - si no, corre 1 vez por hora dentro de la ventana 07:00 - 21:00
//  Al terminar deja el resultado aca, y la Base lo muestra.
//
//  TABLA AUTO-GESTIONADA (mismo patron probado de ConfigBackup /
//  TasaCambio): si la tabla todavia no existe, la PRIMERA operacion la crea
//  sola con SQL idempotente (CREATE TABLE IF NOT EXISTS). Asi el interruptor
//  funciona sin correr `prisma db push` y NUNCA rompe la app: si algo falla
//  al leer, se devuelve el default (ACTIVADO) y el panel sigue andando.
// ============================================================================
import { db } from "@/lib/db";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";

// Id fijo de la UNICA fila de configuracion. Siempre se usa la misma.
export const CONFIG_STOCK_AUTO_ID = "ACTIVA";

// Minutos que se considera "fresca" la senal de la PC del robot. Si la PC
// esta apagada, el panel lo muestra en vez de mentir "todo bien".
export const HEARTBEAT_MINUTOS = 5;

// Un pedido manual sin atender vence a los 30 minutos: si la PC estaba
// apagada cuando alguien apreto el boton, no se dispara solo horas despues.
export const PEDIDO_VIGENTE_MINUTOS = 30;

export interface ConfigStockAuto {
  habilitado: boolean;
  ultimaCorrida: string | null;
  ultimaOk: boolean | null;
  ultimoMensaje: string | null;
  ultimosNuevos: number;
  ultimosActualizados: number;
  pedidoManual: string | null;
  heartbeat: string | null;
  actualizadoPor: string;
  updatedAt: string | null;
  esDefault: boolean;
}

// Default = ACTIVADO: el duenio pidio que la actualizacion corra todos los
// dias desde las 07:00; el interruptor esta para PAUSARLA cuando haga falta.
export const CONFIG_STOCK_AUTO_DEFAULT: ConfigStockAuto = {
  habilitado: true,
  ultimaCorrida: null,
  ultimaOk: null,
  ultimoMensaje: null,
  ultimosNuevos: 0,
  ultimosActualizados: 0,
  pedidoManual: null,
  heartbeat: null,
  actualizadoPor: "SISTEMA",
  updatedAt: null,
  esDefault: true,
};

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

interface FilaConfig {
  habilitado: boolean;
  ultimaCorrida: Date | null;
  ultimaOk: boolean | null;
  ultimoMensaje: string | null;
  ultimosNuevos: number;
  ultimosActualizados: number;
  pedidoManual: Date | null;
  heartbeat: Date | null;
  actualizadoPor: string | null;
  updatedAt: Date | null;
}

// Crea la tabla si no existe. Idempotente: SOLO agrega una tabla nueva, jamas
// toca datos existentes. Mismos nombres que generaria `prisma db push`.
export async function ensureTablaConfigStockAuto(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "ConfigStockAuto" (
         "id" TEXT NOT NULL,
         "habilitado" BOOLEAN NOT NULL DEFAULT true,
         "ultimaCorrida" TIMESTAMP(3),
         "ultimaOk" BOOLEAN,
         "ultimoMensaje" TEXT,
         "ultimosNuevos" INTEGER NOT NULL DEFAULT 0,
         "ultimosActualizados" INTEGER NOT NULL DEFAULT 0,
         "pedidoManual" TIMESTAMP(3),
         "heartbeat" TIMESTAMP(3),
         "actualizadoPor" TEXT NOT NULL DEFAULT 'SISTEMA',
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "ConfigStockAuto_pkey" PRIMARY KEY ("id")
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

const haceMinutos = (fecha: string | null, minutos: number): boolean => {
  if (!fecha) return false;
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > minutos * 60 * 1000;
};

// Lee la configuracion. Si la tabla no existe todavia (o falla), devuelve el
// default ACTIVADO: el panel sigue andando y el robot no se queda mudo.
export async function getConfigStockAuto(): Promise<ConfigStockAuto> {
  try {
    const ok = await ensureTablaConfigStockAuto();
    if (!ok) return { ...CONFIG_STOCK_AUTO_DEFAULT };

    const filas = await db.$queryRawUnsafe<FilaConfig[]>(
      `SELECT "habilitado", "ultimaCorrida", "ultimaOk", "ultimoMensaje",
              "ultimosNuevos", "ultimosActualizados", "pedidoManual",
              "heartbeat", "actualizadoPor", "updatedAt"
         FROM "ConfigStockAuto"
        WHERE "id" = $1
        LIMIT 1`,
      CONFIG_STOCK_AUTO_ID
    );

    const f = filas?.[0];
    if (!f) return { ...CONFIG_STOCK_AUTO_DEFAULT };

    const pedido = aIso(f.pedidoManual);
    return {
      habilitado: f.habilitado === true,
      ultimaCorrida: aIso(f.ultimaCorrida),
      ultimaOk: typeof f.ultimaOk === "boolean" ? f.ultimaOk : null,
      ultimoMensaje: f.ultimoMensaje ?? null,
      ultimosNuevos: Number(f.ultimosNuevos) || 0,
      ultimosActualizados: Number(f.ultimosActualizados) || 0,
      // Un pedido viejo (PC apagada) se ignora: no se dispara solo.
      pedidoManual: haceMinutos(pedido, PEDIDO_VIGENTE_MINUTOS) ? null : pedido,
      heartbeat: aIso(f.heartbeat),
      actualizadoPor: f.actualizadoPor || "SISTEMA",
      updatedAt: aIso(f.updatedAt),
      esDefault: false,
    };
  } catch {
    return { ...CONFIG_STOCK_AUTO_DEFAULT };
  }
}

// Mueve el interruptor ON/OFF. Devuelve null si no se pudo guardar.
export async function guardarHabilitadoStockAuto(
  habilitado: boolean,
  por: string
): Promise<boolean | null> {
  try {
    const ok = await ensureTablaConfigStockAuto();
    if (!ok) return null;
    await db.$executeRawUnsafe(
      `INSERT INTO "ConfigStockAuto" ("id", "habilitado", "actualizadoPor", "updatedAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "habilitado" = EXCLUDED."habilitado",
         "actualizadoPor" = EXCLUDED."actualizadoPor",
         "updatedAt" = NOW()`,
      CONFIG_STOCK_AUTO_ID,
      habilitado,
      por
    );
    return habilitado;
  } catch {
    return null;
  }
}

// Boton ACTUALIZAR AHORA: deja un pedido para que la PC lo tome en <= 1 min.
export async function pedirCorridaStockAuto(por: string): Promise<boolean> {
  try {
    const ok = await ensureTablaConfigStockAuto();
    if (!ok) return false;
    await db.$executeRawUnsafe(
      `INSERT INTO "ConfigStockAuto" ("id", "habilitado", "pedidoManual", "actualizadoPor", "updatedAt")
       VALUES ($1, true, NOW(), $2, NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "pedidoManual" = NOW(),
         "actualizadoPor" = EXCLUDED."actualizadoPor",
         "updatedAt" = NOW()`,
      CONFIG_STOCK_AUTO_ID,
      por
    );
    return true;
  } catch {
    return false;
  }
}

// Senal de vida de la PC (el robot la manda en cada consulta). Se escribe
// como maximo cada 4 minutos para no castigar la base con cada ping.
export async function registrarHeartbeatStockAuto(): Promise<void> {
  try {
    const ok = await ensureTablaConfigStockAuto();
    if (!ok) return;
    await db.$executeRawUnsafe(
      `INSERT INTO "ConfigStockAuto" ("id", "heartbeat", "actualizadoPor", "updatedAt")
       VALUES ($1, NOW(), 'AGENTE', NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "heartbeat" = NOW()
       WHERE "ConfigStockAuto"."heartbeat" IS NULL
          OR "ConfigStockAuto"."heartbeat" < NOW() - INTERVAL '4 minutes'`,
      CONFIG_STOCK_AUTO_ID
    );
  } catch {
    // sin senal => el panel muestra "PC sin senal". Nada mas.
  }
}

// El robot termina una corrida (bien o mal) y lo deja registrado. Ademas
// limpia el pedido manual: ya se atendio.
export async function registrarResultadoStockAuto(datos: {
  ok: boolean;
  nuevos: number;
  actualizados: number;
  mensaje: string;
}): Promise<void> {
  const nuevos = Math.max(0, Math.trunc(Number(datos.nuevos) || 0));
  const actualizados = Math.max(0, Math.trunc(Number(datos.actualizados) || 0));
  const mensaje = (datos.mensaje || "").slice(0, 500);
  try {
    const ok = await ensureTablaConfigStockAuto();
    if (!ok) return;
    await db.$executeRawUnsafe(
      `INSERT INTO "ConfigStockAuto"
         ("id", "ultimaCorrida", "ultimaOk", "ultimoMensaje", "ultimosNuevos",
          "ultimosActualizados", "pedidoManual", "heartbeat", "actualizadoPor", "updatedAt")
       VALUES ($1, NOW(), $2, $3, $4, $5, NULL, NOW(), 'AGENTE', NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "ultimaCorrida" = NOW(),
         "ultimaOk" = EXCLUDED."ultimaOk",
         "ultimoMensaje" = EXCLUDED."ultimoMensaje",
         "ultimosNuevos" = EXCLUDED."ultimosNuevos",
         "ultimosActualizados" = EXCLUDED."ultimosActualizados",
         "pedidoManual" = NULL,
         "heartbeat" = NOW(),
         "actualizadoPor" = 'AGENTE',
         "updatedAt" = NOW()`,
      CONFIG_STOCK_AUTO_ID,
      datos.ok === true,
      mensaje,
      nuevos,
      actualizados
    );
  } catch {
    // el proximo ping vuelve a mandar el estado; el panel no se rompe
  }
}

// Quien puede ver/mover el interruptor: admins y supremo, NUNCA los usuarios
// de consulta (regla unica en usuarios-consulta.ts, manda por encima de todo).
export function puedeControlarStockAuto(
  role: string | null | undefined,
  email: string | null | undefined
): boolean {
  const r = (role || "").trim().toLowerCase();
  if (r !== "admin" && r !== "supremo_admin") return false;
  const e = (email || "").trim();
  if (!e) return false;
  return !esEmailSoloLectura(e);
}
