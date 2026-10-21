"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Mail, Lock, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Completá email y contraseña");
      return;
    }
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Email o contraseña incorrectos");
        setLoading(false);
        return;
      }
      // Recargamos para que el server revalide la sesión
      window.location.reload();
    } catch {
      toast.error("Error al iniciar sesión");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: "#155789" }}
    >
      {/* Banda dorada superior */}
      <div
        className="absolute top-0 left-0 right-0 h-2"
        style={{ backgroundColor: "#D9B86B" }}
      />
      {/* Banda dorada inferior */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2"
        style={{ backgroundColor: "#D9B86B" }}
      />

      <div className="relative w-full max-w-md flex flex-col items-center">
        {/* Logo + slogan */}
        <div className="text-center mb-6 flex flex-col items-center">
          <img
            src="/viza-home-logo.jpg"
            alt="VIZA home"
            style={{
              maxWidth: "320px",
              width: "100%",
              height: "auto",
              border: "4px solid #D9B86B",
              borderRadius: "8px",
            }}
          />
          <p
            className="mt-3 text-sm font-medium tracking-wide"
            style={{ color: "#D9B86B" }}
          >
            Todo para tu hogar, en un solo lugar.
          </p>
        </div>

        {/* Card blanca con borde superior dorado */}
        <div
          className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full"
          style={{ borderTop: "4px solid #D9B86B" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#155789" }}
            >
              <LogIn className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-bold text-lg text-stone-900">Iniciar sesión</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] uppercase font-semibold text-stone-500">
                Email
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vizahome.com"
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-stone-200 text-sm focus:border-stone-400 focus:ring-2 focus:ring-stone-100 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase font-semibold text-stone-500">
                Contraseña
              </label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-stone-200 text-sm focus:border-stone-400 focus:ring-2 focus:ring-stone-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Mostrar/ocultar contraseña"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-1 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(to right, #b89853, #D9B86B)",
                color: "#0d3d5e",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Ingresando...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Ingresar al Panel
                </>
              )}
            </button>
          </form>

          {/* Separador */}
          <div className="mt-5 pt-4 border-t border-stone-100 text-center">
            <p className="text-[11px] text-stone-400">
              Si olvidaste tu contraseña, contactá al administrador del sistema.
            </p>
          </div>
        </div>

        {/* Contacto */}
        <div className="mt-5 text-center text-xs space-y-1" style={{ color: "#D9B86B" }}>
          <p>Tel: (0987) 700 707</p>
          <p>Email: ventas.online@viza.com.py</p>
          <p>Web: www.viza.com.py</p>
          <p>@vizahome</p>
        </div>

        <p className="text-center text-stone-300/80 text-xs mt-4">
          VIZA HOME E.A.S © {new Date().getFullYear()} · Acceso solo para personal autorizado
        </p>
      </div>
    </div>
  );
}
