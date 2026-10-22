"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  X,
  User,
  Package,
  Calendar,
  Trash2,
  FileText,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { usePlanSafraStore, parseSafra } from "@/store/plan-safra";
import { formatPYG } from "@/lib/format";

// === VIZA home brand palette ===
const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";
const DORADO_CLARO = "#e5cb8a";
const CREMA = "#faf6ed";

interface SafraProductApi {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceContado: number | null;
  [key: string]: any;
}

export function PlanSafra() {
  // === Búsqueda de productos ===
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SafraProductApi[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    productos,
    addProducto,
    removeProducto,
    setProductoQuantity,
    clienteNombre,
    clienteTelefono,
    clienteObservaciones,
    fechaEmision,
    setClienteField,
    // === Entrada (manual) ===
    entradaValor,
    setEntradaValor,
    // === Casco (descuento, igual que Cotización Normal) ===
    // cascoAplicado NO se lee del store - es DERIVADO automáticamente
    cascoValor,
    cascoDescripcion,
    setCascoAplicado,
    setCascoValor,
    setCascoDescripcion,
    // === Refuerzos (v2.0: solo fecha, valor auto-calculado) ===
    refuerzos,
    addRefuerzo,
    removeRefuerzo,
    setRefuerzoMes,
    setRefuerzoValor,
    setRefuerzoFecha,
    // === Cronograma y cálculos en tiempo real ===
    cronograma,
    totalContado,
    totalContadoBruto,
    descuentoCasco,
    cascoError,
    totalIntereses,
    totalPlan,
    saldoFinal,
    totalPagado6Meses,
    cumple50,
    cuadra,
    faltanPara50,
    calcularCronograma,
    clear,
  } = usePlanSafraStore();

  // === Buscar productos (mismo patrón que sales-panel) ===
  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    try {
      const res = await fetch(
        `/api/products?search=${encodeURIComponent(q)}&pageSize=10`
      );
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

  const handleAddProduct = (product: SafraProductApi) => {
    // REGLA DE ORO: Solo LECTURA del campo SAFRA del Admin.
    // NO se modifica la BD. Solo se lee el % y se usa para el cálculo en memoria.
    const safraPct = parseSafra(product.safra);
    addProducto({
      id: product.id,
      sku: product.sku,
      name: product.name,
      priceContado: product.priceContado ?? 0,
      safraPct,
      quantity: 1,
    });
    setSearch("");
    setSearchResults([]);
    setShowResults(false);
    calcularCronograma();
    toast.success(`${product.name} agregado al plan Safra`);
  };

  // === DESCUENTO POR CASCO - DETECCIÓN AUTOMÁTICA Y OBLIGATORIA ===
  // REGLA DE NEGOCIO: El casco es un REGALO de VIZA Home. El sistema detecta
  // automáticamente si hay un producto con "CASCO" en el nombre y aplica el
  // descuento automáticamente. NO hay checkbox ni opción manual.
  // El vendedor NO puede modificar ni quitar el descuento (solo quitando el
  // producto casco del carrito).

  // 1. Detectar casco en el carrito (por nombre del producto que contenga "CASCO")
  const cascoEnCarrito = productos.find((i) =>
    i.name.toUpperCase().includes("CASCO")
  );

  // 2. Valor EXACTO del casco (precio contado × cantidad)
  const cascoValorExacto = cascoEnCarrito
    ? (cascoEnCarrito.priceContado ?? 0) * cascoEnCarrito.quantity
    : 0;

  // 3. cascoAplicado ahora es DERIVADO (automático), no del store
  //    Si hay casco en el carrito → cascoAplicado = true (siempre)
  //    Si no hay casco → cascoAplicado = false (siempre)
  const cascoAplicado = !!cascoEnCarrito;

  // 4. Auto-sync: sincronizar el store con los valores derivados
  useEffect(() => {
    if (cascoEnCarrito && cascoValorExacto > 0) {
      if (cascoValor !== cascoValorExacto) {
        setCascoValor(cascoValorExacto);
      }
      if (!usePlanSafraStore.getState().cascoAplicado) {
        setCascoAplicado(true);
      }
    } else {
      if (cascoValor !== 0) {
        setCascoValor(0);
      }
      if (usePlanSafraStore.getState().cascoAplicado) {
        setCascoAplicado(false);
      }
    }
  }, [cascoEnCarrito, cascoValorExacto, cascoValor, setCascoValor, setCascoAplicado]);

  // === Mantener cronograma actualizado cuando cambian productos/pagos/casco ===
  useEffect(() => {
    calcularCronograma();
  }, [productos, entradaValor, refuerzos, cascoAplicado, cascoValor, calcularCronograma]);

  const handleCalcular = () => {
    if (productos.length === 0) {
      toast.error("Agregá al menos un producto antes de calcular");
      return;
    }
    calcularCronograma();
    toast.success("Plan Safra recalculado");
  };

  const handleLimpiar = () => {
    if (productos.length === 0 && !clienteNombre) return;
    if (
      confirm("¿Vaciar el plan Safra? Se perderán los productos y datos cargados.")
    ) {
      clear();
      toast.success("Plan Safra vaciado");
    }
  };

  const handleGenerarPDF = async () => {
    if (productos.length === 0) {
      toast.error("No hay productos para generar el PDF");
      return;
    }
    // Validar que ningún refuerzo supere mes 18
    const refuerzosFueraDePlazo = refuerzos.filter((r) => r.mes > 18 || r.mes < 1);
    if (refuerzosFueraDePlazo.length > 0) {
      toast.error("El Plan Safra es máximo 18 meses. Revisá los refuerzos.");
      return;
    }
    // VALIDACIÓN DEL CASCO - AUTOMÁTICA:
    // El casco se detecta automáticamente por nombre. Si hay casco, el
    // descuento se aplica solo (no se puede evitar). Las validaciones manuales
    // ya no son necesarias porque el sistema controla todo automáticamente.
    // Solo verificamos que el valor no exceda el total (caso de borde).
    if (cascoAplicado && cascoValor > totalContadoBruto) {
      toast.error("⚠️ El valor del casco no puede ser mayor al total de productos.");
      return;
    }
    if (!cumple50) {
      toast.error(
        `No cumple la regla del 50% en 6 meses. Faltan Gs ${faltanPara50.toLocaleString()}`
      );
      return;
    }
    if (!cuadra) {
      toast.error(
        `El saldo final debe ser 0. Saldo actual: Gs ${saldoFinal.toLocaleString()}`
      );
      return;
    }

    setGeneratingPdf(true);
    try {
      // Asegurar que el cronograma esté actualizado antes de generar el PDF
      calcularCronograma();

      const payload = {
        cliente: {
          nombre: clienteNombre,
          telefono: clienteTelefono,
          observaciones: clienteObservaciones,
          fecha: fechaEmision,
        },
        productos: productos.map((p) => ({
          sku: p.sku,
          name: p.name,
          quantity: p.quantity,
          priceContado: p.priceContado,
          subtotalContado: p.priceContado * p.quantity,
          safraPct: p.safraPct,
        })),
        // === DESCUENTO POR CASCO ===
        cascoAplicado,
        cascoValor: descuentoCasco,
        cascoDescripcion: cascoDescripcion || (cascoAplicado ? "Descuento por casco" : ""),
        totalContadoBruto,
        // Pago inicial
        entradaValor,
        // Refuerzos manuales
        refuerzos: refuerzos.map((r) => ({
          id: r.id,
          mes: r.mes,
          valor: r.valor,
          concepto: r.concepto,
        })),
        // Cronograma generado mes a mes (con intereses calculados sobre saldo)
        cronograma: cronograma.map((c) => ({
          mes: c.mes,
          fecha: c.fecha,
          concepto: c.concepto,
          saldoInicial: c.saldoInicial,
          pago: c.pago,
          interes: c.interes,
          saldoFinal: c.saldoFinal,
        })),
        // Totales calculados en tiempo real
        totalContado,
        totalIntereses,
        totalPlan,
        saldoFinal,
        totalPagado6Meses,
        cumple50,
        cuadra,
        faltanPara50,
      };

      const res = await fetch("/api/quotes/safra-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al generar PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nombreCliente = clienteNombre
        ? clienteNombre.replace(/\s+/g, "_").replace(/[^\w-]/g, "")
        : "Cliente";
      a.download = `VIZA-Presupuesto-Safra-${nombreCliente}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF Safra generado correctamente");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Cronograma se valida en tiempo real (cumple50 y cuadra).

  return (
    <div className="space-y-5">
      {/* === A. HEADER === */}
      {/* === B. CLIENTE (OPCIONAL) === */}
      <Section title="CLIENTE (OPCIONAL)" icon={<User className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Nombre completo"
            value={clienteNombre}
            onChange={(v) => setClienteField("Nombre", v)}
            placeholder="Juan Pérez"
          />
          <Field
            label="Teléfono / WhatsApp"
            value={clienteTelefono}
            onChange={(v) => setClienteField("Telefono", v)}
            placeholder="+598 99 123 456"
          />
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
              Fecha de emisión
            </label>
            <input
              type="text"
              value={fechaEmision}
              readOnly
              className="w-full h-10 px-3 rounded-lg border border-stone-200 bg-stone-50 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <Field
            label="Observaciones comerciales"
            value={clienteObservaciones}
            onChange={(v) => setClienteField("Observaciones", v)}
            placeholder="Condiciones del plan, plazo de entrega, etc."
            textarea
          />
        </div>
        <p className="text-[11px] text-stone-400 mt-2">
          Todos los campos del cliente son opcionales. El plan se puede armar sin
          estos datos.
        </p>
      </Section>

      {/* === C. PRODUCTOS === */}
      <Section
        title={`PRODUCTOS (${productos.length})`}
        icon={<Package className="h-4 w-4" />}
        action={
          productos.length > 0 ? (
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
        {/* Buscador */}
        <div ref={searchRef} className="relative mb-3">
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
            className="w-full h-14 pl-12 pr-4 rounded-xl border-2 bg-white text-base font-medium focus:outline-none shadow-sm focus:ring-4"
            style={{ borderColor: "#e7e5e4" }}
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
                <div className="p-4 text-sm text-stone-500 text-center">
                  Buscando...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-sm text-stone-500 text-center">
                  No se encontraron productos para &quot;{search}&quot;
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase text-stone-400 bg-stone-50 border-b border-stone-100">
                    {searchResults.length} resultado
                    {searchResults.length !== 1 ? "s" : ""} · Click para agregar
                  </div>
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      className="w-full text-left p-3 hover:bg-amber-50 border-b border-stone-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm line-clamp-1">
                          {p.name}
                        </p>
                        <p className="text-xs text-stone-500">
                          SKU: {p.sku}
                          {p.priceContado
                            ? ` · Contado: ${formatPYG(p.priceContado)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="font-bold text-sm whitespace-nowrap"
                          style={{ color: AZUL_OSCURO }}
                        >
                          {p.priceContado ? formatPYG(p.priceContado) : "—"}
                        </span>
                        <div
                          className="h-7 w-7 rounded-lg text-white flex items-center justify-center"
                          style={{ backgroundColor: DORADO_OSCURO }}
                        >
                          <Plus className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Tabla de productos */}
        {productos.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="h-10 w-10 text-stone-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-500">
              Todavía no hay productos en el plan Safra
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Usá el buscador de arriba para encontrar y agregar productos
            </p>
            <button
              onClick={() => searchInputRef.current?.focus()}
              className="mt-4 inline-flex h-10 px-4 rounded-xl border-2 border-dashed border-stone-300 hover:border-amber-400 hover:bg-amber-50 text-stone-600 hover:text-amber-700 font-medium text-sm items-center gap-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar primer producto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-stone-200 rounded-lg overflow-hidden">
              <thead
                className="border-b border-stone-200"
                style={{ backgroundColor: AZUL }}
              >
                <tr>
                  <th className="text-left font-bold text-white px-3 py-2">Cód</th>
                  <th className="text-left font-bold text-white px-3 py-2">
                    Descripción
                  </th>
                  <th className="text-right font-bold text-white px-3 py-2">
                    V. Unit
                  </th>
                  <th className="text-center font-bold text-white px-3 py-2">
                    Cant
                  </th>
                  <th className="text-right font-bold text-white px-3 py-2">
                    Subtotal
                  </th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="border-b border-stone-100 last:border-0"
                    style={{
                      backgroundColor: idx % 2 === 0 ? "#fafaf9" : "#ffffff",
                    }}
                  >
                    <td className="px-3 py-3 text-stone-500 font-mono text-xs">
                      {p.sku}
                    </td>
                    <td className="px-3 py-3 text-stone-900 font-medium">
                      {p.name}
                    </td>
                    <td className="px-3 py-3 text-right text-stone-700 tabular-nums">
                      {formatPYG(p.priceContado)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        min={1}
                        value={p.quantity}
                        onChange={(e) =>
                          setProductoQuantity(p.id, Number(e.target.value))
                        }
                        className="w-16 h-9 px-2 rounded-lg border border-stone-200 bg-white text-sm text-center font-semibold focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-stone-900 tabular-nums">
                      {formatPYG(p.priceContado * p.quantity)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => {
                          removeProducto(p.id);
                          calcularCronograma();
                        }}
                        className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors"
                        title="Eliminar producto"
                        aria-label="Eliminar producto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2"
                  style={{
                    borderColor: DORADO,
                    backgroundColor: DORADO_CLARO,
                  }}
                >
                  <td colSpan={4} className="px-3 py-3 text-right font-bold uppercase text-[11px] tracking-wide" style={{ color: AZUL_OSCURO }}>
                    TOTAL AL CONTADO:
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold tabular-nums" style={{ color: AZUL_OSCURO }}>
                    {formatPYG(totalContado)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <button
              onClick={() => searchInputRef.current?.focus()}
              className="w-full mt-3 h-11 rounded-xl border-2 border-dashed border-stone-300 hover:border-amber-400 hover:bg-amber-50 text-stone-600 hover:text-amber-700 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar otro producto
            </button>
          </div>
        )}
      </Section>

      {/* === D-bis. DESCUENTO POR CASCO (AUTOMÁTICO - solo si hay casco en el carrito) === */}
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
                <p className="font-bold tabular-nums mt-0.5">{formatPYG(totalContadoBruto)}</p>
              </div>
              <div>
                <p className="uppercase font-semibold">Descuento casco</p>
                <p className="font-bold text-rose-600 tabular-nums mt-0.5">-{formatPYG(cascoValorExacto)}</p>
              </div>
              <div>
                <p className="uppercase font-semibold">Base Plan Safra</p>
                <p className="font-bold text-emerald-700 tabular-nums mt-0.5">{formatPYG(totalContado)}</p>
              </div>
            </div>
          </div>
        </Section>
      )}

            {/* === D. PAGO INICIAL / ENTRADA (manual) === */}
      <Section title="PAGO INICIAL / ENTRADA" icon={<Calculator className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-1">
            <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
              Entrada / Pago Inicial (Gs)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={entradaValor || ""}
              onChange={(e) => setEntradaValor(Number(e.target.value))}
              placeholder="Ej: 200000"
              className="w-full h-12 px-3 rounded-lg border-2 border-stone-200 bg-white text-sm font-semibold focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none tabular-nums"
            />
          </div>
          <div className="sm:col-span-2 text-[11px] text-stone-500 leading-relaxed">
            {totalContado > 0 && (
              <>
                <p>
                  <strong>Entrada actual:</strong> {formatPYG(entradaValor)}{" "}
                  ({((entradaValor / totalContado) * 100).toFixed(1)}% del total)
                </p>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* === E. REFUERZOS / PAGOS EXTRA (lista dinámica manual) === */}
      <Section
        title={`REFUERZOS / PAGOS EXTRA (${refuerzos.length})`}
        icon={<Calendar className="h-4 w-4" />}
        action={
          <button
            onClick={addRefuerzo}
            className="h-9 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors border"
            style={{
              backgroundColor: DORADO,
              color: AZUL_OSCURO,
              borderColor: DORADO,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            AGREGAR REFUERZO
          </button>
        }
      >
        {refuerzos.length === 0 ? (
          <div className="py-6 text-center">
            <Calendar className="h-10 w-10 text-stone-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-500">No hay refuerzos cargados</p>
            <p className="text-xs text-stone-400 mt-1 mb-4">
              Hacé click en "AGREGAR REFUERZO" para añadir pagos extra en los meses que elijas (máx. mes 18).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {refuerzos.map((r, idx) => {
              const fueraDePlazo = r.mes > 18 || r.mes < 1;
              return (
                <div
                  key={r.id}
                  className={`grid grid-cols-[1fr_2fr_auto] gap-2 items-center p-2 rounded-lg border ${
                    fueraDePlazo ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-stone-50"
                  }`}
                >
                  {/* Fecha (v2.0 - reemplaza input de mes) */}
                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 uppercase block mb-0.5">
                      Fecha de pago
                    </label>
                    <input
                      type="date"
                      value={r.fecha || ""}
                      min={(() => {
                        const d = new Date((fechaEmision || new Date().toISOString().slice(0,10)) + "T00:00:00");
                        d.setMonth(d.getMonth() + 1);
                        return d.toISOString().slice(0, 10);
                      })()}
                      max={(() => {
                        const d = new Date((fechaEmision || new Date().toISOString().slice(0,10)) + "T00:00:00");
                        d.setMonth(d.getMonth() + 18);
                        return d.toISOString().slice(0, 10);
                      })()}
                      onChange={(e) => setRefuerzoFecha(r.id, e.target.value)}
                      className={`w-full h-10 px-2 rounded-md border-2 bg-white text-sm font-semibold outline-none ${
                        fueraDePlazo
                          ? "border-rose-400 focus:ring-2 focus:ring-rose-100"
                          : "border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      }`}
                    />
                  </div>
                  {/* Valor (v2.0 - AUTO-CALCULADO, read-only) */}
                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 uppercase block mb-0.5">
                      Valor (auto-calculado)
                    </label>
                    <div className="h-10 px-2 rounded-md border-2 border-stone-200 bg-stone-100 text-sm font-bold text-stone-700 flex items-center tabular-nums">
                      {r.valor > 0 ? formatPYG(r.valor) : "—"}
                    </div>
                  </div>
                  {/* Eliminar */}
                  <div className="flex items-end">
                    <button
                      onClick={() => removeRefuerzo(r.id)}
                      className="h-10 w-10 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors"
                      title="Eliminar refuerzo"
                      aria-label="Eliminar refuerzo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {fueraDePlazo && (
                    <div className="col-span-3 -mt-1 text-[10px] text-rose-600 font-semibold">
                      ⚠ El mes debe estar entre 1 y 18
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-stone-400 mt-2">
          El sistema calcula automáticamente los intereses sobre el saldo restante en cada pago.
        </p>
      </Section>

      {/* === F. RESUMEN DEL PLAN SAFRA === */}
      {productos.length > 0 && (entradaValor > 0 || refuerzos.length > 0) && (
        <Section title="RESUMEN DEL PLAN SAFRA" icon={<FileText className="h-4 w-4" />}>
          {/* Lista simplificada: solo pagos reales (sin "SOLO INTERÉS") */}
          {cronograma.length > 0 && (() => {
            // Filtrar SOLO los meses donde hay pago real (entrada + refuerzos)
            const pagosReales = cronograma.filter(c => c.pago > 0);
            const totalPagos = pagosReales.reduce((s, c) => s + c.pago, 0);
            return (
              <div className="space-y-2 mb-4">
                {pagosReales.map((c, idx) => {
                  const esEntrada = c.mes === 0;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                        esEntrada
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-stone-50 border-stone-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          esEntrada ? "bg-emerald-500 text-white" : "bg-stone-700 text-white"
                        }`}>
                          {esEntrada ? "0" : c.mes}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-stone-900">{c.concepto}</p>
                          <p className="text-[11px] text-stone-500 tabular-nums">
                            {c.fecha ? new Date(c.fecha + "T00:00:00").toLocaleDateString("es-PY", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            }) : "-"}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-stone-900 tabular-nums whitespace-nowrap">
                        {formatPYG(c.pago)}
                      </p>
                    </div>
                  );
                })}
                {/* Total de pagos */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-2" style={{ backgroundColor: CREMA, borderColor: DORADO }}>
                  <p className="text-sm font-bold uppercase text-stone-700">Total del Plan</p>
                  <p className="text-lg font-extrabold tabular-nums" style={{ color: AZUL }}>
                    {formatPYG(totalPlan)}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Panel de resumen (sin mostrar intereses) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {descuentoCasco > 0 && (
              <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
                <p className="text-[10px] font-semibold text-emerald-700 uppercase">Descuento Casco</p>
                <p className="text-base font-bold text-emerald-700 mt-1 tabular-nums">
                  -{formatPYG(descuentoCasco)}
                </p>
              </div>
            )}
            <div className="rounded-lg p-3 border-2" style={{ backgroundColor: CREMA, borderColor: DORADO }}>
              <p className="text-[10px] font-semibold uppercase" style={{ color: AZUL_OSCURO }}>
                Base Plan Safra
              </p>
              <p className="text-base font-extrabold mt-1 tabular-nums" style={{ color: AZUL }}>
                {formatPYG(totalContado)}
              </p>
            </div>
            <div className="rounded-lg p-3 border-2" style={{ backgroundColor: CREMA, borderColor: DORADO }}>
              <p className="text-[10px] font-semibold uppercase" style={{ color: AZUL_OSCURO }}>
                Total del Plan
              </p>
              <p className="text-base font-extrabold mt-1 tabular-nums" style={{ color: AZUL }}>
                {formatPYG(totalPlan)}
              </p>
            </div>
            <div className={`rounded-lg p-3 border ${cuadra ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-300"}`}>
              <p className={`text-[10px] font-semibold uppercase ${cuadra ? "text-emerald-700" : "text-amber-700"}`}>
                Estado del Plan
              </p>
              <p className={`text-base font-bold mt-1 ${cuadra ? "text-emerald-700" : "text-amber-700"}`}>
                {cuadra ? "CUADRA ✓" : "Falta ajustar"}
              </p>
            </div>
          </div>

          {/* Validación de la regla del 50% en 6 meses */}
          <div
            className="mt-3 p-3 rounded-lg border"
            style={{
              backgroundColor: cumple50 ? "#f0fdf4" : "#fef3c7",
              borderColor: cumple50 ? "#86efac" : "#fcd34d",
            }}
          >
            <div className="flex items-start gap-2">
              {cumple50 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: cumple50 ? "#166534" : "#92400e" }}
                >
                  {cumple50
                    ? "Regla del 50% en 6 meses: CUMPLIDA"
                    : "Faltan para cumplir el 50% en 6 meses"}
                </p>
                <p className="text-[10px] text-stone-600 mt-1 tabular-nums">
                  Pagado en meses 0-6: <strong>{formatPYG(totalPagado6Meses)}</strong>
                  {" "}
                  ({((totalPagado6Meses / Math.max(1, totalContado)) * 100).toFixed(1)}% del total)
                </p>
              </div>
            </div>
          </div>

          {/* Validación del saldo final = 0 */}
          {!cuadra && (
            <div className="mt-2 p-3 rounded-lg border border-amber-300 bg-amber-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    El plan no cuadra
                  </p>
                  <p className="text-[10px] text-stone-600 mt-1 tabular-nums">
                    {saldoFinal > 0
                      ? `Falta pagar Gs ${formatPYG(saldoFinal)} para cuadrar el plan.`
                      : `Te pasaste por Gs ${formatPYG(-saldoFinal)} - revisá los refuerzos.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-[11px] text-stone-500">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <p>
              El <strong>Margen Safra</strong> (leído del Panel Admin, solo lectura) se aplica
              sobre el <strong>saldo restante</strong> en cada pago, no sobre el total original.
              Por eso el interés disminuye a medida que se pagan los refuerzos.
            </p>
          </div>
        </Section>
      )}

      {/* === I. BOTONES === */}      {/* === I. BOTONES === */}      {/* === I. BOTONES === */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* CALCULAR */}
        <button
          onClick={handleCalcular}
          disabled={productos.length === 0}
          className="h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01] hover:brightness-110"
          style={{
            backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`,
            color: AZUL_OSCURO,
            boxShadow: "0 10px 25px -8px rgba(217, 184, 107, 0.55)",
          }}
        >
          <Calculator className="h-5 w-5" />
          CALCULAR
        </button>

        {/* LIMPIAR */}
        <button
          onClick={handleLimpiar}
          className="h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.01] hover:brightness-110"
          style={{
            backgroundColor: "#b91c1c",
            boxShadow: "0 10px 25px -8px rgba(185, 28, 28, 0.45)",
          }}
        >
          <Trash2 className="h-5 w-5" />
          LIMPIAR
        </button>

        {/* GENERAR PDF */}
        <button
          onClick={handleGenerarPDF}
          disabled={generatingPdf || productos.length === 0 || !cumple50 || !cuadra || refuerzos.some(r => r.mes > 18 || r.mes < 1)}
          className="h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110"
          style={{
            backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`,
            color: AZUL_OSCURO,
            boxShadow: "0 8px 20px -8px rgba(217, 184, 107, 0.55)",
          }}
        >
          {generatingPdf ? (
            <>
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              GENERANDO...
            </>
          ) : (
            <>
              <FileText className="h-5 w-5" />
              GENERAR PRESUPUESTO SAFRA
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// === COMPONENTES AUXILIARES (mismo patrón que sales-panel) ===

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
      <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
        />
      )}
    </div>
  );
}
