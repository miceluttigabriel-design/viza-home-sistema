// ─── STOCK POR SUCURSAL (Task 98, pedido del dueño) ───
// "tenemos que hacer um filtro para poder ver por sucursal... lo que
// esta Central es nuestro deposito Central y los otros son por cada
// sucursal... tenemos que dividir bien".
//
// Se guarda en la tabla APARTE "StockSucursal" (una fila por producto
// y sucursal, con el saldo entero que trae la planilla del ERP). El
// modelo Product queda EXACTAMENTE igual que siempre (misma lección
// de CostoEditado / ProductHashtag / ProductCapacidad: tocar Product
// con columnas nuevas rompía la app cuando el db push no se había
// ejecutado).
//
// TABLA AUTO-GESTIONADA (mismo patrón que src/lib/producto-hashtag.ts):
// si la tabla todavía no existe en la base, la PRIMERA operación que la
// usa la crea SOLA con SQL idempotente (CREATE TABLE / CREATE INDEX IF
// NOT EXISTS). Así el stock por sucursal se activa SOLO, sin pasos
// manuales. Y NUNCA rompe la app: si algo falla, las funciones de
// lectura devuelven vacío / null y todo lo demás sigue funcionando
// igual que siempre.
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface SucursalResumen {
  nombre: string;
  productos: number; // SKUs con saldo > 0 en esa sucursal
  unidades: number; // suma de saldos de esa sucursal
}

