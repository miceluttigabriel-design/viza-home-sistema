"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  ShoppingCart,
  LogOut,
  LayoutDashboard,
  X,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  Filter,
  ChevronDown,
  Plus,
  Download,
  FileSpreadsheet,
  Tag,
  Pencil,
  KeyRound,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { formatPYG } from "@/lib/format";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";

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

const PAGE_SIZE = 15; // Filas más grandes, menos por página

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
  // Datos principales (pegados al SKU)
  { key: "referencia", label: "REFERENCIA", type: "text", group: "DATOS" },
  // DATOS FINALES movidos antes de DESCRIPCION (orden solicitado por el usuario)
  { key: "fabricante", label: "FABRICANTE", type: "text", group: "DATOS FINALES" },
  { key: "subGrupo", label: "SUB-GRUPO", type: "text", group: "DATOS FINALES" },
  { key: "categoria", label: "CATEGORIA", type: "text", group: "DATOS FINALES" },
  { key: "division", label: "DIVISION", type: "text", group: "DATOS FINALES" },
  { key: "tipo", label: "TIPO", type: "text", group: "DATOS FINALES" },
  { key: "marca", label: "MARCA", type: "text", group: "DATOS FINALES" },
  { key: "modelo", label: "MODELO", type: "text", group: "DATOS FINALES" },
  { key: "stock", label: "STOCK", type: "num", group: "DATOS FINALES" },
  { key: "costSistema", label: "COSTO SISTEMA", type: "num", group: "DATOS FINALES" },
  { key: "productName", label: "PRODUCTO", type: "text", group: "DATOS FINALES" },
  // Datos de identificacion (despues de DATOS FINALES)
  { key: "name", label: "DESCRIPCION", type: "text", group: "DATOS" },
  { key: "codViza", label: "DATOS VIZA", type: "text", group: "DATOS" },
  { key: "codShow", label: "COD SHOW", type: "text", group: "DATOS" },
  // Costos
  { key: "costBR", label: "Costo R$", type: "num", group: "COSTOS" },
  { key: "rsToGs", label: "R$ A GS", type: "calc", group: "COSTOS" },
  { key: "costUS", label: "Costo US$", type: "num", group: "COSTOS" },
  { key: "usToGs", label: "US$ A GS", type: "calc", group: "COSTOS" },
  { key: "costGs", label: "Costo Gs", type: "num", group: "COSTOS" },
  { key: "rsNoUS", label: "R$ NO US$", type: "calc", group: "COSTOS" },
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
  // VALOR TECNICO, MARGEN TECNICO, COLUNA1, COLUNA2 movidas al final
  { key: "valorTecnico", label: "VALOR TECNICO", type: "num", group: "DATOS FINALES" },
  { key: "margenTecnico", label: "MARGEN TECNICO", type: "num", group: "DATOS FINALES" },
  { key: "coluna1", label: "COLUNA1", type: "text", group: "DATOS FINALES" },
  { key: "coluna2", label: "COLUNA2", type: "text", group: "DATOS FINALES" },
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
  // Filtro activo de etiqueta de color: "verde" | "azul" | "dorado" | "rojo" | null
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

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
  }, [search, page, columnFilters, labelFilter]);

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
      const recalculated = recalcLive(fullForm);
      // Sobrescribir los campos calculados en form
      Object.assign(form, recalculated);
    }

    return form;
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100">
      <header className="sticky top-0 z-30 border-b" style={{ backgroundColor: "#155789", borderColor: "#0d3d5e" }}>
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #b89853 0%, #D9B86B 50%, #b89853 100%)" }} />
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: "system-ui, sans-serif" }}>VIZA</span>
              <span className="text-base font-bold" style={{ color: "#D9B86B", fontFamily: "system-ui, sans-serif" }}>home</span>
            </div>
            <div className="hidden md:block border-l pl-3 ml-1" style={{ borderColor: "#D9B86B" }}>
              <p className="text-[11px] font-medium text-white/80">ADMIN · Gestión de Productos</p>
              <p className="text-[10px] italic" style={{ color: "#D9B86B" }}>Todo para tu hogar, en un solo lugar.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onGoSales}
              className="h-10 px-3 sm:px-4 rounded-xl text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">IR A VENTAS</span>
            </button>

            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-white leading-none">
                {user.name || user.email}
              </span>
              <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "#D9B86B" }}>
                {isSupremo ? "SUPREMO ADMIN" : "ADMINISTRADOR"}
              </span>
            </div>

            <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>

            {isSupremo && onGoGestion && (
              <button
                onClick={onGoGestion}
                className="h-10 px-3 sm:px-4 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #b89853 0%, #D9B86B 100%)", color: "#0d3d5e" }}
                title="Gestión de Accesos y Contraseñas"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">GESTIÓN DE ACCESOS</span>
                <span className="sm:hidden">ACCESOS</span>
              </button>
            )}
            <button
              onClick={onOpenCambiarContrasena}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(217, 184, 107, 0.18)", color: "#D9B86B" }}
              title="Cambiar mi contraseña"
              aria-label="Cambiar mi contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal: Cambiar mi contraseña */}
      <CambiarContrasena
        email={user.email}
        open={cambiarContrasenaOpen}
        onClose={() => setCambiarContrasenaOpen(false)}
      />

      <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-4">
          {/* Buscador */}
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="BUSCAR PRODUCTO POR SKU, NOMBRE, MARCA, MODELO O FABRICANTE..."
                className="w-full h-14 pl-12 pr-12 rounded-xl border-2 border-stone-200 text-base font-medium focus:border-rose-500 focus:ring-4 focus:ring-rose-100 outline-none bg-white shadow-sm"
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
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm" style={{ maxHeight: "calc(100vh - 200px)" }}>
            <div className="overflow-auto">
              <table className="admin-table border-collapse text-xs">
                <thead className="border-b-2 border-stone-300 sticky top-0 z-30" style={{ backgroundColor: "#D9B86B", color: "#155789" }}>
                  <tr>
                    {/* Columna acciones */}
                    <th className="sticky left-0 z-20 px-2 py-0.5 text-center font-bold border-r border-stone-300 min-w-[80px]" style={{ backgroundColor: "#D9B86B", color: "#155789" }}>
                      ACCIONES
                    </th>
                    {/* SKU */}
                    <th className="sticky left-[80px] z-20 px-2 py-0.5 text-left font-bold border-r border-stone-300 min-w-[80px]" style={{ backgroundColor: "#D9B86B", color: "#155789" }}>
                      SKU
                    </th>
                    {COLUMNS.map((col) => {
                      const hasFilter =
                        !!columnFilters[col.key] && columnFilters[col.key].length > 0;
                      const isOpen = openFilterColumn === col.key;
                      return (
                        <th
                          key={col.key}
                          className={`relative px-2 py-0.5 text-center font-bold border-r border-stone-200 whitespace-nowrap ${
                            col.type === "calc" ? "text-[#0d3d5e]" : "text-[#155789]"
                          }`}
                          style={{ backgroundColor: "#D9B86B" }}
                        >
                          <div className="flex flex-col items-center">
                            {col.group && (
                              <span className="text-[9px] font-normal mb-0.5" style={{ color: "#0d3d5e", opacity: 0.7 }}>
                                {col.group}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              <span>{col.label}</span>
                              <FilterButton
                                hasFilter={hasFilter}
                                isOpen={isOpen}
                                onClick={() =>
                                  setOpenFilterColumn(isOpen ? null : col.key)
                                }
                              />
                            </div>
                          </div>
                          {isOpen && (
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
                    products.map((p) => {
                      const form = getDisplayValues(p);
                      const isDirty = !!dirty[p.id];
                      return (
                        <ExcelRow
                          key={p.id}
                          product={p}
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
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
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

    </div>
  );
}

const ExcelRow = memo(function ExcelRow({
  product,
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
    >
      {/* Acciones - sticky */}
      <td className="sticky left-0 z-10 px-2 py-0.5 text-center border-r border-stone-200 bg-white">
        <div className="flex flex-col items-center justify-start gap-1 relative">
          <button
            id={`save-btn-${product.id}`}
            onClick={onSave}
            disabled={!isDirty}
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
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
            className="h-8 w-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
            style={label ? { backgroundColor: labelStyles[label].border, color: "white" } : undefined}
            title="Etiquetar producto"
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="h-8 w-8 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 flex items-center justify-center transition-colors"
            title="Eliminar producto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      {/* SKU - sticky - con badge de última edición encima */}
      <td className="sticky left-[80px] z-10 px-2 py-0.5 font-mono text-stone-700 font-semibold border-r border-stone-200 bg-white align-top">
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
      {COLUMNS.map((col) => (
        <Cell
          key={col.key}
          col={col}
          value={form[col.key]}
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

const Cell = memo(function Cell({
  col,
  value,
  onChange,
}: {
  col: ColDef;
  value: any;
  onChange: (v: string) => void;
}) {
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
      <td className="px-2 py-0.5 text-right tabular-nums bg-emerald-50/50 border-r border-stone-100 whitespace-nowrap text-stone-700">
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

  return (
    <td className="px-1 py-0 border-r border-stone-100 bg-white">
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
        className={`w-full min-w-[80px] h-7 px-2 rounded border border-transparent hover:border-stone-200 focus:border-rose-400 focus:ring-1 focus:ring-rose-100 outline-none text-xs tabular-nums ${
          isText ? "text-left" : "text-right"
        }`}
        placeholder="—"
      />
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
