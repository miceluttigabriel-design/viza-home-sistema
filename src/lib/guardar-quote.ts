import { db } from "@/lib/db";

// ============================================================
// REGISTRO DE PRESUPUESTOS EMITIDOS (pedido del dueño, Task 78)
// ============================================================
// Antes SOLO el guardado del carrito (POST /api/quotes) creaba una
// fila en la tabla Quote. Los PDFs (PRESUPUESTO normal, MAYORISTA,
// SAFRA y CON CHEQUE) generaban su número secuencial pero NUNCA
// guardaban nada en la base → el CRM no los contabilizaba y el dueño
// veía que "los vendedores emitieron presupuestos y no se cuentan".
//
// Esta función guarda la EMISIÓN como fila Quote (sin items: el CRM
// solo necesita quién emitió, cuándo y de qué plan) para que el
// ranking del CRM la cuente SIEMPRE.
//
// · El quoteNumber es el MISMO número secuencial que sale impreso en
//   el PDF (PRESUPUESTO-XX / MAYOR-XX / SAFRA-XX / CHEQUE-XX): así el
//   ranking por plan coincide 1 a 1 con los números que ve el
//   vendedor en los papeles.
// · Es BEST-EFFORT: si el guardado falla (red, duplicado, etc.) el
//   PDF sale igual — NUNCA se rompe la emisión del presupuesto por
//   culpa del registro. El error queda en los logs del servidor.
// · status "emitida": el ranking cuenta TODOS los quotes como
//   "emitidos" (total) y sigue mostrando "aprobadas" aparte, igual
//   que siempre. Ningún otro código filtra por status (verificado).
// · Task 111 (pedido del dueño): los presupuestos emitidos SOLO AL
//   CONTADO se guardan con status "emitida_contado" para que el CRM
//   los separe en su propia opción CONTADO (y no los cuente como
//   CUOTA). Solo cuando el PDF sale únicamente con el Plan A: Contado
//   (sin ningún plan de cuotas). El total del ranking NO cambia:
//   "emitida" y "emitida_contado" cuentan igual en el total.
// · Task 168 (pedido del dueño): la numeración es POR (plan, usuario),
//   así que dos vendedores pueden tener el mismo "PRESUPUESTO-01".
//   La columna Quote.quoteNumber es @unique GLOBAL: el segundo insert
//   fallaba con P2002 y el CRM no contaba ese presupuesto ("emitió y
//   no aparece"). Ahora, si el número ya existe, se reintenta con un
//   sufijo INTERNO (el PDF y el prefijo del plan no cambian) para que
//   la emisión de CADA usuario quede registrada.
const SEPARADOR_SUFIJO = "·";

function esNumeroDuplicado(error: unknown): boolean {
  // Se compara por `code` (y no con instanceof) porque el cliente Prisma puede
  // venir de otra instancia del bundle. Si la base informa el campo, solo se
  // reintenta cuando el choque es realmente de quoteNumber.
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (String(e?.code || "") !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return true;
  const campos = Array.isArray(target) ? target : [target];
  return campos.some((campo) => String(campo).includes("quoteNumber"));
}

/**
 * Resuelve el usuario que emitió el presupuesto.
 * Prioridad: id de la sesión. Si el JWT es viejo y no trae `id`, se busca
 * por email (así la emisión no queda huérfana y el CRM la cuenta).
 * NUNCA lanza: si la base falla, devuelve null (best-effort).
 */
export async function resolverUserIdEmision(
  userId?: string | null,
  userEmail?: string | null
): Promise<string | null> {
  const directo = String(userId || "").trim();
  if (directo) return directo;

  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return null;

  try {
    const usuario = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return usuario?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Crea la fila Quote garantizando un quoteNumber único en la base.
 *
 * El número VISIBLE (el que sale impreso en el PDF) sigue siendo el mismo:
 * este helper solo agrega un sufijo interno cuando otro usuario ya ocupó
 * ese número. El CRM identifica el plan por el PREFIJO, por lo que el
 * sufijo no cambia el desglose CUOTA / MAYORISTA / SAFRA / CHEQUE.
 *
 * Reintentos:
 *   1) número original (caso normal, sin colisión)
 *   2) número + id del usuario (colisión entre vendedores distintos)
 *   3) número + id + marca de tiempo (colisión repetida / sin usuario)
 */
export async function crearQuoteConNumeroUnico<T>(
  numeroBase: string,
  userId: string | null | undefined,
  crear: (quoteNumber: string) => Promise<T>
): Promise<T> {
  const uid = String(userId || "SIN-USUARIO");
  const candidatos = [
    numeroBase,
    `${numeroBase}${SEPARADOR_SUFIJO}${uid.slice(-8)}`,
    `${numeroBase}${SEPARADOR_SUFIJO}${uid.slice(-8)}${SEPARADOR_SUFIJO}${Date.now().toString(36)}`,
  ];

  let ultimoError: unknown;
  for (const numero of candidatos) {
    try {
      return await crear(numero);
    } catch (error) {
      if (!esNumeroDuplicado(error)) throw error;
      ultimoError = error;
    }
  }
  throw ultimoError;
}

export async function guardarQuoteEmitido(params: {
  plan: string; // "PRESUPUESTO" | "MAYOR" | "SAFRA" | "CHEQUE"
  quoteNumber: string;
  userId?: string | null;
  // Task 168: respaldo cuando el JWT no trae el id (sesiones viejas).
  userEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  subtotal?: number;
  discount?: number;
  total?: number;
  contadoSolo?: boolean; // Task 111: emitido SOLO AL CONTADO (sin cuotas)
}): Promise<void> {
  try {
    const userId = await resolverUserIdEmision(params.userId, params.userEmail);
    if (!userId) {
      // No se puede atribuir a un vendedor: se registra igual (no se pierde
      // la emisión), pero queda el aviso para poder diagnosticarlo.
      console.warn(
        `[CRM] Emisión ${params.quoteNumber} sin usuario identificable (email: ${
          params.userEmail || "—"
        })`
      );
    }

    await crearQuoteConNumeroUnico(params.quoteNumber, userId, (quoteNumber) =>
      db.quote.create({
        data: {
          quoteNumber,
          customerName: (params.customerName || "").trim() || "SIN NOMBRE",
          customerPhone: params.customerPhone || null,
          notes: params.notes || null,
          subtotal: Number(params.subtotal) || 0,
          discount: Number(params.discount) || 0,
          taxRate: 0,
          total: Number(params.total) || 0,
          // Task 111: "emitida_contado" = emitido SOLO AL CONTADO. El CRM
          // (api/crm/ranking) usa ese status para la opción CONTADO; para el
          // total del ranking vale igual que "emitida".
          status: params.contadoSolo ? "emitida_contado" : "emitida",
          userId,
        },
      })
    );
  } catch (error) {
    // Best-effort: el presupuesto ya se emitió (el PDF sale igual).
    console.error(
      `[CRM] No se pudo registrar la emisión ${params.quoteNumber}:`,
      error
    );
  }
}
