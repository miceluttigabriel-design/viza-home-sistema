"use client";

import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, Store, Tag, Percent, Save, Info } from "lucide-react";
import { toast } from "sonner";
import type { CombinacionPedidoEspecial } from "@/lib/pedido-especial";

// ─── MODAL PEDIDO ESPECIAL — CONFIG DE LA BASE (Task 113, pedido del dueño) ───
// Acá el admin carga las combinaciones PROVEEDOR + TIPO DE PRODUCTO con sus
// % (contado, 1-6, 7-13, 14-30) — la MISMA estructura de % que los productos
// de la BASE. El vendedor NO ve este modal: solo elige proveedor + tipo y el
// sistema aplica estos % con la fórmula de siempre.
//
// Solo se monta cuando está abierto ({modalPedidoEspecialOpen && ...}), así
// arranca limpio en cada apertura (patrón de los modales de la casa).
// Botón visible SOLO para admin/supremo (la API re-valida lo mismo).

const AZUL = "#155789";

interface FormState {
  proveedor: string;
  tipoProducto: string;
  pctContado: string;
  pct1A6: string;
  pct7A13: string;
  pct14A30: string;
}

const FORM_VACIO: FormState = {
  proveedor: "",
  tipoProducto: "",
  pctContado: "",
  pct1A6: "",
  pct7A13: "",
  pct14A30: "",
};

// Acepta "8", "7,5" y "7.5" (coma decimal incluida, igual que la TASA).
function parsePct(s: string): number | null {
  const n = Number(String(s).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 300) return null;
  return n;
}

