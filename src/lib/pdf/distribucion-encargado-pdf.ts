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
  AnalisisEncargadoIA,
  FilaEncargado,
  PlanEncargado,
} from "@/lib/encargado-distribucion";
import { motivoVisibleTransferencia } from "@/lib/encargado-distribucion";

// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA — PDF (Task 160)
//
// Documento completo de transferencias internas:
//   · resumen ejecutivo + análisis del Encargado (IA o respaldo)
//   · balance por sucursal (stock hoy, objetivo, entradas, salidas,
//     stock después y ventas detectadas)
//   · distribuciones agrupadas por TIPO y COLOR, con COD, origen,
//     destino y cantidad
//
// La NECESIDAD DE COMPRA ya no vive acá: la analiza el ENCARGADO DE
// COMPRA (su propio botón, informe y PDF).
//
// Solo transferencias entre sucursales. NUNCA compras a proveedores.
// ═══════════════════════════════════════════════════════════════════

type Alineacion = "left" | "right" | "center";

interface Columna {
  label: string;
  w: number;
  align?: Alineacion;
  /** tamaño de letra propio de la columna (por defecto 7.2 en filas y 6.6 en cabecera) */
  size?: number;
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

function colorDeEstado(balance: {
  saldoDespues: number;
  objetivo: number;
  faltanteNoCubierto: number;
}): { texto: string; rgb: [number, number, number] } {
  if (balance.faltanteNoCubierto > 0) {
    return { texto: `FALTA ${fmtNum(balance.faltanteNoCubierto)}`, rgb: [180, 83, 9] };
  }
  const dif = balance.saldoDespues - balance.objetivo;
  if (Math.abs(dif) <= 1) return { texto: "PAREADO", rgb: [21, 128, 61] };
  if (dif > 0) return { texto: `SOBRA ${fmtNum(dif)}`, rgb: [21, 87, 137] };
  return { texto: `FALTA ${fmtNum(Math.abs(dif))}`, rgb: [180, 83, 9] };
}

export function generarPdfEncargado(
  plan: PlanEncargado,
  ia: AnalisisEncargadoIA | null
): jsPDF {
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
      doc.text("DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA · continuación", MARGEN, 28);
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
      // Task 161 (pedido del dueño): el título NUNCA puede invadir la
      // columna vecina; se recorta igual que los valores de las filas.
      doc.setFontSize(c.size ?? 6.6);
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
      fondo?: [number, number, number];
    }
  ) => {
    const h = opciones?.alto ?? 14;
    if (y + h > pageH - ALTO_FOOTER) return false;
    if (opciones?.fondo) {
      doc.setFillColor(...opciones.fondo);
      doc.rect(MARGEN, y, contentW, h, "F");
    } else if (opciones?.zebra) {
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
      doc.setFontSize(c.size ?? 7.2);
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
  doc.text("DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA", MARGEN, 84);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text(
    "PLAN DE TRANSFERENCIAS INTERNAS · SOLO ENTRE SUCURSALES · SIN COMPRAS",
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
    `Base de cálculo: ${
      plan.modo === "IDEAL"
        ? "Stock Ideal"
        : plan.modo === "PROPORCIONAL"
          ? "Equilibrio proporcional"
          : "Stock Ideal + equilibrio proporcional"
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
    { label: "TRANSFERENCIAS", valor: fmtNum(plan.resumen.transferencias), color: BLUE },
    { label: "UNIDADES A MOVER", valor: fmtNum(plan.resumen.unidades), color: BLUE },
    { label: "CÓDIGOS", valor: fmtNum(plan.resumen.productos), color: BLUE },
    {
      label: "FALTANTE SIN COBERTURA",
      valor: fmtNum(plan.resumen.faltanteNoCubierto),
      color: plan.resumen.faltanteNoCubierto > 0 ? [180, 83, 9] : [21, 128, 61],
    },
    { label: "SUCURSALES", valor: fmtNum(plan.sucursales.length), color: BLUE },
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
  tituloSeccion("ANÁLISIS DEL ENCARGADO");
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
        ? `El motor detectó ${plan.resumen.transferencias} transferencias internas para mover ${plan.resumen.unidades} unidades y emparejar las sucursales.`
        : "No hay transferencias pendientes: las sucursales están pareadas según su objetivo."
    );
  }
  if (ia?.prioridades?.length) lista("PRIORIDADES", ia.prioridades);
  if (ia?.alertas?.length) lista("ALERTAS", ia.alertas, [146, 64, 14]);
  if (ia?.recomendaciones?.length) {
    lista("RECOMENDACIONES DE TRANSFERENCIA", ia.recomendaciones, [21, 87, 137]);
  }
  if (ia?.mensaje) parrafo(ia.mensaje, 7.6, GREY);

  // ───────────── BALANCE POR SUCURSAL ─────────────
  tituloSeccion("BALANCE POR SUCURSAL");
  const colsBalance: Columna[] = [
    { label: "SUCURSAL", w: 112 },
    { label: "STOCK HOY", w: 52, align: "right" },
    { label: "OBJETIVO", w: 50, align: "right" },
    { label: "ENTRADAS", w: 48, align: "right" },
    { label: "SALIDAS", w: 46, align: "right" },
    { label: "STOCK DESPUÉS", w: 62, align: "right" },
    { label: "VENDIDO", w: 48, align: "right" },
    { label: "ESTADO", w: 69, align: "center" },
  ];
  if (encabezadoTabla(colsBalance)) {
    plan.balance.forEach((b, i) => {
      const estado = colorDeEstado(b);
      filaTabla(
        colsBalance,
        [
          b.sucursal,
          fmtNum(b.saldoActual),
          fmtNum(b.objetivo),
          `+${fmtNum(b.entradas)}`,
          `-${fmtNum(b.salidas)}`,
          fmtNum(b.saldoDespues),
          fmtNum(b.vendidoReciente),
          estado.texto,
        ],
        {
          zebra: i % 2 === 1,
          color: estado.rgb,
          negrita: false,
        }
      );
    });
  }
  if (plan.central) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(
      `CENTRAL (depósito): stock ${fmtNum(plan.central.saldoActual)} · sale ${fmtNum(
        plan.central.salidas
      )} · queda ${fmtNum(plan.central.saldoDespues)}${
        plan.central.ideal ? ` · reserva ideal ${fmtNum(plan.central.ideal)}` : ""
      }`,
      MARGEN,
      y + 8
    );
    y += 18;
  }

  // ───────────── DETALLE DE DISTRIBUCIONES ─────────────
  tituloSeccion("DISTRIBUCIONES POR CÓDIGO, COLOR Y DESTINO");

  asegurar(22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...GREY);
  doc.text(
    "ORIGEN H->D / DESTINO H->D: stock que tiene HOY cada sucursal -> stock que le queda DESPUÉS de la transferencia.",
    MARGEN,
    y
  );
  doc.text(
    "MOTIVO FALTA: el destino estaba en 0. MOTIVO EQUILIBRAR: el destino ya tenía 1 o más. Salen en bloques separados.",
    MARGEN,
    y + 9
  );
  y += 19;

  const colsDetalle: Columna[] = [
    { label: "COD", w: 32 },
    { label: "PRODUCTO", w: 145 },
    // Los nombres de sucursal son largos (SALTOS DEL GUAIRA): letra algo
    // menor para que entren completos y no se recorten.
    { label: "ORIGEN", w: 72, size: 6.3 },
    { label: "DESTINO", w: 72, size: 6.3 },
    { label: "CANT.", w: 29, align: "right" },
    { label: "ORIGEN H->D", w: 54, align: "right", size: 6.5 },
    { label: "DESTINO H->D", w: 58, align: "right", size: 6.5 },
    { label: "MOTIVO", w: 52, align: "center", size: 6.8 },
  ];

  if (plan.filas.length === 0) {
    asegurar(34);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(MARGEN, y, contentW, 30, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61);
    doc.text(
      "SIN TRANSFERENCIAS: las sucursales están pareadas según su objetivo.",
      MARGEN + 10,
      y + 19
    );
    y += 40;
  } else {
    // Task 161 (pedido del dueño): separar por MOTIVO.
    //   · FALTA      → el destino tenía 0 antes de recibir.
    //   · EQUILIBRAR → el destino ya tenía 1 o más y se pareja.
    const bloques: Array<{
      motivo: "FALTA" | "EQUILIBRAR";
      titulo: string;
      fondo: [number, number, number];
      color: [number, number, number];
    }> = [
      {
        motivo: "FALTA",
        titulo: "MOTIVO: FALTA · el destino estaba en 0",
        fondo: [255, 247, 237],
        color: [180, 83, 9],
      },
      {
        motivo: "EQUILIBRAR",
        titulo: "MOTIVO: EQUILIBRAR · el destino ya tenía stock",
        fondo: [239, 246, 255],
        color: [21, 87, 137],
      },
    ];

    for (const bloque of bloques) {
      const filasBloque = plan.filas.filter(
        (f) => motivoVisibleTransferencia(f) === bloque.motivo
      );
      if (filasBloque.length === 0) continue;

      asegurar(28);
      doc.setFillColor(...bloque.fondo);
      doc.roundedRect(MARGEN, y, contentW, 20, 4, 4, "F");
      doc.setFillColor(...bloque.color);
      doc.rect(MARGEN, y + 4, 3, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4);
      doc.setTextColor(...bloque.color);
      doc.text(bloque.titulo, MARGEN + 9, y + 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...GREY);
      doc.text(
        `${filasBloque.length} transferencia(s) · ${fmtNum(
          filasBloque.reduce((acc, f) => acc + f.cantidad, 0)
        )} unidad(es)`,
        MARGEN + contentW - 7,
        y + 13,
        { align: "right" }
      );
      y += 25;

      // Dentro del motivo, agrupar por TIPO > COLOR.
      const grupos = new Map<string, Map<string, FilaEncargado[]>>();
      for (const f of filasBloque) {
        const tipo = String(f.tipo || "SIN TIPO").toUpperCase();
        const color = String(f.color || "SIN COLOR").toUpperCase();
        if (!grupos.has(tipo)) grupos.set(tipo, new Map());
        const porColor = grupos.get(tipo)!;
        if (!porColor.has(color)) porColor.set(color, []);
        porColor.get(color)!.push(f);
      }

      for (const [tipo, porColor] of grupos) {
        for (const [color, filas] of porColor) {
          if (y + 34 > pageH - ALTO_FOOTER) {
            nuevaPagina(true);
          }
          const tituloGrupo = `${bloque.motivo} · ${
            color === "SIN COLOR"
              ? `TIPO: ${tipo}`
              : `TIPO: ${tipo} · COLOR: ${color}`
          }`;
          doc.setFillColor(...GOLD_LIGHT);
          doc.roundedRect(MARGEN, y, contentW, 16, 3, 3, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.4);
          doc.setTextColor(...BLUE);
          doc.text(tituloGrupo, MARGEN + 7, y + 11);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.6);
          doc.setTextColor(...GREY);
          doc.text(
            `${filas.length} transferencia(s) · ${fmtNum(
              filas.reduce((acc, f) => acc + f.cantidad, 0)
            )} unidad(es)`,
            MARGEN + contentW - 7,
            y + 11,
            { align: "right" }
          );
          y += 18;

          encabezadoTabla(colsDetalle);
          filas.forEach((f, i) => {
            const valores = [
              f.sku,
              f.producto,
              f.origen,
              f.destino,
              fmtNum(f.cantidad),
              `${fmtNum(f.origenSaldo)} -> ${fmtNum(f.origenDespues)}`,
              `${fmtNum(f.destinoSaldo)} -> ${fmtNum(f.destinoDespues)}`,
              motivoVisibleTransferencia(f),
            ];
            const ok = filaTabla(colsDetalle, valores, {
              zebra: i % 2 === 1,
              negrita: false,
              color: bloque.color,
            });
            if (!ok) {
              nuevaPagina(true);
              doc.setFillColor(...GOLD_LIGHT);
              doc.roundedRect(MARGEN, y, contentW, 16, 3, 3, "F");
              doc.setFont("helvetica", "bold");
              doc.setFontSize(7.4);
              doc.setTextColor(...BLUE);
              doc.text(`${tituloGrupo} (continuación)`, MARGEN + 7, y + 11);
              y += 18;
              encabezadoTabla(colsDetalle);
              filaTabla(colsDetalle, valores, {
                negrita: false,
                color: bloque.color,
              });
            }
          });
          y += 6;
        }
      }
      y += 2;
    }
  }

  // ───────────── NOTA FINAL ─────────────
  asegurar(34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...GREY);
  const nota = doc.splitTextToSize(
    "Documento interno generado por el DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA de VIZA HOME. Solo contiene transferencias entre sucursales: no es una orden de compra ni genera compras a proveedores. La mercadería la mueve el equipo; el sistema recomienda y deja el plan listo.",
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
    doc.text("VIZA HOME · DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA", MARGEN, pageH - 18);
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

export function nombreArchivoPdfEncargado(plan: PlanEncargado): string {
  const d = new Date(plan.generadoEn);
  const fecha = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
  return `VIZA-HOME-DISTRIBUCION-${fecha}.pdf`;
}
