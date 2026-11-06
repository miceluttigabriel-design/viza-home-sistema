// ─── STOCK IDEAL POR PRODUCTO Y SUCURSAL (Task 127, pedido del dueño) ───
//
// Módulo de DISTRIBUCIÓN INTELIGENTE DE INVENTARIO:
// "El sistema debe analizar el stock existente entre las sucursales y
//  generar automáticamente un reporte de transferencias internas para
//  equilibrar el inventario. NO debe generar órdenes de compra a
//  proveedores, solo movimientos entre sucursales (de donde sobra a
//  donde falta)".
//
// Para poder decir qué es SOBRA y qué es FALTA hace falta un "STOCK
// IDEAL" definido POR PRODUCTO Y POR SUCURSAL (regla de negocio 2 del
// dueño). Ese dato vive en la tabla APARTE "ProductStockIdeal" — MISMO
// patrón que StockSucursal / ProductCapacidad / ProductHashtag:
//   · tocar Product con columnas nuevas rompía la app cuando el db push
//     no se había ejecutado (lección de la casa);
//   · tabla AUTO-GESTIONADA: si todavía no existe, la PRIMERA operación
//     que la usa la crea SOLA con SQL idempotente (mismos nombres que
//     generaría el `prisma db push` del schema, así que correrlo después
//     no ve ninguna diferencia);
//   · si algo falla, las lecturas devuelven vacío y la app sigue
//     funcionando igual que siempre — NUNCA rompe.
//
// Lib server-side (usa Prisma). Cada fila = cuántas unidades DEBERÍA
// haber de ese producto en ESE nodo ("CENTRAL" incluido: es el depósito
// central y también da y recibe transferencias).
import { db } from "@/lib/db";

export interface IdealItem {
  productId: string;
  sucursal: string;
  ideal: number;
}

export interface GuardarIdealesResultado {
  ok: boolean;
  filas: number; // filas escritas (upserts)
  borradas: number; // ideales que se quitaron (valor 0)
  errores: string[];
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes.
export async function ensureTablaProductStockIdeal(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "ProductStockIdeal" (
         "id" TEXT NOT NULL,
         "productId" TEXT NOT NULL,
         "sucursal" TEXT NOT NULL,
         "ideal" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "ProductStockIdeal_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductStockIdeal_productId_sucursal_key"
         ON "ProductStockIdeal"("productId", "sucursal")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ProductStockIdeal_sucursal_idx"
         ON "ProductStockIdeal"("sucursal")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: ideales de una lista de productos ───
// Devuelve Map productId → (Map sucursal → ideal). SOLO ideales > 0:
// un nodo sin fila (o con 0) se considera "sin ideal definido" y el
// algoritmo de distribución NO lo toca (ni lo trata como excedente ni
// como déficit) — regla de seguridad para no "vaciar" productos en
// nodos donde el dueño todavía no configuró nada.
export async function leerIdeales(
  productIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const intentar = async (): Promise<Map<string, Map<string, number>>> => {
    const mapa = new Map<string, Map<string, number>>();
    if (productIds.length === 0) return mapa;
    const filas = await db.productStockIdeal.findMany({
      where: { productId: { in: productIds }, ideal: { gt: 0 } },
      select: { productId: true, sucursal: true, ideal: true },
    });
    for (const f of filas) {
      let porProducto = mapa.get(f.productId);
      if (!porProducto) {
        porProducto = new Map<string, number>();
        mapa.set(f.productId, porProducto);
      }
      porProducto.set(f.sucursal, f.ideal);
    }
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaProductStockIdeal())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Lectura: ids de productos que TIENEN al menos un ideal definido ───
// El reporte de distribución solo calcula con estos productos (los que
// no tienen ideal configurado no aparecen — no hay contra qué comparar).
export async function productIdsConIdeal(): Promise<string[]> {
  const intentar = async (): Promise<string[]> => {
    const filas = await db.productStockIdeal.findMany({
      where: { ideal: { gt: 0 } },
      select: { productId: true },
      distinct: ["productId"],
    });
    return filas.map((f) => f.productId);
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaProductStockIdeal())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── Escritura: guardar una tanda de ideales (upsert por producto+sucursal) ───
// ideal <= 0 o vacío → se BORRA la fila (el nodo queda "sin ideal").
// Devuelve cuántas filas escribió/borró; si la tabla no existe la crea
// sola; si un ítem falla, sigue con los demás y acumula el error.
export async function guardarIdeales(
  items: IdealItem[]
): Promise<GuardarIdealesResultado> {
  const resultado: GuardarIdealesResultado = {
    ok: false,
    filas: 0,
    borradas: 0,
    errores: [],
  };
  try {
    if (!(await ensureTablaProductStockIdeal())) {
      resultado.errores.push(
        "No se pudo crear/verificar la tabla ProductStockIdeal (falta db push). Reintente más tarde."
      );
      return resultado;
    }
    for (const item of items || []) {
      const sucursal = String(item?.sucursal || "").trim().toUpperCase();
      const productId = String(item?.productId || "").trim();
      if (!productId || !sucursal) {
        resultado.errores.push("Ítem sin productId o sucursal: ignorado.");
        continue;
      }
      const n = Math.max(0, Math.floor(Number(item?.ideal) || 0));
      try {
        if (n <= 0) {
          const r = await db.productStockIdeal.deleteMany({
            where: { productId, sucursal },
          });
          resultado.borradas += r.count;
        } else {
          await db.productStockIdeal.upsert({
            where: { productId_sucursal: { productId, sucursal } },
            create: { productId, sucursal, ideal: n },
            update: { ideal: n },
          });
          resultado.filas += 1;
        }
      } catch (err: any) {
        resultado.errores.push(
          `${productId} · ${sucursal}: ${err?.message || String(err)}`
        );
      }
    }
    resultado.ok = resultado.errores.length === 0;
    return resultado;
  } catch (error: any) {
    resultado.errores.push(error?.message || String(error));
    return resultado;
  }
}
