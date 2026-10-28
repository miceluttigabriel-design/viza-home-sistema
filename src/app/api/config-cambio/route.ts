// ─── TASA DE CAMBIO ACTIVA — API (Task 87, pedido del dueño) ───
//
// GET  /api/config-cambio
//   Cualquier usuario logueado: devuelve las tasas activas (R$→Gs y
//   US$→Gs) + meta informativa (cuándo/quién las actualizó). Si todavía
//   nadie aplicó un cambio, devuelve las tasas de siempre (1100/6000).
//
// POST /api/config-cambio
//   SOLO supremo_admin y el email viza@viza.com.py (Task 87B, pedido del
//   dueño: "viza@viza.com.py también va poder editar la tasa de cambio pero
//   solo el") — y NUNCA usuarios de consulta: guarda las tasas nuevas y
//   APLICA el cambio a la base general:
//     · Recalcula TODOS los productos cuyo costo fue cargado en R$
//       (costBR > 0) o en US$ (costUS > 0), con las MISMAS fórmulas del
//       Excel que usa la edición manual (PUT /api/products/[id]).
//     · Los productos con costo cargado directo en Gs NO se tocan (no
//       dependen del cambio).
//     · Los costos de ENTRADA (costBR / costUS / costGs), los % y los
//       márgenes base NUNCA se modifican: solo se recalculan las columnas
//       derivadas (rsToGs, usToGs, sub-costo, ..., Costo Prod., precios).
//     · No toca ultimaEdicionAt/Por ni las marcas de CostoEditado: no es
//       una edición de celda, es un recálculo global.
//   La operación es IDEMPOTENTE: si algo se corta a la mitad (red, timeout),
//   apretar APLICAR de nuevo con la misma tasa completa el trabajo y el
//   resultado final es exactamente el mismo.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { puedeEditarTasaCambio } from "@/lib/permisos-cambio";
import {
  getTasasCambioConMeta,
  guardarTasasCambio,
  esTasaValida,
  TasasCambio,
} from "@/lib/tasas-cambio";

// La base entera puede tener miles de productos: el recálculo corre en
// lotes dentro de la misma función (igual que las importaciones pesadas
// de la casa, que ya usan maxDuration 60).
export const maxDuration = 60;

// Campos derivados que el recálculo global escribe en cada producto.
// ES LA MISMA LISTA que sobrescribe el PUT /api/products/[id] tras
// recalculate(): ni un campo más, ni un campo menos.
const CAMPOS_RECALCULADOS: string[] = [
  "rsNoUS", "usNoGs", "rsToGs", "usToGs", "subCost",
  "minusDisc", "plusAdd", "plusAdd2", "minusDescV", "costProd",
  "priceContado", "price", "cost",
  ...Array.from({ length: 30 }, (_, i) => `marginC${i + 1}`),
  ...Array.from({ length: 30 }, (_, i) => `price${i + 1}`),
];

// Recalcula los campos derivados según las fórmulas del Excel.
// ES LA MISMA función que PUT /api/products/[id] (recalculate) y que las
// importaciones: la única diferencia es que las tasas NO están fijas en
// el código, vienen por parámetro (las activas de la base).
function recalculate(p: any, tasas: TasasCambio): void {
  const cambioRS = tasas.cambioRS; // R$ → Gs (antes fijo 1100)
  const cambioUS = tasas.cambioUS; // US$ → Gs (antes fijo 6000)

  // D = C * cambioRS (si hay costo en R$)
  const d = p.costBR && p.costBR > 0 ? p.costBR * cambioRS : null;
  // F = E * cambioUS (si hay costo en US$)
  const f = p.costUS && p.costUS > 0 ? p.costUS * cambioUS : null;
  // H = IF(D>0, D, F) (R$ NO US$)
  p.rsNoUS = d && d > 0 ? d : f;
  // I = IF(H>0, H, G) (costo final)
  const calcCost = p.rsNoUS && p.rsNoUS > 0 ? p.rsNoUS : (p.costGs ?? 0);
  p.usNoGs = calcCost;
  // J = I (sub-costo)
  p.subCost = calcCost;
  p.rsToGs = d;
  p.usToGs = f;

  // L = J - J*K (MENOS DESC. %)
  p.minusDisc = calcCost - (calcCost * (p.discountPct || 0));

  // N = L + L*M (MAIS % ADD)
  p.plusAdd = (p.minusDisc ?? 0) + ((p.minusDisc ?? 0) * (p.addPct || 0));

  // P = N + N*O (MAIS % ADD 2)
  p.plusAdd2 = (p.plusAdd ?? 0) + ((p.plusAdd ?? 0) * (p.admPct || 0));

  // R = P - Q (MENOS DESC. V)
  p.minusDescV = (p.plusAdd2 ?? 0) - (p.valorDesc ?? 0);

  // T = ROUND((R + S) / 1000, 0) * 1000 (Costo Prod.)
  const baseCosto = (p.minusDescV ?? 0) + (p.valorAdd ?? 0);
  p.costProd = Math.round(baseCosto / 1000) * 1000;

  // Márgenes 1..30 desde bases Y/Z/AA + Contado
  const y = p.pct1A6 || 0;
  const z = p.pct7A13 || 0;
  const aa = p.pct14A30 || 0;
  const mContado = p.marginContado || 0;

  let lastMargin = mContado;
  for (let i = 1; i <= 30; i++) {
    let base: number;
    if (i <= 6) base = y;
    else if (i <= 13) base = z;
    else base = aa;
    lastMargin = lastMargin + base;
    p[`marginC${i}`] = lastMargin;
  }

  // Precios finales
  const t = p.costProd ?? 0;
  p.priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  for (let i = 1; i <= 30; i++) {
    const margin = p[`marginC${i}`];
    p[`price${i}`] = Math.round((t + t * margin) / 1000 / i) * 1000;
  }

  // Compatibilidad catálogo
  p.price = p.priceContado ?? 0;
  p.cost = p.costProd ?? 0;
}

