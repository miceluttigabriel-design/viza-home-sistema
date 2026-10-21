import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Columnas numéricas del modelo Product (devuelven min/max en lugar de distinct)
const NUMERIC_COLUMNS = new Set([
  "costBR",
  "rsToGs",
  "costUS",
  "usToGs",
  "costGs",
  "rsNoUS",
  "usNoGs",
  "subCost",
  "discountPct",
  "minusDisc",
  "addPct",
  "plusAdd",
  "admPct",
  "plusAdd2",
  "valorDesc",
  "minusDescV",
  "valorAdd",
  "costProd",
  "pct1A6",
  "pct7A13",
  "pct14A30",
  "marginContado",
  "marginC1",
  "marginC2",
  "marginC3",
  "marginC4",
  "marginC5",
  "marginC6",
  "marginC7",
  "marginC8",
  "marginC9",
  "marginC10",
  "marginC11",
  "marginC12",
  "marginC13",
  "marginC14",
  "marginC15",
  "marginC16",
  "marginC17",
  "marginC18",
  "marginC19",
  "marginC20",
  "marginC21",
  "marginC22",
  "marginC23",
  "marginC24",
  "marginC25",
  "marginC26",
  "marginC27",
  "marginC28",
  "marginC29",
  "marginC30",
  "priceContado",
  "price1",
  "price2",
  "price3",
  "price4",
  "price5",
  "price6",
  "price7",
  "price8",
  "price9",
  "price10",
  "price11",
  "price12",
  "price13",
  "price14",
  "price15",
  "price16",
  "price17",
  "price18",
  "price19",
  "price20",
  "price21",
  "price22",
  "price23",
  "price24",
  "price25",
  "price26",
  "price27",
  "price28",
  "price29",
  "price30",
  "valorTecnico",
  "margenTecnico",
  "stock",
  "costSistema",
  "price",
  "cost",
]);

// GET /api/products/distinct?column=X
// Devuelve valores únicos para una columna (tipo texto) o min/max/count (numérica)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const column = searchParams.get("column");
    if (!column) {
      return NextResponse.json(
        { error: "Falta el parámetro 'column'" },
        { status: 400 }
      );
    }

    const role = (session.user as any)?.role;
    const baseWhere: Record<string, unknown> = {};
    // Admin y supremo_admin ven todos los productos. Colaboradores solo los visibles.
    if (role !== "admin" && role !== "supremo_admin") {
      baseWhere.showInCatalog = true;
    }

    // Columna numérica: devolver min, max y count
    if (NUMERIC_COLUMNS.has(column)) {
      const agg = await db.product.aggregate({
        where: baseWhere,
        _min: { [column]: true } as any,
        _max: { [column]: true } as any,
        _count: true,
      });
      return NextResponse.json({
        type: "numeric",
        column,
        min: (agg._min as any)?.[column] ?? null,
        max: (agg._max as any)?.[column] ?? null,
        count: agg._count,
      });
    }

    // Columna de texto: devolver valores únicos con conteo
    const groups = await db.product.groupBy({
      by: [column] as any,
      where: baseWhere,
      _count: true,
      orderBy: { _count: { [column]: "desc" } } as any,
    });

    const values = groups.map((g: any) => {
      const v = g[column];
      return { value: v === null || v === undefined ? "" : String(v), count: g._count };
    });

    // Ordenar: vacíos al final, resto alfabético
    values.sort((a, b) => {
      if (a.value === "" && b.value !== "") return 1;
      if (b.value === "" && a.value !== "") return -1;
      return a.value.localeCompare(b.value, "es");
    });

    return NextResponse.json({
      type: "text",
      column,
      values: values.map((v) => v.value),
      counts: values,
      count: values.length,
    });
  } catch (error) {
    console.error("Error fetching distinct values:", error);
    return NextResponse.json(
      { error: "Error al obtener valores únicos" },
      { status: 500 }
    );
  }
}
