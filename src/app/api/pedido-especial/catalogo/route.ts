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
//     · proveedores       → DISTINCT fabricante de la BASE (orden alfabético)
//       + los de la LISTA EXCEL (hoja base: FABRICANTE / CATEGORIA /
//       DIVISION) que la BASE no tiene — los repetidos se eliminan.
//     · tiposPorProveedor → { fabricante: [tipos…] } (+ tipos creados)
//     · tipos             → DISTINCT DIVISION (BASE y Excel) + creados
//     · tiposExtra        → los nombres de los tipos CREADOS (v6)
//     · porcentajes       → un registro por combinación (fabricante, GRUPO,
//       tipo): promedios de la BASE cuando la combinación está en la BASE,
//       o promedios de la LISTA EXCEL cuando no está. NUNCA se escribe
//       nada en Product (la BASE no se toca).
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
import { combosDelCatalogoExtra } from "@/lib/pedido-especial-porcentajes";
import {
  listarTiposExtra,
  crearTipoExtra,
} from "@/lib/pedido-especial-tipos";

export interface ParCatalogo {
  fabricante: string;
  grupo: string;
  tipo: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // DISTINCT directo en SQL: una sola consulta liviana (3 columnas).
    // Se estiran las columnas reales de la BASE:
    //   · FABRICANTE → proveedor
    //   · CATEGORIA  → GRUPO (pedido del dueño: usar GRUPO en el PEDIDO
    //     ESPECIAL porque es más confiable que el TIPO)
    //   · TIPO       → TIPO DE PRODUCTO (queda OPCIONAL)
    const pares = await db.$queryRaw<ParCatalogo[]>`
      SELECT DISTINCT "fabricante" AS fabricante, "categoria" AS grupo, "tipo" AS tipo
      FROM "Product"
      WHERE "fabricante" IS NOT NULL AND "fabricante" <> ''
      ORDER BY "fabricante" ASC, "categoria" ASC, "tipo" ASC
    `;

    // Tipos CREADOS por los usuarios (Task 113 v6) — NUNCA lanza.
    const extra = await listarTiposExtra().catch(() => [] as string[]);
    const extraSet = new Set(extra.map((t) => String(t || "").trim()).filter(Boolean));

    const proveedores: string[] = [];
    const tiposPorProveedor: Record<string, string[]> = {};
    const gruposPorProveedor: Record<string, string[]> = {};
    const tipos = new Set<string>();
    const grupos = new Set<string>();
    for (const p of pares) {
      const fab = String(p.fabricante || "").trim();
      if (!fab) continue;
      const grp = String(p.grupo || "").trim();
      const tip = String(p.tipo || "").trim();
      if (!tiposPorProveedor[fab]) {
        tiposPorProveedor[fab] = [];
        gruposPorProveedor[fab] = [];
        proveedores.push(fab);
      }
      if (grp) {
        if (!gruposPorProveedor[fab].includes(grp)) gruposPorProveedor[fab].push(grp);
        grupos.add(grp);
      }
      if (tip) {
        if (!tiposPorProveedor[fab].includes(tip)) tiposPorProveedor[fab].push(tip);
        tipos.add(tip);
      }
    }
    // LISTA EXCEL (pedido del dueño: "quiero que ponga tanto de la BASE
    // como del Excel… los repetidos los eliminás"): se ofrecen TODAS las
    // combinaciones del Excel en el buscador del PEDIDO ESPECIAL, sin
    // repetir las que la BASE ya tiene (dedupe por clave normalizada).
    // NUNCA se escriben en la BASE (tabla Product); es solo para buscar acá.
    for (const c of combosDelCatalogoExtra()) {
      const fab = String(c.fabricante || "").trim();
      if (!fab) continue;
      if (!tiposPorProveedor[fab]) {
        tiposPorProveedor[fab] = [];
        gruposPorProveedor[fab] = [];
        proveedores.push(fab);
      }
      const grp = String(c.grupo || "").trim();
      const tip = String(c.tipo || "").trim();
      if (grp) {
        if (!gruposPorProveedor[fab].includes(grp)) gruposPorProveedor[fab].push(grp);
        grupos.add(grp);
      }
      if (tip) {
        if (!tiposPorProveedor[fab].includes(tip)) tiposPorProveedor[fab].push(tip);
        tipos.add(tip);
      }
    }
    proveedores.sort((a, b) => a.localeCompare(b));

    // Los tipos creados entran en TODAS las listas (global + por
    // proveedor): si no están catalogados en la BASE, todavía así el
    // vendedor puede elegirlos para cualquier proveedor.
    for (const t of extraSet) {
      tipos.add(t);
      for (const fab of proveedores) {
        if (!tiposPorProveedor[fab].includes(t)) tiposPorProveedor[fab].push(t);
      }
    }

    // Task 113 v4/v6: los % de cada combinación, estirados de la BASE
    // (promedios reales + cascada por proveedor/grupo + respaldo del
    // panel). NUNCA lanza: en fallo devuelve [] y la pantalla calcula
    // con lo que tenga.
    const porcentajes = await mapaPorcentajesDeLaBase();

    return NextResponse.json({
      proveedores,
      tiposPorProveedor,
      gruposPorProveedor,
      tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b)),
      grupos: Array.from(grupos).sort((a, b) => a.localeCompare(b)),
      tiposExtra: Array.from(extraSet).sort((a, b) => a.localeCompare(b)),
      porcentajes,
    });
  } catch (error) {
    console.error("GET /api/pedido-especial/catalogo:", error);
    // NUNCA rompe: la UI muestra las listas de la config como respaldo.
    return NextResponse.json({
      proveedores: [],
      tiposPorProveedor: {},
      gruposPorProveedor: {},
      tipos: [],
      grupos: [],
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
