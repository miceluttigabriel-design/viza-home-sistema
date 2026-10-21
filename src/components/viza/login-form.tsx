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
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden viza-fade-in"
      style={{
        background: "linear-gradient(135deg, #155789 0%, #0d3a5c 100%)",
      }}
    >
      {/* Ondas decorativas doradas superiores */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: "200px",
          background: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 200'%3E%3Cpath fill='%23D9B86B' fill-opacity='0.15' d='M0,96L48,90.7C96,85,192,75,288,80C384,85,480,107,576,112C672,117,768,107,864,90.7C960,75,1056,53,1152,53C1248,53,1344,75,1392,85.3L1440,96L1440,0L0,0Z'/%3E%3C/svg%3E\") no-repeat center top",
          backgroundSize: "cover",
          pointerEvents: "none",
        }}
      />

      {/* Particulas decorativas flotantes */}
      <div
        className="absolute"
        style={{
          top: "15%", left: "10%", width: "6px", height: "6px",
          borderRadius: "50%", backgroundColor: "rgba(217, 184, 107, 0.3)",
          animation: "viza-pulse-gold 3s ease-in-out infinite",
        }}
      />
      <div
        className="absolute"
        style={{
          top: "25%", right: "15%", width: "8px", height: "8px",
          borderRadius: "50%", backgroundColor: "rgba(217, 184, 107, 0.2)",
          animation: "viza-pulse-gold 4s ease-in-out infinite",
        }}
      />
      <div
        className="absolute"
        style={{
          bottom: "20%", left: "8%", width: "5px", height: "5px",
          borderRadius: "50%", backgroundColor: "rgba(217, 184, 107, 0.25)",
          animation: "viza-pulse-gold 3.5s ease-in-out infinite",
        }}
      />

      {/* Banda dorada inferior */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2"
        style={{ background: "linear-gradient(90deg, #b89853, #D9B86B, #b89853)" }}
      />

      {/* Contenido principal */}
      <div className="relative w-full max-w-md flex flex-col items-center z-10 viza-slide-up">
        {/* Logo + slogan */}
        <div className="text-center mb-6 flex flex-col items-center">
          <img
            src="/viza-home-logo.jpg"
            alt="VIZA home"
            style={{
              maxWidth: "300px",
              width: "100%",
              height: "auto",
              border: "4px solid #D9B86B",
              borderRadius: "12px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            }}
          />
          <p
            className="mt-3 text-sm font-medium tracking-wide"
            style={{ color: "#D9B86B" }}
          >
            TODO PARA TU HOGAR, EN UN SOLO LUGAR.
          </p>
        </div>

        {/* Card blanca con sombra premium */}
        <div
          className="bg-white rounded-2xl w-full viza-shadow-strong"
          style={{
            padding: "40px 35px",
            borderTop: "4px solid #D9B86B",
          }}
        >
          {/* Titulo */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #155789 0%, #1e6ba8 100%)" }}
            >
              <LogIn className="h-5 w-5 text-white" />
            </div>
            <h2 className="font-bold text-xl text-stone-900">INICIAR SESIÓN</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="text-[11px] uppercase font-bold tracking-wide block mb-1.5"
                style={{ color: "#343A40" }}
              >
                EMAIL
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  className="viza-input pl-11"
                  style={{ height: "48px" }}
                />
              </div>
            </div>

            <div>
              <label
                className="text-[11px] uppercase font-bold tracking-wide block mb-1.5"
                style={{ color: "#343A40" }}
              >
                CONTRASEÑA
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="viza-input pl-11 pr-10"
                  style={{ height: "48px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Mostrar/ocultar contraseña"
                >
                  {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="viza-btn-gold w-full mt-2"
              style={{ height: "52px", fontSize: "16px" }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> INGRESANDO...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" /> INGRESAR AL PANEL
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

        {/* Footer de contacto */}
        <div className="mt-6 text-center text-xs space-y-1" style={{ color: "#D9B86B" }}>
          <p>TEL: (0987) 700 707 | EMAIL: VENTAS.ONLINE@VIZA.COM.PY</p>
          <p>WEB: WWW.VIZA.COM.PY | @VIZAHOME</p>
        </div>

        <p className="text-center text-stone-300/80 text-[11px] mt-3">
          VIZA HOME E.A.S © {new Date().getFullYear()} · ACCESO SOLO PARA PERSONAL AUTORIZADO
        </p>
      </div>
    </div>
  );
}
