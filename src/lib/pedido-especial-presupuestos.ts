// ============================================================
// PEDIDO ESPECIAL — HISTORIAL DE PRESUPUESTOS (Task 113 v3, pedido
// del dueño) — SERVIDOR
//
// El dueño pidió: "los encargados de sucursales quiero que ellos
// puedan ver el histórico de presupuestos de pedido especial
// generados… y la situación de los mismos, si fue generado y si está
// como aprobado… el vendedor va a tener una opción de marcar como
// aprobado… y de ahí el encargado de sucursal va a poder ver este
// como aprobado".
//
// O sea:
//   · El vendedor GUARDA su presupuesto desde la pantalla PEDIDO
//     ESPECIAL → queda con estado GENERADO.
//   · El vendedor puede MARCARLO APROBADO (botón propio).
//   · El ENCARGADO de sucursal ve el historial de SU sucursal con la
//     situación de cada uno (SOLO LECTURA: él no aprueba los de sus
//     vendedores, solo los VE).
//   · admin / supremo_admin ven TODO el historial.
//
// TABLA AUTO-GESTIONADA (mismo patrón probado de PedidoEspecialConfig /
// UsuarioSucursal / TasaCambio): si la tabla todavía no existe en la
// base, la PRIMERA operación que la usa la crea SOLA con SQL
// idempotente (CREATE TABLE IF NOT EXISTS) — sin pasos manuales y sin
// `prisma db push` obligatorio. NUNCA rompe la app: las lecturas
// devuelven lista vacía si algo falla.
//
// NÚMEROS: ESPECIAL-01, ESPECIAL-02… desde QuoteSequence (plan
// "ESPECIAL"), la MISMA mecánica de MAYOR-01 / SAFRA-01 / CHEQUE-01 —
// cuenta PROPIA por usuario.
//
// El cálculo NO se confía al cliente: la API recalcula en el servidor
// con calcularPedidoEspecial() y los % de la Base (fuente de verdad),
// y guarda el resultado congelado.
// ============================================================
import { db } from "@/lib/db";
import {
  calcularPedidoEspecial,
  diasHastaFecha,
  esTipoMoto,
  type PlanPedidoEspecial,
  type FilaCronogramaEspecial,
  type ChequeEspecial,
} from "@/lib/pedido-especial-calc";
import { listarCombinaciones } from "@/lib/pedido-especial";
import { porcentajesDeLaBase } from "@/lib/pedido-especial-porcentajes";
import { getTasasCambio } from "@/lib/tasas-cambio";
import { nextSequentialQuoteNumber } from "@/lib/quote-number";
import { leerMapaSucursales } from "@/lib/sucursal-usuario";

// Largo máximo de la descripción del producto.
export const DESCRIPCION_MAX = 200;

// Cuántas filas devuelve el historial (los más nuevos primero).
export const HISTORIAL_LIMITE = 200;

