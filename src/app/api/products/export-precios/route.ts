import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import ExcelJS from "exceljs";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { idsPorCapacidad, leerCapacidades } from "@/lib/producto-capacidad";
import { idsPorCores, leerCores } from "@/lib/producto-cores";
import { aplicarCondicionesEtiqueta, condicionesEtiqueta } from "@/lib/filtro-etiqueta";

// ═══════════════════════════════════════════════════════════════════════════
// TASK 167 - EXPORTAR LISTA DE PRECIOS (pedido del dueño)
//
// Botón de la BASE que genera un Excel SOLO con la lista de precios para el
// cliente/vendedor. REGLA DE ORO: acá NUNCA sale costo, margen, % interno ni
// ningún dato de trabajo del admin. Solo lo que el dueño pidió, en este orden:
//
//   COD · PROVEDOR · MARCA · GRUPO · SUB-GRUPO · TIPO PRODUCTO · MODELO ·
//   CAPACIDAD · CORES · REF.FABRICA · DESCRIPCION ·
//   PRECIO CONTADO · CUOTA 1 ... CUOTA 30
//
// Las cuotas son el valor de CADA cuota (price1..price30 de la base), SIN
// entrega inicial: es exactamente el precio de lista que ya usa el cotizador.
//
// Alcance (query `scope`):
//   · completa  → toda la base, sin ningún filtro.
//   · filtrado  → SOLO lo que está en pantalla (mismos filtros del GET
//                 /api/products: búsqueda, etiqueta SELECCIONADO / QUEMA STOCK
//                 / VIZA LIQUIDA / #HASHTAG, filtros por columna). El `where`
//                 de abajo es espejo del GET, así el Excel trae exactamente
//                 las mismas filas que el admin está viendo.
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const rolSesion = (session.user as any)?.role || "";
    const emailSesion = ((session.user as any)?.email || "").trim().toLowerCase();
    // Misma regla que la BASE: admin, supremo, VIP (solo lectura desde el GDA)
    // y usuarios de consulta. Un vendedor no ve la BASE, así que tampoco baja
    // la lista completa de precios por acá.
    const veBaseCompleta =
      rolSesion === "admin" ||
      rolSesion === "supremo_admin" ||
      rolSesion === "vip" ||
      esEmailSoloLectura(emailSesion, rolSesion);
    if (!veBaseCompleta) {
      return NextResponse.json({ error: "Sin permiso para exportar la base" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") === "filtrado" ? "filtrado" : "completa";

    const where: Record<string, unknown> = {};

    if (scope === "filtrado") {
      const category = searchParams.get("category");
      const sku = searchParams.get("sku");
      const search = searchParams.get("search");
      const etiquetaColor = searchParams.get("etiquetaColor");

      if (category && category !== "Todas") where.category = category;
      if (sku) where.sku = { contains: sku };

      // ─── Filtro por etiqueta (misma regla combinada que /api/products) ───
      const condsEtiqueta = await condicionesEtiqueta(etiquetaColor, veBaseCompleta);
      aplicarCondicionesEtiqueta(where, condsEtiqueta);

      if (search) {
        const orList: Record<string, unknown>[] = [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { brand: { contains: search, mode: "insensitive" } },
          { subcategory: { contains: search, mode: "insensitive" } },
          { fabricante: { contains: search, mode: "insensitive" } },
          { tipo: { contains: search, mode: "insensitive" } },
          { marca: { contains: search, mode: "insensitive" } },
          { modelo: { contains: search, mode: "insensitive" } },
          { referencia: { contains: search, mode: "insensitive" } },
        ];
        const idsCap = await idsPorCapacidad(search.trim(), null);
        if (idsCap.length > 0) orList.push({ id: { in: idsCap } });
        const idsCores = await idsPorCores(search.trim(), null);
        if (idsCores.length > 0) orList.push({ id: { in: idsCores } });
        where.OR = orList;
      }

      // ─── Filtros por columna (espejo de /api/products) ───
      let columnFilters: Record<string, string[]> = {};
      const filtersParam = searchParams.get("filters");
      if (filtersParam) {
        try {
          const parsed = JSON.parse(filtersParam);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [k, v] of Object.entries(parsed)) {
              if (Array.isArray(v) && v.length > 0) columnFilters[k] = v.map(String);
            }
          }
        } catch {
          // filtros inválidos → se ignoran (igual que el GET)
        }
      }
      for (const [col, values] of Object.entries(columnFilters)) {
        if (col === "capacidad") {
          const idsCap = await idsPorCapacidad(null, values);
          where.id = { in: idsCap.length > 0 ? idsCap : ["__sin_coincidencia__"] };
          continue;
        }
        if (col === "cores") {
          const idsCores = await idsPorCores(null, values);
          where.id = { in: idsCores.length > 0 ? idsCores : ["__sin_coincidencia__"] };
          continue;
        }
        where[col] = { in: values };
      }
    }

    // Traer todas las filas del alcance elegido. 3.500 productos pesan poco y
    // entran en una sola consulta (el Excel se arma en memoria).
    const products = await db.product.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Orden final: por COD numérico (lo natural en una lista de precios).
    const codNumero = (s: unknown): number | null => {
      const digitos = String(s ?? "").replace(/\D/g, "");
      return digitos === "" ? null : Number(digitos);
    };
    products.sort((a, b) => {
      const na = codNumero(a.sku);
      const nb = codNumero(b.sku);
      if (na === null && nb === null) return String(a.sku).localeCompare(String(b.sku));
      if (na === null) return 1;
      if (nb === null) return -1;
      return na - nb;
    });

    // CAPACIDAD y CORES viven en tablas aparte (mismo patrón que el GET).
    const capacidadesMap = await leerCapacidades(products.map((p) => p.id));
    const coresMap = await leerCores(products.map((p) => p.id));

    // ─── Excel ────────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "VIZA HOME";
    wb.created = new Date();
    const ws = wb.addWorksheet("LISTA DE PRECIOS", {
      views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
    });

    // Columnas EXACTAS del pedido (nada más, nada de costos/márgenes).
    type Col = {
      header: string;
      width: number;
      group: "COD" | "DATOS FINALES" | "DATOS" | "VALORES";
      fn: (p: any) => string | number | null;
    };
    const columns: Col[] = [
      {
        header: "COD",
        width: 11,
        group: "COD",
        // Si el código es puramente numérico se escribe como número (ordenable
        // en Excel); si trae letras queda como texto, sin perder nada.
        fn: (p) => {
          const raw = String(p.sku ?? "").trim();
          return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        },
      },
      { header: "PROVEDOR", width: 22, group: "DATOS FINALES", fn: (p) => txt(p.fabricante) },
      { header: "MARCA", width: 16, group: "DATOS FINALES", fn: (p) => txt(p.marca) },
      { header: "GRUPO", width: 20, group: "DATOS FINALES", fn: (p) => txt(p.categoria) },
      { header: "SUB-GRUPO", width: 18, group: "DATOS FINALES", fn: (p) => txt(p.subGrupo) },
      { header: "TIPO PRODUCTO", width: 20, group: "DATOS FINALES", fn: (p) => txt(p.tipo) },
      { header: "MODELO", width: 22, group: "DATOS FINALES", fn: (p) => txt(p.modelo) },
      {
        header: "CAPACIDAD",
        width: 13,
        group: "DATOS FINALES",
        fn: (p) => txt(capacidadesMap.get(p.id) ?? ""),
      },
      { header: "CORES", width: 15, group: "DATOS FINALES", fn: (p) => txt(coresMap.get(p.id) ?? "") },
      { header: "REF.FABRICA", width: 17, group: "DATOS", fn: (p) => txt(p.referencia) },
      { header: "DESCRIPCION", width: 52, group: "DATOS", fn: (p) => txt(p.name) },
      { header: "PRECIO CONTADO", width: 17, group: "VALORES", fn: (p) => num(p.priceContado) },
      ...Array.from({ length: 30 }, (_, i) => ({
        header: `CUOTA ${i + 1}`,
        width: 13,
        group: "VALORES" as const,
        fn: (p: any) => num(p[`price${i + 1}`]),
      })),
    ];

    // Fila 1: banda de grupos (DATOS FINALES / DATOS / VALORES), tal como el
    // dueño los agrupó en el pedido.
    const totalCols = columns.length;
    let inicio = 1;
    while (inicio <= totalCols) {
      const group = columns[inicio - 1].group;
      let fin = inicio;
      while (fin < totalCols && columns[fin].group === group) fin++;
      const cell = ws.getCell(1, inicio);
      cell.value = group;
      if (fin > inicio) ws.mergeCells(1, inicio, 1, fin);
      cell.font = { bold: true, size: 10, color: { argb: "FF7A5B16" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3B8" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9B86B" } },
        left: { style: "thin", color: { argb: "FFD9B86B" } },
        bottom: { style: "thin", color: { argb: "FFD9B86B" } },
        right: { style: "thin", color: { argb: "FFD9B86B" } },
      };
      inicio = fin + 1;
    }
    ws.getRow(1).height = 20;

    // Fila 2: encabezados exactos.
    const headerRow = ws.getRow(2);
    columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155789" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FF0F4166" } },
        left: { style: "thin", color: { argb: "FF0F4166" } },
        bottom: { style: "thin", color: { argb: "FF0F4166" } },
        right: { style: "thin", color: { argb: "FF0F4166" } },
      };
      ws.getColumn(i + 1).width = c.width;
    });
    headerRow.height = 28;

    // Filas de datos.
    products.forEach((p, idx) => {
      const row = ws.getRow(idx + 3);
      columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const value = c.fn(p);
        cell.value = value === "" || value === undefined ? null : value;
        cell.font = { size: 10, color: { argb: "FF1C1917" } };
        if (c.group === "VALORES") {
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (c.header === "COD") {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE7E5E4" } },
        };
        if (idx % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF9F6" } };
        }
      });
      row.height = 17;
    });

    // Filtro de Excel sobre los encabezados (no toca la banda de grupos).
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: totalCols },
    };

    // Impresión cómoda: horizontal, todo el ancho en una hoja, repetir títulos.
    ws.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:2",
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };

    const buffer = await wb.xlsx.writeBuffer();

    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const fecha =
      `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}` +
      `_${p2(now.getHours())}${p2(now.getMinutes())}`;
    const alcance = scope === "filtrado" ? "FILTRADO" : "COMPLETA";
    const filename = `LISTA_PRECIOS_VIZA_HOME_${alcance}_${fecha}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Productos": String(products.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error exportando lista de precios:", error);
    return NextResponse.json(
      { error: "Error al exportar la lista de precios: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// Texto limpio (null/undefined → celda vacía).
function txt(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// Número limpio (null/NaN → celda vacía).
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
