// ═══════════════════════════════════════════════════════════════════
// ENCARGADO DE DISTRIBUCIÓN — HISTORIAL DE STOCK (Task 160)
//
// El dueño pidió que el Encargado esté "activo viendo cuál producto bajó
// en cuál sucursal... porque cada vez que actualizo el stock algunos
// bajan la cantidad y significa que fueron vendidos".
//
// Para eso guardamos una foto del saldo por producto/sucursal en cada
// análisis. En la siguiente pasada:
//   · saldoPrevio = lo que había la última vez
//   · vendido     = MAX(0, saldoPrevio − saldoActual)
//
// Tabla APARTE y AUTO-GESTIONADA (mismo patrón que StockSucursal /
// ProductStockIdeal / ProductCores): si no existe se crea sola con SQL
// idempotente y NUNCA rompe la app. No toca el modelo Product ni el
// schema de Prisma.
// ═══════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface HistorialEncargadoNodo {
  saldoPrevio: number;
  vendido: number;
  capturadoAt: Date | null;
}

export interface GuardarHistorialResultado {
  ok: boolean;
  filas: number;
  errores: string[];
}

let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  const msg = String((error as { message?: string } | null)?.message || "");
  return (
    code === "P2021" ||
    code === "P2022" ||
    /no such table|does not exist|relation .* does not exist/i.test(msg)
  );
};

export async function ensureTablaEncargadoHistorial(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "EncargadoStockHistorial" (
         "productId" TEXT NOT NULL,
         "sucursal" TEXT NOT NULL,
         "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "vendido" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "capturadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "EncargadoStockHistorial_pkey" PRIMARY KEY ("productId", "sucursal")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "EncargadoStockHistorial_sucursal_idx"
         ON "EncargadoStockHistorial"("sucursal")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

type FilaHistorial = {
  productId: string;
  sucursal: string;
  saldo: number | string;
  vendido: number | string;
  capturadoAt: Date | string | null;
};

function numero(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function leerHistorialEncargado(): Promise<
  Map<string, Map<string, HistorialEncargadoNodo>>
> {
  const mapa = new Map<string, Map<string, HistorialEncargadoNodo>>();
  try {
    if (!(await ensureTablaEncargadoHistorial())) return mapa;
    const filas = await db.$queryRawUnsafe<FilaHistorial[]>(
      `SELECT "productId", "sucursal", "saldo", "vendido", "capturadoAt"
         FROM "EncargadoStockHistorial"`
    );
    for (const f of filas) {
      let porProducto = mapa.get(f.productId);
      if (!porProducto) {
        porProducto = new Map<string, HistorialEncargadoNodo>();
        mapa.set(f.productId, porProducto);
      }
      const fecha = f.capturadoAt ? new Date(f.capturadoAt) : null;
      porProducto.set(f.sucursal, {
        saldoPrevio: Math.max(0, Math.round(numero(f.saldo))),
        vendido: Math.max(0, Math.round(numero(f.vendido))),
        capturadoAt: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
      });
    }
    return mapa;
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return mapa;
    // Si la tabla no existía, el ensure de arriba ya la crea. Reintento.
    try {
      if (!(await ensureTablaEncargadoHistorial())) return mapa;
      const filas = await db.$queryRawUnsafe<FilaHistorial[]>(
        `SELECT "productId", "sucursal", "saldo", "vendido", "capturadoAt"
           FROM "EncargadoStockHistorial"`
      );
      for (const f of filas) {
        let porProducto = mapa.get(f.productId);
        if (!porProducto) {
          porProducto = new Map<string, HistorialEncargadoNodo>();
          mapa.set(f.productId, porProducto);
        }
        const fecha = f.capturadoAt ? new Date(f.capturadoAt) : null;
        porProducto.set(f.sucursal, {
          saldoPrevio: Math.max(0, Math.round(numero(f.saldo))),
          vendido: Math.max(0, Math.round(numero(f.vendido))),
          capturadoAt: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
        });
      }
    } catch {
      // silencio: el análisis sigue sin historial
    }
    return mapa;
  }
}

const LOTE = 200;

export async function guardarSnapshotEncargado(
  actual: Map<string, Map<string, number>>
): Promise<GuardarHistorialResultado> {
  const resultado: GuardarHistorialResultado = { ok: false, filas: 0, errores: [] };
  try {
    if (!(await ensureTablaEncargadoHistorial())) {
      resultado.errores.push(
        "No se pudo crear/verificar la tabla EncargadoStockHistorial. El análisis sigue funcionando, pero sin detectar ventas entre pasadas."
      );
      return resultado;
    }

    const previo = await leerHistorialEncargado();
    const ids = new Set<string>([...previo.keys(), ...actual.keys()]);
    const filas: Array<{
      productId: string;
      sucursal: string;
      saldo: number;
      vendido: number;
    }> = [];

    for (const productId of ids) {
      const prevP = previo.get(productId);
      const actP = actual.get(productId);
      const sucursales = new Set<string>([
        ...(prevP ? Array.from(prevP.keys()) : []),
        ...(actP ? Array.from(actP.keys()) : []),
      ]);
      for (const sucursal of sucursales) {
        const saldoActual = Math.max(0, Math.round(numero(actP?.get(sucursal) ?? 0)));
        const prevNodo = prevP?.get(sucursal);
        if (!prevNodo && saldoActual === 0) continue;
        const saldoPrevio = prevNodo ? prevNodo.saldoPrevio : saldoActual;
        const vendido = prevNodo ? Math.max(0, saldoPrevio - saldoActual) : 0;
        filas.push({ productId, sucursal, saldo: saldoActual, vendido });
      }
    }

    for (let i = 0; i < filas.length; i += LOTE) {
      const lote = filas.slice(i, i + LOTE);
      try {
        const values = Prisma.join(
          lote.map(
            (f) => Prisma.sql`(${f.productId}, ${f.sucursal}, ${f.saldo}, ${f.vendido}, CURRENT_TIMESTAMP)`
          ),
          ", "
        );
        const sql = Prisma.sql`
          INSERT INTO "EncargadoStockHistorial"
            ("productId", "sucursal", "saldo", "vendido", "capturadoAt")
          VALUES ${values}
          ON CONFLICT ("productId", "sucursal") DO UPDATE
          SET "saldo" = EXCLUDED."saldo",
              "vendido" = EXCLUDED."vendido",
              "capturadoAt" = CURRENT_TIMESTAMP
        `;
        const r = await db.$executeRaw(sql);
        resultado.filas += r;
      } catch (err: any) {
        resultado.errores.push(`Lote ${Math.floor(i / LOTE) + 1}: ${err?.message || String(err)}`);
      }
    }

    resultado.ok = resultado.errores.length === 0;
    return resultado;
  } catch (error: any) {
    resultado.errores.push(error?.message || String(error));
    return resultado;
  }
}
