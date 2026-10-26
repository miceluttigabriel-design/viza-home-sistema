// ─── COSTOS EDITADOS POR EL ADMIN (guardados) ───
// Registro de qué celdas de COSTO editó a mano el admin y guardó.
// Sirve para dos cosas (pedido del usuario):
//   1) Pintar de DORADO VIBRANTE la celda editada en la tabla del Panel ADM
//      (para discernirla de un costo traído por importación).
//   2) Proteger esos costos al importar la planilla de stock: los productos
//      con costos editados SOLO actualizan el SALDO (stock), el costo que el
//      admin fijó nunca se pisa.
//
// Se guarda en la tabla APARTE "CostoEditado" (una fila por celda editada).
// El modelo Product queda EXACTAMENTE igual que siempre.
//
// TABLA AUTO-GESTIONADA (lección de las versiones anteriores): si la tabla
// todavía no existe en la base (por ejemplo porque nunca se corrió
// `npx prisma db push`), la PRIMERA operación que la usa la crea SOLA con
// SQL idempotente (CREATE TABLE / CREATE INDEX IF NOT EXISTS). Así el dorado
// y la protección se activan SOLOS, sin pasos manuales ni órdenes de pasos.
// Y NUNCA rompen la app: si algo falla, todas las funciones devuelven el
// mismo resultado que antes de existir esta funcionalidad (sin marcas).
import { db } from "@/lib/db";

// Las 8 columnas de COSTO editables por el admin (inputs del grupo COSTOS).
export const COSTO_EDIT_KEYS = [
  "costBR", "costUS", "costGs",
  "discountPct", "addPct", "admPct",
  "valorDesc", "valorAdd",
];

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
export async function ensureTablaCostoEditado(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "CostoEditado" (
         "id" TEXT NOT NULL,
         "productId" TEXT NOT NULL,
         "colKey" TEXT NOT NULL,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "CostoEditado_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "CostoEditado_productId_colKey_key"
         ON "CostoEditado"("productId", "colKey")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: marcas de una página de productos ───
// Devuelve Map productId → lista de colKeys editadas. Si la tabla no existe
// todavía → se crea sola y se reintenta una vez; si aun así falla, devuelve
// el mapa vacío (sin dorado) y la app sigue funcionando igual que siempre.
export async function leerCostosEditados(
  productIds: string[]
): Promise<Map<string, string[]>> {
  const intentar = async (): Promise<Map<string, string[]>> => {
    const mapa = new Map<string, string[]>();
    if (productIds.length === 0) return mapa;
    const marcas = await db.costoEditado.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, colKey: true },
    });
    for (const m of marcas) {
      const arr = mapa.get(m.productId) ?? [];
      arr.push(m.colKey);
      mapa.set(m.productId, arr);
    }
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaCostoEditado())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: marcar costos editados de UN producto (acumulativo) ───
// Si la tabla no existe todavía → se crea sola y se reintenta una vez.
// Si aun así falla, se ignora en silencio: el guardado del producto ya
// ocurrió bien y la app sigue igual que antes (solo faltaría el dorado).
export async function marcarCostosEditados(
  productId: string,
  colKeys: string[]
): Promise<void> {
  if (colKeys.length === 0) return;
  const intentar = () =>
    db.costoEditado.createMany({
      data: colKeys.map((colKey) => ({ productId, colKey })),
      skipDuplicates: true,
    });
  try {
    await intentar();
    return;
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return;
    if (!(await ensureTablaCostoEditado())) return;
  }
  try {
    await intentar();
  } catch {
    // degradado: sin marca por ahora, sin romper el guardado
  }
}

// ─── Lectura: colKeys editadas de UN producto ───
// La usa el PUT para devolver costosEditados y que la tabla del panel pinte
// el dorado al instante después de guardar.
export async function leerColKeysProducto(productId: string): Promise<string[]> {
  const intentar = async (): Promise<string[]> => {
    const marcas = await db.costoEditado.findMany({
      where: { productId },
      select: { colKey: true },
    });
    return marcas.map((m) => m.colKey);
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaCostoEditado())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── Lectura: Set de productIds con ALGÚN costo editado (protegidos) ───
// La usan las importaciones de stock (preview y apply): esos productos
// NUNCA reciben costo de la planilla, solo se les actualiza el saldo.
export async function leerProductosProtegidos(): Promise<Set<string>> {
  const intentar = async (): Promise<Set<string>> => {
    const marcas = await db.costoEditado.findMany({
      select: { productId: true },
    });
    return new Set(marcas.map((m) => m.productId));
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Set();
    if (!(await ensureTablaCostoEditado())) return new Set();
  }
  try {
    return await intentar();
  } catch {
    return new Set();
  }
}
