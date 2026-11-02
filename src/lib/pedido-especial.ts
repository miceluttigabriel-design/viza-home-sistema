// ============================================================
// PEDIDO ESPECIAL (Task 113, pedido del dueño) — SERVIDOR
// Configuración de la Base: una fila por combinación
// (PROVEEDOR + TIPO DE PRODUCTO) con sus % (contado, 1-6, 7-13,
// 14-30) — la MISMA estructura de % que los productos de la BASE.
//
// TABLA AUTO-GESTIONADA (mismo patrón probado de TasaCambio /
// ProductHashtag): si la tabla todavía no existe en la base, la
// PRIMERA operación que la usa la crea SOLA con SQL idempotente
// (CREATE TABLE IF NOT EXISTS). Así la config funciona SOLA, sin
// pasos manuales, y NUNCA rompe la app: si algo falla al leer,
// las funciones devuelven listas vacías y la UI muestra "sin
// combinaciones cargadas" — el resto del sistema sigue igual.
//
// PERMISOS (los valida la API con la misma lógica de siempre):
//   · LEER (GET): cualquier usuario logueado (el vendedor necesita
//     la lista para cotizar; NADA de esto es secreto).
//   · ESCRIBIR (POST/PUT/DELETE): SOLO admin o supremo_admin y
//     NUNCA usuarios de consulta (solo-lectura).
// ============================================================
import { db } from "@/lib/db";

// Límites sanitarios de los % (evita typos catastróficos tipo "9999"
// pero no atasca valores de negocio legítimos).
export const PCT_MIN = 0;
export const PCT_MAX = 300;

// Largo máximo de proveedor / tipo de producto (texto de la Base).
export const TEXTO_MAX = 80;

export function esPctValido(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= PCT_MIN &&
    v <= PCT_MAX
  );
}

// Normaliza el texto de proveedor / tipo de producto: recorta bordes,
// colapsa espacios internos y pasa a MAYÚSCULAS (igual que el estilo
// de la Base: "CENTRAL", "KATUETE"...). Bonus: si el admin escribe
// "Gafra" y ya existe "GAFRA", la unicidad salta ANTES de crear un
// duplicado confuso por mayúsculas/minúsculas.
export function normalizarTexto(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .slice(0, TEXTO_MAX);
}

// Fila de configuración tal como la reciben la UI del admin y la
// pantalla del vendedor (fechas ya serializables).
export interface CombinacionPedidoEspecial {
  id: string;
  proveedor: string;
  tipoProducto: string;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  updatedAt: string | null;
}

// Estado por instancia de serverless (evita repetir el DDL en cada
// request) — mismo patrón de tasas-cambio.ts.
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes. Usa los mismos nombres de
// tabla/columna/índice que generaría `npx prisma db push` con el schema
// del repo, así que correr el db push después no ve ninguna diferencia.
export async function ensureTablaPedidoEspecial(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "PedidoEspecialConfig" (
         "id" TEXT NOT NULL,
         "proveedor" TEXT NOT NULL,
         "tipoProducto" TEXT NOT NULL,
         "pctContado" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct1A6" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct7A13" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct14A30" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "PedidoEspecialConfig_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "PedidoEspecialConfig_proveedor_tipoProducto_key"
       ON "PedidoEspecialConfig"("proveedor", "tipoProducto")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura de TODAS las combinaciones (ordenadas) ───
// NUNCA lanza y NUNCA rompe: si la tabla no existe → se crea sola y
// reintenta; si aun así falla → lista vacía (la UI muestra el aviso
// de "sin combinaciones cargadas" y el sistema sigue funcionando).
export async function listarCombinaciones(): Promise<CombinacionPedidoEspecial[]> {
  const intentar = async (): Promise<CombinacionPedidoEspecial[]> => {
    const filas = await db.pedidoEspecialConfig.findMany({
      orderBy: [{ proveedor: "asc" }, { tipoProducto: "asc" }],
    });
    return filas.map((f) => ({
      id: f.id,
      proveedor: f.proveedor,
      tipoProducto: f.tipoProducto,
      pctContado: f.pctContado,
      pct1A6: f.pct1A6,
      pct7A13: f.pct7A13,
      pct14A30: f.pct14A30,
      updatedAt: f.updatedAt ? new Date(f.updatedAt).toISOString() : null,
    }));
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaPedidoEspecial())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// Devuelve true si el error es de unicidad (combinación duplicada).
export function esErrorDuplicado(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2002";
}

// ─── Validación del payload de POST/PUT ───
// Devuelve los campos normalizados o null si algo no cumple.
export interface PayloadCombinacion {
  proveedor: string;
  tipoProducto: string;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
}

export function validarPayloadCombinacion(body: any): PayloadCombinacion | null {
  const proveedor = normalizarTexto(body?.proveedor);
  const tipoProducto = normalizarTexto(body?.tipoProducto);
  if (!proveedor || !tipoProducto) return null;

  const pctContado = Number(body?.pctContado ?? 0);
  const pct1A6 = Number(body?.pct1A6 ?? 0);
  const pct7A13 = Number(body?.pct7A13 ?? 0);
  const pct14A30 = Number(body?.pct14A30 ?? 0);
  if (
    !esPctValido(pctContado) ||
    !esPctValido(pct1A6) ||
    !esPctValido(pct7A13) ||
    !esPctValido(pct14A30)
  ) {
    return null;
  }
  return { proveedor, tipoProducto, pctContado, pct1A6, pct7A13, pct14A30 };
}
