"use client";

// ═══════════════════════════════════════════════════════════════════
// TASK 98 — STOCK GENERAL · FILTRO POR SUCURSAL + IMPORTAR INVENTARIO
// (pedido del dueño: "tenemos que hacer um filtro para poder ver por
// sucursal... lo que esta Central es nuestro deposito Central y los
// otros son por cada sucursal... tenemos que dividir bien... y un buton
// para importar adentro el inventario de stock")
//
//   · FILTRO POR SUCURSAL: pills TODAS / CENTRAL (depósito central) /
//     cada sucursal (KATUETE, NUEVA ESPERANZA, SALTOS DEL GUAIRA, LA
//     PALOMA...). Las cards, el gráfico por sub-grupo y la tabla
//     responden al filtro activo.
//   · IMPORTAR INVENTARIO: mismo motor de importación de siempre
//     (preview → confirmar → apply). El apply de la Task 98 divide el
//     saldo POR SUCURSAL (tabla aparte StockSucursal) además del stock
//     global de siempre. Antes de confirmar, el dueño ve CUÁNTAS filas,
//     SKUs y unidades caen en cada sucursal.
//   · Vista SOLO LECTURA igual que siempre: para editar un producto, LA
//     BASE. Nada se edita desde acá; la importación es la MISMA de la
//     BASE (mismas reglas de costos protegidos, márgenes automáticas…).
//
// Datos: UN endpoint nuevo (GET /api/stock/general) alimenta TODO
// (cards + pills + gráfico + tabla) para que nada se desincronice.
//
// TASK 124 — LAS COLUMNAS DE LA BASE DENTRO DE STOCK GENERAL (pedido del
// dueño: "TODAS ESTAS COLUNAS DE LA BASE... QUE ESTEA DENTRO DE STOCK
// GENERAL EN LA MISMA ORDEN... TODO LO REFERENTE A CADA CODIGO QUE SE
// EDITO DE LA BASE ESTEA REGISTRADO ALLA TANBIEN"):
//   · La tabla muestra las MISMAS columnas de LA BASE en la MISMA orden:
//     COD > PROVEDOR > GRUPO > SUB-GRUPO > MARCA > TIPO PRODUCTO > MODELO >
//     > CAPACIDAD > CORES > REF.FABRICA > DESCRIPCION (+ STOCK/SALDO al
//     final, la columna propia de esta vista). Encima de cada nombre va la
//     misma etiqueta de grupo que en la Base (DATOS FINALES / DATOS).
//   · Los datos salen VIVOS de la MISMA base que edita LA BASE (mismo
//     modelo Product + tablas aparte ProductCapacidad/ProductCores): cada
//     edición hecha en la Base queda registrada acá automáticamente.
//   · Los COD editados a mano en la Base llevan el MISMO badge naranja de
//     última edición que en la Base (quién y cuándo).
//   · Vista SOLO LECTURA igual que siempre: para editar, LA BASE.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
// Task 126 (pedido del dueño): escuchar los guardados de LA BASE para
// replicarlos AL INSTANTE en esta vista (columnas, stock y registro).
import { suscribirseAEdicionesProductos } from "@/lib/replicacion-productos";
import {
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  Layers,
  Tags,
  Building2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Upload,
  Check,
  Warehouse,
  Target,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

const AZUL = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface StockGeneralProps {
  user: AppUser;
  // Task 127: opcionales con la regla de la casa del SalesPanel — si no
  // llega la prop, el botón no se renderiza. El ORQUESTADOR solo lo ve el
  // supremo; VILMAR (viza@viza.com.py) entra con BASE (si es admin) o solo
  // con COTIZADOR (si es colaborador), según lo que page.tsx le pase.
  onGoOrquestador?: () => void;
  onGoBase?: () => void;
  onGoSales: () => void;
}

// ─── Respuesta de GET /api/stock/general (Task 98) ───
interface SucursalResumen {
  nombre: string;
  productos: number;
  unidades: number;
}

interface StatsResp {
  totalProducts: number;
  totalStock: number;
  bySubgrupo: Array<{ category: string | null; count: number; stock: number }>;
}

interface DatosResp {
  ok: boolean;
  sucursal: string | null;
  sucursales: SucursalResumen[];
  stats: StatsResp;
  rows: ProdFila[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  error?: string;
}

// Task 124: una fila = las mismas columnas de LA BASE (los mismos campos
// que edita la Base) + el stock/saldo propio de esta vista.
interface ProdFila {
  id: string;
  sku: string;
  name: string | null; // DESCRIPCION
  category: string | null; // categoría del catálogo (respaldo del SUB-GRUPO)
  fabricante?: string | null; // PROVEDOR
  categoria?: string | null; // GRUPO
  subGrupo?: string | null; // SUB-GRUPO
  marca?: string | null;
  tipo?: string | null; // TIPO PRODUCTO
  modelo?: string | null;
  capacidad?: string | null; // tabla aparte ProductCapacidad (igual que la Base)
  cores?: string | null; // tabla aparte ProductCores (igual que la Base)
  referencia?: string | null; // REF.FABRICA
  ultimaEdicionAt?: string | null; // badge de última edición (igual que la Base)
  ultimaEdicionPor?: string | null;
  stock: number;
}

// ─── Task 124: columnas de LA BASE dentro de STOCK GENERAL ───
// La MISMA orden que la tabla de la Base (Tasks 97/98/105):
// PROVEDOR > GRUPO > SUB-GRUPO > MARCA > TIPO PRODUCTO > MODELO >
// > CAPACIDAD > CORES > REF.FABRICA > DESCRIPCION. "grupo" es la etiqueta
// chiquita que aparece ENCIMA del nombre, igual que en la Base (PROVEDOR…
// CORES llevan DATOS FINALES; REF.FABRICA y DESCRIPCION llevan DATOS).
// COD va primero y STOCK/SALDO queda al final (columna propia de esta
// vista). Solo LECTURA: para editar un dato, LA BASE.
const COLS_BASE: Array<{ key: keyof ProdFila; label: string; grupo: string | null }> = [
  { key: "fabricante", label: "PROVEDOR", grupo: "DATOS FINALES" },
  { key: "categoria", label: "GRUPO", grupo: "DATOS FINALES" },
  { key: "subGrupo", label: "SUB-GRUPO", grupo: "DATOS FINALES" },
  { key: "marca", label: "MARCA", grupo: "DATOS FINALES" },
  { key: "tipo", label: "TIPO PRODUCTO", grupo: "DATOS FINALES" },
  { key: "modelo", label: "MODELO", grupo: "DATOS FINALES" },
  { key: "capacidad", label: "CAPACIDAD", grupo: "DATOS FINALES" },
  { key: "cores", label: "CORES", grupo: "DATOS FINALES" },
  { key: "referencia", label: "REF.FABRICA", grupo: "DATOS" },
  { key: "name", label: "DESCRIPCION", grupo: "DATOS" },
];

// ─── Vista previa de la importación (mismo motor que LA BASE + Task 98) ───
interface PreviewSucursal {
  nombre: string;
  filas: number;
  skus: number;
  unidades: number;
}

interface PreviewNuevo {
  sku: string;
  name: string | null;
  referencia: string | null;
  subGrupo: string | null;
  stock: number;
  costProd: number | null;
  margenAuto: number | null;
  margenFuente: string | null;
  safraAuto: string | null;
}

interface PreviewActualizado {
  sku: string;
  nameActual: string | null;
  stockActual: number;
  stockNuevo: number;
  costoActual: number | null;
  costoNuevo: number | null;
  costoProtegido: boolean;
}

interface ImportPreview {
  ok: boolean;
  totalFilas: number;
  codigosUnicos: number;
  nuevosCount: number;
  actualizadosCount: number;
  nuevos: PreviewNuevo[];
  actualizados: PreviewActualizado[];
  stockPorSucursal?: Record<string, Record<string, number>>;
  sucursales?: PreviewSucursal[];
  errores: string[];
}

interface ImportResult {
  creados: number;
  actualizados: number;
  conCostoActualizado?: number;
  sucursales?: {
    ok: boolean;
    filasGuardadas: number;
    productosTocados: number;
    sucursales: number;
  } | null;
  errores: string[];
}

// ─── DISTRIBUCIÓN INTELIGENTE (Task 127, pedido del dueño) ───
// Reporte de TRANSFERENCIAS INTERNAS entre sucursales (de donde sobra
// a donde falta — jamás órdenes de compra). Lo calcula
// GET /api/stock/distribucion con el STOCK IDEAL definido por nodo.
interface FilaDistribucion {
  sku: string;
  producto: string;
  color: string | null; // CORES (columna de la Base)
  tipo: string | null; // TIPO PRODUCTO (columna de la Base)
  origen: string;
  destino: string;
  cantidad: number;
  origenSaldo: number;
  origenIdeal: number;
  destinoSaldo: number;
  destinoIdeal: number;
  destinoFalta: number;
}

interface ResumenDistribucion {
  transferencias: number;
  unidades: number;
  productos: number;
  faltanteNoCubierto: number;
  sucursalesConFaltante: Array<{ nodo: string; falta: number }>;
}

// Fila de la pantalla CONFIGURAR STOCK IDEAL (GET /api/stock/ideal):
// saldo actual e ideal actual de cada producto por nodo.
interface FilaIdeal {
  id: string;
  sku: string;
  name: string;
  tipo: string | null;
  referencia: string | null;
  cores: string | null;
  saldos: Record<string, number>;
  ideales: Record<string, number>;
}

type OrdenOpt = "stock-asc" | "stock-desc" | "name-asc" | "sku-asc" | "sku-desc";

const ORDENES: Array<{ id: OrdenOpt; label: string; sort: string; dir: string }> = [
  { id: "stock-asc", label: "Menor stock primero", sort: "stock", dir: "asc" },
  { id: "stock-desc", label: "Mayor stock primero", sort: "stock", dir: "desc" },
  { id: "name-asc", label: "A → Z (descripción)", sort: "name", dir: "asc" },
  { id: "sku-asc", label: "COD ↑ (número)", sort: "sku", dir: "asc" },
  { id: "sku-desc", label: "COD ↓ (número)", sort: "sku", dir: "desc" },
];

const PAGE_SIZE = 50;
// Productos por página en la pantalla CONFIGURAR STOCK IDEAL (Task 127).
const IDEAL_PAGE_SIZE = 50;

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-PY").format(n);
}

function stockBadgeCls(stock: number): string {
  if (stock <= 0) return "bg-red-100 text-red-700 ring-red-200";
  if (stock <= 5) return "bg-amber-100 text-amber-700 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

export function StockGeneral({ user, onGoOrquestador, onGoBase, onGoSales }: StockGeneralProps) {
  const esSupremo = user.role === "supremo_admin";

  // ═══ Datos de la vista (un solo endpoint para cards + pills + gráfico + tabla) ═══
  const [sucursalSel, setSucursalSel] = useState<string | null>(null); // null = TODAS
  const [sucursales, setSucursales] = useState<SucursalResumen[]>([]);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [datosError, setDatosError] = useState(false);

  // ─── Tabla ───
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [orden, setOrden] = useState<OrdenOpt>("stock-asc");
  const [subgrupo, setSubgrupo] = useState<string | null>(null); // null = todos
  const [page, setPage] = useState(1);
  const [filas, setFilas] = useState<ProdFila[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Arranca true: la primera carga la hace el effect de abajo y termina acá.
  // Los siguientes TRUE los ponen los handlers que disparan cada recarga
  // (búsqueda, orden, página, sub-grupo, sucursal) — NUNCA dentro del effect (lint).
  const [cargando, setCargando] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda con debounce (no golpea el servidor por cada tecla)
  const onBusquedaChange = (v: string) => {
    setBusqueda(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBusquedaAplicada(v.trim());
      setPage(1);
      setCargando(true);
    }, 350);
  };

  const ordenActual = ORDENES.find((o) => o.id === orden) ?? ORDENES[0];

  // Nota lint (react-hooks/set-state-in-effect): el primer setState de acá
  // ocurre SIEMPRE después del await fetch — nada síncrono en el effect.
  const cargarDatos = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort: ordenActual.sort,
        dir: ordenActual.dir,
      });
      if (busquedaAplicada) params.set("search", busquedaAplicada);
      if (subgrupo) params.set("subgrupo", subgrupo);
      if (sucursalSel) params.set("sucursal", sucursalSel);
      // Task 126: siempre datos VIVOS — jamás una copia cacheada del navegador
      // (así lo replicado desde LA BASE llega tal cual a la tabla).
      const res = await fetch(`/api/stock/general?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DatosResp;
      setSucursales(Array.isArray(data.sucursales) ? data.sucursales : []);
      setStats(data.stats ?? null);
      setFilas(Array.isArray(data.rows) ? data.rows : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setDatosError(false);
    } catch {
      setStats(null);
      setFilas([]);
      setTotal(0);
      setTotalPages(1);
      setDatosError(true);
    } finally {
      setCargando(false);
    }
  }, [page, ordenActual, busquedaAplicada, subgrupo, sucursalSel]);

  // Patrón del propio admin-panel (fetchProducts): la llamada se hace vía
  // setTimeout(0) para que NINGÚN setState corra síncrono dentro del effect
  // (react-hooks/set-state-in-effect — misma regla del baseline).
  useEffect(() => {
    const t = setTimeout(() => cargarDatos(), 0);
    return () => clearTimeout(t);
  }, [cargarDatos]);

  // ═══ REPLICACIÓN EN VIVO desde LA BASE (Task 126, pedido del dueño) ═══
  // "cada vez que um producto sea editado y guardado quiero que el mismo
  // replique en el stock... incluso los registros... toda edicion hecha y
  // guardada en estas colunas hay que replicar en el stock general".
  //
  // Cuando el dueño guarda una fila en LA BASE, esta vista recibe el aviso
  // (misma pestaña vía CustomEvent y otras pestañas vía BroadcastChannel /
  // storage — ver src/lib/replicacion-productos.ts) y vuelve a pedir TODOS
  // sus datos: las columnas de la Base (PROVEDOR, GRUPO, SUB-GRUPO, MARCA,
  // TIPO PRODUCTO, MODELO, CAPACIDAD, CORES, REF.FABRICA, DESCRIPCION), el
  // STOCK/SALDO y el registro de última edición (badge naranja del COD)
  // quedan al día SIN tocar filtros ni refrescar a mano.
  //
  // Ref antial desactualización: apunta SIEMPRE a la última cargarDatos
  // (con sus filtros/página/orden vigentes) para que el aviso refresque
  // con lo que el dueño está viendo en este momento.
  const recargarRef = useRef<() => void>(() => {});
  useEffect(() => {
    recargarRef.current = cargarDatos;
  }, [cargarDatos]);

  useEffect(() => {
    const dejarDeEscuchar = suscribirseAEdicionesProductos(() => {
      recargarRef.current();
    });
    return dejarDeEscuchar;
  }, []);

  // Cinturón extra: al volver a ESTA pestaña (o traer la ventana al frente)
  // también refresca — si el aviso no llegara por ningún canal, la vista
  // igual se pone al día en el momento en que el dueño la mira.
  useEffect(() => {
    const recargarSiVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      recargarRef.current();
    };
    window.addEventListener("focus", recargarSiVisible);
    document.addEventListener("visibilitychange", recargarSiVisible);
    return () => {
      window.removeEventListener("focus", recargarSiVisible);
      document.removeEventListener("visibilitychange", recargarSiVisible);
    };
  }, []);

  const maxStockCat = stats?.bySubgrupo?.reduce((m, c) => Math.max(m, c.stock), 0) ?? 0;
  const inicial = (user.name || user.email).charAt(0).toUpperCase();

  // ═══ IMPORTAR INVENTARIO (mismo motor que LA BASE, con reparto por sucursal) ═══
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const abrirImport = () => {
    setImportOpen(true);
    setImportPreview(null);
    setImportResult(null);
    setImportLoading(false);
    setImportApplying(false);
    fileInputRef.current?.click();
  };

  const onArchivoElegido = async (file: File) => {
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
      const data = (await res.json()) as ImportPreview & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      setImportPreview(data);
    } catch (error) {
      console.error("Error import preview (Stock General):", error);
      alert(`Error al leer el inventario: ${(error as Error).message}`);
      setImportOpen(false);
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmarImport = async () => {
    if (!importPreview) return;
    setImportApplying(true);
    try {
      const res = await fetch("/api/products/import-stock/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuevos: importPreview.nuevos ?? [],
          actualizados: importPreview.actualizados ?? [],
          // Task 98: reparto del saldo por SUCURSAL (CENTRAL = depósito central)
          stockPorSucursal: importPreview.stockPorSucursal || {},
        }),
      });
      // Leer SIEMPRE como texto primero (misma garantía que LA BASE: si el
      // servidor responde HTML de timeout, se ve un mensaje claro).
      const text = await res.text();
      let data: ImportResult & { error?: string };
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
        throw new Error(
          `El servidor respondió con estado ${res.status} pero no devolvió JSON. ` +
          `Probablemente timeout (muchos productos). Primeros caracteres: "${preview || "(respuesta vacía)"}".`
        );
      }
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      setImportResult(data);
      // Recargar la vista completa (cards + pills + tabla) con el inventario nuevo
      setCargando(true);
      const t = setTimeout(() => cargarDatos(), 0);
      void t;
    } catch (error) {
      console.error("Error apply (Stock General):", error);
      alert(`Error al aplicar la importación: ${(error as Error).message}`);
    } finally {
      setImportApplying(false);
    }
  };

  // ═══ DISTRIBUCIÓN INTELIGENTE (Task 127, pedido del dueño) ═══
  // Reporte de transferencias internas entre sucursales (de donde SOBRA
  // a donde FALTA, con el STOCK IDEAL por nodo) + pantalla para definir
  // ese stock ideal. Nada se escribe en el stock desde acá: es un
  // REPORTE para que el equipo mueva la mercadería.
  const [distOpen, setDistOpen] = useState(false);
  const [distMode, setDistMode] = useState<"reporte" | "ideal">("reporte");
  const [distCargando, setDistCargando] = useState(false);
  const [distFilas, setDistFilas] = useState<FilaDistribucion[]>([]);
  const [distResumen, setDistResumen] = useState<ResumenDistribucion | null>(null);
  const [distAviso, setDistAviso] = useState<string | null>(null);
  const [distSucursales, setDistSucursales] = useState<string[]>([]);

  const cargarDistribucion = useCallback(async () => {
    setDistCargando(true);
    try {
      const res = await fetch("/api/stock/distribucion", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`);
      setDistFilas(Array.isArray(data.filas) ? data.filas : []);
      setDistResumen(data.resumen ?? null);
      setDistAviso(data.aviso ?? null);
      setDistSucursales(Array.isArray(data.sucursales) ? data.sucursales : []);
    } catch (error) {
      console.error("Error distribución:", error);
      toast.error(`Distribución: ${(error as Error).message}`);
      setDistFilas([]);
      setDistResumen(null);
    } finally {
      setDistCargando(false);
    }
  }, []);

  const abrirDistribucion = () => {
    setDistOpen(true);
    setDistMode("reporte");
    void cargarDistribucion();
  };

  // ── CONFIGURAR STOCK IDEAL (segunda pantalla del modal) ──
  const [idealBusqueda, setIdealBusqueda] = useState("");
  const [idealBusquedaAplicada, setIdealBusquedaAplicada] = useState("");
  const [idealPage, setIdealPage] = useState(1);
  const [idealRows, setIdealRows] = useState<FilaIdeal[]>([]);
  const [idealTotal, setIdealTotal] = useState(0);
  const [idealTotalPages, setIdealTotalPages] = useState(1);
  const [idealCargando, setIdealCargando] = useState(false);
  const [idealGuardando, setIdealGuardando] = useState(false);
  // Cambios sin guardar: "productId||sucursal" → ideal nuevo (0 = quitar).
  const [idealEdiciones, setIdealEdiciones] = useState<Record<string, number>>({});
  const idealDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargarIdeales = useCallback(async (busqueda: string, page: number) => {
    setIdealCargando(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(IDEAL_PAGE_SIZE),
      });
      if (busqueda) params.set("search", busqueda);
      const res = await fetch(`/api/stock/ideal?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`);
      setIdealRows(Array.isArray(data.rows) ? data.rows : []);
      setIdealTotal(typeof data.total === "number" ? data.total : 0);
      setIdealTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setDistSucursales(Array.isArray(data.sucursales) ? data.sucursales : []);
    } catch (error) {
      console.error("Error stock ideal:", error);
      toast.error(`Stock ideal: ${(error as Error).message}`);
      setIdealRows([]);
    } finally {
      setIdealCargando(false);
    }
  }, []);

  const irAModoIdeal = () => {
    setDistMode("ideal");
    setIdealEdiciones({});
    void cargarIdeales(idealBusquedaAplicada, idealPage);
  };

  // Búsqueda con debounce (mismo patrón que la tabla principal).
  const onIdealBusquedaChange = (v: string) => {
    setIdealBusqueda(v);
    if (idealDebounceRef.current) clearTimeout(idealDebounceRef.current);
    idealDebounceRef.current = setTimeout(() => {
      setIdealBusquedaAplicada(v.trim());
      setIdealPage(1);
    }, 350);
  };

  // Recarga la lista de ideales cuando cambian búsqueda/página (solo si
  // el modal está abierto en modo ideal).
  useEffect(() => {
    if (!distOpen || distMode !== "ideal") return;
    const t = setTimeout(() => cargarIdeales(idealBusquedaAplicada, idealPage), 0);
    return () => clearTimeout(t);
  }, [distOpen, distMode, idealBusquedaAplicada, idealPage, cargarIdeales]);

  const valorIdeal = (fila: FilaIdeal, sucursal: string): string => {
    const key = `${fila.id}||${sucursal}`;
    if (key in idealEdiciones) return String(idealEdiciones[key]);
    const actual = fila.ideales[sucursal];
    return typeof actual === "number" ? String(actual) : "";
  };

  const setValorIdeal = (fila: FilaIdeal, sucursal: string, v: string) => {
    const key = `${fila.id}||${sucursal}`;
    setIdealEdiciones((prev) => {
      const next = { ...prev };
      const limpio = v.trim();
      const actualGuardado = fila.ideales[sucursal];
      if (limpio === "") {
        // vacío = quitar el ideal (borra la fila si existía)
        next[key] = 0;
      } else {
        const n = Math.max(0, Math.floor(Number(limpio) || 0));
        next[key] = n;
      }
      // Si quedó igual que lo ya guardado, sacar del diff (menos ruido)
      const actualNum =
        typeof actualGuardado === "number" ? actualGuardado : 0;
      if (next[key] === actualNum && !(limpio === "" && actualNum > 0)) {
        delete next[key];
      }
      return next;
    });
  };

  const guardarIdealesHandler = async () => {
    const items = Object.entries(idealEdiciones).map(([k, ideal]) => {
      const [productId, sucursal] = k.split("||");
      return { productId, sucursal, ideal };
    });
    if (items.length === 0) return;
    setIdealGuardando(true);
    try {
      const res = await fetch("/api/stock/ideal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`);
      if (Array.isArray(data.errores) && data.errores.length > 0) {
        toast.warning(`Stock ideal guardado con ${data.errores.length} aviso(s)`);
      } else {
        toast.success(
          `Stock ideal guardado: ${data.filas ?? items.length} nodo(s) actualizado(s)`
        );
      }
      setIdealEdiciones({});
      await cargarIdeales(idealBusquedaAplicada, idealPage);
      // El reporte queda recalculado con los ideales nuevos.
      await cargarDistribucion();
    } catch (error) {
      console.error("Error guardando ideales:", error);
      toast.error(`Stock ideal: ${(error as Error).message}`);
    } finally {
      setIdealGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100">
      {/* ─── Header (mismo lenguaje visual que los demás paneles) ─── */}
      <header className="sticky top-0 z-30 backdrop-blur shadow-md" style={{ backgroundColor: AZUL }}>
        <div className="h-1.5 w-full" style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})` }} />
        <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          {/* Task 125: sin max-w-7xl — el contenido del header llega a las
              mismas extremidades que las cards de abajo (alineados). */}
          <div className="flex items-center gap-2">
            {esSupremo && onGoOrquestador && (
              <button
                onClick={onGoOrquestador}
                className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95 shrink-0"
                style={{ backgroundColor: "#FFFFFF", color: AZUL }}
                title="Volver al Orquestador (solo supremo)"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ORQUESTADOR</span>
              </button>
            )}
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight px-1">STOCK GENERAL</h1>
            <span
              className="hidden md:flex items-center gap-1.5 text-[9px] font-black tracking-widest px-2 py-1 rounded-full"
              style={{ background: "rgba(34,197,94,0.18)", color: "#4ade80" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              SYSTEM ONLINE
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Task 127: DISTRIBUCIÓN INTELIGENTE — la ve quien entra a esta
                vista (supremo y el usuario habilitado viza@viza.com.py). */}
            <button
              onClick={abrirDistribucion}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95 shrink-0"
              style={{ backgroundColor: "#FFFFFF", color: AZUL }}
              title="Reporte de transferencias internas entre sucursales (de donde sobra a donde falta)"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">DISTRIBUCIÓN INTELIGENTE</span>
              <span className="sm:hidden">DISTRIB.</span>
            </button>
            {esSupremo && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onArchivoElegido(file);
                  }}
                />
                <button
                  onClick={abrirImport}
                  className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-110 shrink-0 text-white"
                  style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                  title="Importar planilla de inventario del ERP (stock + sucursales + nuevos productos)"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>IMPORTAR INVENTARIO</span>
                </button>
              </>
            )}
            {onGoBase && (
              <button
                onClick={onGoBase}
                className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center transition-colors border border-transparent hover:brightness-95 shrink-0"
                style={{ backgroundColor: DORADO, color: AZUL }}
                title="Ir a LA BASE (editar productos)"
              >
                <span>BASE</span>
              </button>
            )}
            <button
              onClick={onGoSales}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center transition-colors border border-transparent hover:brightness-95 shrink-0"
              style={{ backgroundColor: DORADO, color: AZUL }}
              title="Ir al COTIZADOR (panel de ventas)"
            >
              <span>COTIZADOR</span>
            </button>
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`, color: AZUL }}
              title={`${user.name || user.email}${esSupremo ? " · SUPREMO" : ""}`}
            >
              {inicial}
            </div>
          </div>
        </div>
      </header>

      {/* Task 125 (pedido del dueño: "consigue expandir para que llegue a la
          extremidade del lado derecho e izquierdo para que quede mayor"):
          sin el max-w-7xl de antes, TODO el contenido (cards + gráfico +
          TABLA) se estira de extremidad a extremidad de la pantalla y la
          tabla muestra más columnas sin scrollear. Queda el mismo padding
          chico de siempre (16/24px) como aire de los bordes, y el header
          de arriba queda alineado con las mismas extremidades. */}
      <main className="px-4 sm:px-6 py-5 space-y-5">
        {/* Aviso de solo lectura */}
        <p className="text-[11px] text-stone-500 font-medium">
          Vista de consulta · para editar un producto, andá a LA BASE · la importación divide el inventario POR SUCURSAL (CENTRAL = depósito central).
        </p>

        {/* ─── FILTRO POR SUCURSAL (Task 98) ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-black text-stone-700 tracking-wide flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-sky-600" />
              SUCURSALES
              <span className="text-[10px] font-bold text-stone-400 normal-case tracking-normal hidden sm:inline">
                · clic para ver el inventario de cada una
              </span>
            </h2>
            <button
              onClick={() => {
                setCargando(true);
                const t = setTimeout(() => cargarDatos(), 0);
                void t;
              }}
              className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-sky-600 hover:border-sky-200 transition-colors shrink-0"
              title="Refrescar todo"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Pill TODAS (sin filtro = stock global de siempre) */}
            <button
              onClick={() => { setSucursalSel(null); setPage(1); setSubgrupo(null); setCargando(true); }}
              className={`h-9 px-4 rounded-xl text-xs font-black tracking-wide transition-colors ring-1 ${
                sucursalSel === null
                  ? "text-white ring-transparent shadow-sm"
                  : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
              }`}
              style={sucursalSel === null ? { backgroundColor: AZUL } : undefined}
              title="Todo el inventario (stock general de siempre)"
            >
              TODAS
            </button>

            {sucursales.map((s) => {
              const activa = sucursalSel === s.nombre;
              const esCentral = s.nombre === "CENTRAL";
              return (
                <button
                  key={s.nombre}
                  onClick={() => {
                    // Clic de nuevo → volver a TODAS (misma conducta que el gráfico)
                    setSucursalSel(activa ? null : s.nombre);
                    setPage(1);
                    setSubgrupo(null);
                    setCargando(true);
                  }}
                  className={`h-9 pl-3 pr-3.5 rounded-xl text-xs font-bold transition-colors ring-1 flex items-center gap-2 ${
                    activa
                      ? "text-white ring-transparent shadow-sm"
                      : esCentral
                      ? "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100"
                      : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
                  }`}
                  style={activa ? { backgroundColor: esCentral ? "#92610c" : AZUL } : undefined}
                  title={
                    esCentral
                      ? "CENTRAL · Depósito central del inventario"
                      : `Ver solo el stock de la sucursal ${s.nombre}`
                  }
                >
                  {esCentral && <Warehouse className="h-3.5 w-3.5" />}
                  <span>{s.nombre}</span>
                  {esCentral && (
                    <span
                      className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-full ${
                        activa ? "bg-white/20 text-white" : "bg-amber-200/70 text-amber-900"
                      }`}
                    >
                      DEPÓSITO
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full ${
                      activa ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {fmtNum(s.unidades)} u
                  </span>
                </button>
              );
            })}

            {sucursales.length === 0 && (
              <p className="text-[11px] text-stone-400 font-medium self-center">
                Todavía no hay sucursales cargadas. Usá IMPORTAR INVENTARIO con la planilla del ERP (columna SUCURSAL) para activar este filtro.
              </p>
            )}
          </div>
        </div>

        {/* ─── Tarjetas de resumen (responden al filtro de sucursal) ─── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Productos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : stats ? fmtNum(stats.totalProducts) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Boxes className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">
                  Unidades{sucursalSel ? " · sucursal" : ""}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : stats ? fmtNum(stats.totalStock) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Sub-grupos</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : stats ? fmtNum(stats.bySubgrupo?.length ?? 0) : "…"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Tags className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Sucursales con stock</p>
                <p className="text-2xl sm:text-3xl font-black text-stone-800 mt-1 tabular-nums">
                  {datosError ? "—" : fmtNum(sucursales.length)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Stock por sub-grupo ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-700 tracking-wide">
              STOCK POR SUB-GRUPO
              {sucursalSel && (
                <span className="ml-2 text-[10px] font-black text-sky-700 bg-sky-50 ring-1 ring-sky-200 rounded-full px-2 py-0.5 align-middle">
                  {sucursalSel}
                </span>
              )}
            </h2>
          </div>
          {datosError ? (
            <p className="text-xs text-red-500 font-medium">No se pudo cargar el resumen. Probá refrescar.</p>
          ) : !stats ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (stats.bySubgrupo?.length ?? 0) === 0 ? (
            <p className="text-xs text-stone-400">
              {sucursalSel
                ? `Sin stock de "${sucursalSel}" en el inventario importado.`
                : "Sin sub-grupos cargados todavía."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {stats.bySubgrupo.map((c) => (
                <button
                  key={c.category ?? "__sin__"}
                  onClick={() => {
                    // Clic en el sub-grupo → filtra la tabla de abajo (solo lectura)
                    setSubgrupo(subgrupo === c.category ? null : c.category);
                    setPage(1);
                    setCargando(true);
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors text-left ${
                    subgrupo === c.category ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-stone-50"
                  }`}
                  title={subgrupo === c.category ? "Quitar filtro de este sub-grupo" : "Ver este sub-grupo en la tabla"}
                >
                  <span className="text-xs font-semibold text-stone-600 w-40 sm:w-56 truncate shrink-0">
                    {c.category || "Sin sub-grupo"}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxStockCat > 0 ? Math.max(2, Math.round((c.stock / maxStockCat) * 100)) : 0}%`,
                        background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500 w-24 text-right shrink-0 tabular-nums">
                    {fmtNum(c.stock)} u · {fmtNum(c.count)} pr
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Tabla de stock ─── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => onBusquedaChange(e.target.value)}
                placeholder="Buscar por descripción, COD, marca, modelo…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
              />
            </div>
            <select
              value={orden}
              onChange={(e) => {
                setOrden(e.target.value as OrdenOpt);
                setPage(1);
                setCargando(true);
              }}
              className="h-10 px-3 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Filtros activos (sucursal y/o sub-grupo) */}
          {(sucursalSel || subgrupo) && (
            <div className="px-4 sm:px-5 pb-2 flex flex-wrap items-center gap-2">
              {sucursalSel && (
                <span className="text-[11px] font-bold text-white rounded-full px-2.5 py-1 flex items-center gap-1.5" style={{ backgroundColor: AZUL }}>
                  {sucursalSel === "CENTRAL" ? "CENTRAL · DEPÓSITO" : sucursalSel}
                  <button
                    onClick={() => { setSucursalSel(null); setPage(1); setCargando(true); }}
                    className="font-black text-white/80 hover:text-white"
                    title="Quitar filtro de sucursal"
                  >
                    ×
                  </button>
                </span>
              )}
              {subgrupo && (
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 ring-1 ring-sky-200 rounded-full px-2.5 py-1">
                  {subgrupo}
                  <button
                    onClick={() => { setSubgrupo(null); setPage(1); setCargando(true); }}
                    className="ml-1.5 font-black text-sky-500 hover:text-sky-700"
                    title="Quitar filtro"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-y border-stone-200">
                  <th className="text-left px-4 py-2 text-[10px] font-black tracking-widest text-stone-400 w-24 align-bottom whitespace-nowrap">COD</th>
                  {/* Task 124: las columnas de LA BASE, en la MISMA orden que
                      la tabla de la Base y con la misma etiqueta de grupo
                      encima (DATOS FINALES / DATOS). */}
                  {COLS_BASE.map((col) => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-2 text-[10px] font-black tracking-widest text-stone-400 align-bottom whitespace-nowrap"
                    >
                      {col.grupo && (
                        <span className="block text-[9px] font-normal tracking-normal text-stone-300">
                          {col.grupo}
                        </span>
                      )}
                      {col.label}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2 text-[10px] font-black tracking-widest text-stone-400 w-24 align-bottom whitespace-nowrap">
                    {sucursalSel ? "SALDO" : "STOCK"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10">
                      <div className="flex items-center justify-center gap-2 text-stone-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…
                      </div>
                    </td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-stone-400 text-sm">
                      {busquedaAplicada || subgrupo || sucursalSel
                        ? "Ningún producto coincide con los filtros."
                        : "Sin productos en la base todavía."}
                    </td>
                  </tr>
                ) : (
                  filas.map((p) => (
                    <tr key={p.id} className="border-b border-stone-100 hover:bg-sky-50/40 transition-colors">
                      {/* COD — con el MISMO badge naranja de última edición
                          que en LA BASE (Task 124: "todo lo referente a cada
                          codigo que se edito de la base estea registrado
                          alla tambien"): quién y cuándo editó. */}
                      <td className="px-4 py-2 align-top">
                        {p.ultimaEdicionAt && (() => {
                          const d = new Date(p.ultimaEdicionAt);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          const fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
                          const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          const editor = p.ultimaEdicionPor || "admin";
                          return (
                            <div
                              title={`Editado en LA BASE por ${editor} el ${fecha} a las ${hora}`}
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
                        <div className="font-mono font-bold text-stone-600 tabular-nums text-xs">{p.sku}</div>
                      </td>
                      {/* Task 124: las demás columnas de LA BASE, en la misma
                          orden (COLS_BASE). Celda truncada con el texto
                          completo en el title, igual estilo que antes. */}
                      {COLS_BASE.map((col) => {
                        // SUB-GRUPO conserva el respaldo de siempre (si
                        // subGrupo viene vacío muestra la category del
                        // catálogo — igual que la vista venía haciendo).
                        const valor = (
                          col.key === "subGrupo"
                            ? p.subGrupo || p.category
                            : p[col.key]
                        ) as string | null | undefined;
                        return (
                          <td key={col.key} className="px-4 py-2 align-top">
                            <span
                              className={`block truncate text-xs ${col.key === "name" ? "max-w-[340px] text-stone-700" : "max-w-[220px] text-stone-600"}`}
                              title={valor ?? ""}
                            >
                              {valor || "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-block min-w-12 text-center text-xs font-black px-2 py-0.5 rounded-full ring-1 ${stockBadgeCls(p.stock)} tabular-nums`}>
                          {fmtNum(p.stock)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-stone-200 bg-stone-50/60">
            <p className="text-[11px] text-stone-500 font-medium tabular-nums">
              {fmtNum(total)} productos{sucursalSel ? ` en ${sucursalSel}` : ""} · página {page} de {fmtNum(totalPages)}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setPage((p) => Math.max(1, p - 1)); setCargando(true); }}
                disabled={page <= 1 || cargando}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setCargando(true); }}
                disabled={page >= totalPages || cargando}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ═══ MODAL: DISTRIBUCIÓN INTELIGENTE (Task 127 — transferencias internas) ═══ */}
      {distOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Título */}
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#e7e5e4" }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: AZUL }}>
                <ArrowLeftRight className="h-5 w-5" />
                DISTRIBUCIÓN INTELIGENTE
                <span
                  className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(21,87,137,0.08)", color: AZUL }}
                >
                  TRANSFERENCIAS INTERNAS · SIN COMPRAS
                </span>
              </h3>
              <button
                onClick={() => setDistOpen(false)}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* ─────── MODO REPORTE ─────── */}
              {distMode === "reporte" && (
                <>
                  {distCargando ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                      <p className="text-sm text-stone-500 font-medium">Analizando el stock de las sucursales…</p>
                    </div>
                  ) : (
                    <>
                      {distAviso && (
                        <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                          <p className="text-sm font-bold text-amber-800">{distAviso}</p>
                        </div>
                      )}

                      {distResumen && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                            <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Transferencias</p>
                            <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(distResumen.transferencias)}</p>
                          </div>
                          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                            <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Unidades a mover</p>
                            <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(distResumen.unidades)}</p>
                          </div>
                          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                            <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Productos</p>
                            <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(distResumen.productos)}</p>
                          </div>
                          <div className={`rounded-xl border p-3 text-center ${distResumen.faltanteNoCubierto > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                            <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Faltante sin cobertura</p>
                            <p className={`text-lg font-black tabular-nums ${distResumen.faltanteNoCubierto > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                              {fmtNum(distResumen.faltanteNoCubierto)}
                            </p>
                          </div>
                        </div>
                      )}

                      {distResumen && distResumen.sucursalesConFaltante.length > 0 && (
                        <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                          <p className="text-xs font-bold text-amber-800 mb-1">
                            Los excedentes no alcanzan para cubrir TODO el ideal (no se genera compra a proveedor):
                          </p>
                          <p className="text-[10px] text-amber-700 font-medium">
                            {distResumen.sucursalesConFaltante.map((s) => `${s.nodo}: faltan ${fmtNum(s.falta)}`).join(" · ")}
                          </p>
                        </div>
                      )}

                      {!distAviso && distFilas.length === 0 && (
                        <div className="rounded-xl p-6 border border-emerald-200 bg-emerald-50 text-center">
                          <p className="text-sm font-black text-emerald-800">Sin transferencias sugeridas</p>
                          <p className="text-xs text-emerald-700 mt-1">
                            Todos los nodos con stock ideal configurado están en su punto.
                          </p>
                        </div>
                      )}

                      {distFilas.length > 0 && (
                        <div className="rounded-xl border border-stone-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-stone-50 border-b border-stone-200">
                                  <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-stone-500">COD</th>
                                  <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-stone-500">PRODUCTO</th>
                                  <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-stone-500">COLOR</th>
                                  <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-emerald-600">SUCURSAL ORIGEN (SOBRA)</th>
                                  <th className="px-1 py-2" />
                                  <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-sky-600">SUCURSAL DESTINO (FALTA)</th>
                                  <th className="text-right px-3 py-2 text-[9px] font-black tracking-widest text-stone-500">CANTIDAD A TRANSFERIR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {distFilas.map((f, i) => (
                                  <tr
                                    key={`${f.sku}-${f.origen}-${f.destino}-${i}`}
                                    className="border-b border-stone-100 hover:bg-sky-50/40"
                                  >
                                    <td className="px-3 py-2 font-mono font-bold text-stone-800 whitespace-nowrap">{f.sku}</td>
                                    <td className="px-3 py-2 text-stone-700 max-w-[240px] truncate" title={f.producto}>{f.producto}</td>
                                    <td className="px-3 py-2 text-stone-600 max-w-[110px] truncate" title={f.color || ""}>{f.color || "—"}</td>
                                    <td className="px-3 py-2">
                                      <div className="font-bold text-emerald-700 whitespace-nowrap">{f.origen}</div>
                                      <div className="text-[9px] text-stone-400 font-medium whitespace-nowrap">
                                        tiene {fmtNum(f.origenSaldo)} · ideal {fmtNum(f.origenIdeal)}
                                      </div>
                                    </td>
                                    <td className="px-1 py-2 text-center text-stone-300">
                                      <ArrowLeftRight className="h-3.5 w-3.5 inline" />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-bold text-sky-700 whitespace-nowrap">{f.destino}</div>
                                      <div className="text-[9px] text-stone-400 font-medium whitespace-nowrap">
                                        tiene {fmtNum(f.destinoSaldo)} · ideal {fmtNum(f.destinoIdeal)} · falta {fmtNum(f.destinoFalta)}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span
                                        className="inline-block min-w-[3rem] px-2.5 py-1 rounded-lg font-black text-sm tabular-nums"
                                        style={{ background: "rgba(21,87,137,0.08)", color: AZUL }}
                                      >
                                        {fmtNum(f.cantidad)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-stone-400 font-medium leading-relaxed">
                        Regla del cálculo: cada transferencia mueve SOLO EL EXCEDENTE del origen (queda exactamente en su stock ideal) y SOLO
                        LO QUE LE FALTA al destino (llega exactamente a su ideal) → cantidad = mínimo(excedente del origen, faltante del destino).
                        Los nodos sin stock ideal definido no participan. Reporte de consulta: nada se mueve solo, la mercadería la mueve el equipo.
                      </p>
                    </>
                  )}
                </>
              )}

              {/* ─────── MODO CONFIGURAR STOCK IDEAL ─────── */}
              {distMode === "ideal" && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                      <input
                        value={idealBusqueda}
                        onChange={(e) => onIdealBusquedaChange(e.target.value)}
                        placeholder="Buscar por descripción, COD, marca, modelo…"
                        className="w-full h-9 pl-9 pr-3 rounded-xl border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium">
                      {idealCargando ? "Cargando…" : `${fmtNum(idealTotal)} productos · página ${idealPage}/${idealTotalPages}`}
                    </span>
                  </div>

                  <p className="text-[10px] text-stone-400 font-medium">
                    Anotá cuánto DEBERÍA haber de cada producto en cada nodo (CENTRAL = depósito central). Vacío = sin ideal (ese nodo no
                    participa en la distribución). El número de abajo de cada casilla es lo que tiene HOY.
                  </p>

                  {distSucursales.length === 0 ? (
                    <div className="rounded-xl p-4 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800">
                        Todavía no hay sucursales con inventario. Importá la planilla del ERP (IMPORTAR INVENTARIO) primero.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-stone-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-stone-50 border-b border-stone-200">
                              <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-stone-500 sticky left-0 bg-stone-50">COD</th>
                              <th className="text-left px-3 py-2 text-[9px] font-black tracking-widest text-stone-500 min-w-[180px]">PRODUCTO</th>
                              {distSucursales.map((s) => (
                                <th key={s} className="text-center px-2 py-2 text-[9px] font-black tracking-widest text-stone-600 min-w-[86px]">
                                  {s}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {idealCargando ? (
                              <tr>
                                <td colSpan={2 + distSucursales.length} className="px-3 py-8 text-center text-stone-400">
                                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                                  Cargando productos…
                                </td>
                              </tr>
                            ) : idealRows.length === 0 ? (
                              <tr>
                                <td colSpan={2 + distSucursales.length} className="px-3 py-8 text-center text-stone-400 font-medium">
                                  Sin resultados para “{idealBusquedaAplicada}”.
                                </td>
                              </tr>
                            ) : (
                              idealRows.map((r) => (
                                <tr key={r.id} className="border-b border-stone-100 hover:bg-sky-50/40">
                                  <td className="px-3 py-2 font-mono font-bold text-stone-800 whitespace-nowrap sticky left-0 bg-white">{r.sku}</td>
                                  <td className="px-3 py-2">
                                    <div className="text-stone-700 font-semibold max-w-[240px] truncate" title={r.name}>{r.name}</div>
                                    {(r.cores || r.tipo) && (
                                      <div className="text-[9px] text-stone-400 font-medium truncate max-w-[240px]">
                                        {[r.tipo, r.cores].filter(Boolean).join(" · ")}
                                      </div>
                                    )}
                                  </td>
                                  {distSucursales.map((s) => (
                                    <td key={s} className="px-2 py-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        inputMode="numeric"
                                        value={valorIdeal(r, s)}
                                        onChange={(e) => setValorIdeal(r, s, e.target.value)}
                                        placeholder="—"
                                        className="w-16 h-8 rounded-lg border border-stone-300 text-center text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        title={`Stock ideal en ${s} (hoy tiene ${fmtNum(r.saldos[s] ?? 0)})`}
                                      />
                                      <div className="text-[8px] text-stone-400 font-medium mt-0.5">tiene {fmtNum(r.saldos[s] ?? 0)}</div>
                                    </td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {idealTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setIdealPage((p) => Math.max(1, p - 1))}
                        disabled={idealPage <= 1 || idealCargando}
                        className="h-8 px-3 rounded-lg border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                      </button>
                      <span className="text-[10px] text-stone-400 font-bold">Página {idealPage} de {idealTotalPages}</span>
                      <button
                        onClick={() => setIdealPage((p) => Math.min(idealTotalPages, p + 1))}
                        disabled={idealPage >= idealTotalPages || idealCargando}
                        className="h-8 px-3 rounded-lg border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1"
                      >
                        Siguiente <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pie con las acciones del modo activo */}
            <div className="px-6 py-4 border-t flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: "#e7e5e4" }}>
              {distMode === "reporte" ? (
                <>
                  <button
                    onClick={() => void cargarDistribucion()}
                    disabled={distCargando}
                    className="h-9 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1.5"
                    title="Recalcular con el stock de ahora"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${distCargando ? "animate-spin" : ""}`} />
                    RECALCULAR
                  </button>
                  <button
                    onClick={irAModoIdeal}
                    className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-95"
                    style={{ backgroundColor: DORADO, color: AZUL }}
                    title="Definir cuánto debería haber de cada producto en cada sucursal"
                  >
                    <Target className="h-3.5 w-3.5" />
                    CONFIGURAR STOCK IDEAL
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setDistMode("reporte")}
                    className="h-9 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 flex items-center gap-1.5"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    VOLVER AL REPORTE
                  </button>
                  <button
                    onClick={() => void guardarIdealesHandler()}
                    disabled={idealGuardando || Object.keys(idealEdiciones).length === 0}
                    className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors hover:brightness-110 text-white disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
                    title="Guardar los stock ideales y recalcular el reporte"
                  >
                    {idealGuardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    GUARDAR IDEALES{Object.keys(idealEdiciones).length > 0 ? ` (${Object.keys(idealEdiciones).length})` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: IMPORTAR INVENTARIO (mismo motor que LA BASE + sucursales) ═══ */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Título */}
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#e7e5e4" }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: AZUL }}>
                <Upload className="h-5 w-5" />
                IMPORTAR INVENTARIO
              </h3>
              <button
                onClick={() => { if (!importLoading && !importApplying) setImportOpen(false); }}
                className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {importLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-sm text-stone-500 font-medium">Procesando el inventario del ERP…</p>
                </div>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="rounded-xl p-4 border border-emerald-200 bg-emerald-50">
                    <p className="text-sm font-black text-emerald-800 mb-1">Importación completa</p>
                    <p className="text-xs text-emerald-700">
                      {importResult.creados} productos nuevos · {importResult.actualizados} actualizados
                      {typeof importResult.conCostoActualizado === "number" && importResult.conCostoActualizado > 0
                        ? ` · ${importResult.conCostoActualizado} con costo nuevo`
                        : ""}
                    </p>
                    {importResult.sucursales && (
                      <p className="text-xs text-emerald-700 mt-1.5 font-semibold">
                        Stock por sucursal: {fmtNum(importResult.sucursales.filasGuardadas)} movimientos de{" "}
                        {fmtNum(importResult.sucursales.productosTocados)} productos en{" "}
                        {importResult.sucursales.sucursales} sucursales guardados.
                      </p>
                    )}
                  </div>
                  {importResult.errores.length > 0 && (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800 mb-1">Advertencias</p>
                      <ul className="text-[10px] text-amber-700 space-y-0.5">
                        {importResult.errores.slice(0, 10).map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {importPreview && !importResult && (
                <div className="space-y-4">
                  {/* Resumen general */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Filas leídas</p>
                      <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(importPreview.totalFilas)}</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Códigos únicos</p>
                      <p className="text-lg font-black text-stone-800 tabular-nums">{fmtNum(importPreview.codigosUnicos)}</p>
                    </div>
                    <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-sky-500 uppercase">Nuevos</p>
                      <p className="text-lg font-black text-sky-700 tabular-nums">{fmtNum(importPreview.nuevosCount)}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                      <p className="text-[9px] font-black tracking-widest text-emerald-500 uppercase">Actualizados</p>
                      <p className="text-lg font-black text-emerald-700 tabular-nums">{fmtNum(importPreview.actualizadosCount)}</p>
                    </div>
                  </div>

                  {/* ─── Reparto por sucursal (Task 98: "dividir bien") ─── */}
                  {importPreview.sucursales && importPreview.sucursales.length > 0 ? (
                    <div className="rounded-xl border border-stone-200 overflow-hidden">
                      <p className="text-[10px] font-black tracking-widest text-stone-500 px-3 pt-3 pb-1.5 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-sky-600" />
                        CÓMO SE DIVIDE EL INVENTARIO POR SUCURSAL
                        <span className="text-stone-400 font-bold normal-case tracking-normal">
                          (CENTRAL = depósito central)
                        </span>
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-stone-50 border-y border-stone-200">
                            <th className="text-left px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">SUCURSAL</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">FILAS</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">PRODUCTOS</th>
                            <th className="text-right px-3 py-1.5 text-[9px] font-black tracking-widest text-stone-400">UNIDADES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.sucursales.map((s) => {
                            const esCentral = s.nombre === "CENTRAL";
                            return (
                              <tr key={s.nombre} className="border-b border-stone-100">
                                <td className="px-3 py-1.5 font-bold text-stone-700 flex items-center gap-1.5">
                                  {esCentral && <Warehouse className="h-3 w-3 text-amber-600" />}
                                  {s.nombre}
                                  {esCentral && (
                                    <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                      DEPÓSITO
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">{fmtNum(s.filas)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">{fmtNum(s.skus)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-stone-700">{fmtNum(s.unidades)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800">
                        Esta planilla no trae la columna SUCURSAL: se actualizará solo el stock general de siempre.
                      </p>
                    </div>
                  )}

                  {/* Errores del preview */}
                  {importPreview.errores.length > 0 && (
                    <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                      <p className="text-xs font-bold text-amber-800 mb-1">Advertencias</p>
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
                    onClick={() => void confirmarImport()}
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
    </div>
  );
}