export function ModalPedidoEspecialConfig({ onClose }: { onClose: () => void }) {
  const [filas, setFilas] = useState<CombinacionPedidoEspecial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  // id de la fila en EDICIÓN (null = el form agrega una nueva)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/pedido-especial/config");
      const data = await res.json().catch(() => ({}));
      setFilas(Array.isArray(data.combinaciones) ? data.combinaciones : []);
    } catch {
      toast.error("No se pudo cargar la config del pedido especial");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const setField = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const empezarEdicion = (f: CombinacionPedidoEspecial) => {
    setEditandoId(f.id);
    setForm({
      proveedor: f.proveedor,
      tipoProducto: f.tipoProducto,
      pctContado: String(f.pctContado),
      pct1A6: String(f.pct1A6),
      pct7A13: String(f.pct7A13),
      pct14A30: String(f.pct14A30),
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
  };

  const guardar = async () => {
    if (ocupado) return;
    const proveedor = form.proveedor.trim().toUpperCase();
    const tipoProducto = form.tipoProducto.trim().toUpperCase();
    const pcts = {
      pctContado: parsePct(form.pctContado),
      pct1A6: parsePct(form.pct1A6),
      pct7A13: parsePct(form.pct7A13),
      pct14A30: parsePct(form.pct14A30),
    };
    if (!proveedor || !tipoProducto) {
      toast.error("Escribí el PROVEEDOR y el TIPO DE PRODUCTO");
      return;
    }
    if (Object.values(pcts).some((v) => v === null)) {
      toast.error("Los % deben ser números entre 0 y 300 (podés usar coma decimal)");
      return;
    }
    setOcupado(true);
    try {
      const esEdicion = editandoId !== null;
      const res = await fetch("/api/pedido-especial/config", {
        method: esEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esEdicion ? { id: editandoId } : {}),
          proveedor,
          tipoProducto,
          ...pcts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      toast.success(esEdicion ? "Combinación actualizada" : `Combinación agregada: ${proveedor} + ${tipoProducto}`);
      cancelarEdicion();
      await cargar();
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (f: CombinacionPedidoEspecial) => {
    if (ocupado) return;
    if (!confirm(`¿Borrar la combinación "${f.proveedor} + ${f.tipoProducto}"? El vendedor dejará de poder cotizar con esos %.`)) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/pedido-especial/config?id=${encodeURIComponent(f.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Error HTTP ${res.status}`);
      toast.success(`Combinación borrada: ${f.proveedor} + ${f.tipoProducto}`);
      if (editandoId === f.id) cancelarEdicion();
      await cargar();
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  // Listas para los datalist (evitan typos que dupliquen proveedores/tipos)
  const proveedoresExistentes = Array.from(new Set(filas.map((f) => f.proveedor)));
  const tiposExistentes = Array.from(new Set(filas.map((f) => f.tipoProducto)));

  const inputPct = (k: keyof FormState, label: string, hint: string) => (
    <div>
      <label className="text-[10px] font-semibold text-stone-500 uppercase block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={form[k]}
        onChange={(e) => setField(k, e.target.value)}
        inputMode="decimal"
        placeholder={hint}
        className="w-full h-9 px-2.5 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e6ba8] focus:border-transparent"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 25, 23, 0.45)" }}
      onClick={ocupado ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm">
            <Percent className="h-4 w-4" style={{ color: AZUL }} />
            PEDIDO ESPECIAL — PROVEEDORES, TIPOS Y %
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
          {/* Explicación corta */}
          <div className="rounded-lg px-3 py-2.5 bg-sky-50 border border-sky-100 text-xs text-sky-900 leading-relaxed flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Una fila por combinación <strong>PROVEEDOR + TIPO DE PRODUCTO</strong>. El
              vendedor elige esas dos cosas en el panel del cotizador y el sistema aplica
              estos % con la MISMA fórmula de la BASE (% CONTADO como la col AB; los
              demás se suman por cuota: 1-6, 7-13, 14-30, igual que las cols Y/Z/AA).
              Escribí los % como números normales: <strong>10 = 10%</strong>, 2.5 = 2.5%.
            </span>
          </div>

          {/* Formulario: agregar / editar */}
          <div className="rounded-xl border-2 border-dashed border-stone-200 p-4">
            <p className="text-xs font-bold uppercase text-stone-600 mb-3 flex items-center gap-1.5">
              {editandoId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editandoId ? "EDITANDO COMBINACIÓN" : "NUEVA COMBINACIÓN"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-semibold text-stone-500 uppercase block mb-1 flex items-center gap-1">
                  <Store className="h-3 w-3" />
                  Proveedor *
                </label>
                <input
                  type="text"
                  value={form.proveedor}
                  onChange={(e) => setField("proveedor", e.target.value)}
                  list="datalist-proveedores"
                  placeholder="Ej: GAFRA"
                  maxLength={80}
                  className="w-full h-9 px-2.5 rounded-lg border border-stone-300 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-[#1e6ba8] focus:border-transparent"
                />
                <datalist id="datalist-proveedores">
                  {proveedoresExistentes.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-stone-500 uppercase block mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Tipo de producto *
                </label>
                <input
                  type="text"
                  value={form.tipoProducto}
                  onChange={(e) => setField("tipoProducto", e.target.value)}
                  list="datalist-tipos"
                  placeholder="Ej: MOTOS"
                  maxLength={80}
                  className="w-full h-9 px-2.5 rounded-lg border border-stone-300 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-[#1e6ba8] focus:border-transparent"
                />
                <datalist id="datalist-tipos">
                  {tiposExistentes.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {inputPct("pctContado", "% Contado", "Ej: 10 (=10%)")}
              {inputPct("pct1A6", "% 1 a 6", "Ej: 2")}
              {inputPct("pct7A13", "% 7 a 13", "Ej: 1.5")}
              {inputPct("pct14A30", "% 14 a 30", "Ej: 1")}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={guardar}
                disabled={ocupado}
                className="h-9 px-4 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition-colors disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
              >
                {editandoId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {editandoId ? "GUARDAR CAMBIOS" : "AGREGAR COMBINACIÓN"}
              </button>
              {editandoId && (
                <button
                  onClick={cancelarEdicion}
                  disabled={ocupado}
                  className="h-9 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Lista de combinaciones cargadas */}
          <div>
            <p className="text-xs font-bold uppercase text-stone-600 mb-2">
              CARGADAS EN LA BASE {cargando ? "(cargando…)" : `(${filas.length})`}
            </p>
            {!cargando && filas.length === 0 && (
              <div className="rounded-lg px-3 py-3 bg-stone-50 border border-stone-200 text-xs text-stone-500 text-center">
                Todavía no hay combinaciones. Agregá la primera con el formulario de arriba.
              </div>
            )}
            {filas.length > 0 && (
              <div className="rounded-xl border border-stone-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 uppercase text-[10px]">
                      <th className="text-left px-3 py-2 font-semibold">Proveedor</th>
                      <th className="text-left px-3 py-2 font-semibold">Tipo producto</th>
                      <th className="text-right px-3 py-2 font-semibold">% Contado</th>
                      <th className="text-right px-3 py-2 font-semibold">% 1-6</th>
                      <th className="text-right px-3 py-2 font-semibold">% 7-13</th>
                      <th className="text-right px-3 py-2 font-semibold">% 14-30</th>
                      <th className="text-right px-3 py-2 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filas.map((f) => (
                      <tr
                        key={f.id}
                        className={editandoId === f.id ? "bg-amber-50" : "hover:bg-stone-50"}
                      >
                        <td className="px-3 py-2 font-bold text-stone-800 whitespace-nowrap">{f.proveedor}</td>
                        <td className="px-3 py-2 font-semibold text-stone-700 whitespace-nowrap">{f.tipoProducto}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{f.pctContado.toLocaleString("es-PY")}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{f.pct1A6.toLocaleString("es-PY")}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{f.pct7A13.toLocaleString("es-PY")}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{f.pct14A30.toLocaleString("es-PY")}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => empezarEdicion(f)}
                            disabled={ocupado}
                            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-sky-100 text-stone-600 hover:text-sky-700 inline-flex items-center justify-center transition-colors disabled:opacity-50 mr-1"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => borrar(f)}
                            disabled={ocupado}
                            className="h-7 w-7 rounded-lg bg-stone-100 hover:bg-rose-100 text-stone-600 hover:text-rose-700 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                            title="Borrar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
