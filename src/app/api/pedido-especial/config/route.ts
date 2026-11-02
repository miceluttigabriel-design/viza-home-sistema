// ─── PEDIDO ESPECIAL — API DE CONFIGURACIÓN (Task 113, pedido del dueño) ───
//
// La config es una fila por combinación (PROVEEDOR + TIPO DE PRODUCTO)
// con los % que el sistema aplica al cotizar el pedido especial (misma
// estructura de % que la BASE: contado, 1-6, 7-13, 14-30). El dueño
// confirmó: "de acuerdo al % de nuestra base usado para aquel tipo de
// producto y proveedor genera el plan".
//
// GET    /api/pedido-especial/config
//   Cualquier usuario logueado: devuelve TODAS las combinaciones
//   (ordenadas proveedor → tipo). Si la tabla todavía no existe se crea
//   sola (SQL idempotente) y si aun así falla devuelve lista vacía —
//   NUNCA rompe ni el panel de ventas ni la Base.
//
// POST   /api/pedido-especial/config   { proveedor, tipoProducto, pctContado, pct1A6, pct7A13, pct14A30 }
// PUT    /api/pedido-especial/config   { id, ...mismos campos }
// DELETE /api/pedido-especial/config?id=...
//   SOLO admin o supremo_admin y NUNCA usuarios de consulta (solo
//   lectura) — la MISMA regla de toda escritura de la Base.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import {
  listarCombinaciones,
  validarPayloadCombinacion,
  ensureTablaPedidoEspecial,
  esErrorDuplicado,
  normalizarTexto,
  TEXTO_MAX,
} from "@/lib/pedido-especial";

// ¿La sesión puede ESCRIBIR la config? (misma regla de la Base).
function puedeEscribir(session: any): boolean {
  const role = String(session?.user?.role || "").trim().toLowerCase();
  return role === "admin" || role === "supremo_admin";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const combinaciones = await listarCombinaciones();
    return NextResponse.json({ combinaciones });
  } catch (error) {
    console.error("GET /api/pedido-especial/config:", error);
    // NUNCA rompe: la UI muestra "sin combinaciones cargadas".
    return NextResponse.json({ combinaciones: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!puedeEscribir(session)) {
      return NextResponse.json(
        { error: "Solo admin o supremo_admin pueden editar la config del pedido especial" },
        { status: 403 }
      );
    }
    if (esEmailSoloLectura((session.user as any)?.email)) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede editar la config" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const campos = validarPayloadCombinacion(body);
    if (!campos) {
      return NextResponse.json(
        {
          error: `Datos inválidos: proveedor y tipo de producto son obligatorios (hasta ${TEXTO_MAX} caracteres) y los % deben ser números entre 0 y 300`,
        },
        { status: 400 }
      );
    }

    const fila = await db.pedidoEspecialConfig.create({ data: campos });
    return NextResponse.json({ ok: true, fila });
  } catch (error) {
    if (esErrorDuplicado(error)) {
      return NextResponse.json(
        { error: "Ya existe esa combinación de proveedor + tipo de producto: editala en la lista en vez de crearla de nuevo" },
        { status: 409 }
      );
    }
    // Si la tabla faltó, el ensure la creó para la próxima (primer uso).
    await ensureTablaPedidoEspecial();
    console.error("POST /api/pedido-especial/config:", error);
    return NextResponse.json(
      { error: "No se pudo crear la combinación (intenta de nuevo)" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!puedeEscribir(session)) {
      return NextResponse.json(
        { error: "Solo admin o supremo_admin pueden editar la config del pedido especial" },
        { status: 403 }
      );
    }
    if (esEmailSoloLectura((session.user as any)?.email)) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede editar la config" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el id de la combinación" }, { status: 400 });
    }
    const campos = validarPayloadCombinacion(body);
    if (!campos) {
      return NextResponse.json(
        {
          error: `Datos inválidos: proveedor y tipo de producto son obligatorios (hasta ${TEXTO_MAX} caracteres) y los % deben ser números entre 0 y 300`,
        },
        { status: 400 }
      );
    }

    const fila = await db.pedidoEspecialConfig.update({ where: { id }, data: campos });
    return NextResponse.json({ ok: true, fila });
  } catch (error) {
    if (esErrorDuplicado(error)) {
      return NextResponse.json(
        { error: "Ya existe otra combinación con ese proveedor + tipo de producto" },
        { status: 409 }
      );
    }
    await ensureTablaPedidoEspecial();
    console.error("PUT /api/pedido-especial/config:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el cambio (intenta de nuevo)" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!puedeEscribir(session)) {
      return NextResponse.json(
        { error: "Solo admin o supremo_admin pueden editar la config del pedido especial" },
        { status: 403 }
      );
    }
    if (esEmailSoloLectura((session.user as any)?.email)) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO LECTURA: no puede editar la config" },
        { status: 403 }
      );
    }

    const id = String(req.nextUrl.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el id (?id=...)" }, { status: 400 });
    }

    await db.pedidoEspecialConfig.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    await ensureTablaPedidoEspecial();
    // P2025 = el registro ya no existe: borrarlo de nuevo es un éxito.
    if ((error as { code?: string } | null)?.code === "P2025") {
      return NextResponse.json({ ok: true });
    }
    console.error("DELETE /api/pedido-especial/config:", error);
    return NextResponse.json(
      { error: "No se pudo borrar la combinación (intenta de nuevo)" },
      { status: 500 }
    );
  }
}
