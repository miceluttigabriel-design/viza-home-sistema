// ============================================================
// Task 112 (pedido del dueño): BACKUP AUTOMÁTICO DE LA BASE A EXCEL
// "exportar Excel y enviar el backup al correo del representante,
//  3 copias por día (6:00, 14:00, 22:00) — automatizado".
//
// Esta lib genera UN archivo .xlsx con UNA hoja por cada tabla de
// la base de datos (Productos, Usuarios, Cotizaciones, Items, Stock
// Sucursal, Hashtags, Capacidades, Cores, Costos Editados, Etiquetas,
// Tasa de Cambio, Sucursales por Usuario, Stock Import Log, Quote
// Sequences). EXCLUYE PasswordLog (guarda contraseñas en texto plano:
// NUNCA se manda por correo) y EXCLUYE el campo `password` de User
// (mismo motivo). El resto va completo, para que el backup sirva
// realmente como respaldo de la base.
//
// La hoja "Productos" replica EXACTAMENTE las 103 columnas del export
// CSV que ya existe (/api/products/export), incluidos CORES y
// CAPACIDAD (tablas aparte) — así el representante abre el Excel y ve
// el mismo formato de siempre, más todas las demás tablas en hojas
// separadas.
// ============================================================

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { leerCapacidades } from "@/lib/producto-capacidad";
import { leerCores } from "@/lib/producto-cores";

export interface BackupStats {
  fecha: string; // ISO
  hojas: { nombre: string; filas: number }[];
  totalFilas: number;
  sizeBytes: number;
  durationMs: number;
}

export interface BackupResult {
  buffer: Buffer;
  filename: string;
  stats: BackupStats;
}

// Helper: escribe un arreglo de objetos como una hoja Excel.
// Recibe el nombre de la hoja, las columnas (header + key) y las filas.
async function escribirHoja<T>(
  wb: ExcelJS.Workbook,
  nombre: string,
  columnas: { header: string; key: keyof T; width?: number }[],
  filas: T[]
): Promise<{ nombre: string; filas: number }> {
  const ws = wb.addWorksheet(nombre);
  ws.columns = columnas.map((c) => ({
    header: c.header,
    key: c.key as string,
    width: c.width ?? Math.min(40, Math.max(12, c.header.length + 4)),
  }));

  // Estilo del header: negrita + fondo gris claro + bordes
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };

  // Agregar filas
  for (const fila of filas) {
    ws.addRow(fila);
  }

  // Auto-filtro en la primera fila (para que el representante pueda filtrar)
  if (filas.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnas.length },
    };
  }

  return { nombre, filas: filas.length };
}

