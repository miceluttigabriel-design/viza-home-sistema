// ─── TASA DE CAMBIO ACTIVA (Task 87, pedido del dueño) ───
// Guarda las tasas de cambio que usa TODO el sistema al convertir costos:
//   cambioRS: R$ (real) → Gs   (antes fija en 1100)
//   cambioUS: US$ (dólar) → Gs (antes fija en 6000)
//
// El dueño puede editarlas desde la Base (botón TASA DE CAMBIO, solo
// supremo_admin) y APLICARLAS a la base general: se recalculan los costos y
// precios de los productos cuyo costo fue cargado en R$ o en US$. Los
// productos con costo cargado directo en Gs NO dependen del cambio y no se
// tocan (igual que siempre).
//
// Se guarda en la tabla APARTE "TasaCambio" (UNA sola fila, id "ACTIVA").
// El modelo Product, los costos de entrada (costBR/costUS/costGs) y todos
// los registros quedan EXACTAMENTE igual que siempre: el cambio solo
// alimenta las fórmulas que ya existían (D = C*cambio, F = E*cambio, ...).
//
// TABLA AUTO-GESTIONADA (mismo patrón probado de CostoEditado): si la tabla
// todavía no existe en la base, la PRIMERA operación que la usa la crea SOLA
// con SQL idempotente (CREATE TABLE IF NOT EXISTS). Así la tasa funciona
// SOLO, sin pasos manuales ni órdenes de pasos. Y NUNCA rompe la app: si
// algo falla al leer, getTasasCambio() devuelve las tasas por defecto
// (1100 / 6000) — o sea, EXACTAMENTE el mismo comportamiento de siempre.
import { db } from "@/lib/db";

// Tasas por defecto = las que el sistema usó toda la vida (hardcodeadas).
// Si la tabla no existe / falla la lectura / todavía nadie aplicó un cambio,
// el sistema sigue con estas — cero sorpresas.
export const TASAS_DEFAULT = {
  cambioRS: 1100, // R$ → Gs (el "$C$1 del Excel" de toda la vida)
  cambioUS: 6000, // US$ → Gs (el "$G$1 del Excel" de toda la vida)
} as const;

export interface TasasCambio {
  cambioRS: number;
  cambioUS: number;
}

// Id fijo de la ÚNICA fila de configuración. Siempre se usa la misma.
export const TASA_ACTIVA_ID = "ACTIVA";

// Límites sanitarios de una tasa válida (evita typos catastróficos tipo
// "0" o "99999999"): mayor que 0 y hasta 10 millones (Gs por unidad).
export const TASA_MIN = 0.01;
export const TASA_MAX = 10_000_000;

export function esTasaValida(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= TASA_MIN &&
    v <= TASA_MAX
  );
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
// "lista" = tabla verificada/creada en esta instancia.
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
export async function ensureTablaTasaCambio(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "TasaCambio" (
         "id" TEXT NOT NULL,
         "cambioRS" DOUBLE PRECISION NOT NULL DEFAULT 1100,
         "cambioUS" DOUBLE PRECISION NOT NULL DEFAULT 6000,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "actualizadoPor" TEXT NOT NULL DEFAULT 'SISTEMA',
         CONSTRAINT "TasaCambio_pkey" PRIMARY KEY ("id")
       )`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura de las tasas activas ───
// NUNCA lanza y NUNCA rompe: si la tabla no existe → se crea sola y
// reintenta; si aun así falla → TASAS_DEFAULT (el comportamiento de
// siempre). Cualquier request del sistema puede llamarla sin miedo.
export async function getTasasCambio(): Promise<TasasCambio> {
  const intentar = async (): Promise<TasasCambio> => {
    const fila = await db.tasaCambio.findUnique({
      where: { id: TASA_ACTIVA_ID },
      select: { cambioRS: true, cambioUS: true },
    });
    // Sin fila todavía = nunca se aplicó un cambio → tasas de siempre.
    if (!fila) return { ...TASAS_DEFAULT };
    return {
      cambioRS: esTasaValida(fila.cambioRS) ? fila.cambioRS : TASAS_DEFAULT.cambioRS,
      cambioUS: esTasaValida(fila.cambioUS) ? fila.cambioUS : TASAS_DEFAULT.cambioUS,
    };
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return { ...TASAS_DEFAULT };
    if (!(await ensureTablaTasaCambio())) return { ...TASAS_DEFAULT };
  }
  try {
    return await intentar();
  } catch {
    return { ...TASAS_DEFAULT };
  }
}

// ─── Meta informativa (para pintar "última actualización" en la Base) ───
// Igual de blanda que getTasasCambio: si falla, devuelve null y la UI
// simplemente no muestra la línea de meta.
export interface TasaCambioMeta {
  cambioRS: number;
  cambioUS: number;
  updatedAt: Date | null;
  actualizadoPor: string | null;
  // true si todavía nadie guardó una tasa (se están usando las de siempre)
  esDefault: boolean;
}

export async function getTasasCambioConMeta(): Promise<TasaCambioMeta> {
  const intentar = async (): Promise<TasaCambioMeta> => {
    const fila = await db.tasaCambio.findUnique({
      where: { id: TASA_ACTIVA_ID },
    });
    if (!fila) {
      return {
        ...TASAS_DEFAULT,
        updatedAt: null,
        actualizadoPor: null,
        esDefault: true,
      };
    }
    return {
      cambioRS: esTasaValida(fila.cambioRS) ? fila.cambioRS : TASAS_DEFAULT.cambioRS,
      cambioUS: esTasaValida(fila.cambioUS) ? fila.cambioUS : TASAS_DEFAULT.cambioUS,
      updatedAt: fila.updatedAt ?? null,
      actualizadoPor: fila.actualizadoPor ?? null,
      esDefault: false,
    };
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      return { ...TASAS_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
    }
    if (!(await ensureTablaTasaCambio())) {
      return { ...TASAS_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
    }
  }
  try {
    return await intentar();
  } catch {
    return { ...TASAS_DEFAULT, updatedAt: null, actualizadoPor: null, esDefault: true };
  }
}

// ─── Guardado (upsert de la fila ACTIVA) ───
// Devuelve las tasas guardadas o null si NO se pudo persistir. El que llama
// decide: el botón APLICAR de la Base aborta si no se pudo guardar (no
// conviene aplicar una tasa que el sistema no va a recordar), pero un fallo
// acá jamás tumba la app (los callers capturan y muestran error de toast).
export async function guardarTasasCambio(
  cambioRS: number,
  cambioUS: number,
  actualizadoPor: string
): Promise<TasasCambio | null> {
  if (!esTasaValida(cambioRS) || !esTasaValida(cambioUS)) return null;
  const intentar = () =>
    db.tasaCambio.upsert({
      where: { id: TASA_ACTIVA_ID },
      update: { cambioRS, cambioUS, actualizadoPor },
      create: { id: TASA_ACTIVA_ID, cambioRS, cambioUS, actualizadoPor },
      select: { cambioRS: true, cambioUS: true },
    });
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return null;
    if (!(await ensureTablaTasaCambio())) return null;
  }
  try {
    return await intentar();
  } catch {
    return null;
  }
}
