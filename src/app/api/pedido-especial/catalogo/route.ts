// ─── PEDIDO ESPECIAL — CATÁLOGO DE LA BASE (Task 113 v2, pedido del dueño) ───
//
// El dueño pidió: "los proveedores vas a usar la columna PROVEEDORES de
// la base, ahí tiene todos los proveedores… y el tipo de producto también
// está ya la columna TIPO PRODUCTO en la base, de ahí tiene que estirar,
// no hace falta que yo importe nada".
//
// O sea: las listas de PROVEEDOR y TIPO DE PRODUCTO NO se escriben a mano:
// se ESTIRAN de la BASE real (tabla Product):
//   · PROVEEDORES   → columna FABRICANTE (col CO del Excel de la BASE)
//   · TIPO PRODUCTO → columna TIPO       (col CS del Excel de la BASE)
//
// GET /api/pedido-especial/catalogo
//   Cualquier usuario logueado. Devuelve:
//     · proveedores       → DISTINCT fabricante (orden alfabético)
//     · tiposPorProveedor → { fabricante: [tipos…] } (solo pares reales)
//     · tipos             → DISTINCT tipo (orden alfabético)
//     · porcentajes       → Task 113 v4: un registro por par (fabricante,
//       tipo) con los % resueltos DE LA BASE (promedio de los productos
//       del par — la misma regla de márgenes automáticas de la casa;
//       respaldo: los % del panel del admin si algún campo no aparece en
//       la BASE). Así el vendedor NO carga ni ve %: elige proveedor +
//       tipo y los % de la BASE se aplican solos, como pidió el dueño
//       ("vas a usar todas las lógicas de la BASE, lo único manual es
//       el costo").
//   Si la consulta falla devuelve listas vacías — NUNCA rompe la app.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { mapaPorcentajesDeLaBase } from "@/lib/pedido-especial-porcentajes";

export interface ParCatalogo {
  fabricante: string;
  tipo: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // DISTINCT directo en SQL: una sola consulta liviana (solo 2 columnas).
    // Se estiran las columnas reales de la BASE (fabricante + tipo), sin
    // valores vacíos, ordenadas alfabético.
    const pares = await db.$queryRaw<ParCatalogo[]>`
      SELECT DISTINCT "fabricante" AS fabricante, "tipo" AS tipo
      FROM "Product"
      WHERE "fabricante" IS NOT NULL AND "fabricante" <> ''
        AND "tipo" IS NOT NULL AND "tipo" <> ''
      ORDER BY "fabricante" ASC, "tipo" ASC
    `;

    const proveedores: string[] = [];
    const tiposPorProveedor: Record<string, string[]> = {};
    const tipos = new Set<string>();
    for (const p of pares) {
      const fab = String(p.fabricante || "").trim();
      const tip = String(p.tipo || "").trim();
      if (!fab || !tip) continue;
      if (!tiposPorProveedor[fab]) {
        tiposPorProveedor[fab] = [];
        proveedores.push(fab);
      }
      if (!tiposPorProveedor[fab].includes(tip)) tiposPorProveedor[fab].push(tip);
      tipos.add(tip);
    }

    // Task 113 v4: los % de cada par, estirados de la BASE (promedios
    // reales de los productos + respaldo del panel). NUNCA lanza: en
    // fallo devuelve [] y la pantalla calcula con lo que tenga.
    const porcentajes = await mapaPorcentajesDeLaBase();

    return NextResponse.json({
      proveedores,
      tiposPorProveedor,
      tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b)),
      porcentajes,
    });
  } catch (error) {
    console.error("GET /api/pedido-especial/catalogo:", error);
    // NUNCA rompe: la UI muestra las listas de la config como respaldo.
    return NextResponse.json({
      proveedores: [],
      tiposPorProveedor: {},
      tipos: [],
      porcentajes: [],
    });
  }
}
