// ─── PEDIDO ESPECIAL — CATÁLOGO DE LA BASE (Task 113 v2 + v6) ───
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
// Task 113 v6 (pedido del dueño: "en tipo de producto quiero que tenga
// opción de crear también si es que no temos cadastrado este tipo de
// producto"): los tipos que ALGUIEN CREÓ desde la pantalla (tabla
// PedidoEspecialTipo) salen en las listas SIEMPRE, para todos los
// proveedores, marcados con (nuevo) en el dropdown.
//
// GET /api/pedido-especial/catalogo
//   Cualquier usuario logueado. Devuelve:
//     · proveedores       → DISTINCT fabricante (orden alfabético)
//     · tiposPorProveedor → { fabricante: [tipos…] } (+ tipos creados)
//     · tipos             → DISTINCT tipo (orden alfabético) + creados
//     · tiposExtra        → los nombres de los tipos CREADOS (v6)
//     · porcentajes       → Task 113 v4: un registro por par (fabricante,
//       tipo) con los % resueltos DE LA BASE (cascada par → proveedor →
//       tipo → general; respaldo: los % del panel del admin si algún
//       campo no aparece en la BASE). Para los tipos CREADOS salen con
//       el promedio GENERAL (no hay productos de ese tipo todavía).
//   Si la consulta falla devuelve listas vacías — NUNCA rompe la app.
//
// POST /api/pedido-especial/catalogo  { tipo: "..." }
//   CREA un tipo de producto nuevo (el dueño: opción de crear cuando no
//   está catalogado). Pueden todos los usuarios logueados MENOS los de
//   solo consulta. Devuelve { tipo, yaExistia }.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { mapaPorcentajesDeLaBase } from "@/lib/pedido-especial-porcentajes";
import {
  listarTiposExtra,
  crearTipoExtra,
} from "@/lib/pedido-especial-tipos";

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

    // Tipos CREADOS por los usuarios (Task 113 v6) — NUNCA lanza.
    const extra = await listarTiposExtra().catch(() => [] as string[]);
    const extraSet = new Set(extra.map((t) => String(t || "").trim()).filter(Boolean));

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
    // Los tipos creados entran en TODAS las listas (global + por
    // proveedor): si no están catalogados en la BASE, todavía así el
    // vendedor puede elegirlos para cualquier proveedor.
    for (const t of extraSet) {
      tipos.add(t);
      for (const fab of proveedores) {
        if (!tiposPorProveedor[fab].includes(t)) tiposPorProveedor[fab].push(t);
      }
    }

    // Task 113 v4/v6: los % de cada par, estirados de la BASE (promedios
    // reales + cascada por proveedor + respaldo del panel). NUNCA lanza:
    // en fallo devuelve [] y la pantalla calcula con lo que tenga.
    const porcentajes = await mapaPorcentajesDeLaBase();

    return NextResponse.json({
      proveedores,
      tiposPorProveedor,
      tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b)),
      tiposExtra: Array.from(extraSet).sort((a, b) => a.localeCompare(b)),
      porcentajes,
    });
  } catch (error) {
    console.error("GET /api/pedido-especial/catalogo:", error);
    // NUNCA rompe: la UI muestra las listas de la config como respaldo.
    return NextResponse.json({
      proveedores: [],
      tiposPorProveedor: {},
      tipos: [],
      tiposExtra: [],
      porcentajes: [],
    });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const email = (session.user?.email || "").trim().toLowerCase();
    if (esEmailSoloLectura(email)) {
      return NextResponse.json(
        { error: "Tu usuario es de solo consulta: no puede crear tipos de producto." },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => null);
    const tipo = String((body as any)?.tipo || "");
    const r = await crearTipoExtra(tipo, { email });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json(
      { tipo: r.nombre, yaExistia: r.yaExistia },
      { status: r.yaExistia ? 200 : 201 }
    );
  } catch (error) {
    console.error("POST /api/pedido-especial/catalogo:", error);
    return NextResponse.json(
      { error: "No se pudo crear el tipo de producto." },
      { status: 500 }
    );
  }
}
