import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  clampCuotas,
  isWeddingQuoteType,
  type WeddingQuoteType,
} from "@/lib/wedding-list";

/**
 * API de LISTAS DE BODAS.
 *
 * POST   /api/wedding-lists → guarda una lista nueva (con el título de los novios)
 * PUT    /api/wedding-lists → actualiza una lista guardada (id en el body)
 * GET    /api/wedding-lists → lista las guardadas (admin ve todas, vendedor solo las suyas)
 * DELETE /api/wedding-lists?id=... → borra una lista
 *
 * Los items se guardan como "snapshot": además de los datos legibles se
 * guarda el CotizacionItem completo en `data` (JSON) para poder recargar la
 * lista y volver a cotizar con los precios/cuotas originales. Los datos del
 * entregante y la modalidad de cotización se guardan también en columnas
 * propias para poder listarlos sin abrir el JSON.
 */

interface SavedItemInput {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  priceContado?: number;
  subtotal?: number;
  // Datos del entregante (quien regala el producto)
  giverName?: string;
  giverPhone?: string;
  giverCi?: string;
  // Modalidad con la que se cotizó el regalo
  quoteType?: WeddingQuoteType;
  quoteCuotas?: number;
  quotedAmount?: number;
  [key: string]: unknown;
}

function normalizeItems(raw: unknown): SavedItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => {
      const productId = String(it.productId ?? "");
      const sku = String(it.sku ?? "");
      const name = String(it.name ?? "Producto");
      const quantity = Math.max(1, Number(it.quantity) || 1);
      const unitPrice = Number(it.priceContado ?? it.unitPrice ?? 0) || 0;
      const quoteType: WeddingQuoteType = isWeddingQuoteType(it.quoteType)
        ? it.quoteType
        : "contado";
      const quoteCuotas = quoteType === "cuota" ? clampCuotas(it.quoteCuotas) : 0;
      const quotedAmountRaw = Number(it.quotedAmount);
      const quotedAmount =
        Number.isFinite(quotedAmountRaw) && quotedAmountRaw > 0
          ? quotedAmountRaw
          : unitPrice * quantity;
      return {
        ...it,
        productId,
        sku,
        name,
        quantity,
        priceContado: unitPrice,
        subtotal: unitPrice * quantity,
        giverName: String(it.giverName ?? "").trim(),
        giverPhone: String(it.giverPhone ?? "").trim(),
        giverCi: String(it.giverCi ?? "").trim(),
        quoteType,
        quoteCuotas,
        quotedAmount,
      } as SavedItemInput;
    })
    .filter((it) => it.productId && it.name);
}

function itemsToCreate(items: SavedItemInput[]) {
  return items.map((it) => ({
    productId: it.productId,
    sku: it.sku,
    name: it.name,
    quantity: it.quantity,
    unitPrice: Number(it.priceContado) || 0,
    subtotal: Number(it.subtotal) || 0,
    giverName: it.giverName || null,
    giverPhone: it.giverPhone || null,
    giverCi: it.giverCi || null,
    quoteType: it.quoteType ?? "contado",
    quoteCuotas: it.quoteCuotas ?? 0,
    quotedAmount: Number(it.quotedAmount) || 0,
    data: JSON.stringify(it),
  }));
}

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return {
    id: (session.user as { id?: string } | undefined)?.id ?? null,
    role: (session.user as { role?: string } | undefined)?.role ?? "colaborador",
    name: (session.user as { name?: string | null } | undefined)?.name ?? null,
    email: session.user?.email ?? null,
  };
}

// POST /api/wedding-lists - guardar lista nueva
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Ingresá el título de los novios" }, { status: 400 });
    }
    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "La lista de bodas no tiene productos" },
        { status: 400 }
      );
    }

    const list = await db.weddingList.create({
      data: {
        title,
        eventDate: body.eventDate ? String(body.eventDate) : null,
        notes: body.notes ? String(body.notes) : null,
        vendorName:
          String(body.vendorName ?? "").trim() || user.name || user.email || "Vendedor VIZA",
        userId: user.id,
        items: { create: itemsToCreate(items) },
      },
      include: { items: true },
    });

    return NextResponse.json({ ok: true, list });
  } catch (error) {
    console.error("Error al guardar lista de bodas:", error);
    return NextResponse.json({ error: "Error al guardar la lista de bodas" }, { status: 500 });
  }
}

// PUT /api/wedding-lists - actualizar una lista guardada
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const id = String(body.id ?? "");
    const title = String(body.title ?? "").trim();
    if (!id || !title) {
      return NextResponse.json({ error: "Faltan datos de la lista" }, { status: 400 });
    }
    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "La lista de bodas no tiene productos" },
        { status: 400 }
      );
    }

    const existing = await db.weddingList.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }
    const isAdmin = user.role === "admin" || user.role === "supremo_admin";
    if (!isAdmin && existing.userId !== user.id) {
      return NextResponse.json({ error: "No tenés permiso para editar esta lista" }, { status: 403 });
    }

    const list = await db.weddingList.update({
      where: { id },
      data: {
        title,
        eventDate: body.eventDate ? String(body.eventDate) : null,
        notes: body.notes ? String(body.notes) : null,
        items: {
          deleteMany: {},
          create: itemsToCreate(items),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ ok: true, list });
  } catch (error) {
    console.error("Error al actualizar lista de bodas:", error);
    return NextResponse.json({ error: "Error al actualizar la lista de bodas" }, { status: 500 });
  }
}

// GET /api/wedding-lists - listar guardadas
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const isAdmin = user.role === "admin" || user.role === "supremo_admin";
    const lists = await db.weddingList.findMany({
      where: isAdmin ? {} : { userId: user.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ lists });
  } catch (error) {
    console.error("Error al listar listas de bodas:", error);
    return NextResponse.json({ error: "Error al listar las listas de bodas" }, { status: 500 });
  }
}

// DELETE /api/wedding-lists?id=... - borrar lista
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Falta el id de la lista" }, { status: 400 });

    const existing = await db.weddingList.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }
    const isAdmin = user.role === "admin" || user.role === "supremo_admin";
    if (!isAdmin && existing.userId !== user.id) {
      return NextResponse.json({ error: "No tenés permiso para borrar esta lista" }, { status: 403 });
    }

    await db.weddingList.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al borrar lista de bodas:", error);
    return NextResponse.json({ error: "Error al borrar la lista de bodas" }, { status: 500 });
  }
}