const PLANES_VALIDOS = new Set<PlanPedidoEspecial>([
  "contado",
  "cuotas_con_entrega",
  "cuotas_sin_entrega",
  "mayorista",
  "safra",
  "cheque",
]);

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Estado por instancia de serverless (evita repetir el DDL en cada request).
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva (y sus índices), jamás toca datos existentes. Usa los
// MISMOS nombres de tabla/columna/índice que generaría `npx prisma db
// push` con el schema del repo, así que correr el db push después no ve
// ninguna diferencia.
export async function ensureTablaPedidoEspecialPresupuestos(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "PedidoEspecialPresupuesto" (
         "id" TEXT NOT NULL,
         "numero" TEXT NOT NULL,
         "vendedorEmail" TEXT NOT NULL,
         "vendedorNombre" TEXT NOT NULL DEFAULT '',
         "sucursal" TEXT NOT NULL DEFAULT '',
         "proveedor" TEXT NOT NULL,
         "tipoProducto" TEXT NOT NULL,
         "descripcion" TEXT NOT NULL DEFAULT '',
         "modoCosto" TEXT NOT NULL DEFAULT 'gs',
         "costoOriginal" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "costoGs" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "cambioUS" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "plan" TEXT NOT NULL,
         "cuotas" INTEGER NOT NULL DEFAULT 0,
         "pctContado" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct1A6" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct7A13" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pct14A30" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pctTecnico" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "pctSafra" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "valorContado" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "cuotaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "valorTecnico" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "totalIntereses" DOUBLE PRECISION NOT NULL DEFAULT 0,
         "detalle" TEXT NOT NULL DEFAULT '',
         "estado" TEXT NOT NULL DEFAULT 'GENERADO',
         "idCtr" TEXT NOT NULL DEFAULT '',
         "fechaAprobado" TIMESTAMP(3),
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "PedidoEspecialPresupuesto_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "PedidoEspecialPresupuesto_numero_key"
       ON "PedidoEspecialPresupuesto"("numero")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "PedidoEspecialPresupuesto_vendedorEmail_idx"
       ON "PedidoEspecialPresupuesto"("vendedorEmail")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "PedidoEspecialPresupuesto_sucursal_idx"
       ON "PedidoEspecialPresupuesto"("sucursal")`
    );
    // Task 113 v5 (ID CTR): si la tabla YA existía (deploys anteriores),
    // la columna nueva se agrega SOLA. ADD COLUMN IF NOT EXISTS es
    // idempotente e inofensivo — jamás toca datos existentes.
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "idCtr" TEXT NOT NULL DEFAULT ''`
      );
    } catch {
      // ALTER fallido no invalida la tabla: las lecturas devuelven lista
      // vacía (P2022) y el sistema sigue funcionando igual.
    }
    // Task 113 v6 (VERIFICADO + ORDEN DE COMPRA, pedido del dueño): el
    // encargado marca VERIFICADO el APROBADO y después genera la ORDEN
    // DE COMPRA. Mismo escudo: ALTERs idempotentes, nunca tocan datos.
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "fechaVerificado" TIMESTAMP(3)`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "verificadoPorEmail" TEXT NOT NULL DEFAULT ''`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "verificadoPorNombre" TEXT NOT NULL DEFAULT ''`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "ordenGenerada" BOOLEAN NOT NULL DEFAULT FALSE`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "ordenNumero" TEXT NOT NULL DEFAULT ''`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "PedidoEspecialPresupuesto" ADD COLUMN IF NOT EXISTS "ordenFecha" TIMESTAMP(3)`
      );
    } catch {
      // Igual que arriba: sin esas columnas las lecturas devuelven vacío
      // y el resto del sistema sigue funcionando.
    }
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Fila tal como la recibe la UI (todo serializable) ───

// Desglose congelado del cálculo (JSON en la columna `detalle`).
export interface DetallePresupuesto {
  modoCosto?: "usd" | "gs";
  costoOriginal?: number;
  costoProd?: number;
  margenAplicado?: number;
  recargoSinEntregaPct?: number;
  fechaInicioPago?: string;
  safraEntrada?: number;
  safraMeses?: number;
  esMoto?: boolean;
  tasaChequePct?: number;
  plazoPromedioMeses?: number;
  cronograma?: FilaCronogramaEspecial[];
  cheques?: ChequeEspecial[];
}

export interface PresupuestoPedidoEspecial {
  id: string;
  numero: string;
  vendedorEmail: string;
  vendedorNombre: string;
  sucursal: string;
  proveedor: string;
  tipoProducto: string;
  descripcion: string;
  modoCosto: string;
  costoOriginal: number;
  costoGs: number;
  cambioUS: number;
  plan: string;
  cuotas: number;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number;
  pctSafra: number;
  valorContado: number;
  cuotaValor: number;
  valorTecnico: number;
  total: number;
  totalIntereses: number;
  detalle: DetallePresupuesto | null;
  estado: string; // "GENERADO" | "APROBADO" | "VERIFICADO"
  // Task 113 v5: N° de crédito ("ID CTR") anotado al APROBAR (vacío en
  // GENERADO). El encargado de sucursal lo verifica en el historial.
  idCtr: string;
  fechaAprobado: string | null;
  // Task 113 v6: VERIFICADO del encargado + ORDEN DE COMPRA generada.
  fechaVerificado: string | null;
  verificadoPorNombre: string;
  ordenGenerada: boolean;
  ordenNumero: string;
  ordenFecha: string | null;
  createdAt: string;
}

