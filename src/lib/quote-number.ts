import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Numeración SECUENCIAL de presupuestos por (plan, usuario).
 *
 * Antes cada PDF generaba un número aleatorio del estilo
 *   VZH-MAYOR-20261026-8515
 * Ahora el formato es
 *   MAYOR-01, MAYOR-02, MAYOR-03 ...
 * y cada COMBINACIÓN (tipo de plan, usuario) lleva SU PROPIA cuenta:
 *   - el MAYOR-01 del vendedor A es independiente del MAYOR-01 del vendedor B
 *   - SAFRA y CHEQUE tienen cada uno su propia secuencia
 *
 * El contador vive en la tabla QuoteSequence (ver prisma/schema.prisma).
 * Si la tabla todavía no fue creada con `prisma db push`, se crea sola
 * (CREATE TABLE IF NOT EXISTS) para que el sistema NUNCA se caiga por esto.
 */

// Planes con numeración propia. El presupuesto normal del carrito
// (guardado en BD y su PDF) usa "PRESUPUESTO".
const PLANES_VALIDOS = new Set(["PRESUPUESTO", "MAYOR", "SAFRA", "CHEQUE"]);

// Cache por instancia: la tabla solo se intenta crear una vez por proceso
// (en Vercel cada instancia fría la re-crea solo si falta de verdad).
let tablaAsegurada = false;

/**
 * Crea la tabla QuoteSequence con los MISMOS nombres que generaría
 * `prisma db push`, para que si después se corre db push no haya drift.
 * El SQL es compatible con SQLite (desarrollo) y PostgreSQL (Vercel+Neon).
 */
async function asegurarTablaQuoteSequence(): Promise<void> {
  if (tablaAsegurada) return;
  const ddl = [
    `CREATE TABLE IF NOT EXISTS "QuoteSequence" (
       "id" TEXT PRIMARY KEY NOT NULL,
       "plan" TEXT NOT NULL,
       "userId" TEXT NOT NULL,
       "lastNumber" INTEGER NOT NULL DEFAULT 0,
       "updatedAt" TIMESTAMP(3) NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "QuoteSequence_plan_userId_key"
       ON "QuoteSequence" ("plan", "userId")`,
  ];
  for (const stmt of ddl) {
    await db.$executeRawUnsafe(stmt);
  }
  tablaAsegurada = true;
}

/**
 * Devuelve el SIGUIENTE número secuencial para (plan, usuario) y lo reserva.
 * Formato: "{PLAN}-{NN}" con NN con cero a la izquierda (01, 02 ... 99, 100...).
 *
 * Es a prueba de llamadas simultáneas: el incremento ocurre dentro de la BD
 * (upsert nativo con increment), así dos vendedores (o dos pestañas) que
 * generan PDFs al mismo tiempo reciben números DISTINTOS y en orden.
 */
export async function nextSequentialQuoteNumber(
  plan: string,
  userId?: string | null
): Promise<string> {
  const planLimpio = (plan || "").trim().toUpperCase();
  if (!PLANES_VALIDOS.has(planLimpio)) {
    throw new Error(`Plan de presupuesto desconocido: ${plan}`);
  }
  const uid = (userId ?? "").toString().trim() || "SIN-USUARIO";
  const clave = { plan: planLimpio, userId: uid };

  // Hasta 3 intentos:
  //  - P2021: la tabla todavía no existe -> se crea y se reintenta.
  //  - P2002: carrera de unique (rarísima con upsert nativo) -> reintenta.
  for (let intento = 0; intento < 3; intento++) {
    try {
      const fila = await db.quoteSequence.upsert({
        where: { plan_userId: clave },
        update: { lastNumber: { increment: 1 } },
        create: { ...clave, lastNumber: 1 },
      });
      return `${planLimpio}-${String(fila.lastNumber).padStart(2, "0")}`;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2021"
      ) {
        await asegurarTablaQuoteSequence();
        continue;
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  throw new Error(
    `No se pudo generar el número secuencial para ${planLimpio} tras 3 intentos`
  );
}