// Estado por instancia de serverless (evita repetir el DDL en cada request).
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
export async function ensureTablaStockSucursal(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "StockSucursal" (
         "id" TEXT NOT NULL,
         "productId" TEXT NOT NULL,
         "sucursal" TEXT NOT NULL,
         "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "StockSucursal_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "StockSucursal_productId_sucursal_key"
         ON "StockSucursal"("productId", "sucursal")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "StockSucursal_sucursal_idx"
         ON "StockSucursal"("sucursal")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: lista de sucursales con stock cargado ───
// Distinct de la columna sucursal con conteo de SKUs (saldo > 0) y suma
// de unidades. ORDEN FIJO pedido por el dueño: CENTRAL (el depósito
// central) primero, el resto alfabético. Si la tabla no existe todavía
// (nunca se importó inventario con sucursales) devuelve [] — la vista
// muestra solo "TODAS" y funciona igual que siempre.
export async function leerSucursalesStock(): Promise<SucursalResumen[]> {
  const intentar = async (): Promise<SucursalResumen[]> => {
    const filas = await db.stockSucursal.groupBy({
      by: ["sucursal"],
      _count: { _all: true },
      _sum: { saldo: true },
      where: { saldo: { gt: 0 } },
    });
    const resumen: SucursalResumen[] = filas.map((f) => ({
      nombre: f.sucursal,
      productos: f._count._all,
      unidades: Math.round(f._sum.saldo ?? 0),
    }));
    // CENTRAL (depósito central) siempre primera; el resto alfabético.
    resumen.sort((a, b) => {
      if (a.nombre === "CENTRAL") return -1;
      if (b.nombre === "CENTRAL") return 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });
    return resumen;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaStockSucursal())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── Lectura: saldos de UNA sucursal ───
// Devuelve Map productId → saldo (SOLO filas con saldo > 0: es lo que
// la vista muestra cuando el dueño filtra por sucursal).
export async function leerSaldosSucursal(
  sucursal: string
): Promise<Map<string, number>> {
  const intentar = async (): Promise<Map<string, number>> => {
    const mapa = new Map<string, number>();
    const filas = await db.stockSucursal.findMany({
      where: { sucursal, saldo: { gt: 0 } },
      select: { productId: true, saldo: true },
    });
    for (const f of filas) {
      mapa.set(f.productId, f.saldo);
    }
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaStockSucursal())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: aplica el stock por sucursal de UNA importación ───
// Recibe stockPorSucursal = { sku: { "CENTRAL": 3, "KATUETE": 1, ... } }
// y lo guarda limpio para los productos indicados:
//   1) Borra TODAS las filas de StockSucursal de esos productos (solo de
//      ellos — los productos que NO vienen en la planilla quedan
//      intocados, igual que hace el stock global de siempre).
//   2) Inserta una fila por (producto, sucursal) con el saldo del Excel.
// Regla del "set absoluto": después de importar, lo que hay en la tabla
// por esos productos es EXACTAMENTE lo que dice la planilla (coherente
// con el stock global, que también se SOBREESCRIBE con la suma).
//
// BULK por lotes (mismo motivo que el apply de import-stock: 2000+
// operaciones individuales = timeout de Vercel). SQL crudo portable
// PostgreSQL + SQLite (misma sintaxis ON CONFLICT en ambos).
export interface GuardarSaldosResultado {
  ok: boolean;
  filasGuardadas: number;
  productosTocados: number;
  sucursales: number;
  errores: string[];
}

const LOTE_IDS = 500; // borrar por lotes de productIds
const LOTE_INSERT = 200; // insertar por lotes (200 filas × 4 params = 800 < 999 SQLite)

function nuevoId(): string {
  // id TEXT único; cuid no está disponible server-side sin helper extra,
  // y cualquier string único sirve (Prisma acepta TEXT sin formato).
  try {
    // Node 18+: crypto.randomUUID disponible como global webcrypto
    return `ss-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export async function guardarStockPorSucursal(
  stockPorSucursal: Record<string, Record<string, number>>,
  skusToId: Map<string, string>
): Promise<GuardarSaldosResultado> {
  const resultado: GuardarSaldosResultado = {
    ok: false,
    filasGuardadas: 0,
    productosTocados: 0,
    sucursales: 0,
    errores: [],
  };
  try {
    // Si la tabla todavía no existe, crearla ANTES de escribir.
    if (!(await ensureTablaStockSucursal())) {
      resultado.errores.push(
        "No se pudo crear/verificar la tabla StockSucursal (falta db push). El stock global se importó igual; reintente más tarde para activar el filtro por sucursal."
      );
      return resultado;
    }

    // 1) Resolver productId de cada sku (solo los que existen en la BD).
    const filas: Array<{ productId: string; sucursal: string; saldo: number }> = [];
    const sucursalesSet = new Set<string>();
    for (const [sku, porSuc] of Object.entries(stockPorSucursal || {})) {
      const productId = skusToId.get(sku);
      if (!productId) continue; // sku que no existe: el apply global ya lo reporta aparte
      for (const [sucursal, saldo] of Object.entries(porSuc || {})) {
        const s = String(sucursal || "").trim().toUpperCase();
        if (!s) continue;
        const n = Math.max(0, Math.floor(Number(saldo) || 0));
        sucursalesSet.add(s);
        filas.push({ productId, sucursal: s, saldo: n });
      }
    }
    const productIds = Array.from(new Set(filas.map((f) => f.productId)));
    resultado.productosTocados = productIds.length;
    resultado.sucursales = sucursalesSet.size;

    // 2) BORRAR lo viejo de esos productos (set absoluto, solo ellos).
    for (let i = 0; i < productIds.length; i += LOTE_IDS) {
      const lote = productIds.slice(i, i + LOTE_IDS);
      try {
        await db.stockSucursal.deleteMany({
          where: { productId: { in: lote } },
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        resultado.errores.push(`Limpieza de sucursales (lote ${Math.floor(i / LOTE_IDS) + 1}): ${msg}`);
      }
    }

    // 3) INSERTAR en lotes con ON CONFLICT (reintentos seguros).
    for (let i = 0; i < filas.length; i += LOTE_INSERT) {
      const lote = filas.slice(i, i + LOTE_INSERT);
      if (lote.length === 0) continue;
      try {
        const values = Prisma.join(
          lote.map(
            (f) =>
              Prisma.sql`(${nuevoId()}, ${f.productId}, ${f.sucursal}, ${f.saldo}, CURRENT_TIMESTAMP)`
          ),
          ", "
        );
        const sql = Prisma.sql`
          INSERT INTO "StockSucursal" ("id", "productId", "sucursal", "saldo", "updatedAt")
          VALUES ${values}
          ON CONFLICT ("productId", "sucursal") DO UPDATE
          SET "saldo" = EXCLUDED."saldo", "updatedAt" = CURRENT_TIMESTAMP
        `;
        const r = await db.$executeRaw(sql);
        resultado.filasGuardadas += r;
      } catch (err: any) {
        const msg = err?.message || String(err);
        resultado.errores.push(`Lote de sucursales ${Math.floor(i / LOTE_INSERT) + 1}: ${msg}`);
      }
    }
    resultado.ok = resultado.errores.length === 0;
    return resultado;
  } catch (error: any) {
    resultado.errores.push(error?.message || String(error));
    return resultado;
  }
}