// Filas crudas de Prisma → forma serializable (parsea el JSON del
// desglose con try/catch: si algo venía corrupto, detalle = null).
function aFila(f: {
  id: string;
  numero: string;
  vendedorEmail: string;
  vendedorNombre: string;
  sucursal: string;
  proveedor: string;
  tipoProducto: string;
  descripcion: string;
  modoCosto: string;
  costoOriginal: number;
  costoGs: number;
  cambioUS: number;
  plan: string;
  cuotas: number;
  pctContado: number;
  pct1A6: number;
  pct7A13: number;
  pct14A30: number;
  pctTecnico: number;
  pctSafra: number;
  valorContado: number;
  cuotaValor: number;
  valorTecnico: number;
  total: number;
  totalIntereses: number;
  detalle: string;
  estado: string;
  idCtr: string;
  fechaAprobado: Date | null;
  fechaVerificado: Date | null;
  verificadoPorNombre: string;
  ordenGenerada: boolean;
  ordenNumero: string;
  ordenFecha: Date | null;
  createdAt: Date;
}): PresupuestoPedidoEspecial {
  let detalle: DetallePresupuesto | null = null;
  try {
    if (f.detalle) detalle = JSON.parse(f.detalle) as DetallePresupuesto;
  } catch {
    detalle = null;
  }
  return {
    id: f.id,
    numero: f.numero,
    vendedorEmail: f.vendedorEmail,
    vendedorNombre: f.vendedorNombre,
    sucursal: f.sucursal,
    proveedor: f.proveedor,
    tipoProducto: f.tipoProducto,
    descripcion: f.descripcion,
    modoCosto: f.modoCosto,
    costoOriginal: f.costoOriginal,
    costoGs: f.costoGs,
    cambioUS: f.cambioUS,
    plan: f.plan,
    cuotas: f.cuotas,
    pctContado: f.pctContado,
    pct1A6: f.pct1A6,
    pct7A13: f.pct7A13,
    pct14A30: f.pct14A30,
    pctTecnico: f.pctTecnico,
    pctSafra: f.pctSafra,
    valorContado: f.valorContado,
    cuotaValor: f.cuotaValor,
    valorTecnico: f.valorTecnico,
    total: f.total,
    totalIntereses: f.totalIntereses,
    detalle,
    estado: f.estado,
    idCtr: f.idCtr ?? "",
    fechaAprobado: f.fechaAprobado ? new Date(f.fechaAprobado).toISOString() : null,
    fechaVerificado: f.fechaVerificado ? new Date(f.fechaVerificado).toISOString() : null,
    verificadoPorNombre: f.verificadoPorNombre ?? "",
    ordenGenerada: !!f.ordenGenerada,
    ordenNumero: f.ordenNumero ?? "",
    ordenFecha: f.ordenFecha ? new Date(f.ordenFecha).toISOString() : null,
    createdAt: new Date(f.createdAt).toISOString(),
  };
}

// ─── HISTORIAL (GET) — NUNCA lanza, NUNCA rompe ───
// Task 113 v6 (pedido del dueño): "el encargado de sucursal va poder ver
// de todas las sucursales pero hay que crear un filtro nel historial
// para que el pueda ver apenas en su sucursal también para facilitar".
//   · esAdmin            → TODOS los presupuestos (filtro opcional)
//   · sucursalEncargado  → TODAS las sucursales (filtro opcional; la
//     pantalla arranca filtrada en la SUYA para facilitarle)
//   · resto (vendedor)   → SOLO los propios (el filtro no aplica)
export async function listarPresupuestos(opts: {
  email: string;
  esAdmin: boolean;
  sucursalEncargado: string | null;
  sucursalFiltro?: string | null; // "" = TODAS (sin filtro)
}): Promise<PresupuestoPedidoEspecial[]> {
  const email = String(opts.email || "").trim().toLowerCase();
  const filtro = String(opts.sucursalFiltro || "").trim();
  const intentar = async (): Promise<PresupuestoPedidoEspecial[]> => {
    const puedeVerTodo = opts.esAdmin || !!opts.sucursalEncargado;
    const where = !puedeVerTodo
      ? { vendedorEmail: email } // vendedor: solo lo propio
      : filtro
        ? { sucursal: filtro } // encargado/admin con filtro de sucursal
        : {}; // encargado/admin: TODAS las sucursales
    const filas = await db.pedidoEspecialPresupuesto.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: HISTORIAL_LIMITE,
    });
    return filas.map(aFila);
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return [];
    if (!(await ensureTablaPedidoEspecialPresupuestos())) return [];
  }
  try {
    return await intentar();
  } catch {
    return [];
  }
}

