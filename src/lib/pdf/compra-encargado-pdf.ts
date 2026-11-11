import { jsPDF } from "jspdf";
import {
  BLUE,
  GOLD,
  DARK,
  GREY,
  LIGHT,
  ZEBRA,
  GOLD_LIGHT,
  LINE,
  drawWave,
} from "./vizaPdfDesign";
import {
  VIZA_LOGO_WORDMARK_PNG,
  VIZA_LOGO_WORDMARK_RATIO,
} from "./vizaLogo";
import type {
  AnalisisCompraIA,
  PlanCompra,
  PrioridadCompra,
} from "@/lib/encargado-compra";

// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTO DE COMPRA — PDF (Task 161)
//
// Documento de NECESIDAD DE COMPRA de la red (4 sucursales + CENTRAL):
//   · resumen ejecutivo + análisis del Encargado (IA o respaldo)
//   · necesidad agrupada por PROVEEDOR
//   · detalle por código, color y prioridad
//
// Es SOLO una recomendación: no es una orden de compra y no compra nada.
// ═══════════════════════════════════════════════════════════════════

type Alineacion = "left" | "right" | "center";

interface Columna {
  label: string;
  w: number;
  align?: Alineacion;
}

const MARGEN = 36;
const ALTO_FOOTER = 42;

