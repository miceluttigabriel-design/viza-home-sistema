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
      window.location.reload();
    } catch {
      toast.error("Error al iniciar sesión");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#155789",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        padding: "20px",
      }}
    >
      {/* Banda dorada superior */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #b89853, #D9B86B, #b89853)",
        }}
      />
      {/* Banda dorada inferior */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #b89853, #D9B86B, #b89853)",
        }}
      />

      {/* Contenido centrado */}
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* === LOGO CLICKEABLE === */}
        <div
          onClick={() => console.log("Logo clickeado")}
          style={{
            cursor: "pointer",
            transition: "transform 0.3s ease",
            marginBottom: "20px",
            width: "100%",
            maxWidth: "420px",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
          onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
        >
          <img
            src="/viza-home-logo-nuevo.png"
            alt="VIZA HOME"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
            }}
          />
        </div>

        {/* === CUADRO DE LOGIN === */}
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "white",
            borderRadius: "20px",
            padding: "35px 30px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            borderTop: "4px solid #D9B86B",
          }}
        >
          {/* Titulo */}
          <div className="flex items-center gap-2 mb-5">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#155789" }}
            >
              <LogIn className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-bold text-lg text-stone-900">INICIAR SESIÓN</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email */}
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
                  placeholder="tu@email.com"
                  autoComplete="email"
                  className="w-full h-12 pl-10 pr-3 rounded-xl border-2 border-stone-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                />
              </div>
            </div>

            {/* Contrasena */}
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
                  className="w-full h-12 pl-10 pr-10 rounded-xl border-2 border-stone-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
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

            {/* Boton */}
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
                  <Loader2 className="h-4 w-4 animate-spin" /> INGRESANDO...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> INGRESAR AL PANEL
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

        <p className="text-center text-stone-300/80 text-[11px] mt-6">
          VIZA HOME E.A.S © {new Date().getFullYear()} · ACCESO SOLO PARA PERSONAL AUTORIZADO
        </p>
      </div>
    </div>
  );
}