// ─── Datos de entrada para CREAR un presupuesto (lo manda la pantalla) ───
export interface DatosPresupuestoEntrada {
  proveedor: string;
  tipoProducto: string;
  descripcion: string;
  modoCosto: "usd" | "gs";
  costo: number;
  plan: PlanPedidoEspecial;
  cuotas: number;
  fechaInicioPago: string;
  safraEntrada: number;
  safraMeses: number;
  chequesCantidad: number;
  chequesFechas: string[];
  fechaEmision: string; // "hoy" del dispositivo del vendedor (ISO)
}

// Valida el payload de POST. Devuelve los datos limpios o null.
export function validarDatosPresupuesto(body: any): DatosPresupuestoEntrada | null {
  const proveedor = String(body?.proveedor ?? "").trim().slice(0, 80);
  const tipoProducto = String(body?.tipoProducto ?? "").trim().slice(0, 80);
  const descripcion = String(body?.descripcion ?? "").trim().slice(0, DESCRIPCION_MAX);
  if (!proveedor || !tipoProducto || !descripcion) return null;

  const modoCosto = body?.modoCosto === "usd" ? "usd" : "gs";
  const costo = Number(body?.costo);
  if (!Number.isFinite(costo) || costo <= 0) return null;

  const plan = String(body?.plan ?? "") as PlanPedidoEspecial;
  if (!PLANES_VALIDOS.has(plan)) return null;

  const cuotas = Math.max(1, Math.min(30, Math.floor(Number(body?.cuotas) || 1)));
  const fechaInicioPago = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechaInicioPago || ""))
    ? String(body.fechaInicioPago)
    : "";
  const safraEntrada = Math.max(0, Number(body?.safraEntrada) || 0);
  const safraMeses = Math.max(1, Math.min(18, Math.floor(Number(body?.safraMeses) || 1)));
  const chequesCantidad = Math.max(1, Math.min(20, Math.floor(Number(body?.chequesCantidad) || 1)));
  const chequesFechas = Array.isArray(body?.chequesFechas)
    ? (body.chequesFechas as unknown[])
        .map((f) => String(f || "").slice(0, 10))
        .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
        .slice(0, 20)
    : [];
  const fechaEmision = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechaEmision || ""))
    ? String(body.fechaEmision)
    : "";

  return {
    proveedor,
    tipoProducto,
    descripcion,
    modoCosto,
    costo,
    plan,
    cuotas,
    fechaInicioPago,
    safraEntrada,
    safraMeses,
    chequesCantidad,
    chequesFechas,
    fechaEmision,
  };
}

// Resultado de CREAR: ok + fila, o error con mensaje para el vendedor.
export type ResultadoCreacion =
  | { ok: true; presupuesto: PresupuestoPedidoEspecial }
  | { ok: false; error: string; status: number };

