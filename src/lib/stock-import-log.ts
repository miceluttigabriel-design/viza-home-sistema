// ─── REGISTRO DE IMPORTACIONES DE STOCK (Task 105, pedido del dueño) ───
// "cada vez que yo suba el excel para actualizar stock y agregar nuevos
//  productos seria importante que lo equipo tenga esto informado en su
//  panel... cantidad de productos nuevos agregados y horario de
//  actualizacion de stock... creame un mini cuadrito lado izquierdo nel
//  panel de ventas... entonces cada vez que actualice nuestro stock el
//  ya se entera cuando fue nuestra ultima actualizacion!"
//
// Cada vez que el supremo aplica la planilla (import-stock/apply) se
// guarda UNA fila acá con: fecha/hora, cuántos productos NUEVOS se
// agregaron y cuántos existentes se actualizaron. El panel de ventas lee
// la última fila y la muestra en el mini cuadrito del lado izquierdo del
// header. El equipo siempre sabe cuándo fue la última actualización.
//
// TABLA AUTO-GESTIONADA (mismo espíritu de StockSucursal del Task 98 y de
// src/lib/producto-hashtag.ts): si la tabla todavía no existe en la base,
// la PRIMERA operación que la usa la crea SOLA con SQL idempotente
// (CREATE TABLE IF NOT EXISTS), con los mismos nombres de tabla/columna
// que generaría `npx prisma db push` con el schema del repo. Así NO hay
// que correr ningún comando manual en producción: se activa sola en la
// próxima importación. Y NUNCA rompe nada: toda función es best-effort,
// ante cualquier error devuelve false / null y la importación o la
// lectura del panel siguen funcionando igual que siempre.
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface UltimaImportacionStock {
  fecha: string; // ISO (UTC) → el navegador la muestra en hora local
  nuevos: number; // productos NUEVOS agregados en esa importación
  actualizados: number; // productos existentes actualizados (stock/costo)
  usuarioEmail: string | null; // quién la aplicó (solo informativo)
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes. Mismos nombres que `prisma
// db push` generaría del modelo StockImportLog del schema.
export async function ensureTablaStockImportLog(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "StockImportLog" (
         "id" TEXT NOT NULL,
         "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "nuevos" INTEGER NOT NULL DEFAULT 0,
         "actualizados" INTEGER NOT NULL DEFAULT 0,
         "usuarioEmail" TEXT,
         CONSTRAINT "StockImportLog_pkey" PRIMARY KEY ("id")
       )`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

function nuevoId(): string {
  try {
    return `sil-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `sil-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// ─── Escritura: deja constancia de UNA importación aplicada ───
// Se llama al final de import-stock/apply, DESPUÉS de que la planilla ya
// se aplicó. Best-effort total: si algo falla (tabla no se pudo crear, BD
// caída, etc.) devuelve false y NO levanta ningún error — la importación
// ya quedó hecha y es lo importante; el cuadrito simplemente seguirá
// mostrando la importación anterior hasta la próxima vez.
export async function registrarImportacionStock(datos: {
  nuevos: number;
  actualizados: number;
  usuarioEmail?: string | null;
}): Promise<boolean> {
  try {
    if (!(await ensureTablaStockImportLog())) return false;
    const nuevos = Math.max(0, Math.floor(Number(datos.nuevos) || 0));
    const actualizados = Math.max(0, Math.floor(Number(datos.actualizados) || 0));
    const email = (datos.usuarioEmail || "").trim().toLowerCase() || null;
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "StockImportLog" ("id", "fecha", "nuevos", "actualizados", "usuarioEmail")
        VALUES (${nuevoId()}, CURRENT_TIMESTAMP, ${nuevos}, ${actualizados}, ${email})
      `
    );
    return true;
  } catch {
    // El cuadrito informativo NUNCA puede romper la importación.
    return false;
  }
}

// ─── Lectura: la última importación registrada ───
// Devuelve null si nunca se registró una importación (o la tabla aún no
// existe). Best-effort: el panel muestra "sin registros" y todo lo demás
// sigue funcionando igual que siempre.
export async function leerUltimaImportacionStock(): Promise<UltimaImportacionStock | null> {
  const intentar = async (): Promise<UltimaImportacionStock | null> => {
    const fila = await db.stockImportLog.findFirst({
      orderBy: { fecha: "desc" },
      select: { fecha: true, nuevos: true, actualizados: true, usuarioEmail: true },
    });
    if (!fila) return null;
    return {
      fecha: fila.fecha.toISOString(),
      nuevos: fila.nuevos,
      actualizados: fila.actualizados,
      usuarioEmail: fila.usuarioEmail,
    };
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return null;
    if (!(await ensureTablaStockImportLog())) return null;
  }
  try {
    return await intentar();
  } catch {
    return null;
  }
}