// ─── GET: tasas activas (cualquier usuario logueado) ───
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const meta = await getTasasCambioConMeta();
    return NextResponse.json({
      cambioRS: meta.cambioRS,
      cambioUS: meta.cambioUS,
      updatedAt: meta.updatedAt,
      actualizadoPor: meta.actualizadoPor,
      esDefault: meta.esDefault,
    });
  } catch (error) {
    console.error("Error leyendo tasa de cambio:", error);
    // Degradado: tasas de siempre. La Base sigue funcionando igual.
    return NextResponse.json({ cambioRS: 1100, cambioUS: 6000, esDefault: true });
  }
}

// ─── POST: guardar tasas + aplicar a la base general ───
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Task 87B (pedido del dueño): puede editar la tasa SOLO el supremo_admin
    // y el email viza@viza.com.py (lista única en src/lib/permisos-cambio.ts,
    // la misma que usa la UI — UI y backend deciden SIEMPRE lo mismo).
    if (!puedeEditarTasaCambio((session.user as any)?.role, (session.user as any)?.email)) {
      return NextResponse.json(
        { error: "Solo el Supremo Admin o viza@viza.com.py pueden cambiar la tasa de cambio" },
        { status: 403 }
      );
    }
    // Task 79 + 82: usuarios de consulta SOLO LECTURA jamás modifican la base
    // (manda encima de todo, aunque el email estuviera en la lista de editores).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede cambiar la tasa" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cambioRS = Number(body?.cambioRS);
    const cambioUS = Number(body?.cambioUS);

    if (!esTasaValida(cambioRS) || !esTasaValida(cambioUS)) {
      return NextResponse.json(
        { error: "Tasas inválidas: poné números mayores que 0 (ej: 1100 y 6000)" },
        { status: 400 }
      );
    }

    const tasas: TasasCambio = { cambioRS, cambioUS };
    const editorName =
      (session.user as any)?.name || (session.user as any)?.email || "admin";

    // 1) Guardar PRIMERO (la tasa queda recordada aunque el recálculo
    //    se corte: al re-aplicar se completa y el resultado es el mismo).
    //    Si NO se pudo persistir, abortamos: aplicar una tasa que el
    //    sistema no recordaría dejaría las futuras ediciones con otra tasa.
    const guardada = await guardarTasasCambio(cambioRS, cambioUS, editorName);
    if (!guardada) {
      return NextResponse.json(
        { error: "No se pudo guardar la tasa en la base (intenta de nuevo)" },
        { status: 500 }
      );
    }

    // 2) Aplicar a la base general: SOLO productos con costo cargado en
    //    R$ o US$. Los de costo en Gs no dependen del cambio (ni se leen).
    const afectados = await db.product.findMany({
      where: {
        OR: [{ costBR: { gt: 0 } }, { costUS: { gt: 0 } }],
      },
    });

    const t0 = Date.now();
    let actualizados = 0;

    // Lotes de 150 updates por transacción: rápido y cada lote queda
    // consistente. Idempotente: re-aplicar completa lo que falte.
    const LOTE = 150;
    for (let i = 0; i < afectados.length; i += LOTE) {
      const lote = afectados.slice(i, i + LOTE);
      const ops = lote.map((producto) => {
        const merged: any = { ...producto };
        recalculate(merged, tasas);
        const data: Record<string, number | null> = {};
        for (const k of CAMPOS_RECALCULADOS) {
          data[k] = merged[k] ?? null;
        }
        return db.product.update({ where: { id: producto.id }, data });
      });
      await db.$transaction(ops);
      actualizados += lote.length;
    }

    return NextResponse.json({
      ok: true,
      tasas: guardada,
      afectados: afectados.length,
      actualizados,
      duracionMs: Date.now() - t0,
    });
  } catch (error) {
    console.error("Error aplicando tasa de cambio:", error);
    return NextResponse.json(
      { error: "Error al aplicar la tasa de cambio (intenta de nuevo: el proceso continúa donde quedó)" },
      { status: 500 }
    );
  }
}
