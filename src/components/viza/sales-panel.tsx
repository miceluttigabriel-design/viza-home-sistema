"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import {
  Search,
  LogOut,
  Plus,
  X,
  Calculator,
  User,
  Package,
  ChevronDown,
  Trash2,
  Percent,
  FileText,
  Save,
  Calendar,
  Clock,
  Gift,
  AlertTriangle,
  KeyRound,
  LayoutDashboard,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  useCotizacionStore,
  getItemPriceN,
  type CotizacionItem,
  type PlanCuotas,
  type TipoEntrega,
} from "@/store/cotizacion";
import { formatPYG } from "@/lib/format";
import { PlanSafra } from "./plan-safra";
import { PlanCheque } from "./plan-cheque";
import { CambiarContrasena } from "@/components/viza/cambiar-contrasena";

// === VIZA home brand palette ===
const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";
const DORADO_CLARO = "#e5cb8a";
const CREMA = "#faf6ed";

// === HELPERS - Entrega inicial (con/sin entrega) ===

// Calcula los días entre hoy y la fecha de inicio de pago.
// CRÍTICO: No usar `new Date(string)` porque interpreta como UTC y puede
// cambiar el día al convertir a zona horaria local. Parsear manualmente.
function calcularDiasDiferidos(fechaInicio: string): number | null {
  if (!fechaInicio || fechaInicio.length < 10) return null;
  // Parsear "YYYY-MM-DD" manualmente para crear fecha LOCAL (no UTC)
  const [añoStr, mesStr, diaStr] = fechaInicio.split("-");
  const inicio = new Date(
    parseInt(añoStr, 10),
    parseInt(mesStr, 10) - 1, // 0-indexed
    parseInt(diaStr, 10)
  );
  if (isNaN(inicio.getTime())) return null;
  inicio.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (inicio.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diff;
}

// Calcula el margen porcentual a aplicar según los días diferidos.
// REGLA DE NEGOCIO: SIN ENTREGA INICIAL tiene 2 tramos:
//   - 0 a 30 días: 0% (sin recargo, plazo de gracia)
//   - 31 a 60 días: 3% (recargo sobre el precio contado)
// Retorna null si la fecha supera los 60 días (no permitido).
function calcularMargenPorcentaje(dias: number): number | null {
  if (dias < 0) return null; // fecha pasada, no permitida
  if (dias <= 30) return 0; // 0% - Plazo de gracia ≤ 30 días
  if (dias <= 60) return 0.03; // 3% - Recargo por plazo 31 a 60 días
  return null; // > 60 días, no permitido
}

// Calcula el valor de cuota ajustado (sin entrega).
// Como margen = 0, el valor es exactamente igual al valor base.
function calcularCuotaSinEntrega(valorBase: number, margen: number): number {
  return Math.round(valorBase * (1 + margen));
}

// REDONDEO COMERCIAL HACIA ARRIBA
// Redondea SIEMPRE al millar superior más cercano.
// Ej: 1.594.440 → 1.595.000 | 1.548.000 → 1.548.000 (no cambia si ya es exacto)
// SOLO se aplica a las cuotas SIN ENTREGA con recargo del 3% (31-60 días).
// Las cuotas CON ENTREGA y SIN ENTREGA (0-30 días) mantienen su valor exacto.
function redondeoComercial(valor: number): number {
  return Math.ceil(valor / 1000) * 1000;
}

// Genera la fecha de pago de una cuota N a partir de la fecha de inicio.
// CRÍTICO: No usar `new Date(string)` directamente porque interpreta como UTC
// y al convertir a zona horaria local (Paraguay UTC-4) puede cambiar el día.
// En su lugar, parsear manualmente el string "YYYY-MM-DD" y crear un Date LOCAL.
function generarFechaCuota(fechaInicio: string, numeroCuota: number): string {
  if (!fechaInicio || fechaInicio.length < 10) return "";
  // Parsear "YYYY-MM-DD" manualmente (evita el problema de UTC)
  const [añoStr, mesStr, diaStr] = fechaInicio.split("-");
  const año = parseInt(añoStr, 10);
  const mes = parseInt(mesStr, 10) - 1; // 0-indexed
  const dia = parseInt(diaStr, 10);
  // Crear fecha en zona horaria LOCAL (no UTC)
  const fecha = new Date(año, mes, dia);
  if (isNaN(fecha.getTime())) return "";
  // cuota #1 (1-indexed) corresponde a la fecha de inicio mismo.
  fecha.setMonth(fecha.getMonth() + (numeroCuota - 1));
  // Formatear manualmente para evitar toLocaleDateString (que puede cambiar el día)
  const d = String(fecha.getDate()).padStart(2, "0");
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const y = fecha.getFullYear();
  return `${d}/${m}/${y}`;
}

// Fecha máxima permitida (hoy + 60 días) en formato YYYY-MM-DD para input[type=date].
// REGLA DE NEGOCIO: El plazo máximo SIN ENTREGA INICIAL es de 60 días.
// 0-30 días: sin recargo / 31-60 días: +3% sobre precio contado.
function getMaxFechaInicio(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceContado: number | null;
  [key: string]: any;
}

interface AppUser {
  email: string;
  name?: string | null;
  role: string;
}

interface SalesPanelProps {
  user: AppUser;
  onGoAdmin?: () => void;
  onGoGestion?: () => void;
  isSupremo?: boolean;
}

export function SalesPanel({ user, onGoAdmin, onGoGestion, isSupremo }: SalesPanelProps) {
  // El rol define qué botones de navegación se muestran, NO la vista actual.
  // REGLA DE ORO: el menú depende del ROL del usuario, no de la pantalla.
  // El supremo admin es supremo admin en TODAS las pantallas (admin, ventas, gestión).
  const isAdmin = user.role === "admin" || user.role === "supremo_admin";
  const isSupremoRole = user.role === "supremo_admin";

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [calcDone, setCalcDone] = useState(false); // si ya se calculó al menos una vez
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [viewMode, setViewMode] = useState<"cotizador" | "safra" | "cheque">("cotizador");
  // Modal: cambiar mi propia contraseña (visible para todos los roles)
  const [cambiarContrasenaOpen, setCambiarContrasenaOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    items,
    addItem,
    removeItem,
    setQuantity,
    planes,
    addPlan,
    removePlan,
    updatePlanCuotas,
    contadoMarginPct,
    setContadoMarginPct,
    cliente,
    setClienteField,
    clear,
    incluirContadoEnPresupuesto,
    setIncluirContadoEnPresupuesto,
    tipoEntrega,
    setTipoEntrega,
    fechaInicioPago,
    setFechaInicioPago,
    // === Descuento por Casco ===
    // cascoAplicado NO se lee del store - es DERIVADO automáticamente
    cascoValor,
    cascoDescripcion,
    setCascoAplicado,
    setCascoValor,
    setCascoDescripcion,
  } = useCotizacionStore();

  // Estado local para los planes calculados (espejo del store con resultados)
  const [calculatedPlanes, setCalculatedPlanes] = useState<PlanCuotas[]>([]);
  // Estado local para los planes calculados SIN entrega (con interés diferido)
  const [calculatedPlanesSinEntrega, setCalculatedPlanesSinEntrega] = useState<
    PlanCuotas[]
  >([]);
  // Estado local para información del sin_entrega (días/margen aplicado)
  const [sinEntregaInfo, setSinEntregaInfo] = useState<{
    dias: number;
    margen: number;
  } | null>(null);
  // Estado local para controlar qué opciones se muestran en el presupuesto
  const [mostrarConEntrega, setMostrarConEntrega] = useState(true);
  const [mostrarSinEntrega, setMostrarSinEntrega] = useState(true);
  // Estado del reloj en tiempo real (se actualiza cada segundo)
  const [relojAhora, setRelojAhora] = useState<Date>(new Date());

  // Effect: tick del reloj cada 1 segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setRelojAhora(new Date());
    }, 1000);
    // Limpieza al desmontar
    return () => clearInterval(timer);
  }, []);

  // Formatear fecha y hora para mostrar en el reloj: "DD/MM/AAAA - HH:MM:SS"
  const formatearReloj = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${fecha} - ${hora}`;
  };

  // Buscar productos
  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&pageSize=10`);
      const data = await res.json();
      setSearchResults(data.products || []);
    } catch {
      // silent
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(search), 300);
    return () => clearTimeout(t);
  }, [search, searchProducts]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset de cálculo previo cuando cambian los parámetros de entrega.
  // Se invoca desde los handlers de UI (onChange), no en effects.
  const resetCalculoEntrega = () => {
    setCalcDone(false);
    setCalculatedPlanesSinEntrega([]);
    setSinEntregaInfo(null);
  };

  const handleAddProduct = (product: Product) => {
    const item: CotizacionItem = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceContado: product.priceContado ?? 0,
      price1: product.price1 ?? 0,
      price2: product.price2 ?? 0,
      price3: product.price3 ?? 0,
      price4: product.price4 ?? 0,
      price5: product.price5 ?? 0,
      price6: product.price6 ?? 0,
      price7: product.price7 ?? 0,
      price8: product.price8 ?? 0,
      price9: product.price9 ?? 0,
      price10: product.price10 ?? 0,
      price11: product.price11 ?? 0,
      price12: product.price12 ?? 0,
      price13: product.price13 ?? 0,
      price14: product.price14 ?? 0,
      price15: product.price15 ?? 0,
      price16: product.price16 ?? 0,
      price17: product.price17 ?? 0,
      price18: product.price18 ?? 0,
      price19: product.price19 ?? 0,
      price20: product.price20 ?? 0,
      price21: product.price21 ?? 0,
      price22: product.price22 ?? 0,
      price23: product.price23 ?? 0,
      price24: product.price24 ?? 0,
      price25: product.price25 ?? 0,
      price26: product.price26 ?? 0,
      price27: product.price27 ?? 0,
      price28: product.price28 ?? 0,
      price29: product.price29 ?? 0,
      price30: product.price30 ?? 0,
      // Márgenes leídos de la BD del Admin (SOLO LECTURA - nunca se modifican en la BD)
      // Se usan para recalcular cuotas en SIN ENTREGA INICIAL con la fórmula correcta
      marginContado: product.marginContado ?? 0,
      marginC1: product.marginC1 ?? 0,
      marginC2: product.marginC2 ?? 0,
      marginC3: product.marginC3 ?? 0,
      marginC4: product.marginC4 ?? 0,
      marginC5: product.marginC5 ?? 0,
      marginC6: product.marginC6 ?? 0,
      marginC7: product.marginC7 ?? 0,
      marginC8: product.marginC8 ?? 0,
      marginC9: product.marginC9 ?? 0,
      marginC10: product.marginC10 ?? 0,
      marginC11: product.marginC11 ?? 0,
      marginC12: product.marginC12 ?? 0,
      marginC13: product.marginC13 ?? 0,
      marginC14: product.marginC14 ?? 0,
      marginC15: product.marginC15 ?? 0,
      marginC16: product.marginC16 ?? 0,
      marginC17: product.marginC17 ?? 0,
      marginC18: product.marginC18 ?? 0,
      marginC19: product.marginC19 ?? 0,
      marginC20: product.marginC20 ?? 0,
      marginC21: product.marginC21 ?? 0,
      marginC22: product.marginC22 ?? 0,
      marginC23: product.marginC23 ?? 0,
      marginC24: product.marginC24 ?? 0,
      marginC25: product.marginC25 ?? 0,
      marginC26: product.marginC26 ?? 0,
      marginC27: product.marginC27 ?? 0,
      marginC28: product.marginC28 ?? 0,
      marginC29: product.marginC29 ?? 0,
      marginC30: product.marginC30 ?? 0,
      quantity: 1,
    };
    addItem(item);
    setSearch("");
    setSearchResults([]);
    setShowResults(false);
    setCalcDone(false); // hay que recalcular
    toast.success(`${product.name} agregado a la cotización`);
  };

  // Totales contado (en vivo)
  // BRUTO: suma de TODOS los productos (incluyendo el casco)
  const contadoOriginalBruto = items.reduce(
    (sum, i) => sum + i.priceContado * i.quantity,
    0
  );

  // === DESCUENTO POR CASCO - DETECCIÓN AUTOMÁTICA Y OBLIGATORIA ===
  // El casco es un REGALO de VIZA Home. Se detecta automáticamente por nombre.
  // El descuento se resta del TOTAL BRUTO para obtener el TOTAL NETO.
  // Todos los cálculos (cuotas, márgenes, PDF) usan el TOTAL NETO.
  const cascoEnCarrito = items.find((i) =>
    i.name.toUpperCase().includes("CASCO")
  );
  const cascoValorExacto = cascoEnCarrito
    ? (cascoEnCarrito.priceContado ?? 0) * cascoEnCarrito.quantity
    : 0;
  const cascoAplicado = !!cascoEnCarrito;
  const descuentoCasco = cascoAplicado ? cascoValorExacto : 0;

  // Auto-sync: sincronizar el store con los valores derivados
  useEffect(() => {
    if (cascoEnCarrito && cascoValorExacto > 0) {
      if (cascoValor !== cascoValorExacto) setCascoValor(cascoValorExacto);
      if (!useCotizacionStore.getState().cascoAplicado) setCascoAplicado(true);
    } else {
      if (cascoValor !== 0) setCascoValor(0);
      if (useCotizacionStore.getState().cascoAplicado) setCascoAplicado(false);
    }
  }, [cascoEnCarrito, cascoValorExacto, cascoValor, setCascoValor, setCascoAplicado]);

  // NETO: Total Contado REAL = Bruto - Descuento Casco
  // Esto es lo que el cliente realmente paga al contado.
  // Ej: Moto 10M + Casco 500K = Bruto 10.5M - Casco 500K = Neto 10M
  const contadoOriginalTotal = Math.max(0, contadoOriginalBruto - descuentoCasco);

  // Contado ajustado (con margen) - calculado sobre el NETO
  const contadoAjustado = Math.round(
    contadoOriginalTotal * (1 + (contadoMarginPct || 0) / 100)
  );

  // Verificar si hay planes duplicados
  const duplicatePlanes = planes.filter((p, i, arr) =>
    arr.some((p2, j) => p2.cuotas === p.cuotas && j !== i)
  );

  const handleCalcular = () => {
    if (items.length === 0) {
      toast.error("Agregá al menos un producto antes de calcular");
      return;
    }
    if (planes.length === 0) {
      toast.error("Agregá al menos un plan de cuotas antes de calcular");
      return;
    }
    // VALIDACIÓN DEL CASCO - AUTOMÁTICA:
    // El casco se detecta automáticamente por nombre. Si hay casco, el
    // descuento se aplica solo (no se puede evitar). Las validaciones manuales
    // ya no son necesarias porque el sistema controla todo automáticamente.
    // Solo verificamos que el valor no exceda el total (caso de borde).
    if (cascoAplicado && cascoValor > contadoOriginalTotal) {
      toast.error("⚠️ El valor del casco no puede ser mayor al total de productos.");
      return;
    }
    if (!mostrarConEntrega && !mostrarSinEntrega) {
      toast.error("Seleccione al menos una opción");
      return;
    }
    for (const item of items) {
      if (!item.quantity || item.quantity < 1) {
        toast.error(`Cantidad inválida para ${item.name}`);
        return;
      }
    }
    if (duplicatePlanes.length > 0) {
      toast.warning(`Hay planes duplicados (${duplicatePlanes.map(p => p.cuotas).join(", ")} cuotas)`);
    }

    // Validaciones específicas para sin_entrega
    // Ahora se calcula cuando:
    //   - tipoEntrega === "sin_entrega" (legacy radio), O
    //   - mostrarSinEntrega === true (checkbox independiente)
    // Esto permite mostrar ambas secciones en el PDF simultáneamente.
    let sinInfo: { dias: number; margen: number } | null = null;
    const necesitaCalcSinEntrega = tipoEntrega === "sin_entrega" || mostrarSinEntrega;
    if (necesitaCalcSinEntrega) {
      if (!fechaInicioPago) {
        toast.error("Seleccioná la fecha de inicio de la primera cuota");
        return;
      }
      const dias = calcularDiasDiferidos(fechaInicioPago);
      if (dias === null) {
        toast.error("La fecha de inicio no es válida");
        return;
      }
      if (dias < 0) {
        toast.error("La fecha de inicio no puede ser anterior a hoy");
        return;
      }
      const margen = calcularMargenPorcentaje(dias);
      if (margen === null) {
        toast.error(
          `El plazo máximo sin entrega es de 60 días. Elegiste ${dias} días.`
        );
        return;
      }
      sinInfo = { dias, margen };
    }

    // === FILTRAR CASCO DEL CÁLCULO DE CUOTAS ===
    // El casco es un regalo (gratis). NO se incluye en el cálculo de cuotas.
    // Las cuotas se calculan SOLO sobre los productos que no son casco.
    // Esto garantiza que el valor sea EXACTAMENTE el de la BD (sin recálculos).
    const itemsSinCasco = items.filter(
      (i) => !i.name.toUpperCase().includes("CASCO")
    );

    // Calcular todos los planes (CON entrega - valores base)
    // CON ENTREGA: leer directamente el valor EXACTO de la BD (price1..price30)
    // NO aplicar fórmulas matemáticas ni redondeos - solo lectura directa.
    const resultados = planes.map((plan) => {
      const valorPorCuota = itemsSinCasco.reduce(
        (sum, i) => sum + getItemPriceN(i, plan.cuotas) * i.quantity,
        0
      );
      const total = valorPorCuota * plan.cuotas;
      return {
        ...plan,
        valorPorCuota,
        total,
        calculado: true,
      };
    });
    setCalculatedPlanes(resultados);

    // Si es sin_entrega y válido, calcular también los planes ajustados
    // Ahora también se calcula cuando mostrarSinEntrega está activado
    // (independientemente del radio button tipoEntrega)
    if (sinInfo && (tipoEntrega === "sin_entrega" || mostrarSinEntrega)) {
      const ajustados = planes.map((plan) => {
        // ════════════════════════════════════════════════════════════════
        // CÁLCULO SIN ENTREGA INICIAL - CORREGIDO
        // ════════════════════════════════════════════════════════════════
        // REGLA: El valor de la cuota SIN ENTREGA se basa en el valor EXACTO
        // de la BD (price1..price30), igual que CON ENTREGA.
        //
        // - 0-30 días (margen = 0): el valor es EXACTAMENTE IGUAL a CON ENTREGA
        //   (sin recargo, sin fórmulas, solo lectura directa de la BD)
        //
        // - 31-60 días (margen = 0.03): el valor es CON ENTREGA * 1.03
        //   (recargo del 3% sobre el valor exacto de la BD)
        //
        // El casco se EXCLUYE del cálculo (es un regalo, no se cobra).
        // ════════════════════════════════════════════════════════════════
        const margenAplicado = sinInfo.margen; // 0 (0-30 días) o 0.03 (31-60 días)

        // Leer valor EXACTO de la BD para los items SIN casco
        const valorPorCuotaBase = itemsSinCasco.reduce(
          (sum, i) => sum + getItemPriceN(i, plan.cuotas) * i.quantity,
          0
        );

        // Aplicar recargo del 3% solo si es 31-60 días
        // 0-30 días: margen = 0 → valorPorCuota = valorPorCuotaBase (exacto, sin redondeo)
        // 31-60 días: margen = 0.03 → valorPorCuota = valorPorCuotaBase * 1.03
        //   + REDONDEO COMERCIAL hacia arriba al millar superior
        //   Ej: 1.548.000 * 1.03 = 1.594.440 → redondea a 1.595.000
        let valorPorCuota: number;
        if (margenAplicado > 0) {
          // 31-60 días: aplicar recargo + redondeo comercial hacia arriba
          valorPorCuota = redondeoComercial(valorPorCuotaBase * (1 + margenAplicado));
        } else {
          // 0-30 días: valor exacto de la BD (igual a CON ENTREGA, sin redondeo)
          valorPorCuota = valorPorCuotaBase;
        }
        const total = valorPorCuota * plan.cuotas;
        return {
          ...plan,
          valorPorCuota,
          total,
          calculado: true,
        };
      });
      setCalculatedPlanesSinEntrega(ajustados);
      setSinEntregaInfo(sinInfo);
      toast.success(
        `Calculados ${planes.length} plan${planes.length !== 1 ? "es" : ""} · Sin entrega inicial`
      );
    } else {
      // Limpiar planes sin entrega si no aplica
      setCalculatedPlanesSinEntrega([]);
      setSinEntregaInfo(null);
      toast.success(`Calculados ${planes.length} plan${planes.length !== 1 ? "es" : ""} de pago`);
    }
    setCalcDone(true);

    // Scroll al resultado
    setTimeout(() => {
      document.getElementById("resultado-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const handleGenerarPDF = async () => {
    if (items.length === 0) {
      toast.error("No hay productos para generar el PDF");
      return;
    }
    if (calculatedPlanes.length === 0) {
      toast.error("Calculá el presupuesto primero");
      return;
    }
    // ESCENARIO D: Si ninguna opción está marcada, NO bloqueamos la generación
    // del PDF. El PDF mostrará un mensaje "Consulte opciones de financiación"
    // en lugar de las secciones de planes. (Antes se bloqueaba con toast.error.)
    setGeneratingPdf(true);
    try {
      // Construir lista de planes para el PDF: si incluirContadoEnPresupuesto,
      // se inserta "Plan A: Contado" como primera opción.
      const planesForPdf: {
        letra: string;
        cuotas: number;
        valorPorCuota: number;
        total: number;
      }[] = [];
      if (incluirContadoEnPresupuesto) {
        planesForPdf.push({
          letra: "A",
          cuotas: 1,
          valorPorCuota: contadoAjustado,
          total: contadoAjustado,
        });
      }
      calculatedPlanes.forEach((p, idx) => {
        planesForPdf.push({
          letra: String.fromCharCode(65 + idx + (incluirContadoEnPresupuesto ? 1 : 0)),
          cuotas: p.cuotas,
          valorPorCuota: p.valorPorCuota,
          total: p.total,
        });
      });

      // Construir lista de planes SIN ENTREGA (si aplica)
      // REGLA INDEPENDIENTE: Se incluye en el PDF si:
      //   - mostrarSinEntrega === true (checkbox marcado), Y
      //   - hay cálculos de sinEntregaInfo disponibles (fecha válida + margen)
      // Ya NO depende del radio button tipoEntrega.
      const planesSinEntregaForPdf:
        | {
            letra: string;
            cuotas: number;
            valorPorCuota: number;
            total: number;
            fechas: string[];
          }[]
        | null =
        mostrarSinEntrega &&
        sinEntregaInfo &&
        calculatedPlanesSinEntrega.length > 0
          ? calculatedPlanesSinEntrega.map((p, idx) => ({
              letra: String.fromCharCode(
                65 + idx + (incluirContadoEnPresupuesto ? 1 : 0)
              ),
              cuotas: p.cuotas,
              valorPorCuota: p.valorPorCuota,
              total: p.total,
              fechas: Array.from({ length: p.cuotas }, (_, i) =>
                generarFechaCuota(fechaInicioPago, i + 1)
              ),
            }))
          : null;

      const payload = {
        cliente: {
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          documento: cliente.documento,
          observaciones: cliente.observaciones,
          fecha: cliente.fecha,
        },
        items: items.map((it) => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          priceContado: it.priceContado,
          subtotalContado: it.priceContado * it.quantity,
        })),
        contadoOriginal: contadoOriginalTotal,  // NETO (con casco descontado)
        contadoOriginalBruto: contadoOriginalBruto,  // BRUTO (sin descontar) - para mostrar en PDF
        contadoMarginPct: contadoMarginPct,
        contadoAjustado: contadoAjustado,
        // === DESCUENTO POR CASCO ===
        cascoAplicado,
        cascoValor: descuentoCasco,
        cascoDescripcion: cascoDescripcion || (cascoAplicado ? "Descuento por casco" : ""),
        baseCalculo: contadoAjustado, // total neto con margen (casco ya descontado del contado original)
        incluirContadoEnPresupuesto,
        incluirPrecioContado: incluirContadoEnPresupuesto, // Unificado: un solo checkbox controla todo
        // Nuevos campos de entrega inicial
        tipoEntrega,
        fechaInicioPago,
        diasDiferidos: sinEntregaInfo?.dias ?? null,
        margenAplicado: sinEntregaInfo?.margen ?? null,
        // Flags para mostrar/ocultar opciones en el PDF
        mostrarConEntrega,
        mostrarSinEntrega,
        planes: planesForPdf,
        planesSinEntrega: planesSinEntregaForPdf,
      };

      const res = await fetch("/api/quotes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al generar PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nombreCliente = cliente.nombre
        ? cliente.nombre.replace(/\s+/g, "_").replace(/[^\w-]/g, "")
        : "Cliente";
      a.download = `VIZA-Presupuesto-${nombreCliente}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF generado correctamente");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleLimpiar = () => {
    if (items.length === 0 && planes.length === 0) return;
    if (confirm("¿Vaciar la cotización completa? Se perderán los items y planes cargados.")) {
      clear();
      setCalculatedPlanes([]);
      setCalculatedPlanesSinEntrega([]);
      setSinEntregaInfo(null);
      setCalcDone(false);
      toast.success("Cotización vaciada");
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: AZUL }}>
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur shadow-md" style={{ backgroundColor: AZUL }}>
        {/* Banda dorada superior */}
        <div className="h-1.5 w-full" style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})` }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
          {/* LADO IZQUIERDO: Reloj (PRIMERO, EXTREMO IZQUIERDO) + Cambiar contraseña + GESTIÓN ACCESOS + PANEL ADMIN + Tabs */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Reloj en tiempo real - PRIMERO EN EL HEADER, EXTREMO IZQUIERDO - FONDO BLANCO TEXTO NEGRO */}
            <div
              className="hidden md:flex flex-col items-start text-left px-3 py-1.5 rounded-xl border"
              style={{
                backgroundColor: "#FFFFFF",
                borderColor: "#000000",
                color: "#000000",
              }}
              title="Fecha y hora actual (se actualiza cada segundo)"
            >
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" style={{ color: "#000000" }} />
                <span
                  className="text-xs font-bold tabular-nums tracking-tight"
                  style={{ color: "#000000" }}
                >
                  {formatearReloj(relojAhora)}
                </span>
              </div>
              <span
                className="text-[9px] uppercase tracking-wider mt-0.5"
                style={{ color: "#000000" }}
              >
                Hora local
              </span>
            </div>
            <button
              onClick={() => setCambiarContrasenaOpen(true)}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors border"
              style={{
                backgroundColor: "rgba(217, 184, 107, 0.18)",
                color: DORADO,
                borderColor: "rgba(217,184,107,0.4)",
              }}
              title="Cambiar mi contraseña"
              aria-label="Cambiar mi contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            {/* REGLA DE ORO: los botones de navegación dependen del ROL, no de la pantalla.
                El supremo admin es supremo en TODAS las pantallas (admin, ventas, gestión). */}
            {isSupremoRole && onGoGestion && (
              <button
                onClick={onGoGestion}
                className="h-10 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors border shadow-sm hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${DORADO_OSCURO} 0%, ${DORADO} 100%)`, color: AZUL_OSCURO, borderColor: DORADO_OSCURO }}
                title="Gestión de Accesos y Contraseñas"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">GESTIÓN DE ACCESOS</span>
                <span className="sm:hidden">ACCESOS</span>
              </button>
            )}
            {isAdmin && onGoAdmin && (
              <button
                onClick={onGoAdmin}
                className="h-10 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors border border-transparent hover:brightness-95"
                style={{ backgroundColor: DORADO, color: AZUL_OSCURO }}
                title="Volver al Panel Admin"
              >
                <span className="hidden sm:inline">PANEL ADMIN</span>
                <span className="sm:hidden">ADMIN</span>
              </button>
            )}
            {/* === TOGGLE MODO COTIZADOR / PLAN SAFRA / CON CHEQUE (al lado de PANEL ADMIN) === */}
            <button
              onClick={() => setViewMode("cotizador")}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all border"
              style={
                viewMode === "cotizador"
                  ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: DORADO_CLARO, borderColor: "rgba(217,184,107,0.4)" }
              }
            >
              COTIZACION NORMAL
            </button>
            <button
              onClick={() => setViewMode("safra")}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all border"
              style={
                viewMode === "safra"
                  ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: DORADO_CLARO, borderColor: "rgba(217,184,107,0.4)" }
              }
            >
              PLAN SAFRA
            </button>
            <button
              onClick={() => setViewMode("cheque")}
              className="h-9 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all border"
              style={
                viewMode === "cheque"
                  ? { backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: DORADO_CLARO, borderColor: "rgba(217,184,107,0.4)" }
              }
            >
              CON CHEQUE
            </button>
          </div>

          {/* LADO DERECHO: User info + Avatar + Cerrar sesión (AL LADO DEL USUARIO, LADO DERECHO) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-white leading-none">
                {user.name || user.email}
              </span>
              <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: isSupremoRole ? DORADO : DORADO_CLARO }}>
                {isSupremoRole ? "SUPREMO ADMIN" : isAdmin ? "ADMINISTRADOR" : "COLABORADOR"}
              </span>
            </div>
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: DORADO, color: AZUL_OSCURO }}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            {/* Cerrar sesión - AL LADO DEL USUARIO, LADO DERECHO (justo después del avatar) */}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors border"
              style={{
                backgroundColor: "rgba(255,255,255,0.08)",
                color: DORADO_CLARO,
                borderColor: "rgba(217,184,107,0.4)",
              }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

      {/* Modal: Cambiar mi contraseña (visible para todos los roles autenticados) */}
      <CambiarContrasena
        email={user.email}
        open={cambiarContrasenaOpen}
        onClose={() => setCambiarContrasenaOpen(false)}
      />
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {viewMode === "safra" && <PlanSafra />}
        {viewMode === "cheque" && <PlanCheque />}

        {viewMode === "cotizador" && (
        <>
        {/* 1. CLIENTE (OPCIONAL) */}
        <Section title="CLIENTE (OPCIONAL)" icon={<User className="h-4 w-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Nombre completo" value={cliente.nombre} onChange={(v) => setClienteField("nombre", v)} placeholder="Juan Pérez" />
            <Field label="Teléfono / WhatsApp" value={cliente.telefono} onChange={(v) => setClienteField("telefono", v)} placeholder="+598 99 123 456" />
            <Field label="Documento (opcional)" value={cliente.documento} onChange={(v) => setClienteField("documento", v)} placeholder="CI o RUC" />
          </div>
          {/* OBSERVACIONES COMERCIALES - ahora ocupa todo el ancho disponible
               (antes compartía la fila con el campo FECHA que fue eliminado
               por ser redundante con el reloj en tiempo real del header) */}
          <div className="mt-3">
            <Field label="Observaciones comerciales" value={cliente.observaciones} onChange={(v) => setClienteField("observaciones", v)} placeholder="Forma de pago, plazo de entrega, etc." textarea />
          </div>
          <p className="text-[11px] text-stone-400 mt-2">
            Todos los campos del cliente son opcionales. La cotización se puede armar sin estos datos.
          </p>
        </Section>

        {/* 2. PRODUCTOS AGREGADOS (con buscador integrado) */}
        <Section
          title={`PRODUCTOS AGREGADOS (${items.length})`}
          icon={<Package className="h-4 w-4" />}
          action={
            (items.length > 0 || planes.length > 0) ? (
              <button
                onClick={handleLimpiar}
                className="text-[11px] font-semibold text-stone-500 hover:text-rose-600 transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Vaciar
              </button>
            ) : null
          }
        >
          {/* Buscador integrado dentro del cuadro PRODUCTOS AGREGADOS */}
          <div ref={searchRef} className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowResults(true);
              }}
              placeholder="Buscar producto por nombre, SKU o marca... (ej: heladera, sofá, moto 110cc)"
              className="w-full h-12 pl-12 pr-4 rounded-xl border-2 border-stone-200 bg-white text-base font-medium focus:outline-none shadow-sm focus:ring-4"
              style={{
                borderColor: "#e7e5e4",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = DORADO;
                e.currentTarget.style.boxShadow = `0 0 0 4px ${DORADO_CLARO}55`;
                if (search.trim()) setShowResults(true);
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e7e5e4";
                e.currentTarget.style.boxShadow = "none";
              }}
            />

            {showResults && search.trim() && (
              <div className="absolute z-40 top-full mt-2 w-full bg-white rounded-xl border border-stone-200 shadow-2xl max-h-96 overflow-y-auto">
                {loadingSearch ? (
                  <div className="p-4 text-sm text-stone-500 text-center">Buscando...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-sm text-stone-500 text-center">
                    No se encontraron productos para &quot;{search}&quot;
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase text-stone-400 bg-stone-50 border-b border-stone-100">
                      {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} · Click para agregar
                    </div>
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="w-full text-left p-3 hover:bg-rose-50 border-b border-stone-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900 text-sm line-clamp-1">{p.name}</p>
                          <p className="text-xs text-stone-500">
                            SKU: {p.sku}
                            {p.priceContado ? ` · Contado: ${formatPYG(p.priceContado)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-rose-600 text-sm whitespace-nowrap">
                            {p.priceContado ? formatPYG(p.priceContado) : "—"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="h-10 w-10 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-stone-500">Todavía no hay productos en la cotización</p>
              <p className="text-xs text-stone-400 mt-1">Usá el buscador de arriba para encontrar y agregar productos</p>
              <button
                onClick={() => searchInputRef.current?.focus()}
                className="mt-4 inline-flex h-10 px-4 rounded-xl border-2 border-dashed border-stone-300 hover:border-rose-400 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-medium text-sm items-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar primer producto
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <ProductItemRow
                  key={item.productId}
                  item={item}
                  index={idx + 1}
                  onRemove={() => {
                    removeItem(item.productId);
                    setCalcDone(false);
                  }}
                  onQuantityChange={(q) => {
                    setQuantity(item.productId, q);
                    setCalcDone(false);
                  }}
                />
              ))}
              <button
                onClick={() => searchInputRef.current?.focus()}
                className="w-full mt-2 h-11 rounded-xl border-2 border-dashed border-stone-300 hover:border-rose-400 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar otro producto
              </button>
            </div>
          )}
        </Section>

        {/* 2.5. DESCUENTO POR CASCO (AUTOMÁTICO - solo se muestra si hay casco en el carrito) */}
        {cascoEnCarrito && cascoValorExacto > 0 && (
          <Section title="DESCUENTO POR CASCO (AUTOMÁTICO)" icon={<Gift className="h-4 w-4" />}>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700 uppercase">
                    Casco detectado automáticamente
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                  No editable
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-stone-500 uppercase font-semibold">Producto detectado</p>
                  <p className="text-stone-900 font-bold mt-0.5">{cascoEnCarrito.name}</p>
                  <p className="text-stone-400 mt-0.5">
                    SKU: {cascoEnCarrito.sku} · Cantidad: {cascoEnCarrito.quantity}x
                  </p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase font-semibold">Valor del descuento</p>
                  <p className="text-rose-600 font-bold text-base mt-0.5 tabular-nums">
                    -{formatPYG(cascoValorExacto)}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-emerald-200 grid grid-cols-3 gap-2 text-[10px] text-stone-600">
                <div>
                  <p className="uppercase font-semibold">Subtotal productos</p>
                  <p className="font-bold tabular-nums mt-0.5">{formatPYG(contadoOriginalBruto)}</p>
                </div>
                <div>
                  <p className="uppercase font-semibold">Descuento casco</p>
                  <p className="font-bold text-rose-600 tabular-nums mt-0.5">-{formatPYG(cascoValorExacto)}</p>
                </div>
                <div>
                  <p className="uppercase font-semibold">Base a financiar</p>
                  <p className="font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatPYG(contadoOriginalTotal)}
                  </p>
                </div>
              </div>
            </div>
          </Section>
        )}

                {/* 3. PRECIO DE CONTADO CON MARGEN */}
        <Section title="PRECIO DE CONTADO" icon={<Percent className="h-4 w-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">Contado (neto con casco descontado)</label>
              <div className="h-14 px-4 flex items-center rounded-xl bg-stone-50 border-2 border-stone-200">
                <span className="text-base font-bold text-stone-900 tabular-nums">{formatPYG(contadoOriginalTotal)}</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                {cascoAplicado
                  ? `Bruto: ${formatPYG(contadoOriginalBruto)} - Casco: ${formatPYG(descuentoCasco)} = Neto`
                  : "Suma de contado × cantidad"}
              </p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">Margen adicional (%)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={contadoMarginPct}
                onChange={(e) => setContadoMarginPct(Number(e.target.value))}
                placeholder="0"
                className="w-full h-14 px-4 rounded-xl border-2 border-stone-200 bg-white text-base font-semibold focus:border-rose-500 focus:ring-4 focus:ring-rose-100 outline-none tabular-nums"
              />
              <p className="text-[10px] text-stone-400 mt-1">Opcional · 0 = sin margen</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">Contado ajustado</label>
              <div className="h-14 px-4 flex items-center rounded-xl bg-rose-50 border-2 border-rose-200">
                <span className="text-base font-bold text-rose-600 tabular-nums">{formatPYG(contadoAjustado)}</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                {contadoMarginPct > 0 ? `Original + ${contadoMarginPct}%` : "Sin margen adicional"}
              </p>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirContadoEnPresupuesto}
              onChange={(e) => setIncluirContadoEnPresupuesto(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-rose-500 focus:ring-rose-100"
            />
            <span className="text-stone-700 font-medium">
              Incluir precio de contado en el presupuesto
            </span>
          </label>
        </Section>

        {/* 4. PLANES DE PAGO Y CUOTAS */}
        <Section title="PLANES DE PAGO Y CUOTAS" icon={<Calculator className="h-4 w-4" />}>
          {planes.length === 0 ? (
            <div className="py-6 text-center">
              <Calculator className="h-10 w-10 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-stone-500">Todavía no hay planes de cuotas</p>
              <p className="text-xs text-stone-400 mt-1 mb-4">Agregá uno o varios planes para ofrecer alternativas al cliente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {planes.map((plan, idx) => {
                const calculated = calculatedPlanes.find((p) => p.id === plan.id);
                const isDuplicate = duplicatePlanes.some((d) => d.id === plan.id);
                return (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    calculated={calculated}
                    index={idx + 1}
                    isDuplicate={isDuplicate}
                    includeContadoAsPlan={incluirContadoEnPresupuesto}
                    onCuotasChange={(n) => {
                      updatePlanCuotas(plan.id, n);
                      setCalcDone(false);
                    }}
                    onRemove={() => {
                      removePlan(plan.id);
                      setCalculatedPlanes((ps) => ps.filter((p) => p.id !== plan.id));
                      setCalcDone(false);
                    }}
                  />
                );
              })}
            </div>
          )}
          <button
            onClick={addPlan}
            className="w-full mt-3 h-11 rounded-xl border-2 border-dashed border-stone-300 hover:border-rose-400 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="h-4 w-4" />
            AGREGAR PLAN DE CUOTAS
          </button>
          {duplicatePlanes.length > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              ⚠ Tenés planes duplicados ({[...new Set(duplicatePlanes.map(p => p.cuotas))].join(", ")} cuotas).
              Considerá eliminar duplicados antes de calcular.
            </p>
          )}
        </Section>

        {/* 4.5. ENTREGA INICIAL - checkboxes independientes que controlan el PDF */}
        <Section title="ENTREGA INICIAL" icon={<Calendar className="h-4 w-4" />}>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* CAJA VERDE: CON ENTREGA INICIAL - checkbox independiente (compacta) */}
            <label
              className={`flex-1 cursor-pointer select-none rounded-xl border-2 px-5 py-3 transition-all flex items-center gap-3 ${
                mostrarConEntrega
                  ? "border-emerald-500 bg-emerald-50 shadow-sm"
                  : "border-stone-300 bg-white hover:border-emerald-400 opacity-60 border-dashed"
              }`}
            >
              <span className="text-2xl leading-none select-none flex-shrink-0">
                {mostrarConEntrega ? "✅" : "☐"}
              </span>
              <input
                type="checkbox"
                checked={mostrarConEntrega}
                onChange={(e) => {
                  setMostrarConEntrega(e.target.checked);
                  resetCalculoEntrega();
                }}
                className="sr-only"
              />
              <p className="font-bold text-sm text-stone-900 uppercase tracking-wide m-0">
                CON ENTREGA INICIAL
              </p>
            </label>
            {/* CAJA DORADA: SIN ENTREGA INICIAL - checkbox independiente (compacta) */}
            <label
              className={`flex-1 cursor-pointer select-none rounded-xl border-2 px-5 py-3 transition-all flex items-center gap-3 ${
                mostrarSinEntrega
                  ? "border-amber-500 bg-amber-50 shadow-sm"
                  : "border-stone-300 bg-white hover:border-amber-400 opacity-60 border-dashed"
              }`}
            >
              <span className="text-2xl leading-none select-none flex-shrink-0">
                {mostrarSinEntrega ? "✅" : "☐"}
              </span>
              <input
                type="checkbox"
                checked={mostrarSinEntrega}
                onChange={(e) => {
                  setMostrarSinEntrega(e.target.checked);
                  resetCalculoEntrega();
                }}
                className="sr-only"
              />
              <p className="font-bold text-sm text-stone-900 uppercase tracking-wide m-0">
                SIN ENTREGA INICIAL
              </p>
            </label>
          </div>

          {/* DatePicker y resumen - se muestra cuando SIN ENTREGA está marcado */}
          {mostrarSinEntrega && (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
                    Fecha de inicio de primera cuota
                  </label>
                  <input
                    type="date"
                    value={fechaInicioPago}
                    min={new Date().toISOString().slice(0, 10)}
                    max={getMaxFechaInicio()}
                    onChange={(e) => {
                      setFechaInicioPago(e.target.value);
                      resetCalculoEntrega();
                    }}
                    className="w-full sm:w-56 h-12 px-3 rounded-lg border-2 border-stone-200 bg-white text-sm font-semibold focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none tabular-nums"
                  />
                </div>
                <div className="text-[11px] text-stone-500 leading-relaxed sm:max-w-xs">
                  Las cuotas siguientes se vencen el mismo día de cada mes a
                  partir de la fecha seleccionada.
                </div>
              </div>

            </div>
          )}
        </Section>

        {/* 5. BOTÓN CALCULAR PRESUPUESTO */}
        <button
          onClick={handleCalcular}
          disabled={items.length === 0 || planes.length === 0}
          className="w-full h-16 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01] hover:brightness-110"
          style={{
            backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`,
            color: AZUL_OSCURO,
            boxShadow: "0 10px 25px -8px rgba(217, 184, 107, 0.55)",
          }}
        >
          <Calculator className="h-6 w-6" />
          CALCULAR PRESUPUESTO
        </button>

        {/* 6. RESULTADO */}
        {calcDone && calculatedPlanes.length > 0 && (
          <div id="resultado-section">
            <Section title="RESULTADO DEL PRESUPUESTO" icon={<FileText className="h-4 w-4" />}>
              {/* Tabla comparativa de planes */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-stone-200 rounded-lg overflow-hidden">
                  <thead className="bg-stone-100 border-b border-stone-200">
                    <tr>
                      <th className="text-left font-bold text-stone-700 px-3 py-2">PLAN</th>
                      <th className="text-center font-bold text-stone-700 px-3 py-2">CUOTAS</th>
                      <th className="text-right font-bold text-stone-700 px-3 py-2">VALOR POR CUOTA</th>
                      <th className="text-right font-bold text-stone-700 px-3 py-2">TOTAL DEL PLAN</th>
                      <th className="text-left font-bold text-stone-700 px-3 py-2">FECHAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mostrarConEntrega && incluirContadoEnPresupuesto && (
                      <tr className="border-b border-stone-100 last:border-0 hover:bg-rose-50/30 bg-emerald-50/40">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-900">A</span>
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "#dcfce7",
                                color: "#15803d",
                              }}
                            >
                              CON ENTREGA
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-stone-700 font-semibold">
                          Contado (1 pago)
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-rose-600 tabular-nums">
                          {formatPYG(contadoAjustado)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-stone-900 tabular-nums">
                          {formatPYG(contadoAjustado)}
                        </td>
                        <td className="px-3 py-3 text-stone-400 text-xs">—</td>
                      </tr>
                    )}
                    {calculatedPlanes.map((p, idx) => {
                      const letter = String.fromCharCode(
                        65 + idx + (incluirContadoEnPresupuesto ? 1 : 0)
                      );
                      const sinEntrega = calculatedPlanesSinEntrega.find(
                        (sp) => sp.id === p.id
                      );
                      const cuotasLabelCon =
                        p.cuotas === 1
                          ? "1 pago"
                          : `1 ENTRADA + ${p.cuotas - 1} CUOTA${
                              p.cuotas - 1 !== 1 ? "S" : ""
                            }`;
                      const cuotasLabelSin =
                        p.cuotas === 1 ? "1 cuota" : `${p.cuotas} CUOTAS`;
                      return (
                        <Fragment key={p.id}>
                          {/* CON ENTREGA - valores base (ocultar si es 1 solo pago) */}
                          {mostrarConEntrega && p.cuotas > 1 && (
                            <tr className="border-b border-stone-100 last:border-0 hover:bg-rose-50/30 bg-emerald-50/30">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-stone-900">{letter}</span>
                                  <span
                                    className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: "#dcfce7",
                                      color: "#15803d",
                                    }}
                                  >
                                    CON ENTREGA
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center text-stone-700">
                                {cuotasLabelCon}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-rose-600 tabular-nums">
                                {formatPYG(p.valorPorCuota)}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-stone-900 tabular-nums">
                                {formatPYG(p.total)}
                              </td>
                              <td className="px-3 py-3 text-stone-400 text-xs">—</td>
                            </tr>
                          )}
                          {/* SIN ENTREGA - con margen (solo si fue calculado) */}
                          {mostrarSinEntrega && sinEntrega && (
                            <tr className="border-b border-stone-100 last:border-0 hover:bg-amber-50/40 bg-amber-50/30">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-stone-900">{letter}</span>
                                  <span
                                    className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: "#fef3c7",
                                      color: "#b45309",
                                    }}
                                  >
                                    SIN ENTREGA
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center text-stone-700">
                                {cuotasLabelSin}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: "#b45309" }}>
                                {formatPYG(sinEntrega.valorPorCuota)}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-stone-900 tabular-nums">
                                {formatPYG(sinEntrega.total)}
                              </td>
                              <td className="px-3 py-3 text-stone-600 text-[11px] leading-tight whitespace-nowrap">
                                Primer pago: {generarFechaCuota(fechaInicioPago, 1)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Contado en resultado */}
              <div className="mt-5 pt-4 border-t border-stone-200">
                <p className="text-[11px] font-semibold uppercase text-stone-500 mb-3">Precios de contado</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-stone-50">
                    <p className="text-[10px] uppercase text-stone-400 font-semibold tracking-wide mb-1">Contado original</p>
                    <p className="text-lg font-bold text-stone-900 tabular-nums">{formatPYG(contadoOriginalTotal)}</p>
                  </div>
                  {contadoMarginPct > 0 && (
                    <div className="p-3 rounded-xl bg-rose-50 ring-1 ring-rose-200">
                      <p className="text-[10px] uppercase text-rose-500 font-semibold tracking-wide mb-1">
                        Contado con +{contadoMarginPct}% adicional
                      </p>
                      <p className="text-lg font-bold text-rose-600 tabular-nums">{formatPYG(contadoAjustado)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Detalle productos */}
              <div className="mt-5 pt-4 border-t border-stone-200">
                <p className="text-[11px] font-semibold uppercase text-stone-500 mb-2">Detalle de productos</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between text-xs text-stone-700 py-1">
                      <span className="flex-1 min-w-0 truncate">
                        <span className="font-mono text-stone-400">[{item.sku}]</span>{" "}
                        <span className="font-medium">{item.name}</span>{" "}
                        <span className="text-stone-500">× {item.quantity}</span>
                      </span>
                      <span className="font-semibold tabular-nums whitespace-nowrap ml-2">
                        {formatPYG(item.priceContado * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 7. BOTÓN GENERAR PDF */}
              <button
                onClick={handleGenerarPDF}
                disabled={generatingPdf}
                className="w-full mt-5 h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 transition-all hover:brightness-110"
                style={{
                  backgroundImage: `linear-gradient(to right, ${AZUL_OSCURO}, ${AZUL})`,
                  boxShadow: "0 8px 20px -8px rgba(13, 61, 94, 0.5)",
                }}
              >
                {generatingPdf ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    GENERANDO PDF...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5" />
                    GENERAR PRESUPUESTO PDF
                  </>
                )}
              </button>
            </Section>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

// === COMPONENTES AUXILIARES ===

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"
          style={{ color: AZUL }}
        >
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
        />
      )}
    </div>
  );
}

function ProductItemRow({
  item,
  index,
  onRemove,
  onQuantityChange,
}: {
  item: CotizacionItem;
  index: number;
  onRemove: () => void;
  onQuantityChange: (q: number) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200 hover:border-stone-300 transition-colors">
      <div className="h-7 w-7 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-bold shrink-0">{index}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-stone-900 line-clamp-2 leading-snug">{item.name}</p>
        <p className="text-xs text-stone-500 mt-0.5">
          SKU: <span className="font-mono">{item.sku}</span> · Contado:{" "}
          <span className="font-semibold">{formatPYG(item.priceContado)}</span> c/u
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-stone-500 font-medium">Cant:</label>
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => onQuantityChange(Number(e.target.value))}
            className="w-20 h-9 px-2 rounded-lg border border-stone-200 bg-white text-sm text-center font-semibold focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none tabular-nums"
          />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-stone-400 uppercase font-medium">Subtotal</p>
          <p className="font-bold text-stone-900 text-sm tabular-nums whitespace-nowrap">
            {formatPYG(item.priceContado * item.quantity)}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="h-9 w-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors shrink-0"
          title="Eliminar producto"
          aria-label="Eliminar producto"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  calculated,
  index,
  isDuplicate,
  includeContadoAsPlan,
  onCuotasChange,
  onRemove,
}: {
  plan: PlanCuotas;
  calculated: PlanCuotas | undefined;
  index: number;
  isDuplicate: boolean;
  includeContadoAsPlan?: boolean;
  onCuotasChange: (n: number) => void;
  onRemove: () => void;
}) {
  const letter = String.fromCharCode(
    64 + index + (includeContadoAsPlan ? 1 : 0)
  );
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      isDuplicate
        ? "bg-amber-50 border-amber-300"
        : calculated?.calculado
        ? "bg-emerald-50/50 border-emerald-200"
        : "bg-stone-50 border-stone-200"
    }`}>
      <div className="h-8 w-8 rounded-full bg-stone-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
        {letter}
      </div>
      <div className="flex-1 min-w-0">
        <label className="text-[10px] uppercase font-semibold text-stone-500 block mb-1">Plan {letter}</label>
        <div className="relative">
          <select
            value={plan.cuotas}
            onChange={(e) => onCuotasChange(Number(e.target.value))}
            className="w-full h-10 pl-3 pr-8 rounded-lg border border-stone-200 bg-white text-sm font-semibold focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none appearance-none cursor-pointer"
          >
            <option value={1}>1 pago</option>
            {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n} cuotas</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
        </div>
      </div>
      {calculated?.calculado ? (
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[10px] uppercase text-stone-400 font-medium">Valor cuota</p>
            <p className="font-bold text-rose-600 text-sm tabular-nums whitespace-nowrap">
              {formatPYG(calculated.valorPorCuota)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-stone-400 font-medium">Total</p>
            <p className="font-bold text-stone-900 text-sm tabular-nums whitespace-nowrap">
              {formatPYG(calculated.total)}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase text-stone-400 font-medium">Resultado</p>
          <p className="text-stone-400 text-sm">Presione calcular</p>
        </div>
      )}
      <button
        onClick={onRemove}
        className="h-9 w-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors shrink-0"
        title="Eliminar plan"
        aria-label="Eliminar plan"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
