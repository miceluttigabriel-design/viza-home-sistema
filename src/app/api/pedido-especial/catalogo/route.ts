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
    const grupos = new Set<string>();
    const tipos = new Set<string>();
    const provKeys = new Set<string>();
    const grupoKeys = new Set<string>();
    const tipoKeys = new Set<string>();
    const norm = (v: string) => String(v || "").trim().toUpperCase();

    // Un solo agregador para la BASE y la LISTA EXCEL: dedupe por clave
    // normalizada (los repetidos se eliminan y manda lo primero que entra,
    // que es la BASE -> si BASE y Excel tienen la misma combinación, gana
    // la BASE).
    const agregar = (fabRaw: string, grpRaw: string, tipRaw: string) => {
      const fab = String(fabRaw || "").trim();
      if (!fab) return;
      const fabKey = norm(fab);
      if (!provKeys.has(fabKey)) {
        provKeys.add(fabKey);
        tiposPorProveedor[fab] = [];
        gruposPorProveedor[fab] = [];
        proveedores.push(fab);
      }
      const grp = String(grpRaw || "").trim();
      const tip = String(tipRaw || "").trim();
      if (grp) {
        const grpKey = norm(grp);
        if (!grupoKeys.has(grpKey)) {
          grupoKeys.add(grpKey);
          grupos.add(grp);
        }
        if (!gruposPorProveedor[fab].some((v) => norm(v) === grpKey))
          gruposPorProveedor[fab].push(grp);
      }
      if (tip) {
        const tipKey = norm(tip);
        if (!tipoKeys.has(tipKey)) {
          tipoKeys.add(tipKey);
          tipos.add(tip);
        }
        if (!tiposPorProveedor[fab].some((v) => norm(v) === tipKey))
          tiposPorProveedor[fab].push(tip);
      }
    };

    // 1) TODO lo de la BASE (fabricante + GRUPO + TIPO).
    for (const p of pares) agregar(p.fabricante, p.grupo, p.tipo);
    // 2) TODO lo de la LISTA EXCEL (FABRICANTE + CATEGORIA + DIVISION), sin
    //    repetir lo que ya tiene la BASE.
    for (const c of combosDelCatalogoExtra()) agregar(c.fabricante, c.grupo, c.tipo);
    proveedores.sort((a, b) => a.localeCompare(b));

    // Los tipos creados entran en TODAS las listas (global + por
    // proveedor): si no están catalogados en la BASE, todavía así el
    // vendedor puede elegirlos para cualquier proveedor.
    for (const t of extraSet) {
      const tKey = norm(t);
      if (!tipoKeys.has(tKey)) {
        tipoKeys.add(tKey);
        tipos.add(t);
      }
      for (const fab of proveedores) {
        if (!tiposPorProveedor[fab].some((v) => norm(v) === tKey))
          tiposPorProveedor[fab].push(t);
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
