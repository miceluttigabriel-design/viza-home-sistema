import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────
// POST /api/products/import-stock/apply
// Recibe: JSON { nuevos: [...], actualizados: [...] }
// Aplica:
//   - Para cada item en `nuevos`: CREATE nuevo Product con sku/name/codViza/subGrupo/stock/costProd
//   - Para cada item en `actualizados`: UPDATE solo el campo stock (reemplazar)
// Procesamiento en LOTES PARALELOS (batches de BATCH_SIZE) para no agotar
// el timeout de Vercel (10s en Hobby) cuando hay miles de productos.
// Devuelve: { ok, creados, actualizados, errores }
// ─────────────────────────────────────────────────────────────

interface NuevoItem {
  sku: string;
  name: string | null;
  codViza: string | null;
  subGrupo: string | null;
  stock: number;
  costProd: number | null;
}

interface ActualizadoItem {
  sku: string;
  nameActual: string | null;
  stockActual: number;
  stockNuevo: number;
}

interface ApplyBody {
  nuevos: NuevoItem[];
  actualizados: ActualizadoItem[];
}

// Tamaño de lote para Promise.allSettled: 50 operaciones paralelas por lote.
// Con 50 ops × ~30ms = 1.5s por lote, 2000 ops en ~40 lotes × 1.5s = 60s
// (más que el timeout de Hobby, pero se va a procesar en chunks más chicos
// para no bloquear el event loop).
const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    // 1. Auth: solo supremo_admin
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "supremo_admin") {
      return NextResponse.json(
        { error: "Solo supremo_admin puede importar stock" },
        { status: 403 }
      );
    }

    // 2. Leer body JSON
    const body = (await req.json()) as ApplyBody;
    if (!body || !Array.isArray(body.nuevos) || !Array.isArray(body.actualizados)) {
      return NextResponse.json(
        { error: "Formato inválido. Se esperaban arreglos nuevos y actualizados." },
        { status: 400 }
      );
    }

    const errores: string[] = [];
    let creados = 0;
    let actualizadosCount = 0;

    // ─────────────────────────────────────────────────────
    // 3. Crear productos nuevos — en lotes paralelos
    // ─────────────────────────────────────────────────────
    for (let i = 0; i < body.nuevos.length; i += BATCH_SIZE) {
      const batch = body.nuevos.slice(i, i + BATCH_SIZE);
      // Promise.allSettled: si un item falla, los demás se procesan igual
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          if (!item.sku) {
            throw new Error("SKU vacío, saltado");
          }
          // Verificar de nuevo si ya existe (por si cambió entre preview y apply)
          const yaExiste = await db.product.findUnique({
            where: { sku: item.sku },
            select: { sku: true },
          });
          if (yaExiste) {
            // Si existe ahora, actualizar stock en lugar de crear
            await db.product.update({
              where: { sku: item.sku },
              data: { stock: item.stock },
            });
            return { tipo: "actualizado", sku: item.sku };
          }
          // Crear producto nuevo con campos mínimos
          await db.product.create({
            data: {
              sku: item.sku,
              name: item.name || `PRODUCTO ${item.sku}`,
              codViza: item.codViza,
              subGrupo: item.subGrupo,
              stock: item.stock,
              costProd: item.costProd,
              showInCatalog: false,
              brand: null,
              category: item.subGrupo,
              subcategory: item.subGrupo,
              description: item.name,
            },
          });
          return { tipo: "nuevo", sku: item.sku };
        })
      );
      // Procesar resultados del lote
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          if (r.value.tipo === "nuevo") creados++;
          else actualizadosCount++;
        } else {
          const sku = batch[idx]?.sku || "(sin sku)";
          const reason = r.reason;
          const msg = reason?.message || String(reason);
          if (msg.includes("Unique constraint")) {
            errores.push(`SKU ${sku}: ya existe (constraint) — saltado`);
          } else {
            errores.push(`SKU ${sku}: ${msg}`);
          }
        }
      });
    }

    // ─────────────────────────────────────────────────────
    // 4. Actualizar stock de existentes — en lotes paralelos
    // ─────────────────────────────────────────────────────
    for (let i = 0; i < body.actualizados.length; i += BATCH_SIZE) {
      const batch = body.actualizados.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          if (!item.sku) {
            throw new Error("SKU vacío, saltado");
          }
          try {
            await db.product.update({
              where: { sku: item.sku },
              data: { stock: item.stockNuevo },
            });
            return { tipo: "actualizado", sku: item.sku };
          } catch (err: any) {
            const m = err?.message || String(err);
            if (m.includes("Record to update not found")) {
              // Si no existe al momento de apply, crearlo ahora con stock nuevo
              await db.product.create({
                data: {
                  sku: item.sku,
                  name: item.nameActual || `PRODUCTO ${item.sku}`,
                  stock: item.stockNuevo,
                  showInCatalog: false,
                },
              });
              return { tipo: "nuevo", sku: item.sku };
            }
            throw err;
          }
        })
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          if (r.value.tipo === "nuevo") creados++;
          else actualizadosCount++;
        } else {
          const sku = batch[idx]?.sku || "(sin sku)";
          const reason = r.reason;
          const msg = reason?.message || String(reason);
          errores.push(`SKU ${sku}: ${msg}`);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      creados,
      actualizados: actualizadosCount,
      errores,
    });
  } catch (error) {
    console.error("Error en import-stock/apply:", error);
    // Detectar body too large de Next.js
    const msg = (error as any)?.message || String(error);
    if (msg.toLowerCase().includes("body") && msg.toLowerCase().includes("limit")) {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud es demasiado grande. Intentá importar una planilla más chica." },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { error: "Error al aplicar la importación: " + msg },
      { status: 500 }
    );
  }
}