// ─── CREAR un presupuesto del historial (POST) ───
// 1. Toma los % de la BASE para ese proveedor + tipo (Task 113 v4, pedido
//    del dueño: "vas a usar TODAS las lógicas de la BASE, lo único que
//    cambia es que el costo lo ponemos manualmente") — promedio real de
//    los productos del par, con el respaldo del panel del admin. Ya NO
//    exige una combinación cargada: los % de la BASE salen solos.
// 2. Toma la tasa US$→Gs ACTIVA de la Base (no confía en la del cliente).
// 3. RECALCULA en el servidor con la MISMA función de la pantalla, así
//    lo guardado es exactamente lo que el vendedor vio.
// 4. Saca el número ESPECIAL-XX de QuoteSequence y la sucursal del
//    vendedor (tabla UsuarioSucursal, la misma del CRM).
export async function crearPresupuesto(
  datos: DatosPresupuestoEntrada,
  usuario: { id: string; email: string; nombre: string }
): Promise<ResultadoCreacion> {
  try {
    // 1) % de la BASE para la combinación (con respaldo del panel del
    //    admin solo si algún % no aparece en la BASE). Respaldo doble:
    //    si la consulta de la BASE falla, usa la config cargada (o ceros).
    let porc: {
      pctContado: number;
      pct1A6: number;
      pct7A13: number;
      pct14A30: number;
      pctTecnico: number;
      pctSafra: number;
    };
    try {
      porc = await porcentajesDeLaBase(datos.proveedor, datos.tipoProducto);
    } catch {
      const combinaciones = await listarCombinaciones();
      const comb = combinaciones.find(
        (c) =>
          c.proveedor === datos.proveedor && c.tipoProducto === datos.tipoProducto
      );
      porc = comb
        ? {
            pctContado: comb.pctContado,
            pct1A6: comb.pct1A6,
            pct7A13: comb.pct7A13,
            pct14A30: comb.pct14A30,
            pctTecnico: comb.pctTecnico,
            pctSafra: comb.pctSafra,
          }
        : {
            pctContado: 0,
            pct1A6: 0,
            pct7A13: 0,
            pct14A30: 0,
            pctTecnico: 0,
            pctSafra: 0,
          };
    }

    // 2) Tasa activa (server-side, con fallback seguro a 6000).
    const tasas = await getTasasCambio();
    const cambioUS = Number(tasas?.cambioUS) > 0 ? Number(tasas.cambioUS) : 6000;

    // 3) Recálculo del servidor con la MISMA fórmula de la pantalla.
    //    "Hoy" = la fecha de emisión del dispositivo del vendedor (así
    //    los días de SIN ENTREGA y los cheques cuadran con lo que vio).
    const [ay, am, ad] = (datos.fechaEmision || "").split("-").map(Number);
    const hoyRef =
      ay && am && ad ? new Date(ay, am - 1, ad) : new Date();
    const diasSinEntrega =
      datos.plan === "cuotas_sin_entrega"
        ? diasHastaFecha(datos.fechaInicioPago, hoyRef)
        : null;
    const resultado = calcularPedidoEspecial({
      costo: datos.costo,
      modoCosto: datos.modoCosto,
      cambioUS,
      pctContado: porc.pctContado,
      pct1A6: porc.pct1A6,
      pct7A13: porc.pct7A13,
      pct14A30: porc.pct14A30,
      pctTecnico: porc.pctTecnico,
      pctSafra: porc.pctSafra,
      plan: datos.plan,
      cuotas: datos.cuotas,
      diasSinEntrega,
      safraEntrada: datos.safraEntrada,
      safraMeses: datos.safraMeses,
      chequesCantidad: datos.chequesCantidad,
      chequesFechas: datos.chequesFechas,
      esMoto: esTipoMoto(datos.tipoProducto),
      fechaEmision: datos.fechaEmision || hoyRef.toISOString().slice(0, 10),
    });
    if (!resultado) {
      return {
        ok: false,
        error: "Los datos del plan no cierran (revisá costo, fechas y parámetros).",
        status: 400,
      };
    }

    // 4) Número secuencial del usuario + sucursal del vendedor.
    const numero = await nextSequentialQuoteNumber("ESPECIAL", usuario.id);
    let sucursal = "";
    try {
      const mapa = await leerMapaSucursales();
      sucursal = mapa.get(usuario.email.trim().toLowerCase()) || "";
    } catch {
      sucursal = "";
    }

    const detalle: DetallePresupuesto = {
      modoCosto: datos.modoCosto,
      costoOriginal: datos.costo,
      costoProd: resultado.costoProd,
      margenAplicado: resultado.margenAplicado,
      recargoSinEntregaPct: resultado.recargoSinEntregaPct,
      fechaInicioPago: datos.plan === "cuotas_sin_entrega" ? datos.fechaInicioPago : "",
      safraEntrada: datos.plan === "safra" ? datos.safraEntrada : 0,
      safraMeses: datos.plan === "safra" ? datos.safraMeses : 0,
      esMoto: esTipoMoto(datos.tipoProducto),
      tasaChequePct: resultado.tasaChequePct,
      plazoPromedioMeses: resultado.plazoPromedioMeses,
      cronograma: resultado.cronograma,
      cheques: resultado.cheques,
    };

    const crear = async (): Promise<PresupuestoPedidoEspecial> => {
      const f = await db.pedidoEspecialPresupuesto.create({
        data: {
          numero,
          vendedorEmail: usuario.email.trim().toLowerCase(),
          vendedorNombre: String(usuario.nombre || "").slice(0, 120),
          sucursal,
          proveedor: datos.proveedor,
          tipoProducto: datos.tipoProducto,
          descripcion: datos.descripcion,
          modoCosto: datos.modoCosto,
          costoOriginal: datos.costo,
          costoGs: resultado.costoGs,
          cambioUS,
          plan: datos.plan,
          cuotas: resultado.cuotas,
          pctContado: porc.pctContado,
          pct1A6: porc.pct1A6,
          pct7A13: porc.pct7A13,
          pct14A30: porc.pct14A30,
          pctTecnico: porc.pctTecnico,
          pctSafra: porc.pctSafra,
          valorContado: resultado.valorContado,
          cuotaValor: resultado.cuotaValor,
          valorTecnico: resultado.valorTecnico,
          total: resultado.total,
          totalIntereses: resultado.totalIntereses,
          detalle: JSON.stringify(detalle),
          estado: "GENERADO",
        },
      });
      return aFila(f);
    };

    try {
      return { ok: true, presupuesto: await crear() };
    } catch (error) {
      if (!esErrorTablaFaltante(error)) throw error;
      if (!(await ensureTablaPedidoEspecialPresupuestos())) {
        return {
          ok: false,
          error: "La base todavía no tiene la tabla del historial (se creará sola; probá de nuevo).",
          status: 503,
        };
      }
      return { ok: true, presupuesto: await crear() };
    }
  } catch (error) {
    console.error("crearPresupuesto:", error);
    return { ok: false, error: "No se pudo guardar el presupuesto.", status: 500 };
  }
}

