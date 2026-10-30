// ─── ETIQUETAS DE COLOR CREADAS POR EL SUPREMO (Task 84) ───
// Las 4 etiquetas fijas (verde, azul, dorado, rojo) siguen IGUAL que
// siempre, hardcodeadas en la UI. Este lib maneja las etiquetas EXTRA
// que el supremo_admin crea con el botón CREAR ETIQUETA de la Base:
// una fila por etiqueta con nombre visible + color "#RRGGBB".
//
// El producto guarda en su columna etiquetaColor (LA MISMA COLUMNA DE
// SIEMPRE) el id de la etiqueta creada — no se agrega ninguna columna
// a Product, así que filtros, importaciones y el PUT siguen intactos.
//
// TABLA AUTO-GESTIONADA (mismo patrón que src/lib/costo-editado.ts y
// src/lib/producto-hashtag.ts): si la tabla todavía no existe en la
// base, la PRIMERA operación que la usa la crea SOLA con SQL
// idempotente (CREATE TABLE / CREATE INDEX IF NOT EXISTS). NUNCA toca
// datos existentes y NUNCA rompe la app: si algo falla, leer devuelve
// lista vacía y crear/borrar devuelven error con mensaje claro.
import { db } from "@/lib/db";

export interface EtiquetaCreada {
  id: string;
  nombre: string;
  color: string; // "#RRGGBB"
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes. Usa los mismos nombres de
// tabla/columna/índice que generaría `npx prisma db push` con el schema
// del repo, así que correr el db push después no ve ninguna diferencia.
export async function ensureTablaEtiquetas(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "Etiqueta" (
         "id" TEXT NOT NULL,
         "nombre" TEXT NOT NULL,
         "color" TEXT NOT NULL,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Etiqueta_nombre_key"
         ON "Etiqueta"("nombre")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: etiquetas creadas (ordenadas por nombre) ───
// Si la tabla no existe todavía → se crea sola y se reintenta una vez;
// si aun así falla, devuelve [] (solo quedan las 4 fijas de siempre).
export async function leerEtiquetasCreadas(): Promise<EtiquetaCreada[]> {
  const intentar = async (): Promise<EtiquetaCreada[]> => {
    const filas = await db.etiqueta.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, color: true },
    });
    return filas;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaEtiquetas())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// Normaliza un color a "#RRGGBB" (mayúsculas). Acepta "#RGB" y "#RRGGBB".
// Devuelve null si no es un hex válido.
export function normalizarColorHex(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let v = valor.trim().toUpperCase();
  if (!v.startsWith("#")) return null;
  v = v.slice(1);
  if (/^[0-9A-F]{3}$/.test(v)) {
    v = v
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9A-F]{6}$/.test(v)) return null;
  return `#${v}`;
}

// ─── Lectura: ¿existe una etiqueta creada con este id? ───
// La usa el API de etiquetado de filas (PATCH /api/products/[id]/label)
// para aceptar, además de las 4 fijas, los ids de etiquetas creadas.
// Si la tabla no existe → false (solo quedan las fijas) y nada se rompe.
export async function existeEtiquetaCreada(id: string): Promise<boolean> {
  const intentar = async (): Promise<boolean> => {
    const fila = await db.etiqueta.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!fila;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return false;
    if (!(await ensureTablaEtiquetas())) return false;
  }
  try {
    return await intentar();
  } catch {
    return false;
  }
}

// ─── Escritura: crear etiqueta (solo la llama el API con supremo) ───
// Nombre: trim, SIEMPRE EN MAYÚSCULAS (Task 100, pedido del dueño:
// "Estos nonbres de Etiquetas deben ser siempre en MAYUSCULAS"), 1..40
// caracteres, ÚNICO (comparación sin mayúsculas y sin espacios de los
// bordes). Color: "#RRGGBB" ya normalizado.
// Devuelve { ok: true, etiqueta } o { ok: false, error }.
export async function crearEtiqueta(
  nombreRaw: unknown,
  colorRaw: unknown
): Promise<{ ok: boolean; error?: string; etiqueta?: EtiquetaCreada }> {
  const nombre =
    typeof nombreRaw === "string" ? nombreRaw.trim().toUpperCase().slice(0, 40) : "";
  if (!nombre) return { ok: false, error: "Falta el nombre de la etiqueta" };
  const color = normalizarColorHex(colorRaw);
  if (!color) return { ok: false, error: "Color inválido (se espera un hex #RRGGBB)" };

  const intentar = async (): Promise<EtiquetaCreada> => {
    // Nombre único sin distinguir mayúsculas ni espacios de más.
    const dup = await db.etiqueta.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
      select: { id: true },
    });
    if (dup) throw new Error("DUP");
    const fila = await db.etiqueta.create({
      data: { nombre, color },
      select: { id: true, nombre: true, color: true },
    });
    return fila;
  };
  try {
    const etiqueta = await intentar();
    return { ok: true, etiqueta };
  } catch (error) {
    if (error instanceof Error && error.message === "DUP") {
      return { ok: false, error: `Ya existe una etiqueta con el nombre "${nombre}"` };
    }
    if (!esErrorTablaFaltante(error)) {
      return { ok: false, error: "No se pudo crear la etiqueta" };
    }
    if (!(await ensureTablaEtiquetas())) {
      return { ok: false, error: "No se pudo crear la etiqueta" };
    }
  }
  try {
    const etiqueta = await intentar();
    return { ok: true, etiqueta };
  } catch (error) {
    if (error instanceof Error && error.message === "DUP") {
      return { ok: false, error: `Ya existe una etiqueta con el nombre "${nombre}"` };
    }
    return { ok: false, error: "No se pudo crear la etiqueta" };
  }
}

// ─── Escritura: borrar etiqueta creada (solo la llama el API con supremo) ───
// Las 4 fijas NUNCA se pueden borrar (el API ni siquiera llega acá con
// ellas, pero se re-valida por las dudas). Al borrar, los productos que
// tenían esa etiqueta quedan SIN etiqueta (etiquetaColor = null) — lo
// mismo que pasaría si el admin les quitara la etiqueta a mano.
export async function borrarEtiqueta(
  id: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, error: "Falta el id de la etiqueta" };
  }
  const FIJAS = ["verde", "azul", "dorado", "rojo"];
  if (FIJAS.includes(id)) {
    return { ok: false, error: "Las 4 etiquetas fijas no se pueden borrar" };
  }
  const intentar = async (): Promise<void> => {
    await db.product.updateMany({
      where: { etiquetaColor: id },
      data: { etiquetaColor: null },
    });
    await db.etiqueta.deleteMany({ where: { id } });
  };
  try {
    await intentar();
    return { ok: true };
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      return { ok: false, error: "No se pudo borrar la etiqueta" };
    }
    if (!(await ensureTablaEtiquetas())) {
      return { ok: false, error: "No se pudo borrar la etiqueta" };
    }
  }
  try {
    await intentar();
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo borrar la etiqueta" };
  }
}
