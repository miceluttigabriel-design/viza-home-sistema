"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  ShoppingCart,
  LogOut,
  X,
  LayoutGrid,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  Filter,
  ChevronDown,
  ChevronUp,
  Plus,
  Download,
  Upload,
  AlertTriangle,
  FileSpreadsheet,
  Tag,
  Pencil,
  KeyRound,
  Percent,
  Coins,
  BarChart3,
  Warehouse,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { formatPYG } from "@/lib/format";
import { hashtagCeldaRoja, hoyParaguay } from "@/lib/hashtag-formato";
import { calcularValorMayorista, esProductoAire } from "@/lib/margen-mayorista";
import type { EtiquetaCreada } from "@/lib/etiquetas";
import { puedeEditarTasaCambio } from "@/lib/permisos-cambio";
// Task 126 (pedido del dueño): toda edición guardada en LA BASE replica AL
// INSTANTE en STOCK GENERAL (columnas de la Base, STOCK/SALDO y el registro
// de última edición) — misma pestaña y otras pestañas.
import { avisarProductoEditado } from "@/lib/replicacion-productos";
import { ModalPedidoEspecialConfig } from "./pedido-especial-config";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";
// Task 107 (pedido del dueño): el mini cuadrito de última actualización de stock
// (el mismo del panel de ventas, Task 105) también DENTRO DE LA BASE.
import { StockImportInfoCard } from "./stock-import-info-card";