// ─── MARCAR COMO APROBADO (PUT) ───
// Pueden: el PROPIETARIO del presupuesto (el vendedor que lo generó) o
// admin/supremo_admin. El encargado de sucursal NO aprueba los ajenos
// (el dueño: él los VE aprobados, solo lectura). Unidireccional:
// GENERADO → APROBADO (no se vuelve atrás, así el encargado puede
// confiar en lo que ve).
// Task 113 v5 (pedido del dueño): el ID CTR es OBLIGATORIO para aprobar:
// "para marcar como aprobado quiero que agregue un campo obligatorio
// escrito ID CTR para poner el número de crédito que después el
// encargado va verificar". Sin ID CTR la API rechaza la aprobación.
export type ResultadoAprobado =
  | { ok: true; presupuesto: PresupuestoPedidoEspecial }
  | { ok: false; error: string; status: number };

// Largo máximo del ID CTR (n° de crédito).
export const ID_CTR_MAX = 40;

export async function aprobarPresupuesto(
  id: string,
  usuario: { email: string; esAdmin: boolean },
  idCtr: string
): Promise<ResultadoAprobado> {
  const idLimpio = String(id || "").trim();
  if (!idLimpio) return { ok: false, error: "Falta el presupuesto.", status: 400 };
  // ID CTR OBLIGATORIO (Task 113 v5): sin número de crédito no se aprueba.
  const idCtrLimpio = String(idCtr || "").trim().slice(0, ID_CTR_MAX);
  if (!idCtrLimpio) {
    return {
      ok: false,
      error: "El ID CTR es obligatorio: escribí el número de crédito para marcarlo APROBADO.",
      status: 400,
    };
  }
  const email = String(usuario.email || "").trim().toLowerCase();

  const intentar = async (): Promise<ResultadoAprobado> => {
    const fila = await db.pedidoEspecialPresupuesto.findUnique({ where: { id: idLimpio } });
    if (!fila) return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    const esDueno = fila.vendedorEmail === email;
    if (!esDueno && !usuario.esAdmin) {
      return {
        ok: false,
        error: "Solo el vendedor que lo generó (o un admin) puede marcarlo aprobado.",
        status: 403,
      };
    }
    if (fila.estado === "APROBADO") {
      return { ok: true, presupuesto: aFila(fila) }; // ya está: idempotente
    }
    const f = await db.pedidoEspecialPresupuesto.update({
      where: { id: idLimpio },
      data: { estado: "APROBADO", fechaAprobado: new Date(), idCtr: idCtrLimpio },
    });
    return { ok: true, presupuesto: aFila(f) };
  };

  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      console.error("aprobarPresupuesto:", error);
      return { ok: false, error: "No se pudo actualizar el presupuesto.", status: 500 };
    }
    if (!(await ensureTablaPedidoEspecialPresupuestos())) {
      return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    }
  }
  try {
    return await intentar();
  } catch (error) {
    console.error("aprobarPresupuesto (reintento):", error);
    return { ok: false, error: "No se pudo actualizar el presupuesto.", status: 500 };
  }
}

