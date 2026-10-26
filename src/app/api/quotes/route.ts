import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nextSequentialQuoteNumber } from "@/lib/quote-number";

// POST /api/quotes/save - guarda el presupuesto en la BD
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const userId = (session.user as any)?.id;

    const body = await req.json();
    const {
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      vendorName,
      notes,
      discount,
      taxRate,
      items,
    } = body;

    if (!customerName || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Faltan datos del cliente o no hay items en el presupuesto" },
        { status: 400 }
      );
    }

    const subtotal = items.reduce(
      (sum: number, it: { subtotal: number }) => sum + Number(it.subtotal),
      0
    );
    const discountAmt = (subtotal * (Number(discount) || 0)) / 100;
    const taxable = subtotal - discountAmt;
    const taxAmt = (taxable * (Number(taxRate) || 0)) / 100;
    const total = taxable + taxAmt;

    // Número de presupuesto SECUENCIAL por usuario: PRESUPUESTO-01, 02 ...
    const quoteNumber = await nextSequentialQuoteNumber("PRESUPUESTO", userId);

    const quote = await db.quote.create({
      data: {
        quoteNumber,
        customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        customerAddress: customerAddress || null,
        vendorName: vendorName || "Vendedor VIZA",
        notes: notes || null,
        subtotal,
        discount: Number(discount) || 0,
        taxRate: Number(taxRate) || 0,
        total,
        userId,
        items: {
          create: items.map(
            (it: {
              productId: string;
              productName: string;
              productSku: string;
              quantity: number;
              unitPrice: number;
              subtotal: number;
            }) => ({
              productId: it.productId,
              productName: it.productName,
              productSku: it.productSku,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
              subtotal: Number(it.subtotal),
            })
          ),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    console.error("Error al guardar presupuesto:", error);
    return NextResponse.json({ error: "Error al guardar el presupuesto" }, { status: 500 });
  }
}

// GET /api/quotes - lista presupuestos guardados
// Admin y supremo_admin ven todos; un colaborador ve solo los propios.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    const userId = (session.user as any)?.id;
    const isAdmin = role === "admin" || role === "supremo_admin";

    const quotes = await db.quote.findMany({
      where: isAdmin ? {} : { userId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ quotes });
  } catch (error) {
    console.error("Error listando presupuestos:", error);
    return NextResponse.json({ error: "Error al listar presupuestos" }, { status: 500 });
  }
}
