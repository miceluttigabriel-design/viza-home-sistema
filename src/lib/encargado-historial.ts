// ═══════════════════════════════════════════════════════════════════
// ENCARGADOS · HISTORIAL DE STOCK (Task 160/161)
//
// El dueño pidió que los encargados estén "activos viendo cuál producto
// bajó en cuál sucursal... porque cada vez que actualizo el stock algunos
// bajan la cantidad y significa que fueron vendidos".
//
// Para eso se guarda una foto del saldo por producto/sucursal en cada
// análisis. En la siguiente pasada:
//   · saldoPrevio = lo que había la última vez
//   · vendido     = MAX(0, saldoPrevio − saldoActual)
//
// Hay UNA TABLA POR ENCARGADO para que no se pisen:
//   · EncargadoStockHistorial → distribución
//   · CompraStockHistorial    → compra
// Tablas APARTE y AUTO-GESTIONADAS: si no existen se crean solas con SQL
// idempotente y NUNCA rompen la app. No tocan el modelo Product ni el
// schema de Prisma.
// ═══════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Whitelist estricta: el nombre de tabla NUNCA viene de afuera.
const TABLAS = {
  distribucion: "EncargadoStockHistorial",
  compra: "CompraStockHistorial",
} as const;

export type HistorialTipo = keyof typeof TABLAS;

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

const estadoTabla: Record<string, "desconocida" | "lista" | "sinDDL"> = {
  distribucion: "desconocida",
  compra: "desconocida",
};

const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  const msg = String((error as { message?: string } | null)?.message || "");
  return (
    code === "P2021" ||
    code === "P2022" ||
    /no such table|does not exist|relation .* does not exist/i.test(msg)
  );
};

function nombreTabla(tipo: HistorialTipo): string {
  return TABLAS[tipo];
}

export async function ensureTablaHistorial(tipo: HistorialTipo): Promise<boolean> {
  if (estadoTabla[tipo] === "lista") return true;
  if (estadoTabla[tipo] === "sinDDL") return false;
  const tabla = nombreTabla(tipo);
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${tabla}" (
         "productId" TEXT NOT NULL,
         "sucursal" TEXT NOT NULL,
         "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "vendido" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "capturadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "${tabla}_pkey" PRIMARY KEY ("productId", "sucursal")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${tabla}_sucursal_idx"
         ON "${tabla}"("sucursal")`
    );
    estadoTabla[tipo] = "lista";
    return true;
  } catch {
    estadoTabla[tipo] = "sinDDL";
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

function agregarFila(
  mapa: Map<string, Map<string, HistorialEncargadoNodo>>,
  f: FilaHistorial
) {
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

async function leerFilas(tipo: HistorialTipo): Promise<FilaHistorial[]> {
  const tabla = nombreTabla(tipo);
  // El nombre sale de la whitelist: interpolación segura.
  return db.$queryRawUnsafe<FilaHistorial[]>(
    `SELECT "productId", "sucursal", "saldo", "vendido", "capturadoAt"
       FROM "${tabla}"`
  );
}

export async function leerHistorial(
  tipo: HistorialTipo
): Promise<Map<string, Map<string, HistorialEncargadoNodo>>> {
  const mapa = new Map<string, Map<string, HistorialEncargadoNodo>>();
  try {
    if (!(await ensureTablaHistorial(tipo))) return mapa;
    const filas = await leerFilas(tipo);
    for (const f of filas) agregarFila(mapa, f);
    return mapa;
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return mapa;
    try {
      if (!(await ensureTablaHistorial(tipo))) return mapa;
      const filas = await leerFilas(tipo);
      for (const f of filas) agregarFila(mapa, f);
    } catch {
      // silencio: el análisis sigue sin historial
    }
    return mapa;
  }
}

const LOTE = 200;

export async function guardarSnapshot(
  tipo: HistorialTipo,
  actual: Map<string, Map<string, number>>
): Promise<GuardarHistorialResultado> {
  const tabla = nombreTabla(tipo);
  const resultado: GuardarHistorialResultado = { ok: false, filas: 0, errores: [] };
  try {
    if (!(await ensureTablaHistorial(tipo))) {
      resultado.errores.push(
        `No se pudo crear/verificar la tabla ${tabla}. El análisis sigue funcionando, pero sin detectar ventas entre pasadas.`
      );
      return resultado;
    }

    const previo = await leerHistorial(tipo);
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
          INSERT INTO ${Prisma.raw(`"${tabla}"`)}
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

// ── Compatibilidad con el código de la Task 160 (distribución) ──
export function ensureTablaEncargadoHistorial(): Promise<boolean> {
  return ensureTablaHistorial("distribucion");
}

export function leerHistorialEncargado() {
  return leerHistorial("distribucion");
}

export function guardarSnapshotEncargado(actual: Map<string, Map<string, number>>) {
  return guardarSnapshot("distribucion", actual);
}