// Formatea una fracción decimal de porcentaje (0.25 = 25%) igual que la tabla
// (valor × 100), pero compacto: 25%, 28%, 35.3%, 108.8% (sin ceros colgantes)
const fmtPctVal = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return "—";
  const n = v * 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${s}%`;
};

// ─── CRM (ranking de presupuestos emitidos por usuario) ───
// Una fila del ranking que devuelve GET /api/crm/ranking.
interface CrmFila {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  sucursal: string; // "SIN SUCURSAL" si todavía no tiene asignación
  total: number; // presupuestos emitidos
  aprobadas: number; // de esos, cuántas quedaron en estado "aprobada"
  // Desglose por TIPO DE PLAN (Task 78, pedido del dueño): el CRM puede
  // filtrar por CUOTA / CONTADO / MAYORISTA / SAFRA / CHEQUE. Viene de la
  // API (GET /api/crm/ranking); opcional para compat hacia atrás.
  // Task 111: CONTADO = presupuestos emitidos SOLO AL CONTADO (sin cuotas).
  porPlan?: { CUOTA: number; CONTADO: number; MAYORISTA: number; SAFRA: number; CHEQUE: number };
  ultimo: string | null; // fecha ISO del último presupuesto
}

// Pills del filtro por PLAN del CRM (Task 78): TODOS + los planes que
// pidió el dueño. CUOTA = el presupuesto normal con cuotas del panel de
// ventas (quoteNumber PRESUPUESTO-XX). Task 111: CONTADO = el presupuesto
// emitido SOLO AL CONTADO (sin cuotas) — opción propia que pidió el dueño.
const CRM_PLANES = ["TODOS", "CUOTA", "CONTADO", "MAYORISTA", "SAFRA", "CHEQUE"] as const;

// Fecha corta DD/MM/AA para la columna "último" del CRM
const fmtFechaCortaCrm = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  // #HASHTAG (promo del admin): valor en Gs + fecha de validez.
  // Viene de la tabla APARTE ProductHashtag vía GET /api/products
  // (el modelo Product y el PUT normal NO se tocan).
  hashtag?: { valor: number | null; fecha: string | null } | null;
  // Costos
  costBR: number | null;
  rsToGs: number | null;
  costUS: number | null;
  usToGs: number | null;
  costGs: number | null;
  rsNoUS: number | null;
  usNoGs: number | null;
  subCost: number | null;
  discountPct: number | null;
  minusDisc: number | null;
  addPct: number | null;
  plusAdd: number | null;
  admPct: number | null;
  plusAdd2: number | null;
  valorDesc: number | null;
  minusDescV: number | null;
  valorAdd: number | null;
  costProd: number | null;
  // Datos
  referencia: string | null;
  codViza: string | null;
  codShow: string | null;
  // Bases
  pct1A6: number | null;
  pct7A13: number | null;
  pct14A30: number | null;
  // Márgenes
  marginContado: number | null;
  [key: string]: any;
  // Datos finales
  safra: string | null;
  productName: string | null;
  fabricante: string | null;
  subGrupo: string | null;
  categoria: string | null;
  division: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  valorTecnico: number | null;
  margenTecnico: number | null;
  // Task 97: CAPACIDAD (columna nueva; vive en tabla aparte ProductCapacidad
  // y llega fusionada desde GET /api/products, igual que el hashtag)
  capacidad?: string | null;
  // Task 98: CORES (columna nueva; vive en tabla aparte ProductCores
  // y llega fusionada desde GET /api/products, igual que capacidad)
  cores?: string | null;
  coluna1: string | null;
  coluna2: string | null;
  stock: number;
  costSistema: number | null;
  showInCatalog: boolean;
  // Trazabilidad: última edición manual del admin
  etiquetaColor?: string | null;
  ultimaEdicionAt?: string | null;  // ISO string from API
  ultimaEdicionPor?: string | null; // admin name or email
  // Costos editados a mano y guardados por el admin (keys de columna,
  // ej: "costGs"): la celda correspondiente se pinta de DORADO VIBRANTE y
  // la importación de stock nunca pisa esos costos (solo actualiza stock).
  costosEditados?: string[] | null;
}

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface AdminPanelProps {
  user: AppUser;
  onGoSales: () => void;
  onGoGestion?: () => void;
  isSupremo?: boolean;
  // Task 91 (mudanza visual): SOLO llega al supremo_admin desde page.tsx →
  // habilita el botón ORQUESTADOR (ir a los 4 cuadros). Si no llega, el botón
  // no se renderiza (admin/consulta no lo ven).
  onGoOrquestador?: () => void;
  // Task 78 (pedido del dueño): MODO SOLO LECTURA para viza.compras@
  // (ENC. COMPRAS). Ve TODA la base con buscador, filtros, orden y
  // paginación, pero NO puede editar ninguna celda ni borrar/exportar/
  // importar nada. La seguridad real ya la da el backend (PUT/DELETE/
  // PATCH exigen admin); este modo es la capa de UX encima.
  modoLectura?: boolean;
  // Task 127 (pedido del dueño): SOLO llega para viza@viza.com.py (VILMAR
  // CESAR ZAGO PEREIRA — lista única en src/lib/acceso-stock-general.ts).
  // Habilita el botón IR A STOCK GENERAL. Si no llega la prop, el botón no
  // se renderiza (ningún otro usuario lo ve) — misma regla de la casa que
  // onGoOrquestador/onGoBase.
  onGoStock?: () => void;
}

const PAGE_SIZE = 50; // Más productos por página (filas compactas permiten ver más)

// Recalcular en vivo (espejo del cálculo del servidor)
// Task 87: las tasas vienen por parámetro (las activas de la base, cargadas
// al abrir la Base). Si por algún motivo no llegaron, usa las de siempre
// (1100/6000) — mismo comportamiento que antes de esta función existir.
const TASAS_FRONT_DEFAULT = { cambioRS: 1100, cambioUS: 6000 };
function recalcLive(form: any, tasas: { cambioRS: number; cambioUS: number } = TASAS_FRONT_DEFAULT): any {
  const cambioRS = tasas.cambioRS;
  const cambioUS = tasas.cambioUS;
  const d = form.costBR && Number(form.costBR) > 0 ? Number(form.costBR) * cambioRS : 0;
  const f = form.costUS && Number(form.costUS) > 0 ? Number(form.costUS) * cambioUS : 0;
  const rsNoUS = d > 0 ? d : f;
  const calcCost = rsNoUS > 0 ? rsNoUS : (Number(form.costGs) || 0);
  const discount = Number(form.discountPct) || 0;
  const add = Number(form.addPct) || 0;
  const adm = Number(form.admPct) || 0;
  const valDesc = Number(form.valorDesc) || 0;
  const valAdd = Number(form.valorAdd) || 0;

  const minusDisc = calcCost - (calcCost * discount);
  const plusAdd = minusDisc + (minusDisc * add);
  const plusAdd2 = plusAdd + (plusAdd * adm);
  const minusDescV = plusAdd2 - valDesc;
  const baseCosto = minusDescV + valAdd;
  const costProd = Math.round(baseCosto / 1000) * 1000;

  const y = Number(form.pct1A6) || 0;
  const z = Number(form.pct7A13) || 0;
  const aa = Number(form.pct14A30) || 0;
  const mContado = Number(form.marginContado) || 0;

  const margins: number[] = [];
  let last = mContado;
  for (let i = 1; i <= 30; i++) {
    let base: number;
    if (i <= 6) base = y;
    else if (i <= 13) base = z;
    else base = aa;
    last = last + base;
    margins.push(last);
  }

  const t = costProd;
  const priceContado = Math.round((t + t * mContado) / 1000) * 1000;
  const prices: number[] = [];
  for (let i = 1; i <= 30; i++) {
    prices.push(Math.round((t + t * margins[i - 1]) / 1000 / i) * 1000);
  }

  return {
    rsToGs: d, usToGs: f, rsNoUS, usNoGs: calcCost, subCost: calcCost,
    minusDisc, plusAdd, plusAdd2, minusDescV, costProd,
    marginC1: margins[0], marginC2: margins[1], marginC3: margins[2],
    marginC4: margins[3], marginC5: margins[4], marginC6: margins[5],
    marginC7: margins[6], marginC8: margins[7], marginC9: margins[8],
    marginC10: margins[9], marginC11: margins[10], marginC12: margins[11],
    marginC13: margins[12], marginC14: margins[13], marginC15: margins[14],
    marginC16: margins[15], marginC17: margins[16], marginC18: margins[17],
    marginC19: margins[18], marginC20: margins[19], marginC21: margins[20],
    marginC22: margins[21], marginC23: margins[22], marginC24: margins[23],
    marginC25: margins[24], marginC26: margins[25], marginC27: margins[26],
    marginC28: margins[27], marginC29: margins[28], marginC30: margins[29],
    priceContado, price1: prices[0], price2: prices[1], price3: prices[2],
    price4: prices[3], price5: prices[4], price6: prices[5], price7: prices[6],
    price8: prices[7], price9: prices[8], price10: prices[9], price11: prices[10],
    price12: prices[11], price13: prices[12], price14: prices[13], price15: prices[14],
    price16: prices[15], price17: prices[16], price18: prices[17], price19: prices[18],
    price20: prices[19], price21: prices[20], price22: prices[21], price23: prices[22],
    price24: prices[23], price25: prices[24], price26: prices[25], price27: prices[26],
    price28: prices[27], price29: prices[28], price30: prices[29],
  };
}

// Lista de columnas a mostrar (todas las del Excel)
interface ColDef {
  key: string;
  label: string;
  type: "text" | "num" | "calc" | "pct";
  group?: string;
}

const COLUMNS: ColDef[] = [
  // Orden de columnas a pedido del usuario (Task 97, despues del COD fijo):
  //   COD > PROVEDOR > MARCA > GRUPO > SUBGRUPO > TIPO PRODUCTO > MODELO >
  //   > CAPACIDAD > CORES > REF.FABRICA > DESCRIPCION
  // Task 98: el dueño pidió "crea una coluna nombre CORES entre la coluna
  // MODELO y CAPACIDAD" — CORES es la columna NUEVA de esta tarea (texto
  // libre, vive en la tabla aparte ProductCores, mismo patrón que
  // CAPACIDAD). El resto del orden queda igual.
  // Task 105 (CORRECCIÓN, pedido del dueño): "COLUNA CORES ATRAS DE
  // REF.FABRICA LADO ISQUIERDO... QUEDO DEL LADO DERECHO" — la primera
  // versión la puso a la DERECHA de REF.FABRICA y el dueño la quiere a la
  // IZQUIERDA. Mismo criterio ya validado en esta tabla con STOCK y MARGEN
  // MAYORISTA: "atras de X" = ANTES de X (a la izquierda de X). CORES queda
  // como vecina INMEDIATA a la izquierda de REF.FABRICA (entre CAPACIDAD y
  // REF.FABRICA). Keys/campos/datos/filtros intactos: solo cambia la
  // posición visual de la columna.
  // Cambios de esta tarea: PROVEDOR pasó al frente (antes iba detrás de
  // SUB-GRUPO); TIPO PRODUCTO y CAPACIDAD son las DOS columnas NUEVAS
  // ("hay que crear mas dos tanbien"); el resto queda igual. Solo cambia
  // la POSICION visual; keys/campos/datos/Excel intactos.
  // Renombre visual (pedido del usuario): se muestra PROVEDOR; el campo/key
  // "fabricante" queda intacto (datos, filtro, API, import y export sin cambios).
  { key: "fabricante", label: "PROVEDOR", type: "text", group: "DATOS FINALES" },
  // MARCA (Task 129, pedido del dueño): "MARCA la coluna Marca ... necessito
  // que estea en frente de la coluna Provedor ... del lado derecho y atras de
  // la coluna GRUPO" → queda como vecina INMEDIATA a la derecha de PROVEDOR
  // y a la izquierda de GRUPO (regla ya validada en esta tabla, Task 105:
  // "atras de X" = ANTES de X). El campo ya existía en la base de datos y en
  // import/export Excel; se muestra y es editable en esta tabla (filtro por
  // columna y búsqueda global ya lo soportaban). MARCA es la columna MARCA
  // del Excel (el botón IMPORTAR FABRICANTES que la escribía fue retirado
  // del panel a pedido del dueño, Task 121). Solo cambia la POSICIÓN visual;
  // key/campo/datos/filtros/Excel intactos.
  { key: "marca", label: "MARCA", type: "text", group: "DATOS FINALES" },
  // GRUPO: en la base es el campo "categoria" (col CQ "CATEGORIA" de la
  // planilla), el mismo que ya usan el export Excel y la importación de
  // productos. Se muestra (como GRUPO) y es editable en esta tabla; la planilla
  // LISTA VIZA HOME la llena (el botón IMPORTAR FABRICANTES fue retirado
  // del panel a pedido del dueño, Task 121).
  { key: "categoria", label: "GRUPO", type: "text", group: "DATOS FINALES" },
  { key: "subGrupo", label: "SUB-GRUPO", type: "text", group: "DATOS FINALES" },
  // TIPO PRODUCTO (NUEVA en la tabla, Task 97): el campo "tipo" ya existía
  // en la base (col CS "Tipo" de la planilla) y en import/export Excel;
  // estaba OCULTA en esta tabla desde el pedido viejo de orden de columnas
  // ("Columnas DIVISION, TIPO y PRODUCTO ocultas") — el dueño la vuelve a
  // querer, con el nombre TIPO PRODUCTO, entre MARCA y MODELO. Editable,
  // filtrable y buscable como cualquier columna de texto.
  { key: "tipo", label: "TIPO PRODUCTO", type: "text", group: "DATOS FINALES" },
  // MODELO restaurada a pedido del usuario: el campo ya existía en la base
  // (encabezado "MODELO" de la planilla, columna justo detrás de MARCA), en
  // la importación de productos y en el export Excel; ahora también se
  // muestra y es editable en esta tabla. Va justo detrás de MARCA, como en
  // la planilla. (Task 99: MODELO vuelve a ser columna FIJA con celdas
  // doradas, igual que COD y ACCIONES; ver FROZEN_COLUMNS.)
  { key: "modelo", label: "MODELO", type: "text", group: "DATOS FINALES" },
  // CAPACIDAD (NUEVA, Task 97): la segunda de las dos columnas nuevas del
  // pedido ("hay que crear mas dos tanbien"). Dato de texto libre que NO
  // existía ni en la planilla ni en la base (las capacidades hoy viven
  // dentro de la DESCRIPCION: "12.000 BTU", "650M3H", "90CM"...). El admin
  // la llena a mano. Vive en la tabla APARTE ProductCapacidad (mismo
  // patrón que #HASHTAG: se activa sola, jamás toca el modelo Product ni
  // rompe nada sin db push) y llega fusionada desde GET /api/products.
  // Editable, filtrable y buscable como cualquier columna de texto.
  { key: "capacidad", label: "CAPACIDAD", type: "text", group: "DATOS FINALES" },
  // CORES (NUEVA, Task 98; POSICIÓN Task 105 corregida): a pedido del dueño
  // va ATRÁS de REF.FABRICA — con el criterio ya validado en esta tabla
  // ("atras de X" = ANTES de X, a la izquierda), o sea vecina INMEDIATA a
  // la IZQUIERDA de REF.FABRICA (el dueño: "LADO ISQUIERDO... QUEDO DEL
  // LADO DERECHO"). Dato de texto libre con los colores del producto
  // ("BRANCO/AZUL", "PRETO"...). Vive en la tabla APARTE ProductCores
  // (mismo patrón que CAPACIDAD: se activa sola, jamás toca el modelo
  // Product ni rompe nada sin db push) y llega fusionada desde GET
  // /api/products. Editable, filtrable y buscable como cualquier columna de
  // texto. (Task 99: además es columna FIJA con celdas doradas; ver
  // FROZEN_COLUMNS.)
  { key: "cores", label: "CORES", type: "text", group: "DATOS FINALES" },
  // Renombre visual (pedido del usuario): se muestra REF.FABRICA; el campo/key
  // "referencia" queda intacto (datos, filtro, import y export sin cambios).
  { key: "referencia", label: "REF.FABRICA", type: "text", group: "DATOS" },
  // Datos de identificacion
  { key: "name", label: "DESCRIPCION", type: "text", group: "DATOS" },
  // #HASHTAG (nueva, a pedido del usuario): promo por producto — valor en Gs
  // + calendario de validez. Va al lado de DESCRIPCION. La celda NO usa el
  // flujo dirty/PUT: se guarda sola vía PATCH /api/products/[id]/hashtag
  // (igual que la etiqueta de color). La tabla ProductHashtag es APARTE y
  // auto-gestionada, así que nada de lo existente se ve afectado.
  { key: "hashtag", label: "#HASHTAG", type: "text", group: "DATOS" },
  // STOCK movida ENTRE COD SHOW y Costo R$ (atras de Costo R$ = antes, en frente de COD SHOW = despues)
  { key: "stock", label: "STOCK", type: "num", group: "DATOS FINALES" },
  // Costos
  { key: "costBR", label: "Costo R$", type: "num", group: "COSTOS" },
  { key: "rsToGs", label: "R$ A GS", type: "calc", group: "COSTOS" },
  { key: "costUS", label: "Costo US$", type: "num", group: "COSTOS" },
  { key: "usToGs", label: "US$ A GS", type: "calc", group: "COSTOS" },
  { key: "costGs", label: "Costo Gs", type: "num", group: "COSTOS" },
  // R$ NO US$ eliminada de esta tabla a pedido del usuario. El campo sigue
  // existiendo en la base de datos (H = IF D>0, D, F), en el export Excel y
  // alimenta el cálculo de US$ NO GS / Sub-Costo; solo deja de mostrarse.
  { key: "usNoGs", label: "US$ NO GS", type: "calc", group: "COSTOS" },
  { key: "subCost", label: "Sub-Costo", type: "calc", group: "COSTOS" },
  { key: "discountPct", label: "% DESC", type: "pct", group: "COSTOS" },
  { key: "minusDisc", label: "MENOS DESC. %", type: "calc", group: "COSTOS" },
  { key: "addPct", label: "% ADD", type: "pct", group: "COSTOS" },
  { key: "plusAdd", label: "MAIS % ADD", type: "calc", group: "COSTOS" },
  { key: "admPct", label: "GASTOS ADM", type: "pct", group: "COSTOS" },
  { key: "plusAdd2", label: "MAIS % ADD 2", type: "calc", group: "COSTOS" },
  { key: "valorDesc", label: "VALOR DESC.", type: "num", group: "COSTOS" },
  { key: "minusDescV", label: "MENOS DESC. V", type: "calc", group: "COSTOS" },
  { key: "valorAdd", label: "VALOR ADD", type: "num", group: "COSTOS" },
  { key: "costProd", label: "COSTO PROD.", type: "calc", group: "COSTOS" },
  // Bases
  { key: "pct1A6", label: "1 A 6", type: "pct", group: "BASES" },
  { key: "pct7A13", label: "7 A 13", type: "pct", group: "BASES" },
  { key: "pct14A30", label: "14 A 30", type: "pct", group: "BASES" },
  // Margenes y precios
  // Movimientos a pedido del usuario (solo POSICION visual; keys/datos intactos):
  // - MARGEN MAYORISTA movida atras de % CONTADO (antes de ella, a la izquierda)
  // - VALOR MAYORISTA movida atras de CONTADO (PRECIO CONTADO; antes, a la izquierda)
  // Mismo criterio ya validado con STOCK en esta tabla: "atras de X" = antes de X.
  //
  // Renombre visual (pedido del usuario): MARGEN TECNICO ahora se muestra como
  // MARGEN MAYORISTA, y VALOR TECNICO ahora se muestra como VALOR MAYORISTA.
  // Solo cambia el NOMBRE de la columna en pantalla; los keys "margenTecnico" y
  // "valorTecnico", los datos, el import y el export Excel quedan intactos.
  //
  // Task 97: MARGEN MAYORISTA pasa de "num" a "pct" — ahora se ESCRIBE y se
  // VE como porcentaje (teclea 5 = 5%, se guarda 0.05 igual que % CONTADO y
  // % DESC; la base ya guarda fracciones: la planilla trae 0.05 en
  // "Margen P/Tecnico"). Al escribir el %, el VALOR MAYORISTA se llena SOLO
  // (ver handleChange: AIRES sobre COSTO GS, demas sobre COSTO PROD.,
  // misma fórmula de la planilla — ver src/lib/margen-mayorista.ts).
  { key: "margenTecnico", label: "MARGEN MAYORISTA", type: "pct", group: "DATOS FINALES" },
  { key: "marginContado", label: "% CONTADO", type: "pct", group: "MARGENES" },
  { key: "safra", label: "SAFRA", type: "num", group: "DATOS FINALES" },
  { key: "valorTecnico", label: "VALOR MAYORISTA", type: "num", group: "DATOS FINALES" },
  { key: "priceContado", label: "CONTADO", type: "calc", group: "PRECIOS" },
  ...Array.from({ length: 30 }, (_, i) => ({
    key: `marginC${i + 1}`,
    label: `% C${i + 1}`,
    type: "calc" as const,
    group: "MARGENES",
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    key: `price${i + 1}`,
    label: `CUOTA ${i + 1}`,
    type: "calc" as const,
    group: "PRECIOS",
  })),
  // VALOR MAYORISTA (antes VALOR TECNICO) y MARGEN MAYORISTA (antes MARGEN
  // TECNICO) ya no van al final: quedaron atras de CONTADO (PRECIO CONTADO) y
  // atras de % CONTADO respectivamente (ver arriba).
  // COLUNA1, COLUNA2 y COSTO SISTEMA: eliminadas del Panel ADM a pedido del usuario.
  // Siguen existiendo en la base de datos y en import/export Excel; solo dejan de mostrarse.
];

// ─── Columnas FIJAS (congeladas) ───
// Se congelan igual que ACCIONES y COD (position sticky al scrollear hacia los
// costados). TODOS los encabezados llevan el dorado del padrón (#D9B86B);
// las CELDAS de las columnas que aparecen en FROZEN_BLANCO (ver abajo) llevan
// fondo blanco en vez de dorado. Los anchos son fijos para poder calcular la
// posicion left de cada una (arranque: ACCIONES 120px + COD 110px = 230px).
// Para revertir el experimento: dejar el array VACIO ([]).
//
// Task 98 (pedido del dueño): "las colunas TIPO PRODUCTO y CAPACIDAD hay que
// dejarlas fijas". Eso quedó aplicado con esas dos solas.
//
// Task 99 (pedido del dueño, AMPLIA el pedido de la Task 98): "TODAS ESTAS
// COLUNAS TIENEN QUE ESTAR FIJAS Y EL FONDO DE LAS CELDAS DE ELLAS SON
// DOURADO COMO LA DE COD Y ACCIONES". Vuelven a quedar fijas TODAS las del
// bloque izquierdo, EN EL ORDEN real de la tabla: PROVEDOR > GRUPO >
// SUB-GRUPO > MARCA > TIPO PRODUCTO > MODELO > CAPACIDAD > CORES >
// REF.FABRICA (CORES quedó a la IZQUIERDA de REF.FABRICA, corrección
// Task 105: "COLUNA CORES ATRAS DE REF.FABRICA LADO ISQUIERDO...
// QUEDO DEL LADO DERECHO" — "atras de X" = antes de X, criterio ya
// validado). Las CELDAS de todas ellas
// llevan el DORADO del padrón (#D9B86B, FROZEN_BG) igual que COD y
// ACCIONES — FROZEN_BLANCO queda VACIO.
// La DESCRIPCION NO va en la lista: scrollea normal como cualquier columna
// de la derecha (igual que #HASHTAG, STOCK, costos y precios).
// Anchos: los mismos que usaba el bloque fijo hasta la Task 97; CORES
// (columna nueva Task 98) sigue con 110px, ahora ANTES de REF.FABRICA
// (corrección Task 105, lado izquierdo). El total no cambia (solo se
// reordenó): ACCIONES 120 + COD 110 + 1040 = 1270px. IMPORTANTE: el orden
// de acá TIENE
// que ser el MISMO de COLUMNS (las posiciones left fijas se acumulan en ese
// orden — frozenLeftsDesde).
const FROZEN_COLUMNS: { key: string; width: number }[] = [
  { key: "fabricante", width: 130 }, // PROVEDOR (FIJA, pedido del dueño Task 99)
  { key: "categoria", width: 100 },  // GRUPO (FIJA, pedido del dueño Task 99)
  { key: "subGrupo", width: 120 },   // SUB-GRUPO (FIJA, pedido del dueño Task 99)
  { key: "marca", width: 100 },      // MARCA (FIJA, pedido del dueño Task 99)
  { key: "tipo", width: 120 },       // TIPO PRODUCTO (FIJA, pedido del dueño Task 98/99)
  { key: "modelo", width: 130 },     // MODELO (FIJA, pedido del dueño Task 99)
  { key: "capacidad", width: 100 },  // CAPACIDAD (FIJA, pedido del dueño Task 98/99)
  { key: "cores", width: 110 },      // CORES (FIJA Task 99; a la IZQUIERDA de REF.FABRICA, corrección Task 105)
  { key: "referencia", width: 130 }, // REF.FABRICA (FIJA, pedido del dueño Task 99)
];
const FROZEN_START_LEFT = 230; // modo normal: ACCIONES (120px) + COD (110px)
const FROZEN_BG = "#D9B86B";   // mismo dorado del encabezado / ACCIONES / COD
// DORADO SUPER VIVO VIBRANTE para las celdas de COSTO que el admin editó a
// mano y guardó (se ve al instante y se distingue del dorado del padrón).
const COSTO_EDITADO_BG = "#FFD700";
// Columnas fijas cuyas CELDAS llevan fondo BLANCO en vez de dorado. El
// ENCABEZADO siempre sigue dorado, respetando el padrón de encabezados.
// Task 99: el dueño pidió las celdas de TODAS las fijas DORADAS como COD y
// ACCIONES, así que este Set queda VACIO (todas las celdas fijas llevan el
// dorado del padrón #D9B86B). Si mañana quisiera alguna fija con celdas
// blancas (como la vieja DESCRIPCION congelada en blanco), alcanza con
// agregar su key acá.
const FROZEN_BLANCO = new Set<string>();
// Posiciones left de las columnas fijas: se calculan desde el arranque.
// Task 80 (ajuste visual): en MODO SOLO LECTURA la columna ACCIONES no
// existe, así que las fijas arrancan PEGADAS al COD (110px); antes quedaban
// en 230px (reservando los 120px de ACCIONES que no está) y GRUPO se veía
// separada del COD. Los anchos son los mismos; solo cambia el arranque.
function frozenLeftsDesde(start: number): Record<string, number> {
  const m: Record<string, number> = {};
  let acc = start;
  for (const c of FROZEN_COLUMNS) {
    m[c.key] = acc;
    acc += c.width;
  }
  return m;
}
const frozenLeftByKey = frozenLeftsDesde(FROZEN_START_LEFT); // modo normal: ACCIONES (120px) + COD (110px)
const frozenLeftByKeyLectura = frozenLeftsDesde(110);        // modo SOLO LECTURA: solo COD (110px)
const frozenWidthByKey: Record<string, number> = Object.fromEntries(
  FROZEN_COLUMNS.map((c) => [c.key, c.width])
);

export function AdminPanel({ user, onGoSales, onGoGestion, isSupremo, onGoOrquestador, modoLectura, onGoStock }: AdminPanelProps) {
  // Modo SOLO LECTURA (Task 78): el usuario de COMPRAS ve la base completa
  // pero no edita nada. Default false = admins de siempre, sin cambios.
  const esLectura = modoLectura === true;
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [dirty, setDirty] = useState<Record<string, any>>({}); // id -> form de cambios
  // Modal de cambio de contraseña propia (visible para todos los roles autenticados)
  const [cambiarContrasenaOpen, setCambiarContrasenaOpen] = useState(false);
  const onOpenCambiarContrasena = () => setCambiarContrasenaOpen(true);
  // Etiquetas de colores por producto: { [productId]: "verde" | "azul" | "dorado" | "rojo" }
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});
  // Fila ACTIVA (solo visual): id del producto cuya linea queda pintada al
  // tocar/clickear cualquiera de sus celdas (o al navegar con el teclado,
  // porque el focus de los inputs burbujea al <tr>). Al tocar otra fila, esta
  // pasa a ser la activa y la anterior vuelve a la normalidad. No afecta
  // datos ni logica: puramente estetico (clase .fila-activa en globals.css).
  const [filaActivaId, setFilaActivaId] = useState<string | null>(null);
  const [openLabelMenu, setOpenLabelMenu] = useState<string | null>(null);
  // Filtros por columna: { [colKey]: string[] }
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  // Columna cuyo dropdown está abierto (null = ninguno)
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  // Ordenamiento de la columna STOCK: null (sin orden) | "desc" (mayor a menor) | "asc" (menor a mayor)
  const [stockSort, setStockSort] = useState<"asc" | "desc" | null>(null);
  // Ordenamiento de la columna COD (número: mayor a menor / menor a mayor)
  const [codSort, setCodSort] = useState<"asc" | "desc" | null>(null);
  // Ordenamiento de la columna DESCRIPCION (alfabético: Z-A = desc / A-Z = asc)
  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);
  // Filtro activo de etiqueta de color: "verde" | "azul" | "dorado" | "rojo" | null
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  // ─── ETIQUETAS CREADAS POR EL SUPREMO (Task 84) ───
  // Etiquetas extra a las 4 fijas (verde/azul/dorado/rojo), con nombre y
  // color. Se usan en el menú de etiquetado de cada fila, en los filtros
  // clickeables y para pintar la fila (clase dinámica inyectada más abajo).
  const [etiquetasCreadas, setEtiquetasCreadas] = useState<EtiquetaCreada[]>([]);
  const [modalEtiquetaOpen, setModalEtiquetaOpen] = useState(false);

  // Cargar etiquetas creadas (una vez al montar la Base). Si falla o aún
  // no existe la tabla, quedan solo las 4 fijas de siempre y nada se rompe
  // (el API responde lista vacía igual).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/products/labels");
        if (!res.ok) return;
        const data = await res.json();
        if (vivo && Array.isArray(data?.creadas)) {
          setEtiquetasCreadas(data.creadas);
        }
      } catch {
        // sin etiquetas creadas — la Base funciona igual que siempre
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // ─── TASA DE CAMBIO ACTIVA (Task 87, pedido del dueño) ───
  // Tasas R$→Gs y US$→Gs que usa el sistema al recalcular costos (antes
  // fijas en 1100/6000). Se cargan UNA VEZ al montar la Base y se usan:
  //   · para el recálculo EN VIVO de la tabla (recalcLive),
  //   · para mostrarlas en el chip de la barra (informativo, todos),
  //   · para precargar el modal TASA DE CAMBIO (Task 87B: solo Supremo y
  //     viza@viza.com.py — lista única en src/lib/permisos-cambio.ts).
  // Si la lectura falla, quedan las de siempre y nada se rompe.
  const [tasasCambio, setTasasCambio] = useState<{ cambioRS: number; cambioUS: number }>(TASAS_FRONT_DEFAULT);
  const [modalTasaOpen, setModalTasaOpen] = useState(false);
  // Modal: PEDIDO ESPECIAL (Task 113) — config de proveedores + tipos de
  // producto + % de la Base. Botón visible SOLO para admin/supremo (igual
  // que toda escritura de la Base; la API re-valida la misma regla).
  const [modalPedidoEspecialOpen, setModalPedidoEspecialOpen] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/config-cambio");
        if (!res.ok) return;
        const data = await res.json();
        if (
          vivo &&
          typeof data?.cambioRS === "number" && data.cambioRS > 0 &&
          typeof data?.cambioUS === "number" && data.cambioUS > 0
        ) {
          setTasasCambio({ cambioRS: data.cambioRS, cambioUS: data.cambioUS });
        }
      } catch {
        // tasas de siempre — la Base funciona igual que siempre
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // ─── IMPORTAR EXCEL (planilla de inventario) ───
  // Estados del modal de importación de stock desde planilla de inventario
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    totalFilas: number;
    codigosUnicos: number;
    nuevosCount: number;
    actualizadosCount: number;
    nuevos: Array<{ sku: string; name: string | null; referencia: string | null; subGrupo: string | null; stock: number; costProd: number | null; margenAuto: number | null; margenFuente: string | null; safraAuto: string | null }>;
    actualizados: Array<{ sku: string; nameActual: string | null; stockActual: number; stockNuevo: number; costoActual: number | null; costoNuevo: number | null; costoProtegido?: boolean }>;
    errores: string[];
  } | null>(null);
  const [importApplying, setImportApplying] = useState(false);
  const [importResult, setImportResult] = useState<{ creados: number; actualizados: number; conCostoActualizado?: number; margenesAutomaticas: number; conSafraAutomatica?: number; errores: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── DELETE ALL (borrar TODOS los productos) ───
  // Botón rojo solo para supremo_admin. Borra toda la tabla de productos.
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllPreview, setDeleteAllPreview] = useState<{
    total: number;
    sample: Array<{ sku: string; name: string; stock: number }>;
  } | null>(null);
  const [deleteAllApplying, setDeleteAllApplying] = useState(false);
  const [deleteAllResult, setDeleteAllResult] = useState<{ borrados: number; conservados?: number } | null>(null);
  // Checkbox de doble confirmación (debe tildar "SI, BORRAR TODO" para habilitar)
  const [deleteAllConfirmCheck, setDeleteAllConfirmCheck] = useState(false);

  // ─── CRM: ranking de presupuestos emitidos por usuario (general y por sucursal) ───
  const [crmOpen, setCrmOpen] = useState(false);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmRanking, setCrmRanking] = useState<CrmFila[]>([]);
  const [crmSucursales, setCrmSucursales] = useState<string[]>([]);
  const [crmTotalGeneral, setCrmTotalGeneral] = useState(0);
  const [crmFiltro, setCrmFiltro] = useState<string>("GENERAL");
  // Filtro por TIPO DE PLAN (Task 78, pedido del dueño): TODOS por defecto
  // (comportamiento de siempre); al elegir un plan, el ranking muestra y
  // ordena por la cantidad de presupuestos de ESE plan.
  const [crmPlan, setCrmPlan] = useState<string>("TODOS");
  const [crmGuardandoSuc, setCrmGuardandoSuc] = useState<string | null>(null); // email en guardado

  // Abre el modal CRM y trae el ranking completo (una sola llamada).
  const abrirCrm = useCallback(async () => {
    setCrmOpen(true);
    setCrmLoading(true);
    try {
      const res = await fetch("/api/crm/ranking");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      setCrmRanking(Array.isArray(data.ranking) ? data.ranking : []);
      setCrmSucursales(Array.isArray(data.sucursales) ? data.sucursales : []);
      setCrmTotalGeneral(Number(data.totalGeneral) || 0);
    } catch (error) {
      console.error("Error CRM:", error);
      toast.error(`CRM: ${(error as Error).message}`);
    } finally {
      setCrmLoading(false);
    }
  }, []);

  // Guarda la sucursal asignada a un usuario (select del CRM). "" = sin sucursal.
  const guardarSucursalCrm = useCallback(async (email: string, sucursal: string) => {
    setCrmGuardandoSuc(email);
    try {
      const res = await fetch("/api/crm/sucursal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: email, sucursal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      setCrmRanking((prev) =>
        prev.map((f) => (f.email === email ? { ...f, sucursal: sucursal || "SIN SUCURSAL" } : f))
      );
      toast.success(sucursal ? `Sucursal asignada: ${sucursal}` : "Asignación de sucursal quitada");
    } catch (error) {
      toast.error(`CRM: ${(error as Error).message}`);
    } finally {
      setCrmGuardandoSuc(null);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (labelFilter) params.set("etiquetaColor", labelFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      // Enviar filtros de columna como JSON
      const activeFilters = Object.fromEntries(
        Object.entries(columnFilters).filter(([, v]) => Array.isArray(v) && v.length > 0)
      );
      if (Object.keys(activeFilters).length > 0) {
        params.set("filters", JSON.stringify(activeFilters));
      }
      // Ordenamiento: solo UNO activo a la vez (COD numérico / DESCRIPCION
      // alfabético / STOCK). El click de cada flechita limpia las otras dos.
      if (codSort) {
        params.set("sort", "sku");
        params.set("dir", codSort);
      } else if (nameSort) {
        params.set("sort", "name");
        params.set("dir", nameSort);
      } else if (stockSort) {
        params.set("sort", "stock");
        params.set("dir", stockSort);
      }
      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setDirty({});
      // Cargar etiquetas persistidas desde la BD
      // Cada producto trae su propio etiquetaColor desde la API GET /api/products
      const labelsFromDb: Record<string, string> = {};
      for (const p of data.products || []) {
        if (p.etiquetaColor) labelsFromDb[p.id] = p.etiquetaColor;
      }
      setProductLabels(labelsFromDb);
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoadingProducts(false);
    }
  }, [search, page, columnFilters, labelFilter, stockSort, codSort, nameSort]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const t = setTimeout(() => fetchProducts(), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchProducts, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleChange = (productId: string, key: string, value: string) => {
    // Modo SOLO LECTURA (Task 78): ninguna celda se edita (defensa extra;
    // el input ya es readOnly y el backend da 403 a colaboradores).
    if (esLectura) return;
    setDirty((d) => {
      const existing = d[productId] || {};
      return { ...d, [productId]: { ...existing, [key]: value } };
    });

    // ─── % MAYORISTA AUTOMÁTICO → VALOR MAYORISTA (Task 97, pedido del dueño) ───
    // "% AUTOMATICA NO MAYORISTA PARA REFLETIR EN VALOR DE MAYORISTA ...
    //  % PARA AIRES SERIA EMCIMA DE (COSTO GS) Y % PARA DEMAS PRODUCTOS
    //  EM CIMA DE (COSTO PROD.) ambos ao agregar en MARGEN MAYORISTA ya
    //  nos traria automaticamente el VALOR MAYORISTA".
    //
    // Al escribir el % en MARGEN MAYORISTA (o tocar cualquier costo que
    // afecta la base), el VALOR MAYORISTA de la fila se llena SOLO, con la
    // MISMA fórmula de la planilla LISTA VIZA HOME (columna CV):
    //        VALOR = CostoBase * (1 + %)
    //   · AIRES → CostoBase = COSTO GS   (col Costo Gs)
    //   · DEMÁS → CostoBase = COSTO PROD. (recalculado en vivo con los
    //     cambios pendientes, espejo del recálculo del servidor)
    // Si el producto no tiene margen (o es 0), el VALOR no se toca: queda
    // el que el admin escribió a mano (regla de la casa). El valor quedó
    // en el dirty, así que se GUARDA junto con todo lo demás; el PUT del
    // servidor lo recalcula igual como espejo de seguridad.
    const TRIGGERS_MAYORISTA = [
      "margenTecnico", "costBR", "costUS", "costGs",
      "discountPct", "addPct", "admPct", "valorDesc", "valorAdd",
    ];
    if (!TRIGGERS_MAYORISTA.includes(key)) return;
    const productoFila = products.find((p) => p.id === productId);
    if (!productoFila) return;
    const cambiosFila: any = { ...(dirty[productId] || {}), [key]: value };
    // margen efectivo: el recién escrito (si es el caso) o el que ya tenía
    const margenEfectivo =
      cambiosFila.margenTecnico !== undefined
        ? cambiosFila.margenTecnico
        : (productoFila as any).margenTecnico;
    const esAire = esProductoAire(productoFila as any);
    // Base del cálculo:
    //   AIRES → COSTO GS directo (lo escrito ahora manda si lo está editando)
    //   DEMÁS → COSTO PROD. EN VIVO: espejo de recalcLive con los cambios
    //           pendientes (igual que hace getDisplayValues para pintarlo);
    //           si el producto no tiene costos de entrada (solo Costo Prod.
    //           viejo), se usa su COSTO PROD. guardado — mismo fallback del
    //           servidor.
    let baseMayorista: number;
    if (esAire) {
      baseMayorista = Number(
        cambiosFila.costGs !== undefined ? cambiosFila.costGs : (productoFila as any).costGs
      ) || 0;
    } else {
      const formVivo: any = { ...(productoFila as any), ...cambiosFila };
      const tieneCostoEntrada =
        Number(formVivo.costBR) > 0 ||
        Number(formVivo.costUS) > 0 ||
        Number(formVivo.costGs) > 0;
      baseMayorista = tieneCostoEntrada
        ? Number(recalcLive(formVivo, tasasCambio).costProd) || 0
        : Number((productoFila as any).costProd) || 0;
    }
    if (baseMayorista <= 0) return; // sin base todavía: no se toca el VALOR
    const valorAuto = calcularValorMayorista(
      { costGs: baseMayorista, costProd: baseMayorista, categoria: "", tipo: "", name: "" },
      margenEfectivo
    );
    if (valorAuto === null) return;
    setDirty((d) => {
      const existing = d[productId] || {};
      const nuevoValor = String(valorAuto);
      if (existing.valorTecnico === nuevoValor) return d;
      return {
        ...d,
        [productId]: { ...existing, [key]: value, valorTecnico: nuevoValor },
      };
    });
  };

  // ─── #HASHTAG (columna nueva al lado de DESCRIPCION) ───
  // Guardado AUTOMÁTICO con debounce vía endpoint dedicado
  // PATCH /api/products/[id]/hashtag (NO pasa por el PUT ni por dirty,
  // igual que la etiqueta de color). Actualización optimista al instante:
  // la celda muestra el valor mientras se guarda en la tabla aparte
  // ProductHashtag. Si el guardado falla, avisa con toast y nada más
  // se ve afectado.
  const hashtagTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleHashtagChange = (
    productId: string,
    v: { valor: number | null; fecha: string | null }
  ) => {
    // Modo SOLO LECTURA (Task 78): el #HASHTAG tampoco se puede editar.
    if (esLectura) return;
    setProducts((ps) =>
      ps.map((x) => (x.id === productId ? { ...x, hashtag: v } : x))
    );
    clearTimeout(hashtagTimersRef.current[productId]);
    hashtagTimersRef.current[productId] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/${productId}/hashtag`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valor: v.valor, fecha: v.fecha }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.error || "Error al guardar #HASHTAG");
        }
      } catch {
        toast.error("Error de red al guardar #HASHTAG");
      }
    }, 600);
  };

  const handleSave = async (product: Product) => {
    // Modo SOLO LECTURA (Task 78): sin guardado (el botón ya no existe).
    if (esLectura) return;
    const changes = dirty[product.id];
    if (!changes) {
      toast.info("Sin cambios para guardar");
      return;
    }
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error("Error");
      const data = await res.json();
      // Actualizar el producto en la lista con los datos nuevos
      setProducts((ps) =>
        ps.map((p) => (p.id === product.id ? { ...p, ...data.product } : p))
      );
      setDirty((d) => {
        const newDirty = { ...d };
        delete newDirty[product.id];
        return newDirty;
      });
      toast.success(`${product.name} guardado`);
      // Task 126: avisar "se guardó un producto" para que STOCK GENERAL replique
      // AL INSTANTE (columnas de la Base, STOCK/SALDO y el registro de última
      // edición del COD) — sin esperar a que el dueño refresque ni cambie filtros.
      // Funciona en la misma pestaña y en otras pestañas (BroadcastChannel).
      avisarProductoEditado({
        id: product.id,
        sku: product.sku,
        columnas: Object.keys(changes),
        por: data.product?.ultimaEdicionPor ?? null,
        accion: "guardado",
      });
    } catch {
      toast.error("No se pudo guardar");
    }
  };

  const handleDelete = async (product: Product) => {
    // Modo SOLO LECTURA (Task 78): sin eliminación (el botón ya no existe).
    if (esLectura) return;
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      toast.success("Producto eliminado");
      // Task 126: también se avisa la baja, para que STOCK GENERAL saque el
      // producto de la tabla al instante (mismo canal que el guardado).
      avisarProductoEditado({
        id: product.id,
        sku: product.sku,
        columnas: [],
        accion: "eliminado",
      });
      fetchProducts();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  // Construir valores display para un producto: si está dirty, usa el valor editado; sino el del producto
  // Y si es calculado, lo recalculamos en vivo
  const getDisplayValues = (product: Product) => {
    const form: any = {};
    const changes = dirty[product.id] || {};

    // Empezar con los valores actuales del producto
    for (const col of COLUMNS) {
      form[col.key] = changes[col.key] !== undefined ? changes[col.key] : (product as any)[col.key] ?? "";
    }

    // Si hay cambios en inputs que afectan cálculos, recalcular
    const recalcInputs = [
      "costBR", "costUS", "costGs", "discountPct", "addPct", "admPct",
      "valorDesc", "valorAdd", "pct1A6", "pct7A13", "pct14A30", "marginContado",
    ];
    const hasRecalcInputs = recalcInputs.some((k) => changes[k] !== undefined);

    if (hasRecalcInputs) {
      // Construir form completo con valores numéricos
      const fullForm: any = { ...form };
      // Llenar todos los campos numéricos con sus valores del producto
      recalcInputs.forEach((k) => {
        if (changes[k] === undefined) {
          fullForm[k] = (product as any)[k] ?? "";
        }
      });
      // Productos viejos importados solo con Costo Prod. (sin costBR/costUS/costGs):
      // usar ese costo como base para que NO se pongan en 0 al editar un margen.
      const sinCostoEntrada =
        !(Number(fullForm.costBR) > 0) &&
        !(Number(fullForm.costUS) > 0) &&
        !(Number(fullForm.costGs) > 0);
      const tocoCosto = ["costBR", "costUS", "costGs"].some((k) => changes[k] !== undefined);
      if (sinCostoEntrada && !tocoCosto && Number((product as any).costProd) > 0) {
        fullForm.costGs = (product as any).costProd;
      }
      const recalculated = recalcLive(fullForm, tasasCambio);
      // Sobrescribir los campos calculados en form
      Object.assign(form, recalculated);
    }

    return form;
  };

  return (
    <div className="h-screen flex flex-col bg-stone-100 overflow-hidden">
      <header className="sticky top-0 z-30 border-b bg-white" style={{ borderColor: "#e7e5e4" }}>
        <div className="flex items-center gap-3 py-3 pr-4 sm:pr-6 lg:pr-8">
          {/* Cajita HORIZONTAL de botones, pegada al borde izquierdo, al lado del buscador */}
          <div
            className="flex flex-row gap-2 items-center p-2 ml-3 rounded-2xl shrink-0"
            style={{
              background: "linear-gradient(180deg, #faf6e9 0%, #ffffff 100%)",
              boxShadow: "0 2px 6px rgba(217,184,107,0.3), 0 0 0 1px #e7d9a8",
            }}
          >
            {/* 1. Bolinha de usuario (avatar) */}
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title={`${user.name || user.email} · ${esLectura ? "CONSULTA · SOLO LECTURA" : isSupremo ? "SUPREMO ADMIN" : "ADMINISTRADOR"}`}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>

            {/* 2. Carrito de ventas (solo icono) */}
            <button
              onClick={onGoSales}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Ir a Ventas"
              aria-label="Ir a Ventas"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>

            {/* 2b. Task 127 (pedido del dueño): IR A STOCK GENERAL — SOLO
                VILMAR (viza@viza.com.py, VILMAR CESAR ZAGO PEREIRA). La prop
                onGoStock solo llega desde page.tsx si el email está en la
                lista de acceso (src/lib/acceso-stock-general.ts), así que
                ningún otro usuario ve este botón. */}
            {onGoStock && (
              <button
                onClick={onGoStock}
                className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors shadow-sm hover:brightness-95"
                style={{ background: "#ffffff", color: "#0d3d5e", boxShadow: "0 2px 6px rgba(217,184,107,0.3), 0 0 0 1px #e7d9a8" }}
                title="IR A STOCK GENERAL (inventario por sucursal + distribución inteligente)"
                aria-label="IR A STOCK GENERAL"
              >
                <Warehouse className="h-4 w-4" />
              </button>
            )}

            {/* 2. Task 91 (mudanza visual): ORQUESTADOR — solo supremo (la prop
                solo llega al supremo desde page.tsx). Vuelve a la pantalla de
                los 4 cuadros: La Base · Stock General · Cotizador · Distribución. */}
            {onGoOrquestador && (
              <button
                onClick={onGoOrquestador}
                className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
                title="Ir al Orquestador (los 4 cuadros del sistema)"
                aria-label="Ir al Orquestador"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            )}

            {/* 2.5 CRM (ranking de presupuestos por usuario, general y por sucursal).
                Task 82 (pedido del dueño): en MODO SOLO LECTURA TAMBIÉN se
                muestra — es SOLO VISUALIZACIÓN (viza.compras@ y filipe.campos@
                ven el ranking general). La asignación de sucursal (select del
                modal) queda congelada para ellos y su API no acepta escritura
                de usuarios de consulta. */}
            <button
              onClick={abrirCrm}
              className="h-9 w-9 rounded-xl font-bold text-[11px] flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="CRM · Ranking de presupuestos por usuario"
              aria-label="CRM · Ranking de presupuestos por usuario"
            >
              CRM
            </button>

            {/* 3. GDA (solo texto, sin emoji) */}
            {isSupremo && onGoGestion && (
              <button
                onClick={onGoGestion}
                className="h-9 w-9 rounded-xl font-bold text-[11px] flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
                title="Gestión de Accesos y Contraseñas"
                aria-label="Gestión de Accesos y Contraseñas"
              >
                GDA
              </button>
            )}

            {/* 4. Clave de cambiar contraseña */}
            <button
              onClick={onOpenCambiarContrasena}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Cambiar mi contraseña"
              aria-label="Cambiar mi contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>

            {/* 5. Cerrar sesión */}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Task 107 (pedido del dueño): MINI CUADRITO "última actualización de
              stock" también DENTRO DE LA BASE — el MISMO componente del panel
              de ventas (Task 105), para que los ADMIN vean la misma información:
              fecha/hora de la última subida del Excel + productos nuevos +
              actualizados. Lado IZQUIERDO del header (al lado de la cajita de
              botones, antes del buscador), igual que en ventas. Solo lectura:
              no recibe props, no toca datos, no cambia nada más de la base. */}
          <StockImportInfoCard />

          {/* Buscador pegado arriba, al lado de la cajita de botones */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-14 pl-12 pr-12 rounded-xl border-2 border-[#D9B86B] text-base font-medium focus:border-rose-500 focus:ring-4 focus:ring-rose-100 outline-none bg-white shadow-sm"
              autoFocus
            />
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 flex items-center justify-center transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Modal: Cambiar mi contraseña */}
      <CambiarContrasena
        email={user.email}
        open={cambiarContrasenaOpen}
        onClose={() => setCambiarContrasenaOpen(false)}
      />

      {/* Modal: CREAR ETIQUETA (Task 84, solo supremo_admin) — montado
          SOLO cuando está abierto, así arranca limpio en cada apertura. */}
      {modalEtiquetaOpen && (
        <ModalCrearEtiqueta
          onClose={() => setModalEtiquetaOpen(false)}
          creadas={etiquetasCreadas}
          onCreadas={(lista) => setEtiquetasCreadas(lista)}
        />
      )}

      {/* Modal: TASA DE CAMBIO (Task 87, solo supremo_admin) — montado SOLO
          cuando está abierto, así arranca limpio en cada apertura. Al
          aplicar: actualiza las tasas del panel Y recarga la lista de
          productos para que costos y precios nuevos se vean al instante. */}
      {modalTasaOpen && (
        <ModalTasaCambio
          onClose={() => setModalTasaOpen(false)}
          tasasActuales={tasasCambio}
          onAplicadas={(nuevas) => {
            setTasasCambio(nuevas);
            fetchProducts();
          }}
        />
      )}

      {/* Modal: PEDIDO ESPECIAL (Task 113, pedido del dueño) — montado SOLO
          cuando está abierto, así arranca limpio en cada apertura. Acá el
          admin carga las combinaciones PROVEEDOR + TIPO DE PRODUCTO con sus
          % (contado, 1-6, 7-13, 14-30) que usa el cotizador del vendedor. */}
      {modalPedidoEspecialOpen && (
        <ModalPedidoEspecialConfig onClose={() => setModalPedidoEspecialOpen(false)} />
      )}

      <main className="flex-1 min-h-0 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-3 flex flex-col">
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* (Buscador movido al header) */}
          <div className="flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {/* (Título "Gestión de productos" eliminado — pedido del dueño:
                    más espacio para los botones, que ahora arrancan a la
                    izquierda). */}
                {search.trim() ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-xs font-semibold">
                    {loadingProducts ? (
                      <>Buscando "{search}"...</>
                    ) : (
                      <>{total} resultado{total !== 1 ? "s" : ""} para "{search}"</>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 text-stone-600 ring-1 ring-stone-200 text-xs font-semibold">
                    TOTAL: {total} productos
                  </span>
                )}
                {/* Chip TASA DE CAMBIO ACTIVA (Task 87, pedido del dueño) —
                    informativo, visible para todos en la Base: muestra el
                    cambio R$→Gs y US$→Gs que el sistema usa HOY al recalcular
                    costos. Editable solo por el Supremo y viza@viza.com.py
                    (botón de al lado, Task 87B). */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200 text-xs font-semibold"
                  title="Tasa de cambio activa: el sistema la usa para convertir costos cargados en Real y en Dólar a Guaraníes"
                >
                  <Coins className="h-3.5 w-3.5" />
                  CAMBIO: R$ {tasasCambio.cambioRS.toLocaleString("es-PY")} · US$ {tasasCambio.cambioUS.toLocaleString("es-PY")}
                </span>
                {/* Botón TASA DE CAMBIO (Task 87, pedido del dueño) — Task
                    87B: SOLO supremo_admin y el email viza@viza.com.py (lista
                    única en src/lib/permisos-cambio.ts, la misma que valida el
                    backend). Abre el modal para editar el cambio R$→Gs y
                    US$→Gs y APLICARLO a la base general (recalcula costos y
                    precios de los productos cargados en R$ o US$ con las
                    mismas fórmulas de siempre). */}
                {puedeEditarTasaCambio(user.role, user.email) && !esLectura && (
                  <button
                    id="btn-tasa-cambio"
                    onClick={() => setModalTasaOpen(true)}
                    className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                    style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                    title="Editar la tasa de cambio (R$→Gs y US$→Gs) y aplicarla a la base general"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    TASA DE CAMBIO
                  </button>
                )}
                {/* Botón PEDIDO ESPECIAL (Task 113, pedido del dueño) — config
                    de la Base: proveedores + tipos de producto + % por
                    combinación. Visible SOLO para admin/supremo (la API
                    re-valida la MISMA regla en toda escritura). */}
                {(user.role === "admin" || user.role === "supremo_admin") && !esLectura && (
                  <button
                    id="btn-pedido-especial"
                    onClick={() => setModalPedidoEspecialOpen(true)}
                    className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                    style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                    title="Configurar los proveedores, tipos de producto y % que usa el PEDIDO ESPECIAL del cotizador"
                  >
                    <Percent className="h-3.5 w-3.5" />
                    PEDIDO ESPECIAL
                  </button>
                )}
                {/* Boton EXPORTAR EXCEL — oculto en MODO SOLO LECTURA (Task 78):
                    la API de export exige admin y el modo consulta es solo
                    para VER y FILTRAR la base. */}
                {!esLectura && (
                <button
                  id="btn-export-excel"
                  onClick={async () => {
                    const btn = document.getElementById("btn-export-excel") as HTMLButtonElement;
                    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }
                    const toastId = toast.loading("Preparando exportacion...");
                    try {
                      const res = await fetch("/api/products/export");
                      if (!res.ok) {
                        const errData = await res.json().catch(() => ({ error: "Error del servidor" }));
                        throw new Error(errData.error || `Error HTTP ${res.status}`);
                      }
                      const blob = await res.blob();
                      if (!blob || blob.size < 100) {
                        throw new Error("El archivo generado esta vacio");
                      }
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const now = new Date();
                      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
                      const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, "");
                      a.download = `BACKUP_VIZA_HOME_${dateStr}_${timeStr}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                      toast.success(`Exportacion completada. ${(blob.size / 1024).toFixed(0)} KB descargados.`, { id: toastId });
                    } catch (error) {
                      console.error("Error export:", error);
                      toast.error(`Error: ${(error as Error).message}`, { id: toastId });
                    } finally {
                      if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
                    }
                  }}
                  className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                  title="Exportar todos los productos a Excel"
                >
                  <Download className="h-3.5 w-3.5" />
                  EXPORTAR EXCEL
                </button>
                )}

                {/* Boton CREAR ETIQUETA (Task 84, pedido del dueño) — solo
                    supremo_admin: abre el modal para crear etiquetas nuevas
                    (nombre + color) que aparecen en el menú de etiquetado de
                    cada fila y en los filtros clickeables. */}
                {isSupremo && (
                  <button
                    id="btn-crear-etiqueta"
                    onClick={() => setModalEtiquetaOpen(true)}
                    className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                    style={{ background: "linear-gradient(135deg, #8a6d2f 0%, #b08a3e 100%)" }}
                    title="Crear etiquetas nuevas de color (solo Supremo Usuario)"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    CREAR ETIQUETA
                  </button>
                )}

                {/* Boton IMPORTAR EXCEL (planilla de inventario) — solo supremo_admin */}
                {isSupremo && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImportOpen(true);
                        setImportLoading(true);
                        setImportPreview(null);
                        setImportResult(null);
                        try {
                          const formData = new FormData();
                          formData.append("file", file);
                          const res = await fetch("/api/products/import-stock/preview", {
                            method: "POST",
                            body: formData,
                          });
                          const data = await res.json();
                          if (!res.ok || data.error) {
                            throw new Error(data.error || `Error HTTP ${res.status}`);
                          }
                          setImportPreview(data);
                        } catch (error) {
                          console.error("Error import preview:", error);
                          toast.error(`Error: ${(error as Error).message}`);
                          setImportOpen(false);
                        } finally {
                          setImportLoading(false);
                          // Reset del input para permitir elegir el mismo archivo otra vez
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }
                      }}
                    />
                    <button
                      id="btn-import-excel"
                      onClick={() => {
                        setImportOpen(true);
                        setImportPreview(null);
                        setImportResult(null);
                        setImportLoading(false);
                        setImportApplying(false);
                        fileInputRef.current?.click();
                      }}
                      className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                      style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                      title="Importar planilla de inventario (stock + nuevos productos)"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      IMPORTAR EXCEL
                    </button>
                  </>
                )}

                {/* Boton DELETE ALL (borrar TODOS los productos) — rojo, solo supremo_admin */}
                {isSupremo && (
                  <button
                    id="btn-delete-all"
                    onClick={async () => {
                      setDeleteAllOpen(true);
                      setDeleteAllPreview(null);
                      setDeleteAllResult(null);
                      setDeleteAllConfirmCheck(false);
                      setDeleteAllLoading(true);
                      try {
                        const res = await fetch("/api/products/cleanup-all/preview", {
                          method: "POST",
                        });
                        const text = await res.text();
                        let data: any;
                        try {
                          data = text ? JSON.parse(text) : null;
                        } catch {
                          throw new Error(`Respuesta inválida del servidor (estado ${res.status})`);
                        }
                        if (!res.ok || data?.error) {
                          throw new Error(data?.error || `Error HTTP ${res.status}`);
                        }
                        setDeleteAllPreview(data);
                      } catch (error) {
                        console.error("Error delete-all preview:", error);
                        toast.error(`Error: ${(error as Error).message}`);
                        setDeleteAllOpen(false);
                      } finally {
                        setDeleteAllLoading(false);
                      }
                    }}
                    className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                    style={{ background: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)" }}
                    title="ELIMINAR TODOS los productos de la base (irreversible, solo supremo)"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    ELIMINAR TODO
                  </button>
                )}
              </div>
              <div className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded bg-emerald-200 ring-1 ring-emerald-400"></span>
                  Calculado automático
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded bg-white ring-1 ring-stone-300"></span>
                  Editable
                </span>
                {/* Separador */}
                <span className="text-stone-300 mx-1">|</span>
                {/* Filtros por etiqueta - clickeables */}
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === null ? "filtro-activo" : ""}`}
                  data-filtro="todos"
                  onClick={() => {
                    setLabelFilter(null);
                    setPage(1);
                  }}
                  title="Mostrar todos los productos"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: "2px solid transparent",
                    background: "transparent",
                    color: "#525252",
                    fontWeight: labelFilter === null ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  TODOS
                </button>
                {/* Filtro EDITADOS - muestra solo productos con edición manual, ordenados del más reciente al más antiguo */}
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "editados" ? "filtro-activo" : ""}`}
                  data-filtro="editados"
                  onClick={() => {
                    setLabelFilter(prev => prev === "editados" ? null : "editados");
                    setPage(1);
                  }}
                  title="Mostrar solo productos editados manualmente (del más reciente al más antiguo)"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    padding: "5px 12px",
                    borderRadius: "5px",
                    border: labelFilter === "editados" ? "2px solid #856404" : "2px solid transparent",
                    background: labelFilter === "editados" ? "#FFF3CD" : "transparent",
                    color: labelFilter === "editados" ? "#856404" : "#525252",
                    fontWeight: labelFilter === "editados" ? 700 : 400,
                    transition: "all 0.3s ease",
                    fontSize: "13px",
                  }}
                >
                  <Pencil style={{ width: "12px", height: "12px" }} />
                  EDITADOS
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "verde" ? "filtro-activo" : ""}`}
                  data-filtro="verde"
                  onClick={() => {
                    setLabelFilter(prev => prev === "verde" ? null : "verde");
                    setPage(1);
                  }}
                  title="Filtrar: SELECCIONADOS"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: labelFilter === "verde" ? "2px solid #28A745" : "2px solid transparent",
                    background: labelFilter === "verde" ? "rgba(40, 167, 69, 0.15)" : "transparent",
                    color: labelFilter === "verde" ? "#1B5E20" : "#525252",
                    fontWeight: labelFilter === "verde" ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#28A745" }}></span>
                  SELECCIONADO
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "azul" ? "filtro-activo" : ""}`}
                  data-filtro="azul"
                  onClick={() => {
                    setLabelFilter(prev => prev === "azul" ? null : "azul");
                    setPage(1);
                  }}
                  title="Filtrar: PARA PEDIDO"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: labelFilter === "azul" ? "2px solid #007BFF" : "2px solid transparent",
                    background: labelFilter === "azul" ? "rgba(0, 123, 255, 0.15)" : "transparent",
                    color: labelFilter === "azul" ? "#0D47A1" : "#525252",
                    fontWeight: labelFilter === "azul" ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#007BFF" }}></span>
                  PARA PEDIDO
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "dorado" ? "filtro-activo" : ""}`}
                  data-filtro="dorado"
                  onClick={() => {
                    setLabelFilter(prev => prev === "dorado" ? null : "dorado");
                    setPage(1);
                  }}
                  title="Filtrar: DESCONTINUADO"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: labelFilter === "dorado" ? "2px solid #FFC107" : "2px solid transparent",
                    background: labelFilter === "dorado" ? "rgba(255, 193, 7, 0.15)" : "transparent",
                    color: labelFilter === "dorado" ? "#5D4037" : "#525252",
                    fontWeight: labelFilter === "dorado" ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#FFC107" }}></span>
                  DESCONTINUADO
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "rojo" ? "filtro-activo" : ""}`}
                  data-filtro="rojo"
                  onClick={() => {
                    setLabelFilter(prev => prev === "rojo" ? null : "rojo");
                    setPage(1);
                  }}
                  title="Filtrar: QUEMA STOCK"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: labelFilter === "rojo" ? "2px solid #DC3545" : "2px solid transparent",
                    background: labelFilter === "rojo" ? "rgba(220, 53, 69, 0.15)" : "transparent",
                    color: labelFilter === "rojo" ? "#B71C1C" : "#525252",
                    fontWeight: labelFilter === "rojo" ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#DC3545" }}></span>
                  QUEMA STOCK
                </button>
                {/* Etiquetas CREADAS por el supremo (Task 84): mismo filtro
                    clickeable que las 4 fijas, con su color propio. */}
                {etiquetasCreadas.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`leyenda-item ${labelFilter === e.id ? "filtro-activo" : ""}`}
                    data-filtro={e.id}
                    onClick={() => {
                      setLabelFilter(prev => prev === e.id ? null : e.id);
                      setPage(1);
                    }}
                    title={`Filtrar: ${e.nombre.toUpperCase()}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      padding: "4px 10px",
                      borderRadius: "5px",
                      border: labelFilter === e.id ? `2px solid ${e.color}` : "2px solid transparent",
                      background: labelFilter === e.id ? `${e.color}26` : "transparent",
                      color: labelFilter === e.id ? "#1c1917" : "#525252",
                      fontWeight: labelFilter === e.id ? 700 : 400,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }}></span>
                    {/* Task 100: el nombre SIEMPRE en MAYÚSCULAS en pantalla
                        (también cubre etiquetas viejas guardadas en
                        minúsculas, ej: "viza liquida" → "VIZA LIQUIDA"). */}
                    {e.nombre.toUpperCase()}
                  </button>
                ))}
                {/* T123 (pedido del dueño): filtro #HASHTAG al lado derecho de
                    las etiquetas (después de VIZA LIQUIDA y las demás creadas)
                    — muestra SOLO los productos que tienen # cargado. El admin
                    ve también los vencidos: es su base de trabajo (la celda
                    roja de la columna #HASHTAG le avisa para renovar). */}
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "hashtag" ? "filtro-activo" : ""}`}
                  data-filtro="hashtag"
                  onClick={() => {
                    setLabelFilter(prev => prev === "hashtag" ? null : "hashtag");
                    setPage(1);
                  }}
                  title="Filtrar: SOLO productos con #HASHTAG"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: labelFilter === "hashtag" ? "2px solid #0d3d5e" : "2px solid transparent",
                    background: labelFilter === "hashtag" ? "rgba(21, 87, 137, 0.15)" : "transparent",
                    color: labelFilter === "hashtag" ? "#0d3d5e" : "#525252",
                    fontWeight: labelFilter === "hashtag" ? 700 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: "13px" }}>#</span>
                  HASHTAG
                </button>
              </div>
            </div>
          </div>

          {/* Tabla estilo Excel - edición directa */}
          {/* Estilos dinámicos de las filas con etiquetas CREADAS (Task 84):
              mismas reglas !important que las 4 fijas (globals.css), pero
              generadas al vuelo con el color de cada etiqueta. Solo pinta
              filas: no toca datos. */}
          {etiquetasCreadas.length > 0 && (
            <style>
              {etiquetasCreadas
                .map(
                  (e) => `
