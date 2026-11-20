import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  generateWeddingListadoPdf,
  type WeddingListadoPayload,
} from "@/lib/pdf/weddingListado";

function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "") || "Novios"
  );
}

// POST /api/wedding-lists/listado
// Listado elegante de regalos y entregantes, SIN opciones de financiación.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as WeddingListadoPayload;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "La lista de bodas no tiene productos" },
        { status: 400 }
      );
    }

    const title = String(body.title ?? "").trim() || "Lista de Bodas";
    const pdf = generateWeddingListadoPdf({
      title,
      eventDate: body.eventDate ?? null,
      notes: body.notes ?? null,
      items: body.items,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VIZA-ListadoBodas-${slug(title)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando listado de bodas:", error);
    return NextResponse.json(
      { error: "No se pudo generar el listado" },
      { status: 500 }
    );
  }
}
