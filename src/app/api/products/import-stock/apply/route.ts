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

    // 3. Crear productos nuevos
    for (const item of body.nuevos) {
      try {
        if (!item.sku) {
          errores.push(`Item sin SKU, saltado`);
          continue;
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
          actualizadosCount++;
          continue;
        }

        // Crear producto nuevo con campos mínimos:
        // - sku (obligatorio)
        // - name (obligatorio en schema, si viene null usamos "PRODUCTO sin nombre")
        // - codViza (del Excel: Codigo Fabrica)
        // - subGrupo (del Excel: Subgrupo)
        // - stock (Saldo sumado del Excel)
        // - costProd (Costo Unit. Ultima Compra — solo para productos nuevos)
        // Los demás campos quedan null y se cargan manualmente después.
        await db.product.create({
          data: {
            sku: item.sku,
            name: item.name || `PRODUCTO ${item.sku}`,
            codViza: item.codViza,
            subGrupo: item.subGrupo,
            stock: item.stock,
            costProd: item.costProd,
            // showInCatalog por defecto es true (según schema), pero para
            // productos recién importados desde planilla de inventario,
            // conviene que no aparezcan automáticamente en el catálogo de
            // vendedores hasta que el admin los configure. Lo dejamos en false.
            showInCatalog: false,
            // Campos legados de compatibilidad catálogo
            brand: null,
            category: item.subGrupo,
            subcategory: item.subGrupo,
            description: item.name,
          },
        });
        creados++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Unique constraint")) {
          errores.push(`SKU ${item.sku}: ya existe (constraint) — saltado`);
        } else {
          errores.push(`SKU ${item.sku}: ${msg}`);
        }
      }
    }

    // 4. Actualizar stock de productos existentes (solo campo stock, nada más)
    for (const item of body.actualizados) {
      try {
        if (!item.sku) {
          errores.push(`Item actualizado sin SKU, saltado`);
          continue;
        }
        await db.product.update({
          where: { sku: item.sku },
          data: { stock: item.stockNuevo },
        });
        actualizadosCount++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Record to update not found")) {
          // Si no existe al momento de apply, crearlo ahora
          try {
            await db.product.create({
              data: {
                sku: item.sku,
                name: item.nameActual || `PRODUCTO ${item.sku}`,
                stock: item.stockNuevo,
                showInCatalog: false,
              },
            });
            creados++;
          } catch (e2: any) {
            errores.push(`SKU ${item.sku}: ${e2?.message || String(e2)}`);
          }
        } else {
          errores.push(`SKU ${item.sku}: ${msg}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      creados,
      actualizados: actualizadosCount,
      errores,
    });
  } catch (error) {
    console.error("Error en import-stock/apply:", error);
    return NextResponse.json(
      { error: "Error al aplicar la importación" },
      { status: 500 }
    );
  }
}
