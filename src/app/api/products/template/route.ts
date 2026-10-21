import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExcelJS from "exceljs";

// GET /api/products/template - Descarga plantilla vacia con ejemplos
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const wb = new ExcelJS.Workbook();

    // Hoja 1: Plantilla
    const ws = wb.addWorksheet("PRODUCTOS");
    const headers = [
      "SKU", "REFERENCIA", "COD SHOW", "DESCRIPCION",
      "COSTO R$", "COSTO US$", "COSTO GS",
      "% DESC", "% ADD", "GASTOS ADM", "VALOR DESC.", "VALOR ADD",
      "1 A 6", "7 A 13", "14 A 30",
      "% CONTADO", "SAFRA",
      "OBS", "FABRICANTE", "SUB-GRUPO", "CATEGORIA",
      "DIVISION", "TIPO", "MARCA", "MODELO", "STOCK",
    ];
    ws.getRow(1).values = headers;
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155789" } };

    // Filas de ejemplo
    const ejemplos = [
      ["EJ-001", "REF-001", "SHOW-001", "PRODUCTO EJEMPLO 1", 100, null, 110000, null, null, 0.01, null, null, 0.04, 0.05, 0.04, 0.05, 7, "Ejemplo obs", "FABRICANTE X", "GRUPO 1", "CAT 1", "DIV 1", "TIPO 1", "MARCA X", "MOD X", 10],
      ["EJ-002", "REF-002", "SHOW-002", "PRODUCTO EJEMPLO 2", null, 50, 300000, 0.05, 0.03, 0.01, null, null, 0.04, 0.05, 0.04, 0.10, 6, "", "FABRICANTE Y", "GRUPO 2", "CAT 2", "DIV 2", "TIPO 2", "MARCA Y", "MOD Y", 5],
    ];
    ejemplos.forEach((ej, i) => {
      ws.getRow(i + 2).values = ej;
    });
    ws.columns.forEach((col) => { col.width = 18; });

    // Hoja 2: Instrucciones
    const ws2 = wb.addWorksheet("INSTRUCCIONES");
    ws2.getColumn(1).width = 30;
    ws2.getColumn(2).width = 50;

    ws2.getRow(1).values = ["INSTRUCCIONES DE IMPORTACION"];
    ws2.getRow(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155789" } };

    const instrucciones = [
      ["", ""],
      ["CAMPO", "DESCRIPCION"],
      ["SKU", "OBLIGATORIO - Codigo unico del producto (ej: 11555)"],
      ["DESCRIPCION", "OBLIGATORIO - Nombre del producto"],
      ["COSTO R$", "Costo en Reales (opcional, si hay usa cambio 1100)"],
      ["COSTO US$", "Costo en Dolares (opcional, si hay usa cambio 6000)"],
      ["COSTO GS", "Costo en Guaranies directo"],
      ["% DESC", "Porcentaje de descuento (ej: 0.05 = 5%)"],
      ["% ADD", "Porcentaje de adicion (ej: 0.03 = 3%)"],
      ["GASTOS ADM", "Gastos administrativos (ej: 0.01 = 1%)"],
      ["1 A 6", "Base para cuotas 1-6 (ej: 0.04 = 4%)"],
      ["7 A 13", "Base para cuotas 7-13 (ej: 0.05 = 5%)"],
      ["14 A 30", "Base para cuotas 14-30 (ej: 0.04 = 4%)"],
      ["% CONTADO", "Margen de contado (ej: 0.05 = 5%)"],
      ["SAFRA", "Numero de safra (ej: 7)"],
      ["STOCK", "Cantidad en stock (numero entero)"],
      ["", ""],
      ["NOTAS:", ""],
      ["1", "No modificar nombres de columnas"],
      ["2", "Si el SKU ya existe, se ACTUALIZA el producto"],
      ["3", "Si el SKU no existe, se CREA un producto nuevo"],
      ["4", "Los campos calculados (costo prod, precios) se calculan automaticamente"],
      ["5", "Los campos vacios se guardan como null/0"],
    ];

    instrucciones.forEach((row, i) => {
      ws2.getRow(i + 2).values = row;
      if (i === 0) {
        ws2.getRow(i + 2).font = { bold: true };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="VIZA_PLANTILLA_IMPORTACION.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error generando plantilla:", error);
    return NextResponse.json({ error: "Error al generar plantilla" }, { status: 500 });
  }
}