export async function generateBackupExcel(): Promise<BackupResult> {
  const t0 = Date.now();
  const wb = new ExcelJS.Workbook();
  wb.creator = "VIZA HOME E.A.S — Backup Automático";
  wb.created = new Date();

  const hojas: { nombre: string; filas: number }[] = [];

  // ===== HOJA 1: PRODUCTOS (103 columnas, mismo formato que el export CSV) =====
  // Carga en batches de 500 para no pinchar la memoria con ~3500 productos.
  const allProducts: any[] = [];
  let skip = 0;
  const batchSize = 500;
  let hasMore = true;
  while (hasMore) {
    const batch = await db.product.findMany({
      orderBy: [{ sku: "asc" }],
      skip,
      take: batchSize,
    });
    allProducts.push(...batch);
    skip += batchSize;
    hasMore = batch.length === batchSize;
  }

  const capacidadesMap = await leerCapacidades(allProducts.map((p) => p.id));
  const coresMap = await leerCores(allProducts.map((p) => p.id));

  const columnasProductos: { header: string; key: string; width?: number }[] = [
    { header: "SKU", key: "sku" },
    { header: "REFERENCIA", key: "referencia" },
    { header: "DESCRIPCION", key: "name", width: 40 },
    { header: "COD VIZA", key: "codViza" },
    { header: "COD SHOW", key: "codShow" },
    { header: "Costo R$", key: "costBR" },
    { header: "R$ A GS", key: "rsToGs" },
    { header: "Costo US$", key: "costUS" },
    { header: "US$ A GS", key: "usToGs" },
    { header: "Costo Gs", key: "costGs" },
    { header: "R$ NO US$", key: "rsNoUS" },
    { header: "US$ NO GS", key: "usNoGs" },
    { header: "Sub-Costo", key: "subCost" },
    { header: "% DESC", key: "discountPct" },
    { header: "MENOS DESC. %", key: "minusDisc" },
    { header: "% ADD", key: "addPct" },
    { header: "MAIS % ADD", key: "plusAdd" },
    { header: "GASTOS ADM", key: "admPct" },
    { header: "MAIS % ADD 2", key: "plusAdd2" },
    { header: "VALOR DESC.", key: "valorDesc" },
    { header: "MENOS DESC. V", key: "minusDiscV" },
    { header: "VALOR ADD", key: "valorAdd" },
    { header: "COSTO PROD.", key: "costProd" },
    { header: "BASES 1 A 6", key: "pct1A6" },
    { header: "BASES 7 A 13", key: "pct7A13" },
    { header: "BASES 14 A 30", key: "pct14A30" },
    { header: "% CONTADO", key: "marginContado" },
    { header: "SAFRA", key: "safra" },
    { header: "CONTADO", key: "priceContado" },
    ...Array.from({ length: 30 }, (_, i) => ({ header: `% C${i + 1}`, key: `marginC${i + 1}` })),
    ...Array.from({ length: 30 }, (_, i) => ({ header: `CUOTA ${i + 1}`, key: `price${i + 1}` })),
    { header: "PRODUCTO", key: "productName" },
    { header: "FABRICANTE", key: "fabricante" },
    { header: "SUB-GRUPO", key: "subGrupo" },
    { header: "CATEGORIA", key: "categoria" },
    { header: "DIVISION", key: "division" },
    { header: "TIPO", key: "tipo" },
    { header: "MARCA", key: "marca" },
    { header: "MODELO", key: "modelo" },
    { header: "CORES", key: "_cores", width: 20 },
    { header: "CAPACIDAD", key: "_capacidad", width: 20 },
    { header: "VALOR TECNICO", key: "valorTecnico" },
    { header: "MARGEN TECNICO", key: "margenTecnico" },
    { header: "COLUNA1", key: "coluna1" },
    { header: "COLUNA2", key: "coluna2" },
    { header: "STOCK", key: "stock" },
    { header: "COSTO SISTEMA", key: "costSistema" },
    { header: "ETIQUETA COLOR", key: "etiquetaColor" },
    { header: "SHOW IN CATALOG", key: "showInCatalog" },
    { header: "ULT. EDICION AT", key: "_ultimaEdicionAt" },
    { header: "ULT. EDICION POR", key: "ultimaEdicionPor" },
    { header: "CREATED AT", key: "_createdAt" },
    { header: "UPDATED AT", key: "_updatedAt" },
  ];

  // Mapear productos a filas planas (con cores/capacidad y fechas formateadas)
  const filasProductos = allProducts.map((p) => ({
    ...p,
    _cores: coresMap.get(p.id) ?? "",
    _capacidad: capacidadesMap.get(p.id) ?? "",
    _ultimaEdicionAt: p.ultimaEdicionAt ? new Date(p.ultimaEdicionAt).toISOString() : "",
    _createdAt: new Date(p.createdAt).toISOString(),
    _updatedAt: new Date(p.updatedAt).toISOString(),
  }));

  hojas.push(await escribirHoja(wb, "Productos", columnasProductos, filasProductos));

  // ===== HOJA 2: USUARIOS (SIN password — nunca se manda por correo) =====
  const usuarios = await db.user.findMany({ orderBy: [{ email: "asc" }] });
  const filasUsuarios = usuarios.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    role: u.role,
    active: u.active,
    createdAt: new Date(u.createdAt).toISOString(),
    updatedAt: new Date(u.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Usuarios",
      [
        { header: "id", key: "id" },
        { header: "email", key: "email", width: 30 },
        { header: "name", key: "name", width: 25 },
        { header: "role", key: "role" },
        { header: "active", key: "active" },
        { header: "createdAt", key: "createdAt", width: 24 },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasUsuarios
    )
  );

  // ===== HOJA 3: COTIZACIONES =====
  const quotes = await db.quote.findMany({ orderBy: [{ createdAt: "desc" }] });
  const filasQuotes = quotes.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    customerName: q.customerName,
    customerPhone: q.customerPhone ?? "",
    customerEmail: q.customerEmail ?? "",
    customerAddress: q.customerAddress ?? "",
    vendorName: q.vendorName,
    notes: q.notes ?? "",
    subtotal: q.subtotal,
    discount: q.discount,
    taxRate: q.taxRate,
    total: q.total,
    status: q.status,
    userId: q.userId ?? "",
    createdAt: new Date(q.createdAt).toISOString(),
    updatedAt: new Date(q.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Cotizaciones",
      [
        { header: "id", key: "id" },
        { header: "quoteNumber", key: "quoteNumber" },
        { header: "customerName", key: "customerName", width: 25 },
        { header: "customerPhone", key: "customerPhone" },
        { header: "customerEmail", key: "customerEmail", width: 25 },
        { header: "customerAddress", key: "customerAddress", width: 30 },
        { header: "vendorName", key: "vendorName" },
        { header: "notes", key: "notes", width: 30 },
        { header: "subtotal", key: "subtotal" },
        { header: "discount", key: "discount" },
        { header: "taxRate", key: "taxRate" },
        { header: "total", key: "total" },
        { header: "status", key: "status" },
        { header: "userId", key: "userId" },
        { header: "createdAt", key: "createdAt", width: 24 },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasQuotes
    )
  );

  // ===== HOJA 4: COTIZACIONES ITEMS =====
  const quoteItems = await db.quoteItem.findMany({ orderBy: [{ createdAt: "desc" }] });
  const filasItems = quoteItems.map((it) => ({
    id: it.id,
    quoteId: it.quoteId,
    productId: it.productId,
    productName: it.productName,
    productSku: it.productSku,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    subtotal: it.subtotal,
    createdAt: new Date(it.createdAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Cotizaciones Items",
      [
        { header: "id", key: "id" },
        { header: "quoteId", key: "quoteId" },
        { header: "productId", key: "productId" },
        { header: "productName", key: "productName", width: 30 },
        { header: "productSku", key: "productSku" },
        { header: "quantity", key: "quantity" },
        { header: "unitPrice", key: "unitPrice" },
        { header: "subtotal", key: "subtotal" },
        { header: "createdAt", key: "createdAt", width: 24 },
      ],
      filasItems
    )
  );

  // ===== HOJA 5: STOCK SUCURSAL =====
  const stockSuc = await db.stockSucursal.findMany({ orderBy: [{ sucursal: "asc" }, { productId: "asc" }] });
  const filasStock = stockSuc.map((s) => ({
    id: s.id,
    productId: s.productId,
    sucursal: s.sucursal,
    saldo: s.saldo,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Stock Sucursal",
      [
        { header: "id", key: "id" },
        { header: "productId", key: "productId" },
        { header: "sucursal", key: "sucursal" },
        { header: "saldo", key: "saldo" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasStock
    )
  );

  // ===== HOJA 6: HASHTAGS =====
  const hashtags = await db.productHashtag.findMany({ orderBy: [{ productId: "asc" }] });
  const filasHashtags = hashtags.map((h) => ({
    id: h.id,
    productId: h.productId,
    valor: h.valor ?? "",
    fecha: h.fecha ?? "",
    updatedAt: new Date(h.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Hashtags",
      [
        { header: "id", key: "id" },
        { header: "productId", key: "productId" },
        { header: "valor", key: "valor" },
        { header: "fecha", key: "fecha" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasHashtags
    )
  );

  // ===== HOJA 7: CAPACIDADES =====
  const capacidades = await db.productCapacidad.findMany({ orderBy: [{ productId: "asc" }] });
  const filasCap = capacidades.map((c) => ({
    id: c.id,
    productId: c.productId,
    valor: c.valor ?? "",
    updatedAt: new Date(c.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Capacidades",
      [
        { header: "id", key: "id" },
        { header: "productId", key: "productId" },
        { header: "valor", key: "valor" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasCap
    )
  );

  // ===== HOJA 8: CORES =====
  const cores = await db.productCores.findMany({ orderBy: [{ productId: "asc" }] });
  const filasCores = cores.map((c) => ({
    id: c.id,
    productId: c.productId,
    valor: c.valor ?? "",
    updatedAt: new Date(c.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Cores",
      [
        { header: "id", key: "id" },
        { header: "productId", key: "productId" },
        { header: "valor", key: "valor" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasCores
    )
  );

  // ===== HOJA 9: COSTOS EDITADOS =====
  const costosEdit = await db.costoEditado.findMany({ orderBy: [{ productId: "asc" }] });
  const filasCostos = costosEdit.map((c) => ({
    id: c.id,
    productId: c.productId,
    colKey: c.colKey,
    createdAt: new Date(c.createdAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Costos Editados",
      [
        { header: "id", key: "id" },
        { header: "productId", key: "productId" },
        { header: "colKey", key: "colKey" },
        { header: "createdAt", key: "createdAt", width: 24 },
      ],
      filasCostos
    )
  );

  // ===== HOJA 10: ETIQUETAS =====
  const etiquetas = await db.etiqueta.findMany({ orderBy: [{ nombre: "asc" }] });
  const filasEtiq = etiquetas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    color: e.color,
    createdAt: new Date(e.createdAt).toISOString(),
    updatedAt: new Date(e.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Etiquetas",
      [
        { header: "id", key: "id" },
        { header: "nombre", key: "nombre" },
        { header: "color", key: "color" },
        { header: "createdAt", key: "createdAt", width: 24 },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasEtiq
    )
  );

  // ===== HOJA 11: TASA DE CAMBIO =====
  const tasas = await db.tasaCambio.findMany();
  const filasTasas = tasas.map((t) => ({
    id: t.id,
    cambioRS: t.cambioRS,
    cambioUS: t.cambioUS,
    updatedAt: new Date(t.updatedAt).toISOString(),
    actualizadoPor: t.actualizadoPor,
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Tasa Cambio",
      [
        { header: "id", key: "id" },
        { header: "cambioRS", key: "cambioRS" },
        { header: "cambioUS", key: "cambioUS" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
        { header: "actualizadoPor", key: "actualizadoPor" },
      ],
      filasTasas
    )
  );

  // ===== HOJA 12: SUCURSALES POR USUARIO =====
  const sucUsuarios = await db.usuarioSucursal.findMany({ orderBy: [{ userEmail: "asc" }] });
  const filasSucU = sucUsuarios.map((s) => ({
    id: s.id,
    userEmail: s.userEmail,
    sucursal: s.sucursal,
    createdAt: new Date(s.createdAt).toISOString(),
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Sucursales Usuario",
      [
        { header: "id", key: "id" },
        { header: "userEmail", key: "userEmail", width: 30 },
        { header: "sucursal", key: "sucursal" },
        { header: "createdAt", key: "createdAt", width: 24 },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasSucU
    )
  );

  // ===== HOJA 13: STOCK IMPORT LOG =====
  const importLogs = await db.stockImportLog.findMany({ orderBy: [{ fecha: "desc" }] });
  const filasImpLog = importLogs.map((l) => ({
    id: l.id,
    fecha: new Date(l.fecha).toISOString(),
    nuevos: l.nuevos,
    actualizados: l.actualizados,
    usuarioEmail: l.usuarioEmail ?? "",
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Stock Import Log",
      [
        { header: "id", key: "id" },
        { header: "fecha", key: "fecha", width: 24 },
        { header: "nuevos", key: "nuevos" },
        { header: "actualizados", key: "actualizados" },
        { header: "usuarioEmail", key: "usuarioEmail", width: 30 },
      ],
      filasImpLog
    )
  );

  // ===== HOJA 14: QUOTE SEQUENCES =====
  const seqs = await db.quoteSequence.findMany({ orderBy: [{ plan: "asc" }, { userId: "asc" }] });
  const filasSeq = seqs.map((s) => ({
    id: s.id,
    plan: s.plan,
    userId: s.userId,
    lastNumber: s.lastNumber,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));
  hojas.push(
    await escribirHoja(
      wb,
      "Quote Sequences",
      [
        { header: "id", key: "id" },
        { header: "plan", key: "plan" },
        { header: "userId", key: "userId" },
        { header: "lastNumber", key: "lastNumber" },
        { header: "updatedAt", key: "updatedAt", width: 24 },
      ],
      filasSeq
    )
  );

  // ===== GENERAR EL BUFFER =====
  // writeBuffer() devuelve un ArrayBuffer/Buffer según el runtime; lo
  // normalizamos a un Node Buffer para medir tamaño y mandarlo por correo.
  const raw = await wb.xlsx.writeBuffer();
  const buffer: Buffer = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from(raw as ArrayBuffer);
  const sizeBytes = Buffer.isBuffer(buffer) ? buffer.length : Buffer.from(buffer).length;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, "");
  const filename = `BACKUP_VIZA_HOME_${dateStr}_${timeStr}.xlsx`;

  const totalFilas = hojas.reduce((acc, h) => acc + h.filas, 0);

  const stats: BackupStats = {
    fecha: now.toISOString(),
    hojas,
    totalFilas,
    sizeBytes,
    durationMs: Date.now() - t0,
  };

  return { buffer, filename, stats };
}