tr.fila-etiquetada-${e.id} td, tr.fila-etiquetada-${e.id} > td {
  background-color: ${e.color}26 !important;
  border-left: 5px solid ${e.color} !important;
}
tr.fila-etiquetada-${e.id}:hover td {
  background-color: ${e.color}4D !important;
}`
                )
                .join("\n")}
            </style>
          )}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm flex-1 min-h-0">
            <div className="overflow-auto h-full">
              <table className="admin-table border-collapse text-xs">
                <thead className="border-b border-stone-200 sticky top-0 z-30" style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                  <tr>
                    {/* Columna acciones — NO existe en MODO SOLO LECTURA (Task 78):
                        sin guardar, etiquetar ni borrar. */}
                    {!esLectura && (
                    <th className="sticky left-0 z-20 px-2 py-0.5 text-center font-bold border-r border-stone-200 min-w-[120px]" style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                      ACCIONES
                    </th>
                    )}
                    {/* SKU */}
                    <th className={`sticky ${esLectura ? "left-0" : "left-[120px]"} z-20 px-2 py-0.5 text-left font-bold border-r border-stone-200 min-w-[110px] w-[110px]`} style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                      <div className="flex items-center gap-1">
                        <span>COD</span>
                        {/* Flechita de orden NUMÉRICO por COD (pedido del usuario):
                            mayor a menor / menor a mayor. Misma flechita de las
                            columnas STOCK y DESCRIPCION. */}
                        <ColumnSortButton
                          dir={codSort}
                          label="COD"
                          onClick={() => {
                            setCodSort((prev) =>
                              prev === null ? "desc" : prev === "desc" ? "asc" : null
                            );
                            setNameSort(null);
                            setStockSort(null);
                            setPage(1);
                          }}
                        />
                      </div>
                    </th>
                    {COLUMNS.map((col) => {
                      const hasFilter =
                        !!columnFilters[col.key] && columnFilters[col.key].length > 0;
                      const isOpen = openFilterColumn === col.key;
                      // Columnas fijas (congeladas): mismo mecanismo sticky que
                      // ACCIONES y COD; sin entrada en FROZEN_COLUMNS queda
                      // exactamente como siempre. El encabezado SIEMPRE dorado
                      // (padrón); el fondo blanco de FROZEN_BLANCO aplica solo a
                      // las celdas del cuerpo de la tabla.
                      // Task 80: en MODO SOLO LECTURA las fijas arrancan pegadas
                      // al COD (sin los 120px de ACCIONES, que no existe aquí).
                      const frozenLeft = (esLectura ? frozenLeftByKeyLectura : frozenLeftByKey)[col.key];
                      const frozenWidth = frozenWidthByKey[col.key];
                      const esFija = frozenLeft !== undefined;
                      return (
                        <th
                          key={col.key}
                          className={`${esFija ? "sticky z-20" : "relative"} px-2 py-0.5 text-center font-bold border-r border-stone-100 whitespace-nowrap`}
                          style={{
                            backgroundColor: "#D9B86B",
                            ...(esFija
                              ? { left: frozenLeft, width: frozenWidth, minWidth: frozenWidth }
                              : {}),
                          }}
                        >
                          <div className="flex flex-col items-center">
                            {col.group && (
                              <span className="text-[9px] font-normal mb-0.5" style={{ color: "#1c1917" }}>
                                {col.group}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              <span>{col.label}</span>
                              {col.key === "stock" ? (
                                // STOCK: sin filtro por valor, solo flechita de ordenamiento
                                <ColumnSortButton
                                  dir={stockSort}
                                  label="STOCK"
                                  onClick={() => {
                                    setStockSort((prev) =>
                                      prev === null ? "desc" : prev === "desc" ? "asc" : null
                                    );
                                    setCodSort(null);
                                    setNameSort(null);
                                    setPage(1);
                                  }}
                                />
                              ) : col.key === "hashtag" ? (
                                // #HASHTAG: sin filtro por valor (la celda es un editor
                                // propio, no un dato filtrable de la base)
                                null
                              ) : col.key === "name" ? (
                                // DESCRIPCION: flechita de orden alfabético (pedido del
                                // usuario: A hacia abajo / Z hacia adelante) + su filtro
                                // de valores de siempre, los dos conviven
                                <>
                                  <ColumnSortButton
                                    dir={nameSort}
                                    label="DESCRIPCION"
                                    onClick={() => {
                                      setNameSort((prev) =>
                                        prev === null ? "desc" : prev === "desc" ? "asc" : null
                                      );
                                      setCodSort(null);
                                      setStockSort(null);
                                      setPage(1);
                                    }}
                                  />
                                  <FilterButton
                                    hasFilter={hasFilter}
                                    isOpen={isOpen}
                                    onClick={() =>
                                      setOpenFilterColumn(isOpen ? null : col.key)
                                    }
                                  />
                                </>
                              ) : (
                                <FilterButton
                                  hasFilter={hasFilter}
                                  isOpen={isOpen}
                                  onClick={() =>
                                    setOpenFilterColumn(isOpen ? null : col.key)
                                  }
                                />
                              )}
                            </div>
                          </div>
                          {isOpen && col.key !== "stock" && col.key !== "hashtag" && (
                            <FilterDropdown
                              colKey={col.key}
                              selected={columnFilters[col.key] || []}
                              onChange={(values) => {
                                setColumnFilters((prev) => {
                                  const next = { ...prev };
                                  if (values.length > 0) {
                                    next[col.key] = values;
                                  } else {
                                    delete next[col.key];
                                  }
                                  return next;
                                });
                                setPage(1);
                              }}
                              onClose={() => setOpenFilterColumn(null)}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loadingProducts ? (
                    <tr>
                      <td colSpan={COLUMNS.length + (esLectura ? 1 : 2)} className="text-center py-12 text-stone-400">
                        Cargando productos...
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + (esLectura ? 1 : 2)} className="text-center py-12 text-stone-400">
                        No se encontraron productos.
                      </td>
                    </tr>
                  ) : (
                    products.map((p, ri) => {
                      const form = getDisplayValues(p);
                      const isDirty = !!dirty[p.id];
                      return (
                        <ExcelRow
                          key={p.id}
                          product={p}
                          rowIndex={ri}
                          form={form}
                          isDirty={isDirty}
                          modoLectura={esLectura}
                          label={productLabels[p.id] || null}
                          etiquetasCreadas={etiquetasCreadas}
                          isLabelMenuOpen={openLabelMenu === p.id}
                          filaActiva={filaActivaId === p.id}
                          onTocarFila={() => setFilaActivaId(p.id)}
                          onToggleLabelMenu={() => {
                            // SOLO LECTURA (Task 79): el menú de etiquetas de
                            // color no se abre JAMÁS (defensa extra; el botón
                            // que lo dispara ni siquiera se renderiza aquí).
                            if (esLectura) return;
                            setOpenLabelMenu(openLabelMenu === p.id ? null : p.id);
                          }}
                          onSetLabel={async (color: string | null) => {
                            // Modo SOLO LECTURA (Task 78): la etiqueta de color
                            // tampoco se puede cambiar (el botón ya no existe).
                            if (esLectura) return;
                            // Actualización optimista: actualizar UI inmediatamente
                            setProductLabels(prev => {
                              const next = { ...prev };
                              if (color) next[p.id] = color;
                              else delete next[p.id];
                              return next;
                            });
                            setOpenLabelMenu(null);
                            // Persistir en BD vía API dedicada (NO toca otros campos)
                            try {
                              const res = await fetch(`/api/products/${p.id}/label`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ color }),
                              });
                              if (!res.ok) {
                                const errData = await res.json().catch(() => ({}));
                                toast.error(errData.error || "Error al guardar etiqueta");
                                // Revertir en caso de error
                                setProductLabels(prev => {
                                  const next = { ...prev };
                                  if (color) next[p.id] = color;
                                  else delete next[p.id];
                                  return next;
                                });
                              } else {
                                // Actualizar el producto en la lista con los datos nuevos
                                // (incluye ultimaEdicionAt y ultimaEdicionPor para el badge)
                                const data = await res.json();
                                if (data.product) {
                                  setProducts((ps) =>
                                    ps.map((prod) =>
                                      prod.id === p.id ? { ...prod, ...data.product } : prod
                                    )
                                  );
                                }
                              }
                            } catch (err) {
                              console.error("Error persistiendo etiqueta:", err);
                              toast.error("Error de red al guardar etiqueta");
                            }
                          }}
                          onChange={(key, value) => handleChange(p.id, key, value)}
                          onHashtagChange={(v) => handleHashtagChange(p.id, v)}
                          onSave={() => handleSave(p)}
                          onDelete={() => handleDelete(p)}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          {totalPages > 1 && !loadingProducts && (
            <div className="shrink-0 flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="h-10 px-4 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium text-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                ANTERIOR
              </button>
              <div className="flex items-center gap-1 flex-wrap justify-center max-w-full">
                {Array.from({ length: Math.min(totalPages, 9) }).map((_, i) => {
                  let p: number;
                  if (totalPages <= 9) p = i + 1;
                  else if (page <= 5) p = i + 1;
                  else if (page >= totalPages - 4) p = totalPages - 8 + i;
                  else p = page - 4 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-10 min-w-10 px-2 rounded-xl font-semibold text-sm transition-colors ${
                        p === page
                          ? "bg-stone-900 text-white"
                          : "bg-white border border-stone-200 hover:bg-stone-50 text-stone-700"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="h-10 px-4 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium text-sm"
              >
                SIGUIENTE
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: IMPORTAR EXCEL (planilla de inventario)
          - Solo visible para supremo_admin (botón está condicionado)
          - Muestra preview con cantidad de productos nuevos + actualizados
          - Botón CONFIRMAR aplica los cambios
          ════════════════════════════════════════════════════════════════ */}
      {importOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            if (!importLoading && !importApplying) setImportOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "#e7e5e4", background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Importar planilla de inventario
              </h3>
              <button
                onClick={() => {
                  if (!importLoading && !importApplying) setImportOpen(false);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={importLoading || importApplying}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body del modal */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {importLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-[#155789] animate-spin"></div>
                  <p className="text-sm text-stone-600 font-medium">Procesando Excel…</p>
                </div>
              )}

              {!importLoading && importResult && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 border"
                    style={{ background: "#f0fdf4", borderColor: "#86efac" }}
                  >
                    <p className="text-base font-bold text-emerald-800 mb-2">
                      ✓ Importación completada
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3 border border-emerald-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Productos nuevos creados</p>
                        <p className="text-2xl font-black text-emerald-700">{importResult.creados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Costo + stock actualizados</p>
                        <p className="text-2xl font-black text-blue-700">{importResult.actualizados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-sky-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Con costo nuevo aplicado</p>
                        <p className="text-2xl font-black text-sky-700">{importResult.conCostoActualizado ?? 0}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-sky-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Con margen automática</p>
                        <p className="text-2xl font-black text-sky-700">{importResult.margenesAutomaticas ?? 0}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-violet-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Con SAFRA automática</p>
                        <p className="text-2xl font-black text-violet-700">{importResult.conSafraAutomatica ?? 0}</p>
                      </div>
                    </div>
                  </div>
                  {importResult.errores.length > 0 && (
                    <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                      <p className="text-sm font-bold text-amber-800 mb-2">
                        ⚠ Errores ({importResult.errores.length})
                      </p>
                      <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-auto">
                        {importResult.errores.slice(0, 50).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                        {importResult.errores.length > 50 && (
                          <li className="italic">…y {importResult.errores.length - 50} más</li>
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="text-xs text-stone-500 italic">
                    La tabla de productos se va a recargar automáticamente para mostrar los cambios.
                  </div>
                </div>
              )}

              {!importLoading && !importResult && importPreview && (
                <div className="space-y-4">
                  {/* Resumen */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3 border border-emerald-200 bg-emerald-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Productos nuevos</p>
                      <p className="text-3xl font-black text-emerald-700">{importPreview.nuevosCount}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Se van a CREAR con descripción, stock, costo, MÁRGENES AUTOMÁTICAS y SAFRA automática (promedio de su sub-grupo)</p>
                    </div>
                    <div className="rounded-lg p-3 border border-blue-200 bg-blue-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Costo + stock actualizados</p>
                      <p className="text-3xl font-black text-blue-700">{importPreview.actualizadosCount}</p>
                      <p className="text-[10px] text-stone-500 mt-1">SOLO se tocan COSTO GS y STOCK; márgenes, precios, descripciones y todo lo editado queda INTACTO</p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-600 bg-stone-50 rounded-lg p-3 border border-stone-200">
                    <strong>Resumen del Excel:</strong> {importPreview.totalFilas} filas procesadas → {importPreview.codigosUnicos} códigos únicos (las filas duplicadas con el mismo código se sumaron en stock).
                  </div>

                  {/* Lista de productos nuevos (muestra hasta 8) */}
                  {importPreview.nuevos.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        Productos nuevos a crear con margen + SAFRA automáticas ({importPreview.nuevos.length})
                      </p>
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">SKU</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Stock</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Costo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Margen auto.</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">SAFRA</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.nuevos.slice(0, 8).map((p, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{p.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700">{p.name || "—"}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">{p.stock}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-700">
                                  {p.costProd != null ? p.costProd.toLocaleString("es-PY") : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-sky-700" title={p.margenFuente || undefined}>
                                  {p.margenAuto != null ? `${(p.margenAuto * 100).toFixed(2)}%` : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-violet-700">
                                  {p.safraAuto != null ? `${p.safraAuto}%` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {importPreview.nuevos.length > 8 && (
                        <p className="text-[10px] text-stone-500 italic mt-1">
                          …y {importPreview.nuevos.length - 8} productos más (no se muestran para no recargar la vista)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Lista de productos actualizados (muestra hasta 8) */}
                  {importPreview.actualizados.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        Costo + stock a actualizar ({importPreview.actualizados.length})
                      </p>
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">SKU</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción actual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Stock actual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Stock nuevo</th>
                              <th className="text-center px-2 py-1.5 font-semibold text-stone-600">Cambio</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Costo GS actual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Costo GS nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.actualizados.slice(0, 8).map((p, i) => {
                              const diff = p.stockNuevo - p.stockActual;
                              const costoCambia = p.costoNuevo != null && p.costoActual != null && p.costoNuevo !== p.costoActual;
                              return (
                                <tr key={i} className="border-t border-stone-100">
                                  <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{p.sku}</td>
                                  <td className="px-2 py-1.5 text-stone-700">{p.nameActual || "—"}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">{p.stockActual}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-stone-800 font-semibold">{p.stockNuevo}</td>
                                  <td className="px-2 py-1.5 text-center tabular-nums font-bold">
                                    <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-stone-500"}>
                                      {diff > 0 ? "+" : ""}{diff}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">
                                    {p.costoActual != null ? p.costoActual.toLocaleString("es-PY") : "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                                    {p.costoProtegido ? (
                                      <span
                                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                                        style={{ backgroundColor: "#FFD700", border: "1px solid #b45309" }}
                                        title="Costo editado a mano y guardado: la importación NO lo pisa (solo actualiza el stock)"
                                      >
                                        PROTEGIDO
                                      </span>
                                    ) : (
                                      <span className={costoCambia ? "text-sky-700" : "text-stone-500"}>
                                        {p.costoNuevo != null ? p.costoNuevo.toLocaleString("es-PY") : "sin costo nuevo"}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {importPreview.actualizados.length > 8 && (
                        <p className="text-[10px] text-stone-500 italic mt-1">
                          …y {importPreview.actualizados.length - 8} productos más
                        </p>
                      )}
                    </div>
                  )}

                  {/* Errores del preview */}
                  {importPreview.errores.length > 0 && (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800 mb-1">⚠ Advertencias</p>
                      <ul className="text-[10px] text-amber-700 space-y-0.5">
                        {importPreview.errores.slice(0, 10).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!importLoading && !importResult && !importPreview && (
                <div className="text-center py-12 text-stone-500 text-sm">
                  No se pudo procesar el archivo. Cerrá y probá de nuevo.
                </div>
              )}
            </div>

            {/* Footer del modal con botones */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "#e7e5e4" }}>
              {!importResult && (
                <>
                  <button
                    onClick={() => setImportOpen(false)}
                    className="h-9 px-4 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
                    disabled={importLoading || importApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (!importPreview) return;
                      setImportApplying(true);
                      try {
                        const res = await fetch("/api/products/import-stock/apply", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            nuevos: importPreview.nuevos,
                            actualizados: importPreview.actualizados,
                            // Task 98: reparto del saldo por SUCURSAL que vino
                            // en la planilla (CENTRAL = depósito central). El
                            // apply lo guarda en la tabla aparte StockSucursal
                            // para el filtro por sucursal del Stock General.
                            stockPorSucursal: (importPreview as any).stockPorSucursal || {},
                          }),
                        });
                        // Leer SIEMPRE como texto primero, y después intentar
                        // parsear como JSON. Si el servidor respondió con HTML
                        // (timeout 504 de Vercel, error 500, etc.) vamos a
                        // detectarlo y mostrar un mensaje claro en vez de
                        // "JSON.parse: Unexpected character at line 1 column 1".
                        const text = await res.text();
                        let data: any;
                        try {
                          data = text ? JSON.parse(text) : null;
                        } catch (jsonErr) {
                          // El cuerpo no es JSON — probablemente página HTML de error/timeout
                          const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
                          throw new Error(
                            `El servidor respondió con estado ${res.status} pero no devolvió JSON. ` +
                            `Probablemente timeout (muchos productos). ` +
                            `Primeros caracteres: "${preview || "(respuesta vacía)"}". ` +
                            `Si la planilla es muy grande, intentá partirla en archivos más chicos.`
                          );
                        }
                        if (!res.ok || data?.error) {
                          throw new Error(data?.error || `Error HTTP ${res.status}`);
                        }
                        setImportResult(data);
                        toast.success(
                          `Importación completa: ${data.creados} nuevos, ${data.actualizados} actualizados`
                        );
                        // Recargar la tabla para mostrar los cambios
                        fetchProducts();
                      } catch (error) {
                        console.error("Error apply:", error);
                        toast.error(`Error: ${(error as Error).message}`, { duration: 8000 });
                      } finally {
                        setImportApplying(false);
                      }
                    }}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                    disabled={
                      importLoading ||
                      importApplying ||
                      !importPreview ||
                      (importPreview?.nuevosCount === 0 && importPreview?.actualizadosCount === 0)
                    }
                  >
                    {importApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Aplicando…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        CONFIRMAR IMPORTACIÓN
                      </>
                    )}
                  </button>
                </>
              )}
              {importResult && (
                <button
                  onClick={() => setImportOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL: DELETE ALL (borrar TODOS los productos)
          - Botón rojo, solo supremo_admin
          - Pide doble confirmación (checkbox + botón)
          - Operación IRREVERSIBLE
          ════════════════════════════════════════════════════════════════ */}
      {deleteAllOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            if (!deleteAllLoading && !deleteAllApplying) setDeleteAllOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header rojo */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "#fecaca", background: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)" }}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                BORRAR TODOS los productos
              </h3>
              <button
                onClick={() => {
                  if (!deleteAllLoading && !deleteAllApplying) setDeleteAllOpen(false);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={deleteAllLoading || deleteAllApplying}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {deleteAllLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-red-600 animate-spin"></div>
                  <p className="text-sm text-stone-600 font-medium">Contando productos…</p>
                </div>
              )}

              {!deleteAllLoading && deleteAllResult && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 border"
                    style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
                  >
                    <p className="text-base font-bold text-red-800 mb-2">
                      ✓ Borrado completado
                    </p>
                    <p className="text-sm text-red-700">
                      Se borraron <strong>{deleteAllResult.borrados}</strong> productos de la base.
                    </p>
                    {(deleteAllResult.conservados ?? 0) > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                        ⚠ Se conservaron <strong>{deleteAllResult.conservados}</strong> productos porque
                        están dentro de presupuestos guardados (para no perder ese historial).
                      </p>
                    )}
                    <p className="text-xs text-stone-500 italic mt-2">
                      {(deleteAllResult.conservados ?? 0) > 0
                        ? "Podés re-importar usando IMPORTAR EXCEL."
                        : "La tabla está vacía ahora. Podés re-importar usando IMPORTAR EXCEL."}
                    </p>
                  </div>
                </div>
              )}

              {!deleteAllLoading && !deleteAllResult && deleteAllPreview && (
                <div className="space-y-4">
                  {/* Aviso grande */}
                  <div className="rounded-xl p-4 border-2 border-red-300 bg-red-50">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-base font-bold text-red-800 mb-1">¡OPERACIÓN IRREVERSIBLE!</p>
                        <p className="text-sm text-red-700">
                          Vas a borrar <strong>{deleteAllPreview.total}</strong> productos de la base.
                          Una vez borrados, no se pueden recuperar (a menos que tengas un backup Excel).
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sample */}
                  {deleteAllPreview.sample.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">Primeros 5 productos que se van a borrar:</p>
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">SKU</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deleteAllPreview.sample.map((p, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{p.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700">{p.name}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">{p.stock}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Checkbox doble confirmación */}
                  <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-stone-300 hover:border-red-400 transition-colors cursor-pointer bg-white">
                    <input
                      type="checkbox"
                      checked={deleteAllConfirmCheck}
                      onChange={(e) => setDeleteAllConfirmCheck(e.target.checked)}
                      disabled={deleteAllApplying}
                      className="h-5 w-5 mt-0.5 text-red-600 rounded border-stone-400"
                    />
                    <span className="text-sm text-stone-800 font-semibold">
                      Sí, entiendo que es IRREVERSIBLE. Quiero borrar TODOS los {deleteAllPreview.total} productos de la base.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "#e7e5e4" }}>
              {!deleteAllResult && (
                <>
                  <button
                    onClick={() => setDeleteAllOpen(false)}
                    className="h-9 px-4 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
                    disabled={deleteAllLoading || deleteAllApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (!deleteAllPreview) return;
                      if (!deleteAllConfirmCheck) return;
                      setDeleteAllApplying(true);
                      try {
                        const res = await fetch("/api/products/cleanup-all/apply", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirm: true }),
                        });
                        const text = await res.text();
                        let data: any;
                        try {
                          data = text ? JSON.parse(text) : null;
                        } catch {
                          throw new Error(`Respuesta inválida del servidor (estado ${res.status})`);
                        }
                        if (!res.ok || data?.error) {
                          throw new Error(data?.error || `Error HTTP ${res.status}`);
                        }
                        setDeleteAllResult(data);
                        if (data.conservados > 0) {
                          toast.warning(`Se borraron ${data.borrados} productos. ${data.conservados} se conservaron porque están en presupuestos guardados.`, { duration: 9000 });
                        } else {
                          toast.success(`Borrado completo: ${data.borrados} productos eliminados`);
                        }
                        fetchProducts();
                      } catch (error) {
                        console.error("Error delete-all apply:", error);
                        toast.error(`Error: ${(error as Error).message}`);
                      } finally {
                        setDeleteAllApplying(false);
                      }
                    }}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)" }}
                    disabled={
                      deleteAllLoading ||
                      deleteAllApplying ||
                      !deleteAllPreview ||
                      !deleteAllConfirmCheck
                    }
                  >
                    {deleteAllApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Borrando…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        SÍ, BORRAR TODO ({deleteAllPreview?.total || 0})
                      </>
                    )}
                  </button>
                </>
              )}
              {deleteAllResult && (
                <button
                  onClick={() => setDeleteAllOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL CRM · RANKING DE PRESUPUESTOS POR USUARIO
          - Ranking GENERAL y POR SUCURSAL (cantidad de presupuestos emitidos)
          - La sucursal de cada usuario se asigna/cambia con el select
          - SOLO LECTURA de presupuestos/usuarios: nunca edita nada del sistema
          ════════════════════════════════════════════════════════════════ */}
      {crmOpen && (() => {
        // Filtros del CRM: GENERAL + una pill por sucursal. (Los filtros
        // "CENTRAL/KATUETE" y "SIN SUCURSAL" fueron eliminados a pedido del
        // admin: las sucursales válidas vienen de la API y ya no incluyen
        // CENTRAL/KATUETE; quienes no tienen sucursal solo se ven en GENERAL.)
        const filtros = ["GENERAL", ...crmSucursales];
        // Valor de cada fila según el PLAN elegido (Task 78): con TODOS es el
        // total de siempre; con un plan, la cantidad de ESE plan.
        const totalDeFila = (f: CrmFila): number =>
          crmPlan === "TODOS"
            ? f.total
            : (f.porPlan?.[crmPlan as keyof NonNullable<CrmFila["porPlan"]>] ?? 0);
        const filas = [...crmRanking]
          .filter((f) => crmFiltro === "GENERAL" || f.sucursal === crmFiltro)
          .filter((f) => crmPlan === "TODOS" || totalDeFila(f) > 0)
          .sort(
            (a, b) =>
              totalDeFila(b) - totalDeFila(a) ||
              b.total - a.total ||
              a.name.localeCompare(b.name, "es")
          );
        const sumaVista = filas.reduce((acc, f) => acc + totalDeFila(f), 0);
        const aprobadasVista = filas.reduce((acc, f) => acc + f.aprobadas, 0);
        // Total del encabezado: con TODOS es el general de siempre; con un
        // plan, la suma de ese plan sobre TODOS los usuarios (sin filtro de
        // sucursal), igual criterio que crmTotalGeneral.
        const totalHeader =
          crmPlan === "TODOS"
            ? crmTotalGeneral
            : crmRanking.reduce((acc, f) => acc + totalDeFila(f), 0);
        const medalStyle = (pos: number): { bg: string; fg: string } | null =>
          pos === 1
            ? { bg: "#FFD700", fg: "#6b5200" }
            : pos === 2
            ? { bg: "#C0C0C0", fg: "#3f3f3f" }
            : pos === 3
            ? { bg: "#CD7F32", fg: "#fff7ed" }
            : null;
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => {
              if (!crmGuardandoSuc) setCrmOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header azul */}
              <div
                className="px-6 py-4 flex items-center justify-between border-b shrink-0"
                style={{ borderColor: "#e7d9a8", background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
              >
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  CRM · RANKING DE PRESUPUESTOS
                </h3>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold">
                    TOTAL EMITIDOS: {totalHeader}{crmPlan !== "TODOS" ? ` · ${crmPlan}` : ""}
                  </span>
                  <button
                    onClick={() => setCrmOpen(false)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="Cerrar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Filtros: GENERAL + una pill por sucursal */}
              <div className="px-6 py-3 flex flex-wrap gap-1.5 border-b border-stone-200 shrink-0">
                {filtros.map((s) => {
                  const activo = crmFiltro === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setCrmFiltro(s)}
                      className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                        activo
                          ? "text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                      style={activo ? { background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" } : undefined}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* Filtro por TIPO DE PLAN (Task 78; Task 111 agrega CONTADO):
                  TODOS / CUOTA / CONTADO / MAYORISTA / SAFRA / CHEQUE. Con un
                  plan elegido, el ranking cuenta solo los presupuestos de ese
                  plan (CUOTA = con cuotas; CONTADO = emitido solo al
                  contado, sin cuotas — pedido del dueño). */}
              <div className="px-6 py-2.5 flex flex-wrap items-center gap-1.5 border-b border-stone-200 shrink-0 bg-stone-50">
                <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mr-1">
                  Tipo de PLAN:
                </span>
                {CRM_PLANES.map((pl) => {
                  const activo = crmPlan === pl;
                  return (
                    <button
                      key={pl}
                      onClick={() => setCrmPlan(pl)}
                      className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                        activo
                          ? "text-white"
                          : "bg-white text-stone-600 hover:bg-stone-200 border border-stone-200"
                      }`}
                      style={activo ? { background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)" } : undefined}
                    >
                      {pl}
                    </button>
                  );
                })}
              </div>

              {/* Tabla del ranking */}
              <div className="flex-1 overflow-auto">
                {crmLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-[#155789] animate-spin"></div>
                    <p className="text-sm text-stone-600 font-medium">Calculando ranking…</p>
                  </div>
                ) : filas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
                    <BarChart3 className="h-10 w-10 text-stone-300" />
                    <p className="text-sm font-semibold text-stone-600">
                      Sin datos para {crmFiltro === "GENERAL" ? "el ranking general" : crmFiltro}
                    </p>
                    <p className="text-xs text-stone-400 max-w-sm">
                      El ranking cuenta los presupuestos guardados por cada usuario. Cuando se emitan presupuestos aparecen acá solos.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-stone-100 border-b border-stone-200">
                      <tr className="text-[11px] uppercase tracking-wide text-stone-500">
                        <th className="px-3 py-2 text-left w-12">Pos</th>
                        <th className="px-3 py-2 text-left">Usuario</th>
                        <th className="px-3 py-2 text-left w-[220px]">Sucursal</th>
                        <th className="px-3 py-2 text-center w-24">Emitidos</th>
                        <th className="px-3 py-2 text-center w-24">Aprobadas</th>
                        <th className="px-3 py-2 text-center w-20">Último</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => {
                        const pos = i + 1;
                        const medal = pos <= 3 ? medalStyle(pos) : null;
                        return (
                          <tr key={f.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                            <td className="px-3 py-2">
                              {medal ? (
                                <span
                                  className="inline-flex items-center justify-center h-6 w-8 rounded-lg text-xs font-bold shadow-sm"
                                  style={{ background: medal.bg, color: medal.fg }}
                                  title={pos === 1 ? "1° del ranking" : pos === 2 ? "2° del ranking" : "3° del ranking"}
                                >
                                  {pos}°
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center h-6 w-8 text-xs font-semibold text-stone-400">
                                  {pos}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-stone-800 truncate flex items-center gap-1.5">
                                {f.name}
                                {!f.active && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-500 shrink-0">
                                    INACTIVO
                                  </span>
                                )}
                                {f.role === "supremo_admin" && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0d3d5e] text-white shrink-0">
                                    SUPREMO
                                  </span>
                                )}
                                {f.role === "admin" && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1e6ba8] text-white shrink-0">
                                    ADMIN
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-stone-400 truncate">{f.email}</div>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={f.sucursal === "SIN SUCURSAL" ? "" : f.sucursal}
                                onChange={(e) => guardarSucursalCrm(f.email, e.target.value)}
                                disabled={esLectura || crmGuardandoSuc === f.email}
                                className="w-full h-7 px-2 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-700 focus:border-[#1e6ba8] focus:ring-2 focus:ring-blue-100 outline-none disabled:opacity-50"
                                title={esLectura ? "SOLO VISUALIZACIÓN: no puede asignar sucursales" : "Asignar sucursal del usuario (para el ranking por sucursal)"}
                              >
                                <option value="">— NINGUNA —</option>
                                {crmSucursales.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              {crmGuardandoSuc === f.email && (
                                <span className="ml-1 text-[10px] text-stone-400">guardando…</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-base font-extrabold text-stone-800">{totalDeFila(f)}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-sm font-bold ${f.aprobadas > 0 ? "text-green-700" : "text-stone-300"}`}>
                                {f.aprobadas}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-stone-500">
                              {fmtFechaCortaCrm(f.ultimo)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pie: resumen de la vista actual */}
              <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                <span className="font-bold text-stone-700">
                  {crmFiltro === "GENERAL" ? "GENERAL (todas las sucursales)" : crmFiltro}
                  {crmPlan !== "TODOS" ? ` · Plan ${crmPlan}` : ""}
                </span>
                <span>
                  {sumaVista} presupuesto{sumaVista !== 1 ? "s" : ""} emitido{sumaVista !== 1 ? "s" : ""}
                  {" · "}
                  {aprobadasVista} aprobada{aprobadasVista !== 1 ? "s" : ""}
                  {" · "}
                  {filas.length} usuario{filas.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

const ExcelRow = memo(function ExcelRow({
  product,
  rowIndex,
  form,
  isDirty,
  modoLectura,
  label,
  etiquetasCreadas,
  isLabelMenuOpen,
  filaActiva,
  onTocarFila,
  onToggleLabelMenu,
  onSetLabel,
  onHashtagChange,
  onChange,
  onSave,
  onDelete,
}: {
  product: Product;
  rowIndex: number;
  form: any;
  isDirty: boolean;
  // MODO SOLO LECTURA (Task 78): sin columna ACCIONES y celdas readOnly.
  modoLectura?: boolean;
  label: string | null;
  // Etiquetas CREADAS por el supremo (Task 84): aparecen en el menú de
  // etiquetado y pintan la fila con su propio color.
  etiquetasCreadas: { id: string; nombre: string; color: string }[];
  isLabelMenuOpen: boolean;
  filaActiva: boolean;
  onTocarFila: () => void;
  onToggleLabelMenu: () => void;
  onSetLabel: (color: string | null) => void;
  onHashtagChange: (v: { valor: number | null; fecha: string | null }) => void;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const labelStyles: Record<string, { bg: string; border: string; hover: string; cellClass: string }> = {
    verde: { bg: "#A8E6A3", border: "#28A745", hover: "#81D87C", cellClass: "fila-etiquetada-verde" },
    azul: { bg: "#90CAF9", border: "#007BFF", hover: "#64B5F6", cellClass: "fila-etiquetada-azul" },
    dorado: { bg: "#FFE082", border: "#FFC107", hover: "#FFD54F", cellClass: "fila-etiquetada-dorado" },
    rojo: { bg: "#EF9A9A", border: "#DC3545", hover: "#E57373", cellClass: "fila-etiquetada-rojo" },
  };
  // Nombres de las 4 fijas SIEMPRE EN MAYÚSCULAS (Task 100, pedido del
  // dueño: "Estos nonbres de Etiquetas deben ser siempre en MAYUSCULAS").
  const labelColors = [
    { id: "verde", color: "#28A745", label: "SELECCIONADO" },
    { id: "azul", color: "#007BFF", label: "PARA PEDIDO" },
    { id: "dorado", color: "#FFC107", label: "DESCONTINUADO" },
    { id: "rojo", color: "#DC3545", label: "QUEMA STOCK" },
  ];
  // Etiquetas CREADAS (Task 84): mismas bolitas del menú, con su nombre.
  const coloresCreadas = etiquetasCreadas.map((e) => ({
    id: e.id,
    color: e.color,
    label: e.nombre,
  }));
  // Estilo de la fila: fija (map de arriba) o creada (color propio de la
  // etiqueta + clase dinámica inyectada por el panel). Las fijas NUNCA
  // cambian; las creadas solo agregan — cero regresión.
  const etiquetaCreada = label ? etiquetasCreadas.find((e) => e.id === label) : undefined;
  const currentStyle = label
    ? labelStyles[label] ?? {
        bg: `${etiquetaCreada?.color ?? "#d6d3d1"}26`,
        border: etiquetaCreada?.color ?? "#d6d3d1",
        hover: `${etiquetaCreada?.color ?? "#d6d3d1"}4D`,
        cellClass: `fila-etiquetada-${label}`,
      }
    : null;

  // ─── COSTOS EDITADOS POR EL ADMIN ───
  // Las celdas de costo que el admin editó a mano y guardó se pintan de
  // DORADO VIBRANTE. product.costosEditados trae las keys guardadas en la BD.
  const costosEditadosSet = new Set<string>(
    Array.isArray(product.costosEditados) ? product.costosEditados : []
  );

  return (
    <>
    <tr
      onClick={onTocarFila}
      onFocusCapture={onTocarFila}
      className={`border-b border-stone-100 ${filaActiva ? "fila-activa" : ""} ${currentStyle ? currentStyle.cellClass : ""}`}
      style={{ borderBottom: "1px solid #f1f5f9" }}
    >
      {/* Acciones - sticky — NO existe en MODO SOLO LECTURA (Task 78):
          sin guardar, etiquetar ni borrar. */}
      {!modoLectura && (
      <td className="sticky left-0 z-10 px-2 py-0.5 text-center border-r border-stone-100 bg-[#D9B86B]">
        <div className="flex flex-row items-center justify-center gap-0.5 relative">
          <button
            id={`save-btn-${product.id}`}
            onClick={onSave}
            disabled={!isDirty}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
              isDirty
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            }`}
            title={isDirty ? "Guardar cambios" : "Sin cambios"}
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          {/* Boton Etiquetar */}
          <button
            id={`label-btn-${product.id}`}
            onClick={onToggleLabelMenu}
            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
            style={label ? { backgroundColor: currentStyle?.border ?? "#78716c", color: "white" } : undefined}
            title="Etiquetar producto"
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 flex items-center justify-center transition-colors"
            title="Eliminar producto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      )}
      {/* SKU - sticky - con badge de última edición encima (en MODO SOLO
          LECTURA ocupa el left-0 porque no existe la columna ACCIONES) */}
      <td className={`sticky ${modoLectura ? "left-0" : "left-[120px]"} z-10 px-2 py-0.5 font-mono text-[#1c1917] font-semibold border-r border-stone-100 bg-[#D9B86B] align-top w-[110px]`}>
        {/* Badge de última edición manual del admin */}
        {product.ultimaEdicionAt && (() => {
          const d = new Date(product.ultimaEdicionAt);
          // Formatear fecha DD/MM/AAAA HH:MM (horario local del usuario)
          const pad = (n: number) => String(n).padStart(2, "0");
          const fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
          const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const editor = product.ultimaEdicionPor || "admin";
          return (
            <div
              title={`Editado por ${editor} el ${fecha} a las ${hora}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "9px",
                fontWeight: 500,
                color: "#9a3412",
                backgroundColor: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: "4px",
                padding: "1px 4px",
                marginBottom: "3px",
                lineHeight: "1.2",
                whiteSpace: "nowrap",
              }}
            >
              <Pencil style={{ width: "9px", height: "9px", flexShrink: 0 }} />
              <span>{fecha} {hora}</span>
            </div>
          );
        })()}
        <div style={{ fontSize: "11px" }} className="truncate max-w-[94px]">{product.sku}</div>
      </td>
      {/* Todas las columnas */}
      {COLUMNS.map((col, ci) => (
        <Cell
          key={col.key}
          col={col}
          value={form[col.key]}
          rowIndex={rowIndex}
          colIndex={ci}
          costoEditado={costosEditadosSet.has(col.key)}
          hashtag={product.hashtag ?? null}
          modoLectura={modoLectura}
          onHashtagChange={onHashtagChange}
          onChange={(v) => onChange(col.key, v)}
        />
      ))}
    </tr>
    {/* Menu de bolitas de colores - portal al body, al lado derecho del boton Guardar */}
    {isLabelMenuOpen && typeof document !== "undefined" && createPortal(
      (() => {
        const btn = document.getElementById(`save-btn-${product.id}`);
        const rect = btn?.getBoundingClientRect();
        if (!rect) return null;
        // Aparece a la DERECHA del boton Guardar, expandiendo hacia abajo
        const top = rect.top;
        const left = rect.right + 6;
        return (
          <>
            {/* Overlay invisible para cerrar al hacer click fuera */}
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99997,
                background: "transparent",
              }}
              onClick={() => onToggleLabelMenu()}
            />
            <div
              style={{
                position: "fixed",
                top: `${top}px`,
                left: `${left}px`,
                zIndex: 99998,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "6px",
                background: "white",
                borderRadius: "9999px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                border: "1px solid #e7e5e4",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {[...labelColors, ...coloresCreadas].map((lc) => (
                <button
                  key={lc.id}
                  onClick={() => onSetLabel(lc.id)}
                  title={lc.label}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "9999px",
                    backgroundColor: lc.color,
                    border: label === lc.id ? "3px solid #1c1917" : "2px solid white",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                    cursor: "pointer",
                    padding: 0,
                    transition: "transform 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.18)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
              {label && (
                <button
                  onClick={() => onSetLabel(null)}
                  title="Quitar etiqueta"
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "9999px",
                    backgroundColor: "white",
                    border: "2px solid #a8a29e",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    color: "#78716c",
                    fontWeight: "bold",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </>
        );
      })(),
      document.body
    )}
    </>
  );
});

// ===== Navegacion tipo Excel (mover el foco entre celdas con el teclado) =====
// Cada input lleva data-ri (indice de fila en la pagina) y data-ci (indice de
// columna en COLUMNS). Enter o ↓ baja una fila, ↑ sube; → / ← pasan a la celda
// siguiente/anterior (saltando columnas calculadas sin input) cuando el cursor
// de texto esta en el borde (o la celda esta vacia), para no pelear con la
// edicion normal del texto.
function focusCellInput(ri: number, ci: number): boolean {
  if (ri < 0 || ci < 0 || ci >= COLUMNS.length) return false;
  const el = document.querySelector<HTMLInputElement>(
    `input[data-ri="${ri}"][data-ci="${ci}"]`
  );
  if (!el) return false;
  el.focus();
  if (el.dataset.text === "1") {
    // Texto: dejar el cursor al final (nunca borra lo escrito)
    const len = el.value.length;
    el.setSelectionRange(len, len);
  } else {
    // Numeros/porcentajes: seleccionar todo (escribir reemplaza, como Excel)
    el.select();
  }
  return true;
}

function moveCellHorizontal(ri: number, ci: number, dir: 1 | -1) {
  let next = ci + dir;
  while (next >= 0 && next < COLUMNS.length) {
    if (focusCellInput(ri, next)) return;
    next += dir;
  }
}

function handleCellKeyDown(
  e: { key: string; currentTarget: HTMLInputElement; preventDefault: () => void },
  ri: number,
  ci: number
) {
  const key = e.key;
  const input = e.currentTarget;
  const esTexto = input.dataset.text === "1";
  const vacio = input.value.length === 0;

  // Enter o flecha para abajo: fila siguiente (misma columna)
  if (key === "Enter" || key === "ArrowDown") {
    e.preventDefault();
    focusCellInput(ri + 1, ci);
    return;
  }
  // Flecha para arriba: fila anterior (misma columna)
  if (key === "ArrowUp") {
    e.preventDefault();
    focusCellInput(ri - 1, ci);
    return;
  }
  // Flechas laterales: solo si el cursor de texto esta en el borde
  // (o la celda esta vacia); en inputs de numero solo con la celda vacia,
  // para no estorbar la correccion del numero.
  if (key === "ArrowRight") {
    const alFinal = esTexto
      ? (input.selectionStart ?? input.value.length) === input.value.length &&
        (input.selectionEnd ?? input.value.length) === input.value.length
      : vacio;
    if (alFinal) {
      e.preventDefault();
      moveCellHorizontal(ri, ci, 1);
    }
    return;
  }
  if (key === "ArrowLeft") {
    const alInicio = esTexto
      ? (input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0
      : vacio;
    if (alInicio) {
      e.preventDefault();
      moveCellHorizontal(ri, ci, -1);
    }
    return;
  }
}

const Cell = memo(function Cell({
  col,
  value,
  rowIndex,
  colIndex,
  costoEditado,
  hashtag,
  modoLectura,
  onHashtagChange,
  onChange,
}: {
  col: ColDef;
  value: any;
  rowIndex: number;
  colIndex: number;
  costoEditado?: boolean;
  hashtag?: { valor: number | null; fecha: string | null } | null;
  // MODO SOLO LECTURA (Task 78): las celdas NO se pueden editar (readOnly).
  modoLectura?: boolean;
  onHashtagChange?: (v: { valor: number | null; fecha: string | null }) => void;
  onChange: (v: string) => void;
}) {
  // DESCRIPCION (col "name"): celda expandible. La flechita alterna entre el
  // input de una línea y un textarea que muestra TODO el texto con salto de
  // línea (sigue siendo editable, como el resto de la tabla).
  const isDesc = col.key === "name";
  const [descExpanded, setDescExpanded] = useState(false);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (isDesc && descExpanded && descRef.current) {
      descRef.current.style.height = "auto";
      descRef.current.style.height = `${descRef.current.scrollHeight}px`;
    }
  }, [isDesc, descExpanded, value]);

  // #HASHTAG (col especial): dos cuadritos — VALOR en Gs + CALENDARIO de
  // validez (input date). La celda NO usa el flujo dirty/PUT: cada cambio
  // se guarda solo vía PATCH /api/products/[id]/hashtag con debounce
  // (lo maneja el padre), igual que la etiqueta de color. Si el producto
  // tiene hashtag, el vendedor lo ve al buscar: "# 100.000 GS valido
  // hasta 30/11/2026". (Va DESPUÉS de los hooks de arriba: no se puede
  // hacer return temprano antes de llamarlos.)
  if (col.key === "hashtag") {
    const h = hashtag ?? { valor: null as number | null, fecha: null as string | null };
    // Task 95 (pedido del dueño): la celda del # va en ROJO cuando la fecha
    // de validez vence HOY o ya venció. Es un aviso DENTRO DE LA BASE para
    // que el admin la renueve o la limpie; mientras esté vencida el # ya no
    // se le muestra a los vendedores (el valor del # es su premio).
    const celdaRoja = hashtagCeldaRoja(h.fecha);
    return (
      <td
        title={
          celdaRoja
            ? h.fecha
              ? `Este # ${h.fecha === hoyParaguay() ? "VENCE HOY" : "VENCIO"} (${h.fecha.split("-").reverse().join("/")}): ya no sale para los vendedores. Renueve la fecha o limpie el valor.`
              : "Este # esta vencido: ya no sale para los vendedores."
            : undefined
        }
        className={`px-1 py-0 border-r border-stone-50 ${celdaRoja ? "bg-red-200" : "bg-white"}`}
      >
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={h.valor ?? ""}
            placeholder="Gs"
            title="#HASHTAG: valor en Gs (ej: 100000)"
            readOnly={modoLectura}
            onChange={(e) =>
              onHashtagChange?.({
                valor: e.target.value === "" ? null : Number(e.target.value),
                fecha: h.fecha ?? null,
              })
            }
            className={`w-[78px] h-6 px-1 rounded border outline-none text-xs tabular-nums text-right ${
              celdaRoja
                ? "border-transparent bg-transparent text-red-800 font-semibold"
                : modoLectura
                ? "border-transparent bg-white text-stone-700 cursor-default"
                : "border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100"
            }`}
          />
          <input
            type="date"
            value={h.fecha ?? ""}
            title="#HASHTAG: valido hasta (elegir en el calendario)"
            readOnly={modoLectura}
            onChange={(e) =>
              onHashtagChange?.({
                valor: h.valor ?? null,
                fecha: e.target.value || null,
              })
            }
            className={`w-[120px] h-6 px-1 rounded border outline-none text-xs tabular-nums ${
              celdaRoja
                ? "border-transparent bg-transparent text-red-800 font-semibold"
                : modoLectura
                ? "border-transparent bg-white text-stone-700 cursor-default"
                : "border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100"
            }`}
          />
        </div>
      </td>
    );
  }

  // Celdas calculadas (read-only, fondo verde claro)
  if (col.type === "calc") {
    // Solo las columnas marginC1..30 son porcentajes; el resto son Gs
    const isPctCalc = col.key.startsWith("marginC");
    const displayValue =
      typeof value === "number" && value !== null
        ? isPctCalc
          ? `${(value * 100).toFixed(2)}%`
          : formatPYG(Number(value))
        : "—";
    return (
      <td className="px-2 py-0.5 text-right tabular-nums bg-emerald-50/50 border-r border-stone-50 whitespace-nowrap text-stone-700">
        {displayValue}
      </td>
    );
  }

  // Celdas editables
  const isPct = col.type === "pct";
  const isNum = col.type === "num";
  const isText = col.type === "text";

  const displayValue =
    isPct && value !== "" && value !== null && value !== undefined
      ? // Limpieza visual del ruido de punto flotante (0.1*100 =
        // 10.000000000000002 en JS): se corta a 4 decimales de %, sin
        // tocar el valor guardado (la edición sigue guardando fracción).
        Math.round(Number(value) * 1000000) / 10000
      : value ?? "";

  const inputNode = (
    <input
      type={isNum || isPct ? "number" : "text"}
      step={isPct ? "0.01" : isNum ? "1" : undefined}
      value={displayValue}
      readOnly={modoLectura}
      onChange={(e) => {
        if (isPct) {
          const numVal = e.target.value === "" ? "" : String(Number(e.target.value) / 100);
          onChange(numVal);
        } else {
          onChange(e.target.value);
        }
      }}
      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
      data-ri={rowIndex}
      data-ci={colIndex}
      data-text={isText ? "1" : "0"}
      className={`w-full ${isDesc ? "min-w-[400px]" : "min-w-[80px]"} h-6 px-2 rounded border outline-none text-xs tabular-nums ${
        isText ? "text-left" : "text-right"
      } ${
        modoLectura
          ? "border-transparent bg-white text-stone-700 cursor-default"
          : "border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100"
      }`}
      placeholder="—"
    />
  );

  // Columnas fijas (congeladas): mismo mecanismo sticky que ACCIONES y COD.
  // Task 99: las CELDAS de TODAS las fijas llevan fondo DORADO (#D9B86B,
  // igual que COD y ACCIONES); FROZEN_BLANCO quedó vacío (si algún día se
  // re-agrega una fija blanca, esa toma #ffffff). El encabezado siempre es
  // dorado (padrón). Sin entrada en FROZEN_COLUMNS queda como siempre
  // (bg-white).
  // Task 80: en MODO SOLO LECTURA las fijas arrancan pegadas al COD (110px),
  // igual que los encabezados — sin el hueco de los 120px de ACCIONES.
  const frozenLeft = (modoLectura ? frozenLeftByKeyLectura : frozenLeftByKey)[col.key];
  const frozenWidth = frozenWidthByKey[col.key];
  const esFija = frozenLeft !== undefined;
  const fondoFija = esFija
    ? (FROZEN_BLANCO.has(col.key) ? "#ffffff" : FROZEN_BG)
    : undefined;

  // Columnas normales: input simple de una línea, como siempre
  if (!isDesc) {
    return (
      <td
        className={`px-1 py-0 border-r border-stone-50 ${esFija ? "sticky z-10" : "bg-white"}${costoEditado && !esFija ? " celda-costo-editado" : ""}`}
        style={
          esFija
            ? { left: frozenLeft, width: frozenWidth, backgroundColor: fondoFija }
            : // Celda de COSTO editada a mano y guardada por el admin:
              // fondo DORADO SUPER VIVO VIBRANTE para discernirla de un costo
              // traído por importación. (Las columnas de costo nunca son
              // fijas; se deja esFija primero por seguridad.)
              // La clase "celda-costo-editado" (globals.css) hace que el
              // dorado gane también a fila-activa / fila-etiquetada / hover.
              costoEditado
            ? { backgroundColor: COSTO_EDITADO_BG }
            : undefined
        }
      >
        {inputNode}
      </td>
    );
  }

  // DESCRIPCION: input + flechita para expandir/contraer el texto completo
  return (
    <td
      className={`px-1 py-0 border-r border-stone-50 ${esFija ? "sticky z-10" : "bg-white"}`}
      style={esFija ? { left: frozenLeft, width: frozenWidth, backgroundColor: fondoFija } : undefined}
    >
      <div className="flex items-start gap-0.5">
        {descExpanded ? (
          <textarea
            ref={descRef}
            value={displayValue}
            readOnly={modoLectura}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            placeholder="—"
            className={`w-full min-w-[400px] px-2 py-1 rounded border outline-none text-xs text-left leading-4 resize-none ${
              modoLectura
                ? "border-transparent bg-white text-stone-700 cursor-default"
                : "border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100"
            }`}
          />
        ) : (
          inputNode
        )}
        <button
          type="button"
          onClick={() => setDescExpanded((v) => !v)}
          title={descExpanded ? "Contraer DESCRIPCION" : "Ver todo el texto de la DESCRIPCION"}
          className="shrink-0 mt-0.5 h-5 w-5 rounded inline-flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
        >
          {descExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </td>
  );
});

// Botón de filtro para los headers de columna
const FilterButton = memo(function FilterButton({
  hasFilter,
  isOpen,
  onClick,
}: {
  hasFilter: boolean;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      title="Filtrar columna"
      className={`inline-flex items-center justify-center h-5 w-5 rounded transition-colors ${
        hasFilter
          ? "bg-rose-500 text-white"
          : isOpen
          ? "bg-stone-200 text-stone-700"
          : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      }`}
    >
      <Filter className="h-3 w-3" />
    </button>
  );
});

// Botón de ordenamiento de columnas (flechita) — compartido por COD, STOCK y
// DESCRIPCION. El tooltip (title) SIEMPRE nombra la columna correcta:
//   COD / STOCK     → numérico: "de mayor a menor" / "de menor a mayor"
//   DESCRIPCION     → alfabético: "de Z a A" / "de A a Z" (nunca dice "stock")
// Estados: null (sin orden, flecha neutral) → "desc" (↓) → "asc" (↑) → null
const ColumnSortButton = memo(function ColumnSortButton({
  dir,
  label,
  onClick,
}: {
  dir: "asc" | "desc" | null;
  label: "COD" | "STOCK" | "DESCRIPCION";
  onClick: () => void;
}) {
  const esAlfabetico = label === "DESCRIPCION";
  const title =
    dir === "desc"
      ? esAlfabetico
        ? "DESCRIPCION: de Z a A (click: de A a Z)"
        : `${label}: de mayor a menor (click: de menor a mayor)`
      : dir === "asc"
      ? esAlfabetico
        ? "DESCRIPCION: de A a Z (click: orden normal)"
        : `${label}: de menor a mayor (click: orden normal)`
      : `Ordenar por ${label}`;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`inline-flex items-center justify-center h-5 w-5 rounded transition-colors ${
        dir
          ? "bg-stone-800 text-white"
          : "text-stone-700 hover:bg-black/10 hover:text-black"
      }`}
    >
      {dir === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : dir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3" />
      )}
    </button>
  );
});

// Dropdown que muestra valores únicos de una columna y permite filtrar
const FilterDropdown = memo(function FilterDropdown({
  colKey,
  selected,
  onChange,
  onClose,
}: {
  colKey: string;
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [numericInfo, setNumericInfo] = useState<{ min: number; max: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products/distinct?column=${encodeURIComponent(colKey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.type === "numeric") {
          setNumericInfo({ min: data.min, max: data.max, count: data.count });
        } else {
          setValues(data.values || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [colKey]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filteredValues = values.filter((v) =>
    String(v ?? "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggleValue = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 z-50 mt-1 w-56 max-h-80 bg-white rounded-lg border border-stone-200 shadow-2xl flex flex-col"
    >
      <div className="p-2 border-b border-stone-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar valor..."
          className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-100 outline-none"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-xs text-stone-400 text-center">Cargando...</div>
        ) : numericInfo ? (
          <div className="p-3 text-xs text-stone-600 space-y-1">
            <div className="font-bold text-stone-800">Columna numérica</div>
            <div>Min: {numericInfo.min}</div>
            <div>Max: {numericInfo.max}</div>
            <div>Total registros: {numericInfo.count}</div>
            <p className="text-[10px] text-stone-400 mt-2">
              Las columnas numéricas no se pueden filtrar por valor.
            </p>
          </div>
        ) : filteredValues.length === 0 ? (
          <div className="p-3 text-xs text-stone-400 text-center">
            {values.length === 0 ? "Sin valores" : "Sin coincidencias"}
          </div>
        ) : (
          filteredValues.map((v) => {
            const checked = selected.includes(v);
            return (
              <label
                key={v || "__empty__"}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(v)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{v || "(vacío)"}</span>
              </label>
            );
          })
        )}
      </div>
      {selected.length > 0 && (
        <div className="p-2 border-t border-stone-100">
          <button
            onClick={() => onChange([])}
            className="w-full h-7 rounded text-xs font-medium text-stone-600 hover:bg-stone-100"
          >
            Limpiar filtro ({selected.length})
          </button>
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MODAL CREAR ETIQUETA (Task 84, pedido del dueño)
// Solo lo abre el supremo_admin (botón CREAR ETIQUETA de la Base).
// Crea etiquetas nuevas (nombre + color) que aparecen:
//   - en el menú de etiquetado de cada fila (bolita de color),
//   - en los filtros clickeables de la leyenda,
//   - y pintan la fila con su propio color.
// También lista las creadas con su × para borrarlas (al borrar, los
// productos que la tenían quedan sin etiqueta — lo hace el API).
// Las 4 fijas (verde/azul/dorado/rojo) NUNCA se tocan acá.
// ═══════════════════════════════════════════════════════════════
const PALETA_ETIQUETAS: string[] = [
  "#28A745", // verde
  "#007BFF", // azul
  "#FFC107", // dorado
  "#DC3545", // rojo
  "#6F42C1", // violeta
  "#E8590C", // naranja
  "#0CA678", // verde agua
  "#E64980", // rosa
  "#17A2B8", // celeste
  "#8B5E34", // marrón
  "#4B5563", // gris
  "#000000", // negro
];

function ModalCrearEtiqueta({
  onClose,
  creadas,
  onCreadas,
}: {
  onClose: () => void;
  creadas: EtiquetaCreada[];
  onCreadas: (lista: EtiquetaCreada[]) => void;
}) {
  // El padre monta este componente SOLO cuando el modal está abierto
  // ({modalEtiquetaOpen && ...}), así que los estados arrancan limpios en
  // cada apertura — sin effects de reset ni estados sincrónicos.
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState<string>(PALETA_ETIQUETAS[4]);
  const [ocupado, setOcupado] = useState(false);

  const crear = async () => {
    if (ocupado) return;
    if (!nombre.trim()) {
      toast.error("Poné un nombre para la etiqueta");
      return;
    }
    setOcupado(true);
    const toastId = toast.loading("Creando etiqueta...");
    try {
      const res = await fetch("/api/products/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), color }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo crear la etiqueta", { id: toastId });
        return;
      }
      toast.success(`Etiqueta "${data.etiqueta.nombre.toUpperCase()}" creada`, { id: toastId });
      onCreadas([...creadas, data.etiqueta].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNombre("");
    } catch {
      toast.error("Error de red al crear la etiqueta", { id: toastId });
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (e: EtiquetaCreada) => {
    if (!window.confirm(
      `¿Borrar la etiqueta "${e.nombre.toUpperCase()}"?\n\nLos productos que la tenían quedan SIN etiqueta (igual que si se la sacaras a mano).`
    )) return;
    const toastId = toast.loading("Borrando etiqueta...");
    try {
      const res = await fetch(`/api/products/labels?id=${encodeURIComponent(e.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo borrar la etiqueta", { id: toastId });
        return;
      }
      toast.success(`Etiqueta "${e.nombre.toUpperCase()}" borrada`, { id: toastId });
      onCreadas(creadas.filter((x) => x.id !== e.id));
    } catch {
      toast.error("Error de red al borrar la etiqueta", { id: toastId });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 25, 23, 0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm">
            <Tag className="h-4 w-4" style={{ color: "#8a6d2f" }} />
            CREAR ETIQUETA
          </h3>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1">
              NOMBRE de la etiqueta
            </label>
            <input
              value={nombre}
              // Task 100: el nombre de la etiqueta SIEMPRE en MAYÚSCULAS —
              // se pasa a mayúsculas mientras se escribe (y el server
              // normaliza igual al guardar, ver src/lib/etiquetas.ts).
              onChange={(ev) => setNombre(ev.target.value.toUpperCase())}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") crear();
              }}
              maxLength={40}
              placeholder="Ej: RESERVADO, OFERTA, FALTANTE..."
              className="w-full h-9 px-3 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#b08a3e] focus:border-transparent"
            />
          </div>

          {/* Color: paleta + selector libre */}
          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1.5">
              COLOR
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PALETA_ETIQUETAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    border: color === c ? "3px solid #1c1917" : "2px solid #e7e5e4",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(ev) => setColor(ev.target.value)}
                className="h-8 w-12 rounded border border-stone-300 cursor-pointer bg-white"
                title="Color personalizado"
              />
              <span className="text-xs font-mono text-stone-500">{color.toUpperCase()}</span>
            </div>
          </div>

          {/* Vista previa */}
          <div
            className="rounded-lg px-3 py-2 flex items-center gap-2"
            style={{ background: `${color}26`, borderLeft: `5px solid ${color}` }}
          >
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold" style={{ color: "#1c1917" }}>
              {nombre.trim().toUpperCase() || "Vista previa de la etiqueta"}
            </span>
          </div>

          {/* Botón crear */}
          <button
            onClick={crear}
            disabled={ocupado}
            className={`w-full h-10 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
              ocupado ? "opacity-60 cursor-not-allowed" : "hover:brightness-110"
            }`}
            style={{ background: "linear-gradient(135deg, #8a6d2f 0%, #b08a3e 100%)" }}
          >
            <Plus className="h-4 w-4" />
            CREAR ETIQUETA
          </button>

          {/* Etiquetas ya creadas */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-stone-600 mb-1.5">
              ETIQUETAS CREADAS ({creadas.length})
            </p>
            {creadas.length === 0 ? (
              <p className="text-xs text-stone-400">
                Todavía no creaste etiquetas. Las de siempre (SELECCIONADO, PARA PEDIDO,
                DESCONTINUADO, QUEMA STOCK) siguen funcionando igual y no se pueden borrar.
              </p>
            ) : (
              <div className="space-y-1.5">
                {creadas.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5"
                    style={{ background: `${e.color}26`, borderLeft: `5px solid ${e.color}` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="text-sm font-semibold text-stone-800 truncate">{e.nombre.toUpperCase()}</span>
                    </div>
                    <button
                      onClick={() => borrar(e)}
                      className="h-6 w-6 rounded-md bg-white hover:bg-rose-50 text-stone-400 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0"
                      title="Borrar etiqueta (los productos etiquetados quedan sin etiqueta)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL TASA DE CAMBIO (Task 87, pedido del dueño) ───
// Solo supremo_admin y viza@viza.com.py (Task 87B — el botón de la toolbar
// solo se muestra para ellos y el backend valida la MISMA lista).
// Dos pasos adentro del modal:
//   1) EDITAR: el Supremo pone el cambio R$→Gs y US$→Gs y aprieta
//      "APLICAR A LA BASE GENERAL".
//   2) CONFIRMAR: resumen viejo → nuevo + qué se recalcula y qué NO.
// Al confirmar llama POST /api/config-cambio: guarda las tasas y recalcula
// la base (productos con costo en R$ o US$, mismas fórmulas de siempre).
// El padre (onAplicadas) actualiza el chip y recarga la lista de productos.
function ModalTasaCambio({
  onClose,
  tasasActuales,
  onAplicadas,
}: {
  onClose: () => void;
  tasasActuales: { cambioRS: number; cambioUS: number };
  onAplicadas: (tasas: { cambioRS: number; cambioUS: number }) => void;
}) {
  // El padre monta este componente SOLO cuando el modal está abierto
  // ({modalTasaOpen && ...}), así que los estados arrancan limpios en
  // cada apertura — sin effects de reset ni estados sincrónicos.
  const [rsStr, setRsStr] = useState(String(tasasActuales.cambioRS));
  const [usStr, setUsStr] = useState(String(tasasActuales.cambioUS));
  const [etapa, setEtapa] = useState<"editar" | "confirmar">("editar");
  const [ocupado, setOcupado] = useState(false);
  const [errorTxt, setErrorTxt] = useState<string | null>(null);

  // Acepta "1100", "7450,5" y "7450.5" (coma decimal incluida).
  const parseTasa = (s: string): number | null => {
    const n = Number(String(s).trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const rsNuevo = parseTasa(rsStr);
  const usNuevo = parseTasa(usStr);
  const valido = rsNuevo !== null && usNuevo !== null;

  const irAConfirmar = () => {
    setErrorTxt(null);
    if (!valido) {
      setErrorTxt("Poné números mayores que 0 para el cambio del Real y del Dólar.");
      return;
    }
    setEtapa("confirmar");
  };

  const aplicar = async () => {
    if (ocupado || !valido) return;
    setOcupado(true);
    setErrorTxt(null);
    const toastId = toast.loading("Aplicando el cambio a la base... (puede tardar un poco)");
    try {
      const res = await fetch("/api/config-cambio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambioRS: rsNuevo, cambioUS: usNuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      const aplicadas = {
        cambioRS: data.tasas?.cambioRS ?? rsNuevo!,
        cambioUS: data.tasas?.cambioUS ?? usNuevo!,
      };
      toast.success(
        `Cambio aplicado: R$ ${aplicadas.cambioRS.toLocaleString("es-PY")} · US$ ${aplicadas.cambioUS.toLocaleString("es-PY")} — ${data.actualizados ?? 0} productos recalculados`,
        { id: toastId, duration: 6000 }
      );
      onAplicadas(aplicadas);
      onClose();
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`, { id: toastId });
      setErrorTxt(
        "No se pudo aplicar el cambio. Si la base es muy grande puede haberse cortado: apretar APLICAR de nuevo completa el trabajo (no se duplica nada)."
      );
      setOcupado(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("es-PY");

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 25, 23, 0.45)" }}
      onClick={ocupado ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4" style={{ color: "#155789" }} />
            TASA DE CAMBIO
          </h3>
          <button
            onClick={onClose}
            disabled={ocupado}
            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {etapa === "editar" ? (
            <>
              {/* Explicación corta */}
              <div className="rounded-lg px-3 py-2.5 bg-sky-50 border border-sky-100 text-xs text-sky-900 leading-relaxed">
                El sistema usa este cambio para convertir a Guaraníes los costos
                cargados en <strong>Real</strong> y en <strong>Dólar</strong>. Al
                aplicar, se recalculan los costos y precios de TODOS los productos
                con costo en R$ o US$, con las mismas fórmulas de siempre. Los
                productos con costo cargado directo en Gs <strong>no se tocan</strong>
                {" "}y los costos de entrada quedan intactos.
              </div>

              {/* Cambio R$ */}
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">
                  CAMBIO R$ → Gs (Real a Guaraní)
                </label>
                <input
                  value={rsStr}
                  onChange={(ev) => setRsStr(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") irAConfirmar();
                  }}
                  inputMode="decimal"
                  placeholder="Ej: 1100"
                  className="w-full h-9 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e6ba8] focus:border-transparent"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Actual: R$ {fmt(tasasActuales.cambioRS)} por 1 Real
                </p>
              </div>

              {/* Cambio US$ */}
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">
                  CAMBIO US$ → Gs (Dólar a Guaraní)
                </label>
                <input
                  value={usStr}
                  onChange={(ev) => setUsStr(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") irAConfirmar();
                  }}
                  inputMode="decimal"
                  placeholder="Ej: 6000"
                  className="w-full h-9 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e6ba8] focus:border-transparent"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Actual: US$ {fmt(tasasActuales.cambioUS)} por 1 Dólar
                </p>
              </div>

              {errorTxt && (
                <div className="rounded-lg px-3 py-2 bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  {errorTxt}
                </div>
              )}

              {/* Botón continuar */}
              <button
                onClick={irAConfirmar}
                disabled={ocupado}
                className={`w-full h-10 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                  valido ? "hover:brightness-110" : "opacity-50 cursor-not-allowed"
                }`}
                style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
              >
                <Coins className="h-4 w-4" />
                APLICAR A LA BASE GENERAL
              </button>
            </>
          ) : (
            <>
              {/* Resumen antes de aplicar */}
              <div className="rounded-lg px-3 py-2.5 bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Vas a recalcular <strong>TODA la base</strong> con el cambio
                  nuevo. Los precios de los presupuestos NUEVOS salen con los
                  valores recalculados; los presupuestos ya guardados quedan
                  como están.
                </span>
              </div>

              <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-semibold text-stone-600">Real (R$ → Gs)</span>
                  <span className="font-mono text-xs">
                    <span className="text-stone-400">{fmt(tasasActuales.cambioRS)}</span>
                    <span className="mx-1.5 text-stone-300">→</span>
                    <span className="font-bold text-stone-900">{fmt(rsNuevo!)}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-semibold text-stone-600">Dólar (US$ → Gs)</span>
                  <span className="font-mono text-xs">
                    <span className="text-stone-400">{fmt(tasasActuales.cambioUS)}</span>
                    <span className="mx-1.5 text-stone-300">→</span>
                    <span className="font-bold text-stone-900">{fmt(usNuevo!)}</span>
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-stone-500 leading-relaxed">
                Se recalculan: sub-costo, Costo Prod., márgenes y precios de los
                productos con costo en R$ o US$. NO se tocan: los costos de
                entrada, los productos con costo en Gs, las etiquetas, el stock
                ni los registros. Si se corta la conexión a mitad, apretar
                APLICAR de nuevo completa el trabajo.
              </p>

              {errorTxt && (
                <div className="rounded-lg px-3 py-2 bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  {errorTxt}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setEtapa("editar")}
                  disabled={ocupado}
                  className="flex-1 h-10 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  VOLVER
                </button>
                <button
                  onClick={aplicar}
                  disabled={ocupado}
                  className={`flex-1 h-10 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                    ocupado ? "opacity-60 cursor-wait" : "hover:brightness-110"
                  }`}
                  style={{ background: "linear-gradient(135deg, #166534 0%, #15803d 100%)" }}
                >
                  <Check className="h-4 w-4" />
                  {ocupado ? "APLICANDO..." : "SÍ, APLICAR"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
