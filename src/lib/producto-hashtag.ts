// ─── #HASHTAG POR PRODUCTO (promo del admin) ───
// El admin carga en la base un VALOR en Gs + una FECHA de validez
// (calendario) por producto, en la columna #HASHTAG (al lado de
// DESCRIPCION). Cuando el vendedor busca ese producto, el resultado
// muestra "# 100.000 GS valido hasta 30/11/2026".
//
// Se guarda en la tabla APARTE "ProductHashtag" (una fila por producto).
// El modelo Product queda EXACTAMENTE igual que siempre (misma lección
// de CostoEditado: tocar Product con columnas nuevas rompía la app
// cuando el db push no se había ejecutado).
//
// TABLA AUTO-GESTIONADA (mismo patrón que src/lib/costo-editado.ts):
// si la tabla todavía no existe en la base, la PRIMERA operación que la
// usa la crea SOLA con SQL idempotente (CREATE TABLE / CREATE INDEX IF
// NOT EXISTS). Así el #HASHTAG se activa SOLO, sin pasos manuales. Y
// NUNCA rompe la app: si algo falla, leerHashtags devuelve un mapa
// vacío (sin hashtag en los resultados) y guardarHashtag devuelve false
// — todo lo demás sigue funcionando igual que siempre.
import { db } from "@/lib/db";
import { hashtagVisibleParaVendedor, hoyParaguay } from "@/lib/hashtag-formato";

export interface HashtagProducto {
  valor: number | null;
  fecha: string | null; // "YYYY-MM-DD"
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
// tabla/columna/índice que generaría `npx prisma db push` con el schema del
// repo, así que correr el db push después no ve ninguna diferencia.
export async function ensureTablaProductoHashtag(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "ProductHashtag" (
         "id" TEXT NOT NULL,
         "productId" TEXT NOT NULL,
         "valor" DOUBLE PRECISION,
         "fecha" TEXT,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "ProductHashtag_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductHashtag_productId_key"
         ON "ProductHashtag"("productId")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: hashtags de una página de productos ───
// Devuelve Map productId → {valor, fecha}. Si la tabla no existe todavía
// → se crea sola y se reintenta una vez; si aun así falla, devuelve el
// mapa vacío (sin hashtags) y la app sigue funcionando igual que siempre.
export async function leerHashtags(
  productIds: string[]
): Promise<Map<string, HashtagProducto>> {
  const intentar = async (): Promise<Map<string, HashtagProducto>> => {
    const mapa = new Map<string, HashtagProducto>();
    if (productIds.length === 0) return mapa;
    const filas = await db.productHashtag.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, valor: true, fecha: true },
    });
    for (const f of filas) {
      mapa.set(f.productId, { valor: f.valor, fecha: f.fecha });
    }
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaProductoHashtag())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: hashtag de UN producto (valor + fecha) ───
// Si ambos son null/vacíos se borra la fila (el producto queda sin promo).
// Si la tabla no existe todavía → se crea sola y se reintenta una vez.
// Si aun así falla devuelve false (el endpoint responde 500 con mensaje
// claro) y NADA más se ve afectado.
export async function guardarHashtag(
  productId: string,
  valor: number | null,
  fecha: string | null
): Promise<boolean> {
  const intentar = async (): Promise<boolean> => {
    if (valor === null && (fecha === null || fecha === "")) {
      await db.productHashtag.deleteMany({ where: { productId } });
      return true;
    }
    await db.productHashtag.upsert({
      where: { productId },
      create: { productId, valor, fecha },
      update: { valor, fecha },
    });
    return true;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return false;
    if (!(await ensureTablaProductoHashtag())) return false;
  }
  try {
    return await intentar();
  } catch {
    return false;
  }
}

// ─── Filtro #HASHTAG (T123, pedido del dueño) ───
// Ids de los productos que TIENEN un # real cargado (valor >= 1: un valor
// < 1 no es un # real — ver valorGsRealesHashtag en hashtag-formato.ts).
//   · soloVisibles=false (admin / supremo / consulta) → TODOS, también los
//     vencidos (es su base de trabajo: la celda roja les avisa para renovar).
//   · soloVisibles=true (vendedores) → SOLO los no vencidos: la MISMA regla
//     de visibilidad de la Task 95 que ya gobierna el buscador.
// Si la tabla todavía no existe se crea sola y se reintenta una vez; si aun
// así falla devuelve [] (ningún producto coincide) y la app sigue igual.
export async function idsProductosConHashtag(soloVisibles: boolean): Promise<string[]> {
  const intentar = async (): Promise<string[]> => {
    const filas = await db.productHashtag.findMany({
      where: { valor: { gte: 1 } },
      select: { productId: true, fecha: true },
    });
    if (!soloVisibles) return filas.map((f) => f.productId);
    const hoy = hoyParaguay();
    return filas
      .filter((f) => hashtagVisibleParaVendedor(f.fecha, hoy))
      .map((f) => f.productId);
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaProductoHashtag())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}