function fmtNum(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("es-PY");
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function recortar(doc: jsPDF, texto: string, ancho: number): string {
  const t = String(texto ?? "");
  if (doc.getTextWidth(t) <= ancho) return t;
  let corte = t;
  while (corte.length > 1 && doc.getTextWidth(`${corte}…`) > ancho) {
    corte = corte.slice(0, -1);
  }
  return `${corte}…`;
}

function colorPrioridad(p: PrioridadCompra): [number, number, number] {
  if (p === "ALTA") return [180, 83, 9];
  if (p === "MEDIA") return [21, 87, 137];
  return GREY;
}

export function generarPdfCompra(
  plan: PlanCompra,
  ia: AnalisisCompraIA | null,
  opciones?: { proveedor?: string | null }
): jsPDF {
  // Task 169: PDF de UN proveedor. En ese modo el documento es el pedido de
  // ese proveedor: cambia el subtítulo y NO se imprime el análisis global
  // (resumen/prioridades/alertas son de TODA la red, no de un proveedor).
  const proveedorPdf = String(opciones?.proveedor || "").trim();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGEN * 2;
  let y = 0;

  const nuevaPagina = (continuacion = false) => {
    doc.addPage();
    y = 42;
    if (continuacion) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text("DEPARTAMENTO DE COMPRA · continuación", MARGEN, 28);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.6);
      doc.line(MARGEN, 34, pageW - MARGEN, 34);
    }
  };

  const asegurar = (alto: number, continuacion = true) => {
    if (y + alto > pageH - ALTO_FOOTER) {
      nuevaPagina(continuacion);
      return true;
    }
    return false;
  };

  const tituloSeccion = (texto: string) => {
    asegurar(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text(texto, MARGEN, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.2);
    doc.line(MARGEN, y + 5, MARGEN + contentW, y + 5);
    y += 16;
  };

  const parrafo = (texto: string, size = 8.2, color: [number, number, number] = DARK) => {
    if (!texto) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(texto, contentW - 16);
    const alto = 10 + lineas.length * (size + 2.2);
    asegurar(alto);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(MARGEN, y, contentW, alto, 6, 6, "F");
    doc.setFillColor(...GOLD);
    doc.rect(MARGEN, y + 7, 3, alto - 14, "F");
    doc.setTextColor(...color);
    doc.text(lineas, MARGEN + 12, y + 13);
    y += alto + 8;
  };

  const lista = (titulo: string, items: string[], color: [number, number, number] = DARK) => {
    const limpios = items.filter(Boolean).slice(0, 6);
    if (limpios.length === 0) return;
    asegurar(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...BLUE);
    doc.text(titulo, MARGEN, y);
    y += 11;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(...color);
    for (const item of limpios) {
      const lineas = doc.splitTextToSize(`•  ${item}`, contentW - 18);
      const alto = lineas.length * 9.6;
      asegurar(alto + 4);
      doc.text(lineas, MARGEN + 6, y + 7);
      y += alto + 3;
    }
    y += 4;
  };

  const encabezadoTabla = (columnas: Columna[]) => {
    const h = 15;
    if (y + h > pageH - ALTO_FOOTER) return false;
    doc.setFillColor(...BLUE);
    doc.roundedRect(MARGEN, y, contentW, h, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(255, 255, 255);
    let x = MARGEN + 5;
    for (const c of columnas) {
      const align = c.align || "left";
      const tx = align === "right" ? x + c.w - 4 : align === "center" ? x + c.w / 2 : x;
      // El título nunca invade la columna vecina.
      doc.text(recortar(doc, c.label, c.w - 8), tx, y + 10, { align });
      x += c.w;
    }
    y += h;
    return true;
  };

  const filaTabla = (
    columnas: Columna[],
    valores: string[],
    opciones?: {
      zebra?: boolean;
      negrita?: boolean;
      color?: [number, number, number];
      alto?: number;
    }
  ) => {
    const h = opciones?.alto ?? 14;
    if (y + h > pageH - ALTO_FOOTER) return false;
    if (opciones?.zebra) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGEN, y, contentW, h, "F");
    }
    doc.setFont("helvetica", opciones?.negrita ? "bold" : "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...(opciones?.color || DARK));
    let x = MARGEN + 5;
    for (let i = 0; i < columnas.length; i += 1) {
      const c = columnas[i];
      const align = c.align || "left";
      const tx = align === "right" ? x + c.w - 4 : align === "center" ? x + c.w / 2 : x;
      const texto = recortar(doc, valores[i] ?? "", c.w - 8);
      doc.text(texto, tx, y + h - 4.5, { align });
      x += c.w;
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.line(MARGEN, y + h, MARGEN + contentW, y + h);
    y += h;
    return true;
  };

  // ───────────── ENCABEZADO ─────────────
  drawWave(doc, pageW);
  const logoH = 30;
  const logoW = logoH * VIZA_LOGO_WORDMARK_RATIO;
  doc.addImage(VIZA_LOGO_WORDMARK_PNG, "PNG", MARGEN, 26, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...BLUE);
  doc.text("DEPARTAMENTO DE COMPRA", MARGEN, 84);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text(
    proveedorPdf
      ? `PROVEEDOR: ${proveedorPdf} · SOLO RECOMENDACIÓN · SIN ORDEN DE COMPRA`
      : "NECESIDAD DE COMPRA DE LAS 4 SUCURSALES · SOLO RECOMENDACIÓN · SIN ORDEN DE COMPRA",
    MARGEN,
    98
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(...GREY);
  doc.text(`Generado: ${fechaHora(plan.generadoEn)}`, pageW - MARGEN, 84, {
    align: "right",
  });
  doc.text(
    `Base: SELECCIONADO + PARA PEDIDO + sin etiqueta · COD 100.000+ · ${
      plan.modo === "IDEAL"
        ? "Stock Ideal"
        : plan.modo === "VENTAS"
          ? "mínimo 1 por sucursal"
          : "Ideal + ventas detectadas"
    }`,
    pageW - MARGEN,
    96,
    { align: "right" }
  );

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.4);
  doc.line(MARGEN, 104, pageW - MARGEN, 104);
  y = 116;

  // ───────────── RESUMEN EN CAJAS ─────────────
  const cajas: Array<{ label: string; valor: string; color: [number, number, number] }> = [
    { label: "CÓDIGOS A COMPRAR", valor: fmtNum(plan.resumen.productos), color: BLUE },
    { label: "UNIDADES", valor: fmtNum(plan.resumen.unidades), color: BLUE },
    { label: "PROVEEDORES", valor: fmtNum(plan.resumen.proveedores), color: BLUE },
    {
      label: "PRIORIDAD ALTA",
      valor: fmtNum(plan.resumen.prioridadAlta),
      color: plan.resumen.prioridadAlta > 0 ? [180, 83, 9] : [21, 128, 61],
    },
    {
      label: "VENTAS DETECTADAS",
      valor: fmtNum(plan.resumen.unidadesVendidas),
      color: plan.resumen.unidadesVendidas > 0 ? [21, 87, 137] : GREY,
    },
  ];
  const gap = 7;
  const cajaW = (contentW - gap * (cajas.length - 1)) / cajas.length;
  const cajaH = 38;
  cajas.forEach((c, i) => {
    const x = MARGEN + i * (cajaW + gap);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, cajaW, cajaH, 6, 6, "F");
    doc.setFillColor(...GOLD);
    doc.rect(x, y + 8, 2.5, cajaH - 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...GREY);
    doc.text(c.label, x + 8, y + 12);
    doc.setFontSize(14);
    doc.setTextColor(...c.color);
    doc.text(c.valor, x + 8, y + 30);
  });
  y += cajaH + 14;

  // ───────────── ANÁLISIS DEL ENCARGADO ─────────────
  // En el PDF de UN proveedor no va: el análisis (resumen, prioridades,
  // alertas) es de TODA la red y confundiría el pedido de ese proveedor.
  if (!proveedorPdf) {
    tituloSeccion("ANÁLISIS DEL DEPARTAMENTO DE COMPRA");
    const etiquetaIA = ia?.activa
      ? `IA NVIDIA NIM · ${ia.modelo || "modelo configurado"}`
      : "RESPALDO DETERMINÍSTICO · IA NO CONFIGURADA";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(...(ia?.activa ? ([21, 128, 61] as [number, number, number]) : GREY));
    doc.text(etiquetaIA, MARGEN, y);
    y += 10;

    if (ia?.resumen) {
      parrafo(ia.resumen);
    } else {
      parrafo(
        plan.filas.length > 0
          ? `El motor detectó necesidad de compra en ${plan.resumen.productos} código(s): ${plan.resumen.unidades} unidad(es) para ${plan.resumen.proveedores} proveedor(es).`
          : "No hay necesidad de compra: las 4 sucursales están cubiertas con el stock actual, CENTRAL y las transferencias internas."
      );
    }
    if (ia?.prioridades?.length) lista("PRIORIDADES", ia.prioridades);
    if (ia?.alertas?.length) lista("ALERTAS", ia.alertas, [146, 64, 14]);
    if (ia?.recomendaciones?.length) {
      lista("RECOMENDACIONES POR PROVEEDOR", ia.recomendaciones, [21, 87, 137]);
    }
    if (ia?.mensaje) parrafo(ia.mensaje, 7.6, GREY);
  }

  // ───────────── NECESIDAD POR PROVEEDOR ─────────────
  tituloSeccion(
    proveedorPdf ? "NECESIDAD DEL PROVEEDOR" : "NECESIDAD AGRUPADA POR PROVEEDOR"
  );
  const colsProv: Columna[] = [
    { label: "PROVEEDOR", w: 245 },
    { label: "CÓDIGOS", w: 80, align: "right" },
    { label: "UNIDADES", w: 90, align: "right" },
    { label: "PRIORIDAD ALTA", w: 103, align: "right" },
  ];
  if (plan.proveedores.length === 0) {
    asegurar(34);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(MARGEN, y, contentW, 30, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61);
    doc.text("SIN NECESIDAD DE COMPRA: las sucursales están cubiertas.", MARGEN + 10, y + 19);
    y += 40;
  } else if (encabezadoTabla(colsProv)) {
    plan.proveedores.forEach((p, i) => {
      const valores = [
        p.proveedor,
        fmtNum(p.productos),
        fmtNum(p.unidades),
        fmtNum(p.prioritarios),
      ];
      if (!filaTabla(colsProv, valores, { zebra: i % 2 === 1 })) {
        nuevaPagina(true);
        encabezadoTabla(colsProv);
        filaTabla(colsProv, valores, {});
      }
    });
  }
  y += 6;

  // ───────────── VENTAS DETECTADAS POR BAJA DE STOCK ─────────────
  tituloSeccion("VENTAS DETECTADAS · BAJA DE STOCK POR SUCURSAL");
  asegurar(26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...GREY);
  const notaVentas = doc.splitTextToSize(
    "Cada vez que se actualiza el stock, si la cantidad baja se cuenta como VENDIDO. ANTES es el saldo de la última foto y AHORA el saldo actual. También aparece cuando la sucursal quedó en 0 o el producto ya no figura en ninguna sucursal.",
    contentW
  );
  doc.text(notaVentas, MARGEN, y);
  y += notaVentas.length * 9 + 6;

  const colsVentas: Columna[] = [
    { label: "COD", w: 48 },
    { label: "PRODUCTO", w: 150 },
    { label: "COLOR", w: 60 },
    { label: "SUCURSAL", w: 96 },
    { label: "ANTES", w: 38, align: "right" },
    { label: "AHORA", w: 38, align: "right" },
    { label: "VENDIDO", w: 44, align: "right" },
  ];

  if (plan.ventas.length === 0) {
    asegurar(24);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(MARGEN, y, contentW, 20, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...GREY);
    doc.text(
      "Sin bajas de stock desde la última foto. La primera pasada guarda la foto; desde la siguiente, cada bajada aparece acá.",
      MARGEN + 8,
      y + 13
    );
    y += 28;
  } else if (encabezadoTabla(colsVentas)) {
    plan.ventas.forEach((v, i) => {
      const valores = [
        v.sku,
        v.producto,
        v.color || "—",
        v.sucursal,
        fmtNum(v.anterior),
        fmtNum(v.actual),
        fmtNum(v.vendido),
      ];
      if (!filaTabla(colsVentas, valores, { zebra: i % 2 === 1 })) {
        nuevaPagina(true);
        encabezadoTabla(colsVentas);
        filaTabla(colsVentas, valores, {});
      }
    });
    asegurar(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BLUE);
    doc.text(
      `TOTAL VENDIDO: ${fmtNum(
        plan.ventas.reduce((acc, v) => acc + v.vendido, 0)
      )} unidad(es) en ${plan.ventas.length} sucursal(es)/código(s)`,
      MARGEN + contentW,
      y + 10,
      { align: "right" }
    );
    y += 18;
  }
  y += 6;

  // ───────────── DETALLE POR CÓDIGO ─────────────
  tituloSeccion("DETALLE POR CÓDIGO, COLOR Y PRIORIDAD");
  const colsDet: Columna[] = [
    { label: "COD", w: 48 },
    { label: "PRODUCTO", w: 140 },
    { label: "COLOR", w: 56 },
    { label: "STOCK TOTAL", w: 54, align: "right" },
    { label: "CENTRAL", w: 46, align: "right" },
    { label: "OBJETIVO", w: 50, align: "right" },
    { label: "COMPRAR", w: 48, align: "right" },
    { label: "VENDIDO", w: 44, align: "right" },
    { label: "PRIOR.", w: 34, align: "center" },
  ];

  if (plan.filas.length === 0) {
    asegurar(30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...GREY);
    doc.text(
      "No hay códigos con necesidad de compra en este momento.",
      MARGEN,
      y + 8
    );
    y += 20;
  } else {
    // Agrupar por PROVEEDOR y, dentro, por TIPO · COLOR.
    const grupos = new Map<string, Map<string, typeof plan.filas>>();
    for (const f of plan.filas) {
      const prov = f.proveedor || "SIN PROVEEDOR";
      const tipoColor = `${String(f.tipo || "SIN TIPO").toUpperCase()}${
        f.color ? ` · ${f.color.toUpperCase()}` : ""
      }`;
      if (!grupos.has(prov)) grupos.set(prov, new Map());
      const porTipo = grupos.get(prov)!;
      if (!porTipo.has(tipoColor)) porTipo.set(tipoColor, []);
      porTipo.get(tipoColor)!.push(f);
    }

    for (const [prov, porTipo] of grupos) {
      if (y + 34 > pageH - ALTO_FOOTER) nuevaPagina(true);
      doc.setFillColor(...GOLD_LIGHT);
      doc.roundedRect(MARGEN, y, contentW, 16, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      doc.setTextColor(...BLUE);
      doc.text(`PROVEEDOR: ${prov}`, MARGEN + 7, y + 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...GREY);
      const totalProv = Array.from(porTipo.values())
        .flat()
        .reduce((acc, f) => acc + f.compra, 0);
      doc.text(
        `${fmtNum(totalProv)} unidad(es)`,
        MARGEN + contentW - 7,
        y + 11,
        { align: "right" }
      );
      y += 18;

      for (const [tipoColor, filas] of porTipo) {
        if (y + 30 > pageH - ALTO_FOOTER) nuevaPagina(true);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(...GREY);
        doc.text(tipoColor, MARGEN + 2, y + 7);
        y += 11;
        encabezadoTabla(colsDet);
        filas.forEach((f, i) => {
          const valores = [
            f.sku,
            f.producto,
            f.color || "—",
            fmtNum(f.stockSucursales),
            fmtNum(f.central),
            fmtNum(f.objetivoRed),
            fmtNum(f.compra),
            fmtNum(f.vendidoRed),
            f.prioridad,
          ];
          const ok = filaTabla(colsDet, valores, {
            zebra: i % 2 === 1,
            color: colorPrioridad(f.prioridad),
          });
          if (!ok) {
            nuevaPagina(true);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.8);
            doc.setTextColor(...GREY);
            doc.text(`${prov} · ${tipoColor} (continuación)`, MARGEN + 2, y + 7);
            y += 11;
            encabezadoTabla(colsDet);
            filaTabla(colsDet, valores, { color: colorPrioridad(f.prioridad) });
          }
        });
        y += 5;
      }
      y += 4;
    }
  }

  // ───────────── NOTA FINAL ─────────────
  asegurar(34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...GREY);
  const nota = doc.splitTextToSize(
    "Documento interno generado por el DEPARTAMENTO DE COMPRA de VIZA HOME. Solo analiza productos SELECCIONADO (verde), PARA PEDIDO (azul) y SIN etiqueta en la Base, y códigos desde 100.000; los productos con otra etiqueta (DESCONTINUADO, QUEMA STOCK, etc.) quedan fuera. CENTRAL cuenta solo como stock ya comprado (en tránsito/depósito): NO se compra para CENTRAL, solo para las 4 sucursales. Es una RECOMENDACIÓN: no es una orden de compra y no genera compras a proveedores. Antes de comprar, usar CENTRAL y las transferencias internas del DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA. La decisión final es del dueño.",
    contentW
  );
  doc.text(nota, MARGEN, y + 10);
  y += nota.length * 8 + 12;

  // ───────────── PIE DE PÁGINA ─────────────
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.line(MARGEN, pageH - 30, pageW - MARGEN, pageH - 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(...BLUE);
    doc.text("VIZA HOME · DEPARTAMENTO DE COMPRA", MARGEN, pageH - 18);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY);
    doc.text(
      `Página ${p} de ${totalPaginas}`,
      pageW - MARGEN,
      pageH - 18,
      { align: "right" }
    );
  }

  return doc;
}

export function nombreArchivoPdfCompra(plan: PlanCompra): string {
  const d = new Date(plan.generadoEn);
  const fecha = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
  return `VIZA-HOME-COMPRA-${fecha}.pdf`;
}

// Task 169: nombre del PDF de UN proveedor.
export function nombreArchivoPdfCompraProveedor(
  plan: PlanCompra,
  proveedor: string
): string {
  const d = new Date(plan.generadoEn);
  const fecha = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
  const prov = String(proveedor || "PROVEEDOR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "PROVEEDOR";
  return `VIZA-HOME-COMPRA-${prov}-${fecha}.pdf`;
}
