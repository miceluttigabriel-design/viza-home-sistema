// ─── CAPACIDAD POR PRODUCTO (Task 97, pedido del dueño) ───
//
// Columna NUEVA "CAPACIDAD" en la Base (queda entre MODELO y REF.FABRICA,
// en el orden que pidió el dueño). El dato NO existía en ningún lado:
// ni en la planilla LISTA VIZA HOME ni en la base (las capacidades hoy
// viven dentro de la DESCRIPCION: "12.000 BTU", "650M3H", "90CM"...).
// El admin la llena a mano en la tabla (texto libre).
//
// ¿Por qué tabla APARTE y no una columna más del modelo Product?
// Lección de la casa (anotada en src/lib/producto-hashtag.ts): tocar
// Product con columnas nuevas rompía la app cuando el `prisma db push`
// no se había ejecutado. Con tabla aparte AUTO-GESTIONADA (mismo patrón
// que CostoEditado y ProductHashtag, que hoy están en producción) la
// función nueva se activa SOLA y NUNCA rompe nada:
//   · si la tabla todavía no existe, la PRIMERA operación que la usa la
//     crea sola con SQL idempotente (mismos nombres que generaría el
//     `prisma db push` del schema, así que correrlo después no ve
//     ninguna diferencia);
//   · si algo falla, leerCapacidades devuelve mapa vacío (la tabla sigue
//     funcionando igual que siempre, sin CAPACIDAD) y guardarCapacidad
//     devuelve false — nada más se ve afectado.
//
// Lib server-side (usa Prisma). La UI la ve como el campo "capacidad"
// de cada producto (GET /api/products la fusiona, igual que el hashtag).
import { db } from "@/lib/db";

export interface CapacidadProducto {
  valor: string | null;
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
// tabla nueva, jamás toca datos existentes. Mismos nombres que el schema.
export async function ensureTablaProductCapacidad(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "ProductCapacidad" (
         "id" TEXT NOT NULL,
         "productId" TEXT NOT NULL,
         "valor" TEXT,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "ProductCapacidad_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductCapacidad_productId_key"
         ON "ProductCapacidad"("productId")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: capacidades de una página de productos ───
// Devuelve Map productId → valor (string | null). Si la tabla no existe
// todavía → se crea sola y se reintenta una vez; si aun así falla,
// devuelve el mapa vacío y la app sigue funcionando igual que siempre.
export async function leerCapacidades(
  productIds: string[]
): Promise<Map<string, string | null>> {
  const intentar = async (): Promise<Map<string, string | null>> => {
    const mapa = new Map<string, string | null>();
    if (productIds.length === 0) return mapa;
    const filas = await db.productCapacidad.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, valor: true },
    });
    for (const f of filas) {
      mapa.set(f.productId, f.valor);
    }
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaProductCapacidad())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: capacidad de UN producto ───
// valor "" o null → se borra la fila (el producto queda sin capacidad).
// Si la tabla no existe todavía → se crea sola y se reintenta una vez.
// Si aun así falla devuelve false (el PUT responde con error claro) y
// NADA más se ve afectado.
export async function guardarCapacidad(
  productId: string,
  valor: string | null
): Promise<boolean> {
  const intentar = async (): Promise<boolean> => {
    const limpio = valor === null || valor === undefined ? null : String(valor).trim();
    if (limpio === null || limpio === "") {
      await db.productCapacidad.deleteMany({ where: { productId } });
      return true;
    }
    await db.productCapacidad.upsert({
      where: { productId },
      create: { productId, valor: limpio },
      update: { valor: limpio },
    });
    return true;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return false;
    if (!(await ensureTablaProductCapacidad())) return false;
  }
  try {
    return await intentar();
  } catch {
    return false;
  }
}

// ─── IDs de productos cuya capacidad coincide con una búsqueda ───
// Para el BUSCADOR global y los FILTROS por columna de la Base (la
// capacidad no es una columna de Product, así que sus búsquedas se
// resuelven por ids y se injertan en el where como { id: { in: [...] } }).
// Si la tabla no existe → lista vacía (sin resultados de capacidad, la
// búsqueda por los demás campos sigue igual que siempre).
export async function idsPorCapacidad(
  contains: string | null, // búsqueda parcial (buscador global)
  valores: string[] | null // coincidencia exacta (filtro por columna)
): Promise<string[]> {
  const intentar = async (): Promise<string[]> => {
    if (contains !== null) {
      const filas = await db.productCapacidad.findMany({
        where: { valor: { contains, mode: "insensitive" } },
        select: { productId: true },
      });
      return filas.map((f) => f.productId);
    }
    if (valores && valores.length > 0) {
      const filas = await db.productCapacidad.findMany({
        where: { valor: { in: valores } },
        select: { productId: true },
      });
      return filas.map((f) => f.productId);
    }
    return [];
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaProductCapacidad())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── Valores únicos de capacidad (filtro por columna) ───
// Devuelve los valores DISTINTOS con conteo, vacíos al final, igual que
// el resto de las columnas de texto del endpoint /distinct.
export async function valoresDistinctCapacidad(): Promise<
  { value: string; count: number }[]
> {
  const intentar = async (): Promise<{ value: string; count: number }[]> => {
    const filas = await db.productCapacidad.groupBy({
      by: ["valor"],
      _count: true,
    });
    const valores = filas
      .filter((f) => f.valor !== null && String(f.valor).trim() !== "")
      .map((f) => ({ value: String(f.valor), count: f._count }));
    valores.sort((a, b) => a.value.localeCompare(b.value, "es"));
    return valores;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaProductCapacidad())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}