// ─── MARCAR VERIFICADO (encargado de sucursal) — Task 113 v6 ───
// El dueño: "después que el encargado vea APROBADO en el presupuesto
// quiero que tenga la opción de generar ORDEN DE COMPRA de este
// presupuesto en específico… primer el marca VERIFICADO OK y después
// que el tenga la opción de generar orden de compra".
// O sea: APROBADO → VERIFICADO lo marca el ENCARGADO DE LA SUCURSAL del
// presupuesto (o admin/supremo, la excepción de siempre). El ID CTR ya
// quedó anotado por el vendedor al aprobar — el encargado lo tiene a la
// vista en el historial al momento de verificar.
// Unidireccional como los demás estados: no se vuelve atrás.
export type ResultadoVerificado =
  | { ok: true; presupuesto: PresupuestoPedidoEspecial }
  | { ok: false; error: string; status: number };

export async function verificarPresupuesto(
  id: string,
  usuario: { email: string; nombre: string; esAdmin: boolean; sucursalEncargado: string | null }
): Promise<ResultadoVerificado> {
  const idLimpio = String(id || "").trim();
  if (!idLimpio) return { ok: false, error: "Falta el presupuesto.", status: 400 };
  const email = String(usuario.email || "").trim().toLowerCase();

  const intentar = async (): Promise<ResultadoVerificado> => {
    const fila = await db.pedidoEspecialPresupuesto.findUnique({ where: { id: idLimpio } });
    if (!fila) return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    // Permiso: encargado de LA SUCURSAL del presupuesto, o admin/supremo.
    const esDeSuSucursal =
      !!usuario.sucursalEncargado && fila.sucursal === usuario.sucursalEncargado;
    if (!usuario.esAdmin && !esDeSuSucursal) {
      return {
        ok: false,
        error: "Solo el encargado de la sucursal (o un admin) puede marcarlo VERIFICADO.",
        status: 403,
      };
    }
    if (fila.estado === "VERIFICADO") {
      return { ok: true, presupuesto: aFila(fila) }; // ya está: idempotente
    }
    if (fila.estado !== "APROBADO") {
      return {
        ok: false,
        error: "Solo se verifica un presupuesto APROBADO (el vendedor primero lo marca aprobado con el ID CTR).",
        status: 409,
      };
    }
    const f = await db.pedidoEspecialPresupuesto.update({
      where: { id: idLimpio },
      data: {
        estado: "VERIFICADO",
        fechaVerificado: new Date(),
        verificadoPorEmail: email,
        verificadoPorNombre: String(usuario.nombre || "").slice(0, 120),
      },
    });
    return { ok: true, presupuesto: aFila(f) };
  };

  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      console.error("verificarPresupuesto:", error);
      return { ok: false, error: "No se pudo actualizar el presupuesto.", status: 500 };
    }
    if (!(await ensureTablaPedidoEspecialPresupuestos())) {
      return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    }
  }
  try {
    return await intentar();
  } catch (error) {
    console.error("verificarPresupuesto (reintento):", error);
    return { ok: false, error: "No se pudo actualizar el presupuesto.", status: 500 };
  }
}

