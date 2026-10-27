"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  X,
  User,
  Package,
  Trash2,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { usePlanMayoristaStore } from "@/store/mayorista";
import { formatPYG } from "@/lib/format";
import { esProductoRegalo } from "@/lib/producto-regalo";
import { CostoInterno, extractCostoMayorista } from "./costo-interno";

// FECHA DE EMISIÓN: fecha+hora LOCAL del dispositivo del vendedor, tomada en el
// momento exacto de generar el PDF. La ruta del PDF la usa para el cuadro
// FECHA DE EMISIÓN y para VÁLIDO HASTA (emisión + 10 días), así el presupuesto
// muestra siempre el día real en que se emite (el servidor vive en UTC).
function emisionHoy(): { fecha: string; hora: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

// === VIZA home brand palette ===
const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";
const DORADO_CLARO = "#e5cb8a";

interface MayoristaProductApi {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  [key: string]: any;
}

// PRECIO TÉCNICO (VALOR TECNICO de la BASE) - SOLO LECTURA
// Devuelve 0 si el producto no tiene precio técnico cargado.
function parseValorTecnico(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  const n = Number(valor);
  if (isNaN(n) || n <= 0) return 0;
  return n;
}

export function PlanMayorista() {
  // === Búsqueda de productos ===
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MayoristaProductApi[]>([]);
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
    clienteDocumento,
    clienteObservaciones,
    setClienteField,
    clear,
  } = usePlanMayoristaStore();

  // === Buscar productos (mismo patrón que Plan Safra) ===
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

  const handleAddProduct = (product: MayoristaProductApi) => {
    // REGLA: solo se pueden agregar productos CON precio técnico cargado.
    const precioTecnico = parseValorTecnico(product.valorTecnico);
    if (precioTecnico <= 0) {
      toast.error(
        `"${product.name}" no tiene PRECIO TÉCNICO cargado en la BASE. Cargale el VALOR TECNICO en el Panel Admin para poder agregarlo al MAYORISTA.`
      );
      return;
    }
    addProducto({
      id: product.id,
      sku: product.sku,
      name: product.name,
      priceTecnico: precioTecnico,
      quantity: 1,
      // Costo UNITARIO de la BASE: SOLO para el cuadrito interno del vendedor.
      // Nunca viaja en el payload del PDF (ese payload solo lleva sku/name/
      // quantity/priceTecnico/subtotal).
      // REGLA MAYORISTA (a pedido del usuario): productos AIRES (AIRE/AIRES en
      // DESCRIPCION, GRUPO o SUB-GRUPO) SIEMPRE usan el COSTO GS (costGs) y
      // NUNCA el COSTO PROD; las demas lineas usan el costo de siempre
      // (cost/costProd).
      cost: extractCostoMayorista(product),
    });
    setSearch("");
    setSearchResults([]);
    setShowResults(false);
    toast.success(`${product.name} agregado al MAYORISTA`);
  };

  const handleLimpiar = () => {
    if (productos.length === 0 && !clienteNombre) return;
    if (
      confirm(
        "¿Vaciar el presupuesto MAYORISTA? Se perderán los productos y datos cargados."
      )
    ) {
      clear();
      toast.success("Presupuesto MAYORISTA vaciado");
    }
  };

  // Total MAYORISTA = suma de (precio técnico × cantidad). Sin descuentos.
  const totalMayorista = productos.reduce(
    (sum, p) => sum + p.priceTecnico * p.quantity,
    0
  );

  // === REGALO CHAPA (COD 100068) - mismo mecanismo que el CASCO en los
  // otros planes === La chapa es un REGALO de VIZA Home: se detecta sola
  // por COD exacto (src/lib/producto-regalo.ts) y su precio técnico ×
  // cantidad se descuenta del total. El total que ve el vendedor y el que
  // llega al PDF es el NETO.
  const chapaEnCarrito = productos.find((p) => esProductoRegalo(p.sku));
  const descuentoChapa = chapaEnCarrito
    ? chapaEnCarrito.priceTecnico * chapaEnCarrito.quantity
    : 0;
  const totalMayoristaNeto = Math.max(0, totalMayorista - descuentoChapa);

  const handleGenerarPDF = async () => {
    if (productos.length === 0) {
      toast.error("No hay productos para generar el PDF");
      return;
    }
    if (!clienteNombre.trim()) {
      toast.error("Completá el Nombre del cliente para generar el presupuesto");
      return;
    }
    // Doble control (la UI ya bloquea agregarlos): ningún producto sin precio técnico.
    const sinPrecio = productos.filter((p) => p.priceTecnico <= 0);
    if (sinPrecio.length > 0) {
      toast.error(
        "Hay productos sin PRECIO TÉCNICO cargado. Quitálos o cargales el VALOR TECNICO en la BASE."
      );
      return;
    }

    setGeneratingPdf(true);
    try {
      const em = emisionHoy(); // emisión = día/hora real de generar el presupuesto
      const payload = {
        cliente: {
          nombre: clienteNombre,
          telefono: clienteTelefono,
          documento: clienteDocumento,
          observaciones: clienteObservaciones,
          fecha: em.fecha,
          hora: em.hora,
        },
        productos: productos.map((p) => ({
          sku: p.sku,
          name: p.name,
          quantity: p.quantity,
          priceTecnico: p.priceTecnico,
          subtotal: p.priceTecnico * p.quantity,
        })),
        total: totalMayoristaNeto,
      };

      const res = await fetch("/api/quotes/mayorista-pdf", {
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
      a.download = `VIZA-Presupuesto-Mayorista-${nombreCliente}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF MAYORISTA generado correctamente");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* === A. CLIENTE — el Nombre es OBLIGATORIO para generar el presupuesto === */}
      <Section title="CLIENTE" icon={<User className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Nombre completo *"
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
          <Field
            label="RUC / CI Documento (opcional)"
            value={clienteDocumento}
            onChange={(v) => setClienteField("Documento", v)}
            placeholder="Ej: 1234567-8"
          />
        </div>
        <div className="mt-3">
          <Field
            label="Observaciones comerciales"
            value={clienteObservaciones}
            onChange={(v) => setClienteField("Observaciones", v)}
            placeholder="Condiciones de venta, plazo de entrega, etc."
            textarea
          />
        </div>
        <p className="text-[11px] text-stone-400 mt-2">
          El Nombre del cliente es obligatorio para generar el presupuesto. Los
          demás campos son opcionales.
        </p>
      </Section>

      {/* === B. PRODUCTOS (con buscador integrado, precio = PRECIO TÉCNICO de la BASE) === */}
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
                    {searchResults.length !== 1 ? "s" : ""} · Solo productos con
                    PRECIO TÉCNICO
                  </div>
                  {searchResults.map((p) => {
                    const precioTecnico = parseValorTecnico(p.valorTecnico);
                    const sinPrecio = precioTecnico <= 0;
                    return sinPrecio ? (
                      // SIN precio técnico: NO se puede agregar (regla MAYORISTA)
                      <div
                        key={p.id}
                        title="Sin PRECIO TÉCNICO cargado en la BASE - no se puede agregar al MAYORISTA"
                        className="w-full p-3 border-b border-stone-100 last:border-0 flex items-center justify-between gap-3 bg-stone-50 opacity-60 cursor-not-allowed select-none"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900 text-sm line-clamp-1">
                            {p.name}
                          </p>
                          <p className="text-xs text-stone-500">SKU: {p.sku}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-[10px] font-bold uppercase text-amber-700 whitespace-nowrap">
                            Sin precio técnico
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="w-full text-left p-3 hover:bg-amber-50 border-b border-stone-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900 text-sm line-clamp-1">
                            {p.name}
                          </p>
                          <p className="text-xs text-stone-500">SKU: {p.sku}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="font-bold text-sm whitespace-nowrap"
                            style={{ color: AZUL_OSCURO }}
                          >
                            {formatPYG(precioTecnico)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
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
              Todavía no hay productos en el presupuesto MAYORISTA
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Usá el buscador de arriba para encontrar y agregar productos con
              PRECIO TÉCNICO
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
                    P. Téc.
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
                      {formatPYG(p.priceTecnico)}
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
                      {formatPYG(p.priceTecnico * p.quantity)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => removeProducto(p.id)}
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
                {descuentoChapa > 0 && (
                  <tr className="border-t-2" style={{ borderColor: DORADO }}>
                    <td colSpan={4} className="px-3 py-2 text-right font-bold uppercase text-[11px] tracking-wide text-emerald-700">
                      REGALO CHAPA (AUTOMÁTICO):
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">
                      -{formatPYG(descuentoChapa)}
                    </td>
                    <td></td>
                  </tr>
                )}
                <tr
                  className="border-t-2"
                  style={{
                    borderColor: DORADO,
                    backgroundColor: DORADO_CLARO,
                  }}
                >
                  <td colSpan={4} className="px-3 py-3 text-right font-bold uppercase text-[11px] tracking-wide" style={{ color: AZUL_OSCURO }}>
                    TOTAL MAYORISTA:
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold tabular-nums" style={{ color: AZUL_OSCURO }}>
                    {formatPYG(totalMayoristaNeto)}
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

        {/* === CUADRO DE COSTOS (SOLO VENDEDOR - nunca sale en ningún PDF) === */}
        <CostoInterno
          items={productos.map((p) => ({
            key: p.id,
            name: p.name,
            quantity: p.quantity,
            cost: p.cost,
          }))}
        />
      </Section>

      {/* === C. BOTONES (GENERAR bloqueado sin Nombre del cliente) === */}
      {!clienteNombre.trim() && (
        <p className="text-xs font-semibold text-amber-700 text-center">
          Completá el Nombre del cliente para habilitar el botón GENERAR PRESUPUESTO.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          disabled={generatingPdf || productos.length === 0 || !clienteNombre.trim()}
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
              GENERAR PRESUPUESTO MAYORISTA
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// === COMPONENTES AUXILIARES (mismo patrón que Plan Safra) ===

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
