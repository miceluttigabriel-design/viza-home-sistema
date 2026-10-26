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
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { formatPYG } from "@/lib/format";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";

// Formatea una fracción decimal de porcentaje (0.25 = 25%) igual que la tabla
// (valor × 100), pero compacto: 25%, 28%, 35.3%, 108.8% (sin ceros colgantes)
const fmtPctVal = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return "—";
  const n = v * 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${s}%`;
};

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
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
  coluna1: string | null;
  coluna2: string | null;
  stock: number;
  costSistema: number | null;
  showInCatalog: boolean;
  // Trazabilidad: última edición manual del admin
  etiquetaColor?: string | null;
  ultimaEdicionAt?: string | null;  // ISO string from API
  ultimaEdicionPor?: string | null; // admin name or email
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
}

const PAGE_SIZE = 50; // Más productos por página (filas compactas permiten ver más)

// Recalcular en vivo (espejo del cálculo del servidor)
function recalcLive(form: any): any {
  const cambioRS = 1100;
  const cambioUS = 6000;
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
  // Orden de columnas a pedido del usuario (despues del COD fijo):
  // GRUPO > SUB-GRUPO > PROVEDOR > MARCA > REF.FABRICA > DESCRIPCION.
  // Solo cambia la POSICION visual; keys/campos/datos/Excel intactos.
  // GRUPO: en la base es el campo "categoria" (col CQ "CATEGORIA" de la
  // planilla), el mismo que ya usan el export Excel y la importación de
  // productos. Se muestra (como GRUPO) y es editable en esta tabla; el botón
  // IMPORTAR FABRICANTES Y MARCAS + GRUPO la llena desde la planilla.
  { key: "categoria", label: "GRUPO", type: "text", group: "DATOS FINALES" },
  // Columnas DIVISION, TIPO, MODELO y PRODUCTO ocultas de esta tabla a pedido
  // del usuario (los datos siguen en la base).
  { key: "subGrupo", label: "SUB-GRUPO", type: "text", group: "DATOS FINALES" },
  // FABRICANTE y MARCA restauradas a pedido del usuario: los campos ya
  // existían en la base de datos y en import/export Excel; ahora también se
  // muestran y son editables en esta tabla (filtro por columna y búsqueda
  // global ya lo soportaban). MARCA es la col CT del Excel: el botón IMPORTAR
  // FABRICANTES Y MARCAS escribe aquí las marcas de la planilla.
  // Renombre visual (pedido del usuario): se muestra PROVEDOR; el campo/key
  // "fabricante" queda intacto (datos, filtro, API, import y export sin cambios).
  { key: "fabricante", label: "PROVEDOR", type: "text", group: "DATOS FINALES" },
  { key: "marca", label: "MARCA", type: "text", group: "DATOS FINALES" },
  // Renombre visual (pedido del usuario): se muestra REF.FABRICA; el campo/key
  // "referencia" queda intacto (datos, filtro, import y export sin cambios).
  { key: "referencia", label: "REF.FABRICA", type: "text", group: "DATOS" },
  // Datos de identificacion
  { key: "name", label: "DESCRIPCION", type: "text", group: "DATOS" },
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
  { key: "marginContado", label: "% CONTADO", type: "pct", group: "MARGENES" },
  { key: "safra", label: "SAFRA", type: "num", group: "DATOS FINALES" },
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
  // VALOR TECNICO y MARGEN TECNICO al final
  { key: "valorTecnico", label: "VALOR TECNICO", type: "num", group: "DATOS FINALES" },
  { key: "margenTecnico", label: "MARGEN TECNICO", type: "num", group: "DATOS FINALES" },
  // COLUNA1, COLUNA2 y COSTO SISTEMA: eliminadas del Panel ADM a pedido del usuario.
  // Siguen existiendo en la base de datos y en import/export Excel; solo dejan de mostrarse.
];

export function AdminPanel({ user, onGoSales, onGoGestion, isSupremo }: AdminPanelProps) {
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
  const [openLabelMenu, setOpenLabelMenu] = useState<string | null>(null);
  // Filtros por columna: { [colKey]: string[] }
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  // Columna cuyo dropdown está abierto (null = ninguno)
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  // Ordenamiento de la columna STOCK: null (sin orden) | "desc" (mayor a menor) | "asc" (menor a mayor)
  const [stockSort, setStockSort] = useState<"asc" | "desc" | null>(null);
  // Filtro activo de etiqueta de color: "verde" | "azul" | "dorado" | "rojo" | null
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

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
    actualizados: Array<{ sku: string; nameActual: string | null; stockActual: number; stockNuevo: number; costoActual: number | null; costoNuevo: number | null }>;
    errores: string[];
  } | null>(null);
  const [importApplying, setImportApplying] = useState(false);
  const [importResult, setImportResult] = useState<{ creados: number; actualizados: number; conCostoActualizado?: number; margenesAutomaticas: number; conSafraAutomatica?: number; errores: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── IMPORTAR MÁRGENES (planilla LISTA VIZA HOME, hoja "base") ───
  // El Excel se procesa EN EL NAVEGADOR (SheetJS) y solo se envía un JSON
  // compacto con códigos + márgenes. Así se evita el límite de 4.5MB de
  // subida de Vercel (el .xlsm pesa ~6MB).
  const [marginsImportOpen, setMarginsImportOpen] = useState(false);
  const [marginsImportLoading, setMarginsImportLoading] = useState(false);
  const [marginsImportPreview, setMarginsImportPreview] = useState<{
    totalCodigos: number;
    coinciden: number;
    noEncontrados: number;
    noEncontradosMuestra: string[];
    sinMargen: number;
    sinCosto: number;
    conTecnico: number;
    cambios: Array<{
      sku: string;
      name: string;
      marginActual: number | null;
      marginNuevo: number;
      pct1A6: number;
      pct7A13: number;
      pct14A30: number;
      precioContadoNuevo: number | null;
    }>;
    cambiosTecnico: Array<{
      sku: string;
      name: string;
      valorTecnicoActual: number | null;
      valorTecnicoNuevo: number;
      margenTecnicoNuevo: number | null;
    }>;
    autoSinMargen: number;
    autoSinCosto: number;
    autoMuestra: Array<{
      sku: string;
      name: string;
      tipo: string | null;
      margenAsignada: number;
      fuente: string;
    }>;
    autoPromedioGlobal: number | null;
    autoTipos: number;
  } | null>(null);
  const [marginsImportApplying, setMarginsImportApplying] = useState(false);
  const [marginsImportResult, setMarginsImportResult] = useState<{
    actualizados: number;
    conTecnico: number;
    autoSinMargen: number;
    autoActualizados: number;
    noEncontrados: number;
    fallidos: number;
    errores: string[];
  } | null>(null);
  const marginsFileInputRef = useRef<HTMLInputElement | null>(null);
  // Guarda las filas parseadas del Excel entre la vista previa y el apply
  // vt/mt = Valor Para Técnico + Margen P/Técnico (solo algunos productos los traen)
  const marginsRowsRef = useRef<Array<{ cod: string; m: number | null; y: number | null; z: number | null; aa: number | null; vt: number | null; mt: number | null }> | null>(null);

  // ─── IMPORTAR FABRICANTES Y MARCAS + GRUPO (planilla LISTA VIZA HOME, hoja "base") ───
  // Mismo mecanismo que IMPORTAR MÁRGENES: el Excel se procesa EN EL NAVEGADOR
  // (SheetJS) y solo se envía un JSON compacto { cod, fabricante, marca, grupo }.
  // La API solo actualiza FABRICANTE, MARCA (campo marca, col CT), GRUPO
  // (campo categoria, col CQ "CATEGORIA" de la planilla) y el espejo brand del
  // catálogo de vendedores; nada más se toca. Los valores explícitos del Excel
  // siempre ganan; un campo ausente (0/"-"/VAZIO) deja el campo del producto
  // intacto (nunca borra). El catálogo (brand) queda como espejo del FABRICANTE
  // SOLO donde estaba vacío (convención del sistema).
  const [fabImportOpen, setFabImportOpen] = useState(false);
  const [fabImportLoading, setFabImportLoading] = useState(false);
  const [fabImportPreview, setFabImportPreview] = useState<{
    totalCodigos: number;
    coinciden: number;
    aActualizar: number;
    yaIgual: number;
    noEncontrados: number;
    noEncontradosMuestra: string[];
    sinValores: number;
    conFabricante: number;
    conMarca: number;
    conGrupo: number;
    cambios: Array<{ sku: string; name: string; fabricanteActual: string | null; fabricanteNuevo: string | null; marcaActual: string | null; marcaNuevo: string | null; grupoActual: string | null; grupoNuevo: string | null }>;
  } | null>(null);
  const [fabImportApplying, setFabImportApplying] = useState(false);
  const [fabImportResult, setFabImportResult] = useState<{
    actualizados: number;
    conMarcaNueva: number;
    conGrupoNuevo: number;
    conBrandEspejo: number;
    yaIgual: number;
    noEncontrados: number;
    fallidos: number;
    errores: string[];
  } | null>(null);
  const fabFileInputRef = useRef<HTMLInputElement | null>(null);
  // Guarda las filas {cod, fabricante, marca, grupo} parseadas entre la vista previa y el apply
  const fabRowsRef = useRef<Array<{ cod: string; fabricante: string | null; marca: string | null; grupo: string | null }> | null>(null);

  // ─── IMPORTAR VALOR + % ADD + SAFRA (planilla LISTA VIZA HOME, hoja "base") ───
  // Mismo mecanismo que IMPORTAR MÁRGENES / FABRICANTES: el Excel se procesa EN
  // EL NAVEGADOR (SheetJS) y solo se envía un JSON compacto { cod, valorAdd, addPct, safra }.
  // % ADD (col M, fracción decimal 0.25 = 25%) y VALOR ADD (col S, guaraníes) son
  // inputs de la cadena de costos: al aplicarlos, la API recalcula Costo Prod.,
  // márgenes y precios EXACTAMENTE igual que cuando el admin los edita a mano en
  // la tabla (PUT /api/products/[id]). SAFRA (col CL) es un dato independiente
  // (String en la base) y sigue la REGLA "SOLO DONDE FALTA" (pedido del usuario):
  // se agrega ÚNICAMENTE a los productos que NO tienen SAFRA (vacío, "null" o 0);
  // los que YA la tienen quedan EXACTAMENTE igual (nunca se sobrescribe, aunque
  // el Excel traiga otro valor). Cada fila puede traer uno, varios o ninguno; un
  // campo ausente deja el campo del producto intacto (nunca borra).
  const [vaImportOpen, setVaImportOpen] = useState(false);
  const [vaImportLoading, setVaImportLoading] = useState(false);
  const [vaImportPreview, setVaImportPreview] = useState<{
    totalCodigos: number;
    coinciden: number;
    aActualizar: number;
    yaIgual: number;
    noEncontrados: number;
    noEncontradosMuestra: string[];
    sinValores: number;
    conValorAdd: number;
    conAddPct: number;
    conSafra: number;
    safraAAgregar: number;
    safraMantenidas: number;
    cambios: Array<{
      sku: string;
      name: string;
      addPctActual: number | null;
      addPctNuevo: number | null;
      valorAddActual: number | null;
      valorAddNuevo: number | null;
      safraActual: string | null;
      safraNuevo: string | null;
      safraMantenida: boolean;
      costProdActual: number | null;
      costProdNuevo: number | null;
      precioActual: number | null;
      precioNuevo: number | null;
    }>;
  } | null>(null);
  const [vaImportApplying, setVaImportApplying] = useState(false);
  const [vaImportResult, setVaImportResult] = useState<{
    actualizados: number;
    yaIgual: number;
    safraAgregadas: number;
    safraMantenidas: number;
    noEncontrados: number;
    fallidos: number;
    errores: string[];
  } | null>(null);
  const vaFileInputRef = useRef<HTMLInputElement | null>(null);
  // Guarda las filas {cod, valorAdd, addPct, safra} parseadas entre la vista previa y el apply
  const vaRowsRef = useRef<Array<{ cod: string; valorAdd: number | null; addPct: number | null; safra: string | null }> | null>(null);

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
      // Ordenamiento por stock (flechita de la columna STOCK)
      if (stockSort) {
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
  }, [search, page, columnFilters, labelFilter, stockSort]);

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
    setDirty((d) => {
      const existing = d[productId] || {};
      return { ...d, [productId]: { ...existing, [key]: value } };
    });
  };

  const handleSave = async (product: Product) => {
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
    } catch {
      toast.error("No se pudo guardar");
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      toast.success("Producto eliminado");
      fetchProducts();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  // ─── IMPORTAR MÁRGENES: procesar el Excel EN EL NAVEGADOR ───
  // Lee la hoja "base" de la planilla LISTA VIZA HOME (headers en fila 2),
  // extrae COD VIZA + Contado + bases 1A6/7A13/14A30 + Valor Para Técnico (CV)
  // + Margen P/Técnico (CW) y envía un JSON compacto a
  // /api/products/import-margins/preview.
  const handleMarginsFile = async (file: File) => {
    setMarginsImportOpen(true);
    setMarginsImportLoading(true);
    setMarginsImportPreview(null);
    setMarginsImportResult(null);
    try {
      // Import dinámico: solo carga la librería cuando se usa (~peso del bundle)
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName =
        wb.SheetNames.find((n) => n.trim().toLowerCase() === "base") || wb.SheetNames[0];
      if (!sheetName) throw new Error("El Excel no tiene hojas");
      const ws = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      const norm = (s: any) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
      // Buscar la fila de headers que contiene "COD VIZA"
      let headerIdx = -1;
      let colMap: Record<string, number> = {};
      for (let r = 0; r < Math.min(aoa.length, 10); r++) {
        const row = aoa[r] || [];
        const mapped: Record<string, number> = {};
        row.forEach((cell, c) => {
          const h = norm(cell);
          if (h && mapped[h] === undefined) mapped[h] = c;
        });
        if (mapped["COD VIZA"] !== undefined) {
          headerIdx = r;
          colMap = mapped;
          break;
        }
      }
      if (headerIdx < 0 || colMap["CONTADO"] === undefined) {
        throw new Error("No se encontró la hoja 'base' con columnas COD VIZA y Contado");
      }
      // Columnas técnicas (opcionales): 'Valor Para Tecnico' (CV) y 'Margen P/Tecnico' (CW).
      // Solo algunos productos las tienen; si no existen en la planilla se ignoran.
      const colVT =
        colMap["VALOR PARA TECNICO"] ?? colMap["VALOR TECNICO"] ?? -1;
      const colMT =
        colMap["MARGEN P/TECNICO"] ?? colMap["MARGEN P/ TECNICO"] ?? colMap["MARGEN TECNICO"] ?? -1;

      const num = (v: any): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const rows: Array<{ cod: string; m: number | null; y: number | null; z: number | null; aa: number | null; vt: number | null; mt: number | null }> = [];
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const codRaw = row[colMap["COD VIZA"]];
        if (codRaw === null || codRaw === undefined || String(codRaw).trim() === "") continue;
        // Valor Para Tecnico: en la planilla, 0 o vacío = sin precio técnico
        const vtRaw = colVT >= 0 ? num(row[colVT]) : null;
        const mtRaw = colMT >= 0 ? num(row[colMT]) : null;
        const hasTec = vtRaw !== null && vtRaw > 0;
        rows.push({
          cod: String(codRaw).trim().replace(/\.0$/, ""),
          m: num(row[colMap["CONTADO"]]),
          y: num(row[colMap["1 A 6"]]),
          z: num(row[colMap["7 A 13"]]),
          aa: num(row[colMap["14 A 30"]]),
          vt: hasTec ? vtRaw : null,
          mt: hasTec ? mtRaw : null,
        });
      }
      if (rows.length === 0) throw new Error("El Excel no contiene filas con COD VIZA");
      marginsRowsRef.current = rows;

      const res = await fetch("/api/products/import-margins/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setMarginsImportPreview(data);
    } catch (error) {
      console.error("Error import margins:", error);
      toast.error(`Error: ${(error as Error).message}`);
      setMarginsImportOpen(false);
    } finally {
      setMarginsImportLoading(false);
      if (marginsFileInputRef.current) marginsFileInputRef.current.value = "";
    }
  };

  const handleMarginsApply = async () => {
    const rows = marginsRowsRef.current;
    if (!rows || rows.length === 0) {
      toast.error("No hay datos para aplicar");
      return;
    }
    setMarginsImportApplying(true);
    try {
      const res = await fetch("/api/products/import-margins/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setMarginsImportResult(data);
      fetchProducts(); // Recargar la tabla con las márgenes nuevas
    } catch (error) {
      console.error("Error apply margins:", error);
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setMarginsImportApplying(false);
    }
  };

  // ─── IMPORTAR FABRICANTES Y MARCAS + GRUPO: procesar el Excel EN EL NAVEGADOR ───
  // Lee la hoja "base" de la planilla LISTA VIZA HOME (headers en fila 2),
  // extrae COD VIZA + FABRICANTE (col CO) + MARCA (col CT) + GRUPO (col CQ,
  // encabezado "CATEGORIA" o "GRUPO") y envía un JSON compacto a
  // /api/products/import-fabricante/preview. Mismo flujo que márgenes/valor
  // add: primero vista previa (solo lectura) y después el apply explícito.
  // En la columna MARCA, 0 y "-" significan "sin marca".
  const handleFabricanteFile = async (file: File) => {
    setFabImportOpen(true);
    setFabImportLoading(true);
    setFabImportPreview(null);
    setFabImportResult(null);
    try {
      // Import dinámico: solo carga la librería cuando se usa (~peso del bundle)
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName =
        wb.SheetNames.find((n) => n.trim().toLowerCase() === "base") || wb.SheetNames[0];
      if (!sheetName) throw new Error("El Excel no tiene hojas");
      const ws = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      const norm = (s: any) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
      // Celdas ricas / fórmulas / números → texto plano estable
      const toStr = (v: any): string => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") {
          const rich = (v as any).richText;
          if (Array.isArray(rich)) return rich.map((rt: any) => String(rt?.text ?? "")).join("");
          if ((v as any).w !== undefined) return String((v as any).w);
          if ((v as any).v !== undefined) return String((v as any).v);
          return "";
        }
        return String(v).trim();
      };
      // Buscar la fila de headers que contiene "COD VIZA"
      let headerIdx = -1;
      let colMap: Record<string, number> = {};
      for (let r = 0; r < Math.min(aoa.length, 10); r++) {
        const row = aoa[r] || [];
        const mapped: Record<string, number> = {};
        row.forEach((cell, c) => {
          const h = norm(toStr(cell));
          if (h && mapped[h] === undefined) mapped[h] = c;
        });
        if (mapped["COD VIZA"] !== undefined) {
          headerIdx = r;
          colMap = mapped;
          break;
        }
      }
      if (headerIdx < 0 || colMap["FABRICANTE"] === undefined) {
        throw new Error("No se encontró la hoja 'base' con columnas COD VIZA y FABRICANTE");
      }
      // Columna MARCA (opcional en planillas viejas): celdas 0 / "-" = sin marca
      // Se acepta también el encabezado "MARCAS" (plural) por si la planilla lo trae
      const colMarca = colMap["MARCA"] ?? colMap["MARCAS"] ?? -1;
      if (colMarca < 0) {
        toast.info("La planilla no tiene columna MARCA: solo se importarán FABRICANTES.");
      }
      // Columna GRUPO (opcional en planillas viejas): en la planilla se llama
      // "CATEGORIA" (col CQ, detrás de SUB-GRUPO); se acepta "GRUPO" o "CATEGORIA"
      const colGrupo = colMap["GRUPO"] ?? colMap["CATEGORIA"] ?? -1;
      if (colGrupo < 0) {
        toast.info("La planilla no tiene columna GRUPO/CATEGORIA: no se importarán grupos.");
      }

      const rows: Array<{ cod: string; fabricante: string | null; marca: string | null; grupo: string | null }> = [];
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const cod = toStr(row[colMap["COD VIZA"]]).replace(/\.0$/, "");
        if (!cod) continue;
        // Se envían TODAS las filas con código, incluso sin fabricante/marca/grupo:
        // la API las cuenta (sinValores) y NUNCA borra los valores existentes.
        // La limpieza fina (0/"-"/espacios) la hace la API (limpiarTextoExcel).
        rows.push({
          cod,
          fabricante: toStr(row[colMap["FABRICANTE"]]),
          marca: colMarca >= 0 ? toStr(row[colMarca]) : "",
          grupo: colGrupo >= 0 ? toStr(row[colGrupo]) : "",
        });
      }
      if (rows.length === 0) throw new Error("El Excel no contiene filas con COD VIZA");
      fabRowsRef.current = rows;

      const res = await fetch("/api/products/import-fabricante/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setFabImportPreview(data);
    } catch (error) {
      console.error("Error import fabricante:", error);
      toast.error(`Error: ${(error as Error).message}`);
      setFabImportOpen(false);
    } finally {
      setFabImportLoading(false);
      if (fabFileInputRef.current) fabFileInputRef.current.value = "";
    }
  };

  const handleFabricanteApply = async () => {
    const rows = fabRowsRef.current;
    if (!rows || rows.length === 0) {
      toast.error("No hay datos para aplicar");
      return;
    }
    setFabImportApplying(true);
    try {
      const res = await fetch("/api/products/import-fabricante/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setFabImportResult(data);
      fetchProducts(); // Recargar la tabla con los fabricantes nuevos
    } catch (error) {
      console.error("Error apply fabricante:", error);
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setFabImportApplying(false);
    }
  };

  // ─── IMPORTAR VALOR + % ADD: procesar el Excel EN EL NAVEGADOR ───
  // Lee la hoja "base" de la planilla LISTA VIZA HOME (headers en fila 2),
  // extrae COD VIZA + "Valor Add" (col S) + "% Add" (col M, fracción decimal:
  // 0.25 = 25%) y envía un JSON compacto a /api/products/import-valoradd/preview.
  // Mismo flujo que márgenes/fabricantes: primero vista previa (solo lectura)
  // y después el apply explícito.
  const handleValorAddFile = async (file: File) => {
    setVaImportOpen(true);
    setVaImportLoading(true);
    setVaImportPreview(null);
    setVaImportResult(null);
    try {
      // Import dinámico: solo carga la librería cuando se usa (~peso del bundle)
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName =
        wb.SheetNames.find((n) => n.trim().toLowerCase() === "base") || wb.SheetNames[0];
      if (!sheetName) throw new Error("El Excel no tiene hojas");
      const ws = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      const norm = (s: any) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
      // Celdas ricas / fórmulas / números → texto plano estable
      const toStr = (v: any): string => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") {
          const rich = (v as any).richText;
          if (Array.isArray(rich)) return rich.map((rt: any) => String(rt?.text ?? "")).join("");
          if ((v as any).w !== undefined) return String((v as any).w);
          if ((v as any).v !== undefined) return String((v as any).v);
          return "";
        }
        return String(v).trim();
      };
      const num = (v: any): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      // Buscar la fila de headers que contiene "COD VIZA"
      let headerIdx = -1;
      let colMap: Record<string, number> = {};
      for (let r = 0; r < Math.min(aoa.length, 10); r++) {
        const row = aoa[r] || [];
        const mapped: Record<string, number> = {};
        row.forEach((cell, c) => {
          const h = norm(toStr(cell));
          if (h && mapped[h] === undefined) mapped[h] = c;
        });
        if (mapped["COD VIZA"] !== undefined) {
          headerIdx = r;
          colMap = mapped;
          break;
        }
      }
      // Las columnas % ADD y SAFRA son OPCIONALES (planillas viejas solo traen
      // VALOR ADD): si no están, todo sigue funcionando igual que antes.
      const colAddPct = colMap["% ADD"] ?? colMap["%ADD"];
      const colSafra = colMap["SAFRA"];
      if (
        headerIdx < 0 ||
        (colMap["VALOR ADD"] === undefined && colAddPct === undefined && colSafra === undefined)
      ) {
        throw new Error("No se encontró la hoja 'base' con COD VIZA y VALOR ADD, % ADD o SAFRA");
      }
      // SAFRA (col CL, String en la base): número del Excel → texto limpio ("7"),
      // texto → trim. null = la fila no trae SAFRA (el producto queda intacto).
      const toSafra = (v: any): string | null => {
        if (v === null || v === undefined || v === "") return null;
        const s = toStr(v).trim().replace(/\.0$/, "");
        return s ? s.slice(0, 50) : null;
      };

      const rows: Array<{ cod: string; valorAdd: number | null; addPct: number | null; safra: string | null }> = [];
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const cod = toStr(row[colMap["COD VIZA"]]).replace(/\.0$/, "");
        if (!cod) continue;
        // Se envían TODAS las filas con código, incluso sin % ADD / VALOR ADD /
        // SAFRA: la API las cuenta (sinValores) y NUNCA borra valores existentes.
        rows.push({
          cod,
          valorAdd: colMap["VALOR ADD"] !== undefined ? num(row[colMap["VALOR ADD"]]) : null,
          addPct: colAddPct !== undefined ? num(row[colAddPct]) : null,
          safra: colSafra !== undefined ? toSafra(row[colSafra]) : null,
        });
      }
      if (rows.length === 0) throw new Error("El Excel no contiene filas con COD VIZA");
      vaRowsRef.current = rows;

      const res = await fetch("/api/products/import-valoradd/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setVaImportPreview(data);
    } catch (error) {
      console.error("Error import valorAdd:", error);
      toast.error(`Error: ${(error as Error).message}`);
      setVaImportOpen(false);
    } finally {
      setVaImportLoading(false);
      if (vaFileInputRef.current) vaFileInputRef.current.value = "";
    }
  };

  const handleValorAddApply = async () => {
    const rows = vaRowsRef.current;
    if (!rows || rows.length === 0) {
      toast.error("No hay datos para aplicar");
      return;
    }
    setVaImportApplying(true);
    try {
      const res = await fetch("/api/products/import-valoradd/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      setVaImportResult(data);
      fetchProducts(); // Recargar la tabla con los VALOR ADD nuevos
    } catch (error) {
      console.error("Error apply valorAdd:", error);
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setVaImportApplying(false);
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
      const recalculated = recalcLive(fullForm);
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
              title={`${user.name || user.email} · ${isSupremo ? "SUPREMO ADMIN" : "ADMINISTRADOR"}`}
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

      <main className="flex-1 min-h-0 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-3 flex flex-col">
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* (Buscador movido al header) */}
          <div className="flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-stone-900">Gestión de productos</h2>
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
                {/* Boton EXPORTAR EXCEL */}
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

                {/* Boton IMPORTAR MÁRGENES (planilla LISTA VIZA HOME) — solo supremo_admin */}
                {isSupremo && (
                  <>
                    <input
                      ref={marginsFileInputRef}
                      type="file"
                      accept=".xlsm,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMarginsFile(file);
                      }}
                    />
                    <button
                      id="btn-import-margins"
                      onClick={() => {
                        setMarginsImportOpen(true);
                        setMarginsImportPreview(null);
                        setMarginsImportResult(null);
                        setMarginsImportLoading(false);
                        setMarginsImportApplying(false);
                        marginsFileInputRef.current?.click();
                      }}
                      className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                      style={{ background: "linear-gradient(135deg, #0d3d5e 0%, #155789 100%)" }}
                      title="Importar márgenes + valores técnicos desde la planilla LISTA VIZA HOME (hoja base)"
                    >
                      <Percent className="h-3.5 w-3.5" />
                      IMPORTAR MÁRGENES
                    </button>
                  </>
                )}

                {/* Boton IMPORTAR FABRICANTES Y MARCAS + GRUPO (planilla LISTA VIZA HOME) — solo supremo_admin */}
                {isSupremo && (
                  <>
                    <input
                      ref={fabFileInputRef}
                      type="file"
                      accept=".xlsm,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFabricanteFile(file);
                      }}
                    />
                    <button
                      id="btn-import-fabricante"
                      onClick={() => {
                        setFabImportOpen(true);
                        setFabImportPreview(null);
                        setFabImportResult(null);
                        setFabImportLoading(false);
                        setFabImportApplying(false);
                        fabFileInputRef.current?.click();
                      }}
                      className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                      style={{ background: "linear-gradient(135deg, #155789 0%, #3a8fd4 100%)" }}
                      title="Importar FABRICANTE, MARCA y GRUPO desde la planilla LISTA VIZA HOME (hoja base). Solo actualiza esas tres columnas; nada más se toca."
                    >
                      <Tag className="h-3.5 w-3.5" />
                      IMPORTAR FABRICANTES Y MARCAS + GRUPO
                    </button>
                  </>
                )}

                {/* Boton IMPORTAR VALOR ADD (planilla LISTA VIZA HOME) — solo supremo_admin */}
                {isSupremo && (
                  <>
                    <input
                      ref={vaFileInputRef}
                      type="file"
                      accept=".xlsm,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleValorAddFile(file);
                      }}
                    />
                    <button
                      id="btn-import-valoradd"
                      onClick={() => {
                        setVaImportOpen(true);
                        setVaImportPreview(null);
                        setVaImportResult(null);
                        setVaImportLoading(false);
                        setVaImportApplying(false);
                        vaFileInputRef.current?.click();
                      }}
                      className="h-8 px-3 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors"
                      style={{ background: "linear-gradient(135deg, #b45309 0%, #d97706 100%)" }}
                      title="Importar % ADD y VALOR ADD desde la planilla LISTA VIZA HOME (hoja base). Recalcula Costo Prod. y precios igual que la edición manual; nada más se toca."
                    >
                      <Coins className="h-3.5 w-3.5" />
                      IMPORTAR VALOR + % ADD
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
                  title="Filtrar: Seleccionados"
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
                  Seleccionado
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "azul" ? "filtro-activo" : ""}`}
                  data-filtro="azul"
                  onClick={() => {
                    setLabelFilter(prev => prev === "azul" ? null : "azul");
                    setPage(1);
                  }}
                  title="Filtrar: Para Pedido"
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
                  Para Pedido
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "dorado" ? "filtro-activo" : ""}`}
                  data-filtro="dorado"
                  onClick={() => {
                    setLabelFilter(prev => prev === "dorado" ? null : "dorado");
                    setPage(1);
                  }}
                  title="Filtrar: Descontinuado"
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
                  Descontinuado
                </button>
                <button
                  type="button"
                  className={`leyenda-item ${labelFilter === "rojo" ? "filtro-activo" : ""}`}
                  data-filtro="rojo"
                  onClick={() => {
                    setLabelFilter(prev => prev === "rojo" ? null : "rojo");
                    setPage(1);
                  }}
                  title="Filtrar: Quema Stock"
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
                  Quema Stock
                </button>
              </div>
            </div>
          </div>

          {/* Tabla estilo Excel - edición directa */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm flex-1 min-h-0">
            <div className="overflow-auto h-full">
              <table className="admin-table border-collapse text-xs">
                <thead className="border-b border-stone-200 sticky top-0 z-30" style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                  <tr>
                    {/* Columna acciones */}
                    <th className="sticky left-0 z-20 px-2 py-0.5 text-center font-bold border-r border-stone-200 min-w-[120px]" style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                      ACCIONES
                    </th>
                    {/* SKU */}
                    <th className="sticky left-[120px] z-20 px-2 py-0.5 text-left font-bold border-r border-stone-200 min-w-[80px]" style={{ backgroundColor: "#D9B86B", color: "#1c1917" }}>
                      COD
                    </th>
                    {COLUMNS.map((col) => {
                      const hasFilter =
                        !!columnFilters[col.key] && columnFilters[col.key].length > 0;
                      const isOpen = openFilterColumn === col.key;
                      return (
                        <th
                          key={col.key}
                          className="relative px-2 py-0.5 text-center font-bold border-r border-stone-100 whitespace-nowrap"
                          style={{ backgroundColor: "#D9B86B" }}
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
                                <StockSortButton
                                  dir={stockSort}
                                  onClick={() => {
                                    setStockSort((prev) =>
                                      prev === null ? "desc" : prev === "desc" ? "asc" : null
                                    );
                                    setPage(1);
                                  }}
                                />
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
                          {isOpen && col.key !== "stock" && (
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
                      <td colSpan={COLUMNS.length + 2} className="text-center py-12 text-stone-400">
                        Cargando productos...
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className="text-center py-12 text-stone-400">
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
                          label={productLabels[p.id] || null}
                          isLabelMenuOpen={openLabelMenu === p.id}
                          onToggleLabelMenu={() => setOpenLabelMenu(openLabelMenu === p.id ? null : p.id)}
                          onSetLabel={async (color: string | null) => {
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
                                  <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${costoCambia ? "text-sky-700" : "text-stone-500"}`}>
                                    {p.costoNuevo != null ? p.costoNuevo.toLocaleString("es-PY") : "sin costo nuevo"}
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
          MODAL: IMPORTAR MÁRGENES (planilla LISTA VIZA HOME, hoja "base")
          - Excel procesado en el navegador, envía solo JSON compacto
          - Preview con muestra antes de aplicar
          - Solo toca márgenes + precios; costos NUNCA se modifican
          - También importa VALOR TÉCNICO + MARGEN TÉCNICO de los productos
            que lo traen en la planilla (cols CV/CW); los demás intocados
          ════════════════════════════════════════════════════════════════ */}
      {marginsImportOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            if (!marginsImportLoading && !marginsImportApplying) setMarginsImportOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "#e7e5e4", background: "linear-gradient(135deg, #0d3d5e 0%, #155789 100%)" }}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Importar márgenes (planilla VIZA HOME)
              </h3>
              <button
                onClick={() => {
                  if (!marginsImportLoading && !marginsImportApplying) setMarginsImportOpen(false);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={marginsImportLoading || marginsImportApplying}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body del modal */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {marginsImportLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-[#155789] animate-spin"></div>
                  <p className="text-sm text-stone-600 font-medium">Procesando planilla…</p>
                </div>
              )}

              {!marginsImportLoading && marginsImportResult && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 border"
                    style={{ background: "#f0fdf4", borderColor: "#86efac" }}
                  >
                    <p className="text-base font-bold text-emerald-800 mb-2">
                      ✓ Márgenes aplicadas
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3 border border-emerald-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Productos actualizados</p>
                        <p className="text-2xl font-black text-emerald-700">{marginsImportResult.actualizados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Códigos sin producto</p>
                        <p className="text-2xl font-black text-blue-700">{marginsImportResult.noEncontrados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-violet-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Con valor técnico</p>
                        <p className="text-2xl font-black text-violet-700">{marginsImportResult.conTecnico}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-sky-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Margen automática</p>
                        <p className="text-2xl font-black text-sky-700">{marginsImportResult.autoActualizados}</p>
                      </div>
                    </div>
                  </div>
                  {marginsImportResult.errores.length > 0 && (
                    <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                      <p className="text-sm font-bold text-amber-800 mb-2">
                        ⚠ Errores ({marginsImportResult.fallidos})
                      </p>
                      <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-auto">
                        {marginsImportResult.errores.slice(0, 50).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-xs text-stone-500 italic">
                    La tabla se recargó con las márgenes y precios nuevos. Los costos no fueron modificados.
                    {marginsImportResult.conTecnico > 0 && (
                      <span className="block mt-1">
                        Valor técnico y margen técnica importados para {marginsImportResult.conTecnico} productos.
                      </span>
                    )}
                    {marginsImportResult.autoActualizados > 0 && (
                      <span className="block mt-1">
                        Margen automática (promedio por tipo) asignada a {marginsImportResult.autoActualizados} productos que no estaban en la planilla.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!marginsImportLoading && !marginsImportResult && marginsImportPreview && (
                <div className="space-y-4">
                  {/* Resumen */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="rounded-lg p-3 border border-emerald-200 bg-emerald-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">A actualizar</p>
                      <p className="text-3xl font-black text-emerald-700">{marginsImportPreview.coinciden}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Productos que coinciden por COD</p>
                    </div>
                    <div className="rounded-lg p-3 border border-stone-200 bg-stone-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Sin producto</p>
                      <p className="text-3xl font-black text-stone-600">{marginsImportPreview.noEncontrados}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Códigos del Excel que no existen en el sistema</p>
                    </div>
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Filas ignoradas</p>
                      <p className="text-3xl font-black text-amber-600">{marginsImportPreview.sinMargen}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Sin margen Contado válida en el Excel</p>
                    </div>
                    <div className="rounded-lg p-3 border border-violet-200 bg-violet-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Con valor técnico</p>
                      <p className="text-3xl font-black text-violet-700">{marginsImportPreview.conTecnico}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Productos con VALOR/MARGEN TÉCNICO en el Excel</p>
                    </div>
                    <div className="rounded-lg p-3 border border-sky-200 bg-sky-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Margen automática</p>
                      <p className="text-3xl font-black text-sky-700">{marginsImportPreview.autoSinMargen}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Productos del panel con margen 0 que no están en el Excel</p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-600 bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <strong>{marginsImportPreview.totalCodigos}</strong> códigos leídos de la hoja "base".
                    Se actualizan <strong>solo márgenes (% CONTADO + bases + % C1..C30)</strong> y se recalculan
                    los <strong>precios (contado + 30 cuotas)</strong> con el costo actual de cada producto.
                    <strong> Los costos no se modifican.</strong>
                    <span className="block mt-1">
                      Además, a los <strong>{marginsImportPreview.conTecnico}</strong> productos que tienen
                      "Valor Para Tecnico" en la planilla se les importa el <strong>VALOR TÉCNICO</strong> y el
                      <strong> MARGEN TÉCNICO</strong>. A los demás no se les toca nada técnico.
                    </span>
                    <span className="block mt-1">
                      Y <strong>{marginsImportPreview.autoSinMargen}</strong> productos del panel que NO están
                      en la planilla (margen 0) recibirán <strong>margen automática</strong>: promedio de su
                      tipo{marginsImportPreview.autoTipos > 0 ? ` (${marginsImportPreview.autoTipos} tipos con promedio)` : ""}
                      {marginsImportPreview.autoPromedioGlobal != null && (
                        <> — promedio general {(marginsImportPreview.autoPromedioGlobal * 100).toFixed(2)}%</>
                      )}.
                    </span>
                    {marginsImportPreview.sinCosto > 0 && (
                      <span className="block mt-1 text-amber-700">
                        ⚠ {marginsImportPreview.sinCosto} productos sin costo guardado: se actualizarán solo sus márgenes (precios intocados).
                      </span>
                    )}
                  </div>

                  {/* Muestra de cambios */}
                  {marginsImportPreview.cambios.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        Vista previa de cambios (primeros {marginsImportPreview.cambios.length})
                      </p>
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">COD</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">% CONTADO actual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">% CONTADO nuevo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Base 1A6</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Base 7A13</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Base 14A30</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Precio CONTADO nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marginsImportPreview.cambios.map((c, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{c.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700 max-w-[220px] truncate" title={c.name}>{c.name || "—"}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-500">
                                  {c.marginActual != null ? `${(c.marginActual * 100).toFixed(2)}%` : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-700">
                                  {(c.marginNuevo * 100).toFixed(2)}%
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">{(c.pct1A6 * 100).toFixed(2)}%</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">{(c.pct7A13 * 100).toFixed(2)}%</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-600">{(c.pct14A30 * 100).toFixed(2)}%</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-800">
                                  {c.precioContadoNuevo != null ? formatPYG(c.precioContadoNuevo) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Muestra de productos con VALOR TÉCNICO (solo los que lo traen en el Excel) */}
                  {marginsImportPreview.cambiosTecnico.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-violet-500 mr-1.5"></span>
                        Productos con valor técnico (primeros {marginsImportPreview.cambiosTecnico.length} de {marginsImportPreview.conTecnico})
                      </p>
                      <div className="border border-violet-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#faf5ff" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">COD</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Valor técn. actual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Valor técn. nuevo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">% técn. nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marginsImportPreview.cambiosTecnico.map((c, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{c.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700 max-w-[220px] truncate" title={c.name}>{c.name || "—"}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-stone-500">
                                  {c.valorTecnicoActual != null ? formatPYG(c.valorTecnicoActual) : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-bold text-violet-700">
                                  {formatPYG(c.valorTecnicoNuevo)}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-violet-600">
                                  {c.margenTecnicoNuevo != null ? `${(c.margenTecnicoNuevo * 100).toFixed(2)}%` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Muestra de productos con MARGEN AUTOMÁTICA (no están en el Excel, margen 0) */}
                  {marginsImportPreview.autoMuestra.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-500 mr-1.5"></span>
                        Margen automática por tipo (primeros {marginsImportPreview.autoMuestra.length} de {marginsImportPreview.autoSinMargen})
                      </p>
                      <div className="border border-sky-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f0f9ff" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">COD</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Tipo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">% CONTADO asignada</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Fuente del promedio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marginsImportPreview.autoMuestra.map((c, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{c.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700 max-w-[220px] truncate" title={c.name}>{c.name || "—"}</td>
                                <td className="px-2 py-1.5 text-stone-600">{c.tipo || "—"}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-bold text-sky-700">
                                  {(c.margenAsignada * 100).toFixed(2)}%
                                </td>
                                <td className="px-2 py-1.5 text-stone-500">{c.fuente}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Códigos sin producto (muestra) */}
                  {marginsImportPreview.noEncontradosMuestra.length > 0 && (
                    <div className="text-xs text-stone-500">
                      <span className="font-semibold text-stone-600">Sin producto en el sistema (muestra): </span>
                      {marginsImportPreview.noEncontradosMuestra.slice(0, 20).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-end gap-3 bg-stone-50">
              {!marginsImportResult && (
                <>
                  <button
                    onClick={() => setMarginsImportOpen(false)}
                    className="h-9 px-4 rounded-lg text-stone-600 text-sm font-bold hover:bg-stone-200 transition-colors disabled:opacity-50"
                    disabled={marginsImportLoading || marginsImportApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleMarginsApply}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                    disabled={
                      marginsImportLoading ||
                      marginsImportApplying ||
                      !marginsImportPreview ||
                      marginsImportPreview.coinciden === 0
                    }
                  >
                    {marginsImportApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Aplicando márgenes…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        APLICAR MÁRGENES
                      </>
                    )}
                  </button>
                </>
              )}
              {marginsImportResult && (
                <button
                  onClick={() => setMarginsImportOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #0d3d5e 0%, #155789 100%)" }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ════════════════════════════════════════════════════════════════
          MODAL: IMPORTAR FABRICANTES Y MARCAS + GRUPO (planilla LISTA VIZA HOME, hoja "base")
          - Mismo flujo de márgenes/valor add: vista previa (solo lectura) + apply
          - SOLO actualiza FABRICANTE, MARCA, GRUPO (categoria) y brand (espejo)
          - Los valores explícitos del Excel siempre ganan; si la fila no trae
            MARCA, brand se completa con el fabricante SOLO si está vacío (espejo)
          - GRUPO = col CQ "CATEGORIA" de la planilla, campo "categoria" de la base
          - NUNCA borra valores existentes; filas sin los tres valores intocadas
          ════════════════════════════════════════════════════════════════ */}
      {fabImportOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            if (!fabImportLoading && !fabImportApplying) setFabImportOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "#e7e5e4", background: "linear-gradient(135deg, #155789 0%, #3a8fd4 100%)" }}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Importar fabricantes, marcas y grupo (planilla VIZA HOME)
              </h3>
              <button
                onClick={() => {
                  if (!fabImportLoading && !fabImportApplying) setFabImportOpen(false);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={fabImportLoading || fabImportApplying}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body del modal */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {fabImportLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-[#155789] animate-spin"></div>
                  <p className="text-sm text-stone-600 font-medium">Procesando planilla…</p>
                </div>
              )}

              {!fabImportLoading && fabImportResult && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 border"
                    style={{ background: "#f0fdf4", borderColor: "#86efac" }}
                  >
                    <p className="text-base font-bold text-emerald-800 mb-2">
                      ✓ Fabricantes, marcas y grupos aplicados
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3 border border-emerald-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Productos actualizados</p>
                        <p className="text-2xl font-black text-emerald-700">{fabImportResult.actualizados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-stone-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Ya correctos</p>
                        <p className="text-2xl font-black text-stone-600">{fabImportResult.yaIgual}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Códigos sin producto</p>
                        <p className="text-2xl font-black text-blue-700">{fabImportResult.noEncontrados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-violet-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Marcas del Excel aplicadas</p>
                        <p className="text-2xl font-black text-violet-700">{fabImportResult.conMarcaNueva}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-teal-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Grupos del Excel aplicados</p>
                        <p className="text-2xl font-black text-teal-700">{fabImportResult.conGrupoNuevo}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-amber-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Catálogo por espejo</p>
                        <p className="text-2xl font-black text-amber-700">{fabImportResult.conBrandEspejo}</p>
                      </div>
                    </div>
                  </div>
                  {fabImportResult.errores.length > 0 && (
                    <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                      <p className="text-sm font-bold text-amber-800 mb-2">
                        ⚠ Errores ({fabImportResult.fallidos})
                      </p>
                      <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-auto">
                        {fabImportResult.errores.slice(0, 50).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-xs text-stone-500 italic">
                    La tabla se recargó con los fabricantes, marcas y grupos nuevos. Solo se actualizaron las
                    columnas FABRICANTE, MARCA y GRUPO (el catálogo de vendedores quedó como espejo del
                    fabricante solo donde estaba vacío).
                    Costos, márgenes, precios y stock quedaron intactos.
                  </div>
                </div>
              )}

              {!fabImportLoading && !fabImportResult && fabImportPreview && (
                <div className="space-y-4">
                  {/* Resumen */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="rounded-lg p-3 border border-emerald-200 bg-emerald-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">A actualizar</p>
                      <p className="text-3xl font-black text-emerald-700">{fabImportPreview.aActualizar}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Productos que reciben fabricante, marca y/o grupo nuevo</p>
                    </div>
                    <div className="rounded-lg p-3 border border-stone-200 bg-stone-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Ya correctos</p>
                      <p className="text-3xl font-black text-stone-600">{fabImportPreview.yaIgual}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Ya tenían exactamente esos valores</p>
                    </div>
                    <div className="rounded-lg p-3 border border-blue-200 bg-blue-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Sin producto</p>
                      <p className="text-3xl font-black text-blue-700">{fabImportPreview.noEncontrados}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Códigos del Excel que no existen en el sistema</p>
                    </div>
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Filas sin ningún valor</p>
                      <p className="text-3xl font-black text-amber-600">{fabImportPreview.sinValores}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Filas sin FABRICANTE, MARCA ni GRUPO (quedan intocadas)</p>
                    </div>
                    <div className="rounded-lg p-3 border border-violet-200 bg-violet-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Filas con MARCA</p>
                      <p className="text-3xl font-black text-violet-700">{fabImportPreview.conMarca}</p>
                      <p className="text-[10px] text-stone-500 mt-1">De {fabImportPreview.conFabricante} filas con FABRICANTE en el Excel</p>
                    </div>
                    <div className="rounded-lg p-3 border border-teal-200 bg-teal-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Filas con GRUPO</p>
                      <p className="text-3xl font-black text-teal-700">{fabImportPreview.conGrupo}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Filas con CATEGORIA/GRUPO en el Excel (col detrás de SUB-GRUPO)</p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-600 bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <strong>{fabImportPreview.totalCodigos}</strong> códigos leídos de la hoja "base".
                    Se actualizan <strong>SOLO las columnas FABRICANTE, MARCA y GRUPO</strong> de los
                    productos que coinciden por COD; la MARCA va al campo MARCA de la base (col CT, el mismo
                    que usa la importación de productos) y el GRUPO va al campo GRUPO de la tabla (col
                    CATEGORIA del Excel, justo detrás de SUB-GRUPO). El catálogo de vendedores se completa
                    con el fabricante solo donde estaba vacío (convención del sistema).
                    <span className="block mt-1">
                      <strong>No se crean productos y no se tocan</strong> costos, márgenes, precios,
                      stock, etiquetas ni ningún otro dato. Las filas con VAZIO/- en GRUPO dejan el
                      grupo del producto como está (nunca se borra).
                    </span>
                  </div>

                  {/* Muestra de cambios */}
                  {fabImportPreview.cambios.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        Vista previa de cambios (primeros {fabImportPreview.cambios.length} de {fabImportPreview.aActualizar})
                      </p>
                      <div className="border border-stone-200 rounded-lg overflow-auto">
                        <table className="w-full text-xs">
                          <thead style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">COD</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Fabricante actual</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Fabricante nuevo</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Marca actual</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Marca nueva</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Grupo actual</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Grupo nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fabImportPreview.cambios.map((c, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{c.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700 max-w-[200px] truncate" title={c.name}>{c.name || "—"}</td>
                                <td className="px-2 py-1.5 text-stone-500 max-w-[150px] truncate" title={c.fabricanteActual ?? ""}>
                                  {c.fabricanteActual || "— (vacío)"}
                                </td>
                                <td className="px-2 py-1.5 font-bold text-emerald-700 max-w-[150px] truncate" title={c.fabricanteNuevo ?? ""}>
                                  {c.fabricanteNuevo ?? "—"}
                                </td>
                                <td className="px-2 py-1.5 text-stone-500 max-w-[150px] truncate" title={c.marcaActual ?? ""}>
                                  {c.marcaActual || "— (vacío)"}
                                </td>
                                <td className="px-2 py-1.5 font-bold text-violet-700 max-w-[150px] truncate" title={c.marcaNuevo ?? ""}>
                                  {c.marcaNuevo ?? "—"}
                                </td>
                                <td className="px-2 py-1.5 text-stone-500 max-w-[130px] truncate" title={c.grupoActual ?? ""}>
                                  {c.grupoActual || "— (vacío)"}
                                </td>
                                <td className="px-2 py-1.5 font-bold text-teal-700 max-w-[130px] truncate" title={c.grupoNuevo ?? ""}>
                                  {c.grupoNuevo ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Códigos sin producto (muestra) */}
                  {fabImportPreview.noEncontradosMuestra.length > 0 && (
                    <div className="text-xs text-stone-500">
                      <span className="font-semibold text-stone-600">Sin producto en el sistema (muestra): </span>
                      {fabImportPreview.noEncontradosMuestra.slice(0, 20).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-end gap-3 bg-stone-50">
              {!fabImportResult && (
                <>
                  <button
                    onClick={() => setFabImportOpen(false)}
                    className="h-9 px-4 rounded-lg text-stone-600 text-sm font-bold hover:bg-stone-200 transition-colors disabled:opacity-50"
                    disabled={fabImportLoading || fabImportApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleFabricanteApply}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                    disabled={
                      fabImportLoading ||
                      fabImportApplying ||
                      !fabImportPreview ||
                      fabImportPreview.aActualizar === 0
                    }
                  >
                    {fabImportApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Aplicando fabricantes, marcas y grupos…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        APLICAR FABRICANTES, MARCAS Y GRUPO
                      </>
                    )}
                  </button>
                </>
              )}
              {fabImportResult && (
                <button
                  onClick={() => setFabImportOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #3a8fd4 100%)" }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ════════════════════════════════════════════════════════════════
          MODAL: IMPORTAR VALOR + % ADD + SAFRA (planilla LISTA VIZA HOME, hoja "base")
          - Mismo flujo de márgenes/fabricantes: vista previa + apply
          - % ADD (col M) y VALOR ADD (col S) son inputs de la cadena de costos:
            al aplicarlos el sistema recalcula Costo Prod., márgenes y precios
            igual que la edición manual. SAFRA (col CL) es independiente y va
            con REGLA "SOLO DONDE FALTA": se agrega solo a productos sin
            SAFRA; los que ya la tienen quedan igual (nunca se sobrescribe)
          - Cada fila puede traer % ADD, VALOR ADD, SAFRA, varios o ninguno; un
            campo ausente deja el campo del producto intacto (NUNCA borra)
          ════════════════════════════════════════════════════════════════ */}
      {vaImportOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            if (!vaImportLoading && !vaImportApplying) setVaImportOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "#e7e5e4", background: "linear-gradient(135deg, #b45309 0%, #d97706 100%)" }}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Importar VALOR + % ADD + SAFRA (planilla VIZA HOME)
              </h3>
              <button
                onClick={() => {
                  if (!vaImportLoading && !vaImportApplying) setVaImportOpen(false);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={vaImportLoading || vaImportApplying}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body del modal */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {vaImportLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-10 w-10 rounded-full border-4 border-stone-200 border-t-[#b45309] animate-spin"></div>
                  <p className="text-sm text-stone-600 font-medium">Procesando planilla…</p>
                </div>
              )}

              {!vaImportLoading && vaImportResult && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 border"
                    style={{ background: "#f0fdf4", borderColor: "#86efac" }}
                  >
                    <p className="text-base font-bold text-emerald-800 mb-2">
                      ✓ VALOR + % ADD + SAFRA aplicados
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3 border border-emerald-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Productos actualizados</p>
                        <p className="text-2xl font-black text-emerald-700">{vaImportResult.actualizados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-stone-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Ya tenían esos valores</p>
                        <p className="text-2xl font-black text-stone-600">{vaImportResult.yaIgual}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Códigos sin producto</p>
                        <p className="text-2xl font-black text-blue-700">{vaImportResult.noEncontrados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-amber-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">Costos y precios recalculados</p>
                        <p className="text-2xl font-black text-amber-600">{vaImportResult.actualizados}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-violet-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">SAFRA agregadas (solo faltantes)</p>
                        <p className="text-2xl font-black text-violet-700">{vaImportResult.safraAgregadas}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-stone-200">
                        <p className="text-stone-500 text-xs font-semibold uppercase">SAFRA mantenidas (ya tenían)</p>
                        <p className="text-2xl font-black text-stone-600">{vaImportResult.safraMantenidas}</p>
                      </div>
                    </div>
                  </div>
                  {vaImportResult.errores.length > 0 && (
                    <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                      <p className="text-sm font-bold text-amber-800 mb-2">
                        ⚠ Errores ({vaImportResult.fallidos})
                      </p>
                      <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-auto">
                        {vaImportResult.errores.slice(0, 50).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-xs text-stone-500 italic">
                    La tabla se recargó con los % ADD, VALOR ADD y SAFRA nuevos. Para cada producto
                    actualizado se recalculó Costo Prod. y los precios con las mismas fórmulas del
                    sistema (igual que editarlos a mano); la SAFRA solo se agregó donde faltaba —
                    los productos que ya tenían SAFRA quedaron EXACTAMENTE igual. Costos de entrada,
                    % DESC, GASTOS ADM, VALOR DESC., bases de porcentajes, stock y fabricantes
                    quedaron intactos.
                  </div>
                </div>
              )}

              {!vaImportLoading && !vaImportResult && vaImportPreview && (
                <div className="space-y-4">
                  {/* Resumen */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg p-3 border border-emerald-200 bg-emerald-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">A actualizar</p>
                      <p className="text-3xl font-black text-emerald-700">{vaImportPreview.aActualizar}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Productos que reciben % ADD, VALOR ADD y/o SAFRA nueva (solo donde falta)</p>
                    </div>
                    <div className="rounded-lg p-3 border border-stone-200 bg-stone-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Ya correctos</p>
                      <p className="text-3xl font-black text-stone-600">{vaImportPreview.yaIgual}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Ya tenían exactamente ese valor</p>
                    </div>
                    <div className="rounded-lg p-3 border border-blue-200 bg-blue-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Sin producto</p>
                      <p className="text-3xl font-black text-blue-700">{vaImportPreview.noEncontrados}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Códigos del Excel que no existen en el sistema</p>
                    </div>
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-stone-500 text-xs font-semibold uppercase">Sin % ADD, VALOR ADD ni SAFRA</p>
                      <p className="text-3xl font-black text-amber-600">{vaImportPreview.sinValores}</p>
                      <p className="text-[10px] text-stone-500 mt-1">Filas sin ninguno de esos valores en el Excel (quedan intocadas)</p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <strong>{vaImportPreview.totalCodigos}</strong> códigos leídos de la hoja "base"
                    ({vaImportPreview.conAddPct} con % ADD, {vaImportPreview.conValorAdd} con VALOR ADD,{" "}
                    {vaImportPreview.conSafra} con SAFRA).
                    Se actualizan <strong>SOLO las columnas % ADD, VALOR ADD y SAFRA</strong> de los
                    productos que coinciden por COD. % ADD y VALOR ADD son parte de la cadena de costos:
                    a cada producto actualizado se le <strong>recalcula Costo Prod. y los precios</strong>{" "}
                    con las mismas fórmulas del sistema (exactamente igual que editarlos a mano). La
                    SAFRA (col CL) es un dato independiente y sigue la REGLA <strong>"SOLO DONDE
                    FALTA"</strong>: se van a agregar <strong>{vaImportPreview.safraAAgregar}</strong> SAFRA
                    (únicamente a productos que NO la tienen) y se mantienen <strong>{vaImportPreview.safraMantenidas}</strong>{" "}
                    (productos que ya la tienen — quedan EXACTAMENTE igual, nunca se sobrescribe).
                    <span className="block mt-1">
                      No se crean productos y no se tocan costos de entrada, % DESC, GASTOS ADM,
                      VALOR DESC., bases de porcentajes, % Contado, stock, etiquetas ni fabricantes.
                      Las filas sin % ADD, sin VALOR ADD o sin SAFRA dejan ese campo como está (nunca se borra).
                    </span>
                  </div>

                  {/* Muestra de cambios */}
                  {vaImportPreview.cambios.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-stone-800 mb-2">
                        Vista previa de cambios (primeros {vaImportPreview.cambios.length} de {vaImportPreview.aActualizar})
                      </p>
                      <div className="border border-stone-200 rounded-lg overflow-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0" style={{ background: "#f5f5f4" }}>
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">COD</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-stone-600">Descripción</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">% ADD</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">VALOR ADD</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">SAFRA</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Costo Prod. actual → nuevo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-stone-600">Precio Contado actual → nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vaImportPreview.cambios.map((c, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-2 py-1.5 font-mono font-semibold text-stone-800">{c.sku}</td>
                                <td className="px-2 py-1.5 text-stone-700 max-w-[220px] truncate" title={c.name}>{c.name || "—"}</td>
                                <td className="px-2 py-1.5 text-right font-bold text-amber-700 whitespace-nowrap">
                                  {c.addPctNuevo === null ? (
                                    <span className="font-normal text-stone-400">—</span>
                                  ) : (
                                    <>
                                      {c.addPctActual !== null ? fmtPctVal(c.addPctActual) : "— (vacío)"} → {fmtPctVal(c.addPctNuevo)}
                                    </>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right font-bold text-amber-700 whitespace-nowrap">
                                  {c.valorAddNuevo === null ? (
                                    <span className="font-normal text-stone-400">—</span>
                                  ) : (
                                    <>
                                      {c.valorAddActual !== null ? formatPYG(c.valorAddActual) : "— (vacío)"} → {formatPYG(c.valorAddNuevo)}
                                    </>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right font-bold text-amber-700 whitespace-nowrap">
                                  {c.safraNuevo === null ? (
                                    <span className="font-normal text-stone-400">—</span>
                                  ) : c.safraMantenida ? (
                                    <span
                                      className="font-normal text-stone-500"
                                      title="El producto ya tiene SAFRA: queda exactamente igual (no se sobrescribe)"
                                    >
                                      mantiene {c.safraNuevo}
                                    </span>
                                  ) : (
                                    <>
                                      {c.safraActual !== null && c.safraActual !== "" ? c.safraActual : "— (vacío)"} → <span className="font-bold text-violet-700">{c.safraNuevo}</span>
                                    </>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right text-stone-600 whitespace-nowrap">
                                  {c.costProdActual !== null ? formatPYG(c.costProdActual) : "—"}
                                  <span className="mx-1">→</span>
                                  <span className="font-bold text-emerald-700">{c.costProdNuevo !== null ? formatPYG(c.costProdNuevo) : "—"}</span>
                                </td>
                                <td className="px-2 py-1.5 text-right text-stone-600 whitespace-nowrap">
                                  {c.precioActual !== null ? formatPYG(c.precioActual) : "—"}
                                  <span className="mx-1">→</span>
                                  <span className="font-bold text-emerald-700">{c.precioNuevo !== null ? formatPYG(c.precioNuevo) : "—"}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Códigos sin producto (muestra) */}
                  {vaImportPreview.noEncontradosMuestra.length > 0 && (
                    <div className="text-xs text-stone-500">
                      <span className="font-semibold text-stone-600">Sin producto en el sistema (muestra): </span>
                      {vaImportPreview.noEncontradosMuestra.slice(0, 20).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-end gap-3 bg-stone-50">
              {!vaImportResult && (
                <>
                  <button
                    onClick={() => setVaImportOpen(false)}
                    className="h-9 px-4 rounded-lg text-stone-600 text-sm font-bold hover:bg-stone-200 transition-colors disabled:opacity-50"
                    disabled={vaImportLoading || vaImportApplying}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleValorAddApply}
                    className="h-9 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                    disabled={
                      vaImportLoading ||
                      vaImportApplying ||
                      !vaImportPreview ||
                      vaImportPreview.aActualizar === 0
                    }
                  >
                    {vaImportApplying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                        Aplicando VALOR + % ADD + SAFRA…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        APLICAR VALOR + % ADD + SAFRA
                      </>
                    )}
                  </button>
                </>
              )}
              {vaImportResult && (
                <button
                  onClick={() => setVaImportOpen(false)}
                  className="h-9 px-4 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-colors"
                  style={{ background: "linear-gradient(135deg, #b45309 0%, #d97706 100%)" }}
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

    </div>
  );
}

const ExcelRow = memo(function ExcelRow({
  product,
  rowIndex,
  form,
  isDirty,
  label,
  isLabelMenuOpen,
  onToggleLabelMenu,
  onSetLabel,
  onChange,
  onSave,
  onDelete,
}: {
  product: Product;
  rowIndex: number;
  form: any;
  isDirty: boolean;
  label: string | null;
  isLabelMenuOpen: boolean;
  onToggleLabelMenu: () => void;
  onSetLabel: (color: string | null) => void;
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
  const labelColors = [
    { id: "verde", color: "#28A745", label: "Seleccionado" },
    { id: "azul", color: "#007BFF", label: "Para Pedido" },
    { id: "dorado", color: "#FFC107", label: "Descontinuado" },
    { id: "rojo", color: "#DC3545", label: "Quema Stock" },
  ];
  const currentStyle = label ? labelStyles[label] : null;

  return (
    <>
    <tr
      className={`border-b border-stone-100 ${currentStyle ? currentStyle.cellClass : ""}`}
      style={{ borderBottom: "1px solid #f1f5f9" }}
    >
      {/* Acciones - sticky */}
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
            style={label ? { backgroundColor: labelStyles[label].border, color: "white" } : undefined}
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
      {/* SKU - sticky - con badge de última edición encima */}
      <td className="sticky left-[120px] z-10 px-2 py-0.5 font-mono text-[#1c1917] font-semibold border-r border-stone-100 bg-[#D9B86B] align-top">
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
        <div style={{ fontSize: "11px" }}>{product.sku}</div>
      </td>
      {/* Todas las columnas */}
      {COLUMNS.map((col, ci) => (
        <Cell
          key={col.key}
          col={col}
          value={form[col.key]}
          rowIndex={rowIndex}
          colIndex={ci}
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
              {labelColors.map((lc) => (
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
  onChange,
}: {
  col: ColDef;
  value: any;
  rowIndex: number;
  colIndex: number;
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
      ? Number(value) * 100
      : value ?? "";

  const inputNode = (
    <input
      type={isNum || isPct ? "number" : "text"}
      step={isPct ? "0.01" : isNum ? "1" : undefined}
      value={displayValue}
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
      className={`w-full ${isDesc ? "min-w-[400px]" : "min-w-[80px]"} h-6 px-2 rounded border border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100 outline-none text-xs tabular-nums ${
        isText ? "text-left" : "text-right"
      }`}
      placeholder="—"
    />
  );

  // Columnas normales: input simple de una línea, como siempre
  if (!isDesc) {
    return (
      <td className="px-1 py-0 border-r border-stone-50 bg-white">
        {inputNode}
      </td>
    );
  }

  // DESCRIPCION: input + flechita para expandir/contraer el texto completo
  return (
    <td className="px-1 py-0 border-r border-stone-50 bg-white">
      <div className="flex items-start gap-0.5">
        {descExpanded ? (
          <textarea
            ref={descRef}
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            placeholder="—"
            className="w-full min-w-[400px] px-2 py-1 rounded border border-transparent hover:border-stone-200 focus:border-rose-400 focus:bg-amber-50 focus:ring-1 focus:ring-rose-100 outline-none text-xs text-left leading-4 resize-none bg-white"
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

// Botón de ordenamiento para la columna STOCK (flechita)
// Estados: null (sin orden, flecha neutral) → "desc" (mayor a menor, ↓) → "asc" (menor a mayor, ↑) → null
const StockSortButton = memo(function StockSortButton({
  dir,
  onClick,
}: {
  dir: "asc" | "desc" | null;
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
      title={
        dir === "desc"
          ? "Stock: mayor a menor (click para menor a mayor)"
          : dir === "asc"
          ? "Stock: menor a mayor (click para volver al orden normal)"
          : "Ordenar por stock: mayor a menor / menor a mayor"
      }
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
