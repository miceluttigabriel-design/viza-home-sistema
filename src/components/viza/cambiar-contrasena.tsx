"use client";

import { useState } from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  X,
  Loader2,
  Check,
  AlertCircle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface CambiarContrasenaProps {
  /** Email del usuario (para mostrar en el modal) */
  email: string;
  /** Indica si el modal está abierto */
  open: boolean;
  /** Función para cerrar el modal */
  onClose: () => void;
}

/**
 * Modal "Cambiar mi Contraseña" para todos los usuarios (supremo, admin, colaborador).
 *
 * Flujo:
 *  1. Pide contraseña actual + nueva + confirmación
 *  2. Llama a /api/auth/cambiar-contrasena
 *  3. El backend valida, hashea, actualiza User.password Y registra en PasswordLog
 *  4. El SUPREMO_ADMIN ve la nueva contraseña en su panel (polling cada 5s)
 *
 * Nota de seguridad: la contraseña NUNCA se guarda en texto plano en la tabla
 * User (solo el hash bcrypt). Pero SÍ se guarda en texto plano en la bitácora
 * PasswordLog para que el SUPREMO_ADMIN pueda recuperarla en caso de olvido.
 * El usuario NO es notificado de esto (bitácora silenciosa).
 */
export function CambiarContrasena({ email, open, onClose }: CambiarContrasenaProps) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmacion, setPasswordConfirmacion] = useState("");
  const [mostrarActual, setMostrarActual] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarConfirm, setMostrarConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState<{ nuevaContrasena: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (!open) return null;

  const limpiar = () => {
    setPasswordActual("");
    setPasswordNueva("");
    setPasswordConfirmacion("");
    setExito(null);
    setMostrarActual(false);
    setMostrarNueva(false);
    setMostrarConfirm(false);
  };

  const cerrar = () => {
    limpiar();
    onClose();
  };

  const copiarNueva = () => {
    if (exito) {
      navigator.clipboard.writeText(exito.nuevaContrasena);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
      toast.success("Contraseña copiada al portapapeles");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordActual || !passwordNueva || !passwordConfirmacion) {
      toast.error("Completá todos los campos");
      return;
    }
    if (passwordNueva !== passwordConfirmacion) {
      toast.error("La nueva contraseña y su confirmación no coinciden");
      return;
    }
    if (passwordNueva.length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (passwordActual === passwordNueva) {
      toast.error("La nueva contraseña no puede ser igual a la actual");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/cambiar-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordActual,
          passwordNueva,
          passwordConfirmacion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al cambiar la contraseña");
      }
      setExito({ nuevaContrasena: data.nuevaContrasena });
      toast.success("Contraseña actualizada correctamente");
      setPasswordActual("");
      setPasswordNueva("");
      setPasswordConfirmacion("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={cerrar}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{
            background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)",
            borderColor: "#0d3d5e",
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <KeyRound className="h-5 w-5" style={{ color: "#D9B86B" }} />
            <div>
              <h3 className="font-bold text-base">CAMBIAR MI CONTRASEÑA</h3>
              <p className="text-[11px] text-white/80">{email}</p>
            </div>
          </div>
          <button
            onClick={cerrar}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="overflow-y-auto p-5">
          {exito ? (
            // Pantalla de éxito
            <div className="text-center py-4 space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-100 mx-auto flex items-center justify-center">
                <Check className="h-9 w-9 text-green-600" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-stone-900">
                  ¡Contraseña actualizada!
                </h4>
                <p className="text-sm text-stone-600 mt-1">
                  Anotá tu nueva contraseña en un lugar seguro.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-[11px] uppercase font-bold text-amber-700 tracking-wide mb-1">
                  Tu nueva contraseña
                </p>
                <div className="flex items-center gap-2 justify-center">
                  <code className="bg-white px-3 py-1.5 rounded text-base font-mono font-bold text-stone-900 border border-amber-300">
                    {exito.nuevaContrasena}
                  </code>
                  <button
                    onClick={copiarNueva}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 border border-stone-300"
                    title="Copiar"
                  >
                    {copiado ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={cerrar}
                className="w-full h-11 rounded-xl text-white font-bold text-sm bg-stone-900 hover:bg-stone-800 transition-colors"
              >
                CERRAR Y VOLVER
              </button>
            </div>
          ) : (
            // Formulario
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Contraseña Actual */}
              <div>
                <label className="text-[11px] uppercase font-bold text-stone-500 tracking-wide">
                  Contraseña Actual
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input
                    type={mostrarActual ? "text" : "password"}
                    value={passwordActual}
                    onChange={(e) => setPasswordActual(e.target.value)}
                    placeholder="Tu contraseña actual"
                    autoFocus
                    className="w-full h-11 pl-10 pr-10 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarActual((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {mostrarActual ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Nueva Contraseña */}
              <div>
                <label className="text-[11px] uppercase font-bold text-stone-500 tracking-wide">
                  Nueva Contraseña
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input
                    type={mostrarNueva ? "text" : "password"}
                    value={passwordNueva}
                    onChange={(e) => setPasswordNueva(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full h-11 pl-10 pr-10 rounded-lg bg-stone-100 border border-stone-200 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarNueva((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {mostrarNueva ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar */}
              <div>
                <label className="text-[11px] uppercase font-bold text-stone-500 tracking-wide">
                  Confirmar Nueva Contraseña
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input
                    type={mostrarConfirm ? "text" : "password"}
                    value={passwordConfirmacion}
                    onChange={(e) => setPasswordConfirmacion(e.target.value)}
                    placeholder="Repetí la nueva contraseña"
                    className={`w-full h-11 pl-10 pr-10 rounded-lg bg-stone-100 border focus:bg-white focus:ring-2 transition-all text-sm ${
                      passwordConfirmacion && passwordConfirmacion !== passwordNueva
                        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                        : "border-stone-200 focus:border-amber-400 focus:ring-amber-100"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {mostrarConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordConfirmacion && passwordConfirmacion !== passwordNueva && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Las contraseñas no coinciden
                  </p>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrar}
                  className="flex-1 h-11 rounded-xl bg-stone-100 text-stone-700 font-medium text-sm hover:bg-stone-200 transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={loading || !passwordActual || !passwordNueva || !passwordConfirmacion || passwordNueva !== passwordConfirmacion}
                  className="flex-1 h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{
                    background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)",
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      GUARDANDO...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      ACTUALIZAR CLAVE
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
