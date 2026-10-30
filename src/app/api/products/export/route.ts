import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerCapacidades } from "@/lib/producto-capacidad";
import { leerCores } from "@/lib/producto-cores";

// GET /api/products/export - Exporta TODOS los productos con TODAS las columnas (103 columnas)
// Genera CSV que abre en Excel - SIN librerias externas
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if ((session.user as any)?.role !== "admin" && (session.user as any)?.role !== "supremo_admin") return NextResponse.json({ error: "Solo admin o supremo_admin" }, { status: 403 });

    // Cargar TODOS los productos en batches de 500
    const allProducts: any[] = [];
    let skip = 0;
    const batchSize = 500;
    let hasMore = true;
    while (hasMore) {
      const batch = await db.product.findMany({
        where: { showInCatalog: false },
        orderBy: [{ sku: "asc" }],
        skip,
        take: batchSize,
      });
      allProducts.push(...batch);
      skip += batchSize;
      hasMore = batch.length === batchSize;
    }

    // Task 97: CAPACIDAD de cada producto (tabla aparte ProductCapacidad,
    // mismo patrón que #HASHTAG). Si la tabla aún no existe, el mapa viene
    // vacío y la columna CAPACIDAD sale vacía — el export nunca se rompe.
    const capacidadesMap = await leerCapacidades(allProducts.map((p) => p.id));

    // Task 98: CORES de cada producto (tabla aparte ProductCores, mismo
    // patrón que CAPACIDAD). Si la tabla aún no existe, el mapa viene
    // vacío y la columna CORES sale vacía — el export nunca se rompe.
    const coresMap = await leerCores(allProducts.map((p) => p.id));

    // Helper para sanitizar valores CSV
    function csvVal(val: any): string {
      if (val === null || val === undefined || val === "") return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes(";")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    // Helper para numeros - devuelve string vacio si null
    function numVal(val: any): string {
      if (val === null || val === undefined || val === "") return "";
      const n = Number(val);
      return isNaN(n) ? csvVal(val) : String(n);
    }

    // ===== DEFINIR LAS 103 COLUMNAS EN ORDEN EXACTO =====
    const columns = [
      // GRUPO 1 - IDENTIFICACION (1)
      { header: "SKU", fn: (p: any) => csvVal(p.sku) },

      // GRUPO 2 - DATOS PRINCIPALES (4) - pegados al SKU
      { header: "REFERENCIA", fn: (p: any) => csvVal(p.referencia) },
      { header: "DESCRIPCION", fn: (p: any) => csvVal(p.name) },
      { header: "COD VIZA", fn: (p: any) => csvVal(p.codViza) },
      { header: "COD SHOW", fn: (p: any) => csvVal(p.codShow) },

      // GRUPO 3 - COSTOS (18)
      { header: "Costo R$", fn: (p: any) => numVal(p.costBR) },
      { header: "R$ A GS", fn: (p: any) => numVal(p.rsToGs) },
      { header: "Costo US$", fn: (p: any) => numVal(p.costUS) },
      { header: "US$ A GS", fn: (p: any) => numVal(p.usToGs) },
      { header: "Costo Gs", fn: (p: any) => numVal(p.costGs) },
      { header: "R$ NO US$", fn: (p: any) => numVal(p.rsNoUS) },
      { header: "US$ NO GS", fn: (p: any) => numVal(p.usNoGs) },
      { header: "Sub-Costo", fn: (p: any) => numVal(p.subCost) },
      { header: "% DESC", fn: (p: any) => numVal(p.discountPct) },
      { header: "MENOS DESC. %", fn: (p: any) => numVal(p.minusDisc) },
      { header: "% ADD", fn: (p: any) => numVal(p.addPct) },
      { header: "MAIS % ADD", fn: (p: any) => numVal(p.plusAdd) },
      { header: "GASTOS ADM", fn: (p: any) => numVal(p.admPct) },
      { header: "MAIS % ADD 2", fn: (p: any) => numVal(p.plusAdd2) },
      { header: "VALOR DESC.", fn: (p: any) => numVal(p.valorDesc) },
      { header: "MENOS DESC. V", fn: (p: any) => numVal(p.minusDescV) },
      { header: "VALOR ADD", fn: (p: any) => numVal(p.valorAdd) },
      { header: "COSTO PROD.", fn: (p: any) => numVal(p.costProd) },

      // GRUPO 4 - BASES (3)
      { header: "BASES 1 A 6", fn: (p: any) => numVal(p.pct1A6) },
      { header: "BASES 7 A 13", fn: (p: any) => numVal(p.pct7A13) },
      { header: "BASES 14 A 30", fn: (p: any) => numVal(p.pct14A30) },

      // GRUPO 5 - MARGEN CONTADO (1)
      { header: "% CONTADO", fn: (p: any) => numVal(p.marginContado) },

      // GRUPO 6 - DATOS FINALES (1)
      { header: "SAFRA", fn: (p: any) => numVal(p.safra) },

      // GRUPO 7 - PRECIOS (1)
      { header: "CONTADO", fn: (p: any) => numVal(p.priceContado) },

      // GRUPO 8 - MARGENES C1-C30 (30)
      ...Array.from({ length: 30 }, (_, i) => ({
        header: `% C${i + 1}`,
        fn: (p: any) => numVal(p[`marginC${i + 1}`]),
      })),

      // GRUPO 9 - PRECIOS CUOTAS 1-30 (30)
      ...Array.from({ length: 30 }, (_, i) => ({
        header: `CUOTA ${i + 1}`,
        fn: (p: any) => numVal(p[`price${i + 1}`]),
      })),

      // GRUPO 10 - DATOS FINALES (14)
      { header: "PRODUCTO", fn: (p: any) => csvVal(p.productName) },
      { header: "FABRICANTE", fn: (p: any) => csvVal(p.fabricante) },
      { header: "SUB-GRUPO", fn: (p: any) => csvVal(p.subGrupo) },
      { header: "CATEGORIA", fn: (p: any) => csvVal(p.categoria) },
      { header: "DIVISION", fn: (p: any) => csvVal(p.division) },
      { header: "TIPO", fn: (p: any) => csvVal(p.tipo) },
      { header: "MARCA", fn: (p: any) => csvVal(p.marca) },
      { header: "MODELO", fn: (p: any) => csvVal(p.modelo) },
      // Task 98: CORES nueva, entre MODELO y CAPACIDAD (mismo orden que la
      // tabla del Panel ADM). El import de productos la lee para productos
      // NUEVOS, así el round-trip export → import conserva el dato.
      { header: "CORES", fn: (p: any) => csvVal(coresMap.get(p.id) ?? "") },
      // Task 97: CAPACIDAD (después de CORES, mismo orden que la tabla del
      // Panel ADM). El import de productos la lee para productos NUEVOS,
      // así el round-trip export → import conserva el dato.
      { header: "CAPACIDAD", fn: (p: any) => csvVal(capacidadesMap.get(p.id) ?? "") },
      { header: "VALOR TECNICO", fn: (p: any) => numVal(p.valorTecnico) },
      { header: "MARGEN TECNICO", fn: (p: any) => numVal(p.margenTecnico) },
      { header: "COLUNA1", fn: (p: any) => csvVal(p.coluna1) },
      { header: "COLUNA2", fn: (p: any) => csvVal(p.coluna2) },
      { header: "STOCK", fn: (p: any) => numVal(p.stock) },
      { header: "COSTO SISTEMA", fn: (p: any) => numVal(p.costSistema) },
    ];

    // ===== GENERAR CSV CON BOM UTF-8 =====
    let csv = "\uFEFF"; // BOM para que Excel reconozca UTF-8 (acentos, ñ, etc.)

    // HEADER (fila 1) - 103 columnas
    csv += columns.map((c) => c.header).join(";") + "\r\n";

    // FILAS DE DATOS - todas las 3533+ filas
    allProducts.forEach((p) => {
      const row = columns.map((c) => c.fn(p));
      csv += row.join(";") + "\r\n";
    });

    // Nombre del archivo
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, "");
    const filename = `BACKUP_VIZA_HOME_COMPLETO_${dateStr}_${timeStr}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error exportando:", error);
    return NextResponse.json(
      { error: "Error al exportar: " + (error as Error).message },
      { status: 500 }
    );
  }
}
