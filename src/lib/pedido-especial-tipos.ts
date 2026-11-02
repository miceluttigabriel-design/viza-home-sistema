// ============================================================
// PEDIDO ESPECIAL — TIPOS DE PRODUCTO CREADOS DESDE LA PANTALLA
// (Task 113 v6, pedido del dueño)
//
// "en tipo de producto amigo quiero que tenga opcion de crear tanbien
//  si es que no temos cadastrado este tipo de producto"
//
// O sea: el TIPO DE PRODUCTO se estira de la BASE (columna TIPO de
// Product), pero si el tipo que busca el vendedor NO EXISTE todavía,
// tiene que poder CREARLO ahí mismo. Esos tipos creados viven en SU
// propia tabla (PedidoEspecialTipo) y aparecen SIEMPRE en el dropdown
// de la pantalla, para todos los proveedores — sin tocar la BASE.
//
// TABLA AUTO-GESTIONADA (mismo patrón probado de PedidoEspecialConfig /
// PedidoEspecialPresupuesto): si la tabla todavía no existe, la PRIMERA
// operación la crea SOLA con SQL idempotente (CREATE TABLE IF NOT
// EXISTS) — sin pasos manuales y sin `prisma db push` obligatorio.
// NUNCA rompe la app: las lecturas devuelven lista vacía si algo falla.
//
// Cálculo de un tipo creado: no hay productos de ese tipo en la BASE,
// así que la cascada de % (par → proveedor → tipo → general,
// src/lib/pedido-especial-porcentajes.ts) cae sola al PROMEDIO GENERAL
// de la BASE. Ni el vendedor ni el encargado cargan nada a mano.
// ============================================================
import { db } from "@/lib/db";
import { normalizarTexto, TEXTO_MAX } from "@/lib/pedido-especial";

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva (y su índice único), jamás toca datos existentes. Usa los
// MISMOS nombres de tabla/columna/índice que generaría `npx prisma db
// push` con el schema del repo.
export async function ensureTablaPedidoEspecialTipos(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "PedidoEspecialTipo" (
         "id" TEXT NOT NULL,
         "nombre" TEXT NOT NULL,
         "createdBy" TEXT NOT NULL DEFAULT '',
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "PedidoEspecialTipo_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "PedidoEspecialTipo_nombre_key"
       ON "PedidoEspecialTipo"("nombre")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lista de tipos creados (solo los nombres, ordenados) ───
// NUNCA lanza: si la tabla no existe → se crea sola y reintenta; si aun
// así falla → lista vacía.
export async function listarTiposExtra(): Promise<string[]> {
  const intentar = async (): Promise<string[]> => {
    const filas = await db.pedidoEspecialTipo.findMany({
      orderBy: { nombre: "asc" },
      select: { nombre: true },
    });
    return filas.map((f) => f.nombre);
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaPedidoEspecialTipos())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── CREAR un tipo de producto nuevo ───
// Lo puede hacer cualquier usuario logueado que no sea de solo consulta
// (lo valida la API): el dueño quiere que EL VENDEDOR pueda crear el
// tipo desde la pantalla cuando no está catalogado.
// Devuelve { ok, nombre } o { ok: false, error, status }.
export type ResultadoTipoExtra =
  | { ok: true; nombre: string; yaExistia: boolean }
  | { ok: false; error: string; status: number };

export async function crearTipoExtra(
  nombreRaw: string,
  usuario: { email: string }
): Promise<ResultadoTipoExtra> {
  const nombre = normalizarTexto(nombreRaw);
  if (!nombre) {
    return {
      ok: false,
      error: "Escribí el nombre del tipo de producto.",
      status: 400,
    };
  }

  const intentar = async (): Promise<ResultadoTipoExtra> => {
    // ¿Ya existe en la tabla de tipos creados? (case-insensitive: el
    // nombre se normaliza a MAYÚSCULAS, así que la unicidad salta sola).
    const existente = await db.pedidoEspecialTipo.findUnique({
      where: { nombre },
      select: { nombre: true },
    });
    if (existente) return { ok: true, nombre: existente.nombre, yaExistia: true };
    const f = await db.pedidoEspecialTipo.create({
      data: {
        nombre,
        createdBy: String(usuario.email || "").trim().toLowerCase().slice(0, 120),
      },
    });
    return { ok: true, nombre: f.nombre, yaExistia: false };
  };

  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      // Unicidad en carrera (dos pestañas creando lo mismo): tratarlo
      // como "ya existía" — el resultado para el usuario es el mismo.
      const code = (error as { code?: string } | null)?.code;
      if (code === "P2002") {
        return { ok: true, nombre, yaExistia: true };
      }
      console.error("crearTipoExtra:", error);
      return {
        ok: false,
        error: "No se pudo crear el tipo de producto.",
        status: 500,
      };
    }
    if (!(await ensureTablaPedidoEspecialTipos())) {
      return {
        ok: false,
        error: "La base todavía no tiene la tabla de tipos (se creará sola; probá de nuevo).",
        status: 503,
      };
    }
  }
  try {
    return await intentar();
  } catch (error) {
    console.error("crearTipoExtra (reintento):", error);
    return { ok: false, error: "No se pudo crear el tipo de producto.", status: 500 };
  }
}

// Largo máximo del nombre (mismo techo que proveedor/tipo de la BASE).
export const TIPO_EXTRA_MAX = TEXTO_MAX;
