"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Search, Plus, X, User, Package, Calendar, Trash2, FileText,
  Calculator, Gift, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { useChequeStore, parseSafra, addDays } from "@/store/cheque";
import { formatPYG } from "@/lib/format";
import { CostoInterno, extractCosto } from "./costo-interno";

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

const AZUL = "#155789";
const AZUL_OSCURO = "#0d3d5e";
const DORADO = "#D9B86B";
const DORADO_OSCURO = "#b89853";
const DORADO_CLARO = "#e5cb8a";
const CREMA = "#faf6ed";

interface ChequeProductApi {
  id: string; sku: string; name: string; priceContado: number | null;
  safra: string | null; [key: string]: any;
}

export function PlanCheque() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChequeProductApi[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const {
    productos, addProducto, removeProducto, setProductoQuantity,
    clienteNombre, clienteTelefono, clienteDocumento, clienteObservaciones, fechaEmision, setClienteField,
    cantidadCheques, setCantidadCheques, fechasCheques, setFechaCheque, generarCampos,
    resultados, totalPagar, totalContadoBruto, descuentoCasco, baseCalculo,
    calcular, clear,
  } = useChequeStore();

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&pageSize=10`);
      const data = await res.json();
      setSearchResults(data.products || []);
    } catch { } finally { setLoadingSearch(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(search), 300);
    return () => clearTimeout(t);
  }, [search, searchProducts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAddProduct = (product: ChequeProductApi) => {
    addProducto({
      id: product.id, sku: product.sku, name: product.name,
      priceContado: product.priceContado ?? 0, safraPct: parseSafra(product.safra), quantity: 1,
      // Costo UNITARIO de la BASE: SOLO para el cuadrito interno del vendedor.
      // Nunca viaja en el payload del PDF (ese payload solo lleva sku/name/
      // quantity/priceContado/subtotalContado/safraPct).
      cost: extractCosto(product),
    });
    setSearch(""); setSearchResults([]); setShowResults(false);
    toast.success(`${product.name} agregado`);
  };

  // Casco auto-detectado
  const cascoEnCarrito = productos.find(p => p.name.toUpperCase().includes("CASCO"));
  const cascoValorExacto = cascoEnCarrito ? cascoEnCarrito.priceContado * cascoEnCarrito.quantity : 0;
  const fechaMaxima = addDays(fechaEmision || new Date().toISOString().slice(0, 10), 180);

  const handleCalcular = () => {
    if (productos.length === 0) { toast.error("Agregá al menos un producto"); return; }
    if (fechasCheques.filter(f => f).length === 0) {
      toast.error("Generá los campos de cheques primero");
      return;
    }
    const fueraPlazo = fechasCheques.filter(f => f && f > fechaMaxima);
    if (fueraPlazo.length > 0) {
      toast.error("⚠️ El plazo máximo para cheques es 180 días desde la emisión.");
      return;
    }
    calcular();
    toast.success("Cheques calculados");
  };

  const handleGenerarPDF = async () => {
    if (resultados.length === 0) { toast.error("Calculá los cheques primero"); return; }
    if (!clienteNombre.trim()) { toast.error("Completá el Nombre del cliente para generar el presupuesto"); return; }
    setGeneratingPdf(true);
    try {
      const em = emisionHoy(); // emisión = día/hora real de generar el presupuesto
      const payload = {
        cliente: { nombre: clienteNombre, telefono: clienteTelefono, documento: clienteDocumento, observaciones: clienteObservaciones, fecha: em.fecha, hora: em.hora },
        productos: productos.map(p => ({ sku: p.sku, name: p.name, quantity: p.quantity, priceContado: p.priceContado, subtotalContado: p.priceContado * p.quantity, safraPct: p.safraPct })),
        cascoAplicado: !!cascoEnCarrito, cascoValor: cascoValorExacto, cascoDescripcion: cascoEnCarrito?.name || "",
        totalContadoBruto,
        cronograma: resultados.map(r => ({ mes: r.numero, fecha: r.fecha, concepto: `Cheque ${r.numero}`, saldoInicial: 0, pago: r.valor, interes: 0, saldoFinal: 0 })),
        totalIntereses: 0, totalPlan: totalPagar, saldoFinal: 0, cumple50: true, cuadra: true, faltanPara50: 0,
        tipoPlan: "CON_CHEQUE", resultadosCheques: resultados, totalPagar,
      };
      // Llamar al endpoint DEDICADO para Plan Con Cheque
      // (no usar /api/quotes/safra-pdf porque ese es solo para Safra y falla con datos de cheque)
      const res = await fetch("/api/quotes/cheque-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VIZA-Presupuesto-Cheque-${clienteNombre.replace(/\s+/g, "_") || "Cliente"}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF generado");
    } catch { toast.error("No se pudo generar el PDF"); }
    finally { setGeneratingPdf(false); }
  };

  return (
    <div className="space-y-5">
      {/* CLIENTE — el Nombre es OBLIGATORIO para generar el presupuesto */}
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
            placeholder="Condiciones del plan, plazo de entrega, etc."
            textarea
          />
        </div>
        <p className="text-[11px] text-stone-400 mt-2">
          El Nombre del cliente es obligatorio para generar el presupuesto. Los
          demás campos son opcionales.
        </p>
      </Section>

      {/* PRODUCTOS AGREGADOS (con buscador integrado) */}
      <Section title={`PRODUCTOS AGREGADOS (${productos.length})`} icon={<Package className="h-4 w-4" />}>
        {/* Buscador integrado dentro del cuadro PRODUCTOS AGREGADOS */}
        <div ref={searchRef} className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
            className="w-full h-12 pl-12 pr-4 rounded-xl border-2 bg-white text-base font-medium focus:outline-none shadow-sm focus:ring-4" style={{ borderColor: "#e7e5e4" }} />
          {showResults && search.trim() && (
            <div className="absolute z-40 top-full mt-2 w-full bg-white rounded-xl border border-stone-200 shadow-2xl max-h-96 overflow-y-auto">
              {loadingSearch ? <div className="p-4 text-sm text-stone-500 text-center">Buscando...</div> :
                searchResults.length === 0 ? <div className="p-4 text-sm text-stone-500 text-center">No se encontraron productos</div> :
                searchResults.map(p => (
                  <button key={p.id} onClick={() => handleAddProduct(p)} className="w-full text-left p-3 hover:bg-rose-50 border-b border-stone-100 last:border-0 flex items-center justify-between gap-3">
                    <div><p className="font-semibold text-stone-900 text-sm">{p.name}</p><p className="text-xs text-stone-500">SKU: {p.sku}</p></div>
                    <span className="font-bold text-rose-600 text-sm">{formatPYG(p.priceContado ?? 0)}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {productos.length === 0 ? (
          <div className="py-6 text-center"><Package className="h-10 w-10 text-stone-300 mx-auto mb-2" /><p className="text-sm font-medium text-stone-500">No hay productos agregados</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-stone-200 rounded-lg overflow-hidden">
              <thead className="bg-stone-100"><tr>
                <th className="text-left px-3 py-2 font-bold text-stone-700">PRODUCTO</th>
                <th className="text-center px-3 py-2 font-bold text-stone-700">CANT.</th>
                <th className="text-right px-3 py-2 font-bold text-stone-700">P. CONTADO</th>
                <th className="text-center px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {productos.map(p => (
                  <tr key={p.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2 font-semibold text-stone-900">{p.name}</td>
                    <td className="px-3 py-2 text-center"><input type="number" min={1} value={p.quantity} onChange={(e) => setProductoQuantity(p.id, Number(e.target.value))} className="w-16 h-8 px-2 rounded border border-stone-200 text-center text-sm" /></td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{formatPYG(p.priceContado * p.quantity)}</td>
                    <td className="px-2 py-2 text-center"><button onClick={() => removeProducto(p.id)} className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* CASCO (auto) */}
      {cascoEnCarrito && cascoValorExacto > 0 && (
        <Section title="DESCUENTO POR CASCO (AUTOMÁTICO)" icon={<Gift className="h-4 w-4" />}>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-emerald-600" /><span className="text-xs font-bold text-emerald-700 uppercase">Casco detectado automáticamente</span></div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase">No editable</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] text-stone-600">
              <div><p className="uppercase font-semibold">Subtotal productos</p><p className="font-bold tabular-nums mt-0.5">{formatPYG(totalContadoBruto)}</p></div>
              <div><p className="uppercase font-semibold">Descuento casco</p><p className="font-bold text-rose-600 tabular-nums mt-0.5">-{formatPYG(cascoValorExacto)}</p></div>
              <div><p className="uppercase font-semibold">Base a financiar</p><p className="font-bold text-emerald-700 tabular-nums mt-0.5">{formatPYG(totalContadoBruto - cascoValorExacto)}</p></div>
            </div>
          </div>
        </Section>
      )}

      {/* CONFIGURACIÓN DE CHEQUES */}
      <Section title="CONFIGURACIÓN DE CHEQUES" icon={<Banknote className="h-4 w-4" />}>
        <div className="space-y-4">
          {/* Cantidad de cheques */}
          <div className="flex items-end gap-3">
            <div>
              <label className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">Cantidad de cheques</label>
              <input type="number" min={1} max={20} value={cantidadCheques} onChange={(e) => setCantidadCheques(Number(e.target.value))} className="w-24 h-12 px-3 rounded-lg border-2 border-stone-200 bg-white text-sm font-semibold focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none tabular-nums" />
            </div>
            <button onClick={generarCampos} className="h-12 px-4 rounded-lg font-bold text-xs flex items-center gap-1.5 border" style={{ backgroundColor: DORADO, color: AZUL_OSCURO, borderColor: DORADO }}>
              <Plus className="h-3.5 w-3.5" />GENERAR CAMPOS
            </button>
          </div>

          {/* Fechas de cada cheque */}
          {fechasCheques.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-stone-500 uppercase">Fechas de vencimiento de cada cheque</p>
              {fechasCheques.map((fecha, i) => {
                const fueraPlazo = fecha && fecha > fechaMaxima;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-stone-700 w-20">Cheque {i + 1}:</span>
                    <input type="date" value={fecha} min={fechaEmision} max={fechaMaxima} onChange={(e) => setFechaCheque(i, e.target.value)} className={`h-10 px-3 rounded-md border-2 bg-white text-sm font-semibold outline-none ${fueraPlazo ? "border-rose-400" : "border-stone-200 focus:border-amber-400"}`} />
                    {fueraPlazo && <span className="text-[10px] text-rose-600 font-semibold">⚠ Máx 180 días</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* BOTÓN CALCULAR */}
      <button onClick={handleCalcular} disabled={productos.length === 0 || fechasCheques.filter(f => f).length === 0}
        className="w-full h-16 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01] hover:brightness-110"
        style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`, color: AZUL_OSCURO, boxShadow: "0 10px 25px -8px rgba(217, 184, 107, 0.55)" }}>
        <Calculator className="h-6 w-6" />CALCULAR CHEQUES
      </button>

      {/* RESULTADO */}
      {resultados.length > 0 && (
        <Section title="RESULTADO - VALORES DE CHEQUES" icon={<FileText className="h-4 w-4" />}>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-stone-200 rounded-lg overflow-hidden">
              <thead className="bg-stone-100"><tr>
                <th className="text-center px-3 py-2 font-bold text-stone-700">N° CHEQUE</th>
                <th className="text-center px-3 py-2 font-bold text-stone-700">FECHA DE VENCIMIENTO</th>
                <th className="text-right px-3 py-2 font-bold text-stone-700">VALOR DEL CHEQUE</th>
              </tr></thead>
              <tbody>
                {resultados.map((r) => {
                  const [y, m, d] = r.fecha.split("-");
                  const fechaFmt = `${d}/${m}/${y}`;
                  return (
                    <tr key={r.numero} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-3 py-3 text-center font-mono font-bold text-stone-900">{r.numero}</td>
                      <td className="px-3 py-3 text-center text-stone-700 tabular-nums">{fechaFmt}</td>
                      <td className="px-3 py-3 text-right font-bold text-stone-900 tabular-nums text-base">{formatPYG(r.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-stone-100 border-t-2 border-stone-300">
                <tr>
                  <td colSpan={2} className="px-3 py-2 font-bold uppercase text-[11px] text-right" style={{ color: AZUL_OSCURO }}>Total a pagar:</td>
                  <td className="px-3 py-2 text-right font-extrabold text-lg tabular-nums" style={{ color: AZUL }}>{formatPYG(totalPagar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      )}

      {/* BOTONES (GENERAR bloqueado sin Nombre del cliente) */}
      {!clienteNombre.trim() && (
        <p className="text-xs font-semibold text-amber-700 text-center">
          Completá el Nombre del cliente para habilitar el botón GENERAR PRESUPUESTO.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => { if (confirm("¿Vaciar el plan con cheque?")) { clear(); toast.success("Plan vaciado"); } }}
          className="h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.01] hover:brightness-110"
          style={{ backgroundColor: "#b91c1c", boxShadow: "0 10px 25px -8px rgba(185, 28, 28, 0.45)" }}>
          <Trash2 className="h-4 w-4" />LIMPIAR
        </button>
        <button onClick={handleGenerarPDF} disabled={generatingPdf || resultados.length === 0 || !clienteNombre.trim()}
          className="h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110"
          style={{ backgroundImage: `linear-gradient(to right, ${DORADO}, ${DORADO_OSCURO})`, color: AZUL_OSCURO, boxShadow: "0 8px 20px -8px rgba(217, 184, 107, 0.55)" }}>
          <FileText className="h-4 w-4" />GENERAR PDF
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: AZUL }}>{icon}{title}</h2>
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