// ─── GENERAR ORDEN DE COMPRA (encargado de sucursal) — Task 113 v6 ───
// "después que el tenga la opción de generar orden de compra": sobre el
// presupuesto VERIFICADO, el encargado de la sucursal (o admin/supremo)
// genera LA ORDEN DE COMPRA de ese presupuesto en específico. La orden
// queda numerada OC-01, OC-02… (QuoteSequence plan "OC", cuenta por
// usuario) y el número + la fecha quedan en la fila: si la vuelve a
// pedir, sale SIEMPRE la misma orden (idempotente).
// Devuelve la fila actualizada (con el número de orden) o error; el PDF
// lo arma la ruta /api/pedido-especial/presupuestos/orden con la lib
// src/lib/pdf/orden-compra-pdf.ts.
export type ResultadoOrden =
  | { ok: true; presupuesto: PresupuestoPedidoEspecial }
  | { ok: false; error: string; status: number };

export async function generarOrdenPresupuesto(
  id: string,
  usuario: { id: string; email: string; esAdmin: boolean; sucursalEncargado: string | null }
): Promise<ResultadoOrden> {
  const idLimpio = String(id || "").trim();
  if (!idLimpio) return { ok: false, error: "Falta el presupuesto.", status: 400 };
  const email = String(usuario.email || "").trim().toLowerCase();

  const intentar = async (): Promise<ResultadoOrden> => {
    const fila = await db.pedidoEspecialPresupuesto.findUnique({ where: { id: idLimpio } });
    if (!fila) return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    // Mismo permiso que VERIFICAR: encargado de la sucursal o admin.
    const esDeSuSucursal =
      !!usuario.sucursalEncargado && fila.sucursal === usuario.sucursalEncargado;
    if (!usuario.esAdmin && !esDeSuSucursal) {
      return {
        ok: false,
        error: "Solo el encargado de la sucursal (o un admin) puede generar la orden de compra.",
        status: 403,
      };
    }
    // Ya tiene orden: se devuelve tal cual (misma orden, mismo número).
    if (fila.ordenGenerada && fila.ordenNumero) {
      return { ok: true, presupuesto: aFila(fila) };
    }
    if (fila.estado !== "VERIFICADO") {
      return {
        ok: false,
        error: "Primero hay que marcarlo VERIFICADO: la orden de compra sale del presupuesto verificado.",
        status: 409,
      };
    }
    // Número de orden OC-XX (cuenta propia por usuario, como ESPECIAL-XX).
    const ordenNumero = await nextSequentialQuoteNumber("OC", usuario.id || null);
    const ahora = new Date();
    const f = await db.pedidoEspecialPresupuesto.update({
      where: { id: idLimpio },
      data: { ordenGenerada: true, ordenNumero, ordenFecha: ahora },
    });
    return { ok: true, presupuesto: aFila(f) };
  };

  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) {
      console.error("generarOrdenPresupuesto:", error);
      return { ok: false, error: "No se pudo generar la orden de compra.", status: 500 };
    }
    if (!(await ensureTablaPedidoEspecialPresupuestos())) {
      return { ok: false, error: "Presupuesto no encontrado.", status: 404 };
    }
  }
  try {
    return await intentar();
  } catch (error) {
    console.error("generarOrdenPresupuesto (reintento):", error);
    return { ok: false, error: "No se pudo generar la orden de compra.", status: 500 };
  }
}
