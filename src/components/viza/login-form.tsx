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
        {/* === CUADRO DEL LOGO (mismo ancho que el card de login) === */}
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            marginBottom: "20px",
          }}
        >
          {/* Parte superior: VIZA (fondo blanco) */}
          <div
            style={{
              background: "#FFFFFF",
              padding: "25px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/viza-home-logo-nuevo.png"
              alt="VIZA HOME"
              style={{
                maxWidth: "100%",
                height: "auto",
                maxHeight: "100px",
                objectFit: "contain",
              }}
            />
          </div>
          {/* Parte inferior: home + slogan (fondo dorado) */}
          <div
            style={{
              background: "#D9B86B",
              padding: "12px 20px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                color: "#155789",
                margin: 0,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              TODO PARA TU HOGAR, EN UN SOLO LUGAR
            </p>
          </div>
        </div>

        {/* === CUADRO DE LOGIN (mismo ancho que el del logo) === */}
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "white",
            borderRadius: "20px",
            padding: "35px 30px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          {/* Titulo */}
          <h1
            style={{
              color: "#155789",
              fontSize: "24px",
              fontWeight: 700,
              textAlign: "center",
              margin: "0 0 25px 0",
            }}
          >
            INICIAR SESIÓN
          </h1>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  color: "#343A40",
                  fontWeight: 600,
                  marginBottom: "8px",
                  fontSize: "12px",
                  textTransform: "uppercase",
                }}
              >
                EMAIL
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: "18px",
                    width: "18px",
                    color: "#9CA3AF",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  style={{
                    width: "100%",
                    padding: "14px 14px 14px 44px",
                    border: "2px solid #E0E0E0",
                    borderRadius: "10px",
                    fontSize: "15px",
                    background: "#F8F9FA",
                    color: "#343A40",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#D9B86B";
                    e.target.style.background = "#FFFFFF";
                    e.target.style.boxShadow = "0 0 0 3px rgba(217, 184, 107, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E0E0E0";
                    e.target.style.background = "#F8F9FA";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Contrasena */}
            <div style={{ marginBottom: "25px" }}>
              <label
                style={{
                  display: "block",
                  color: "#343A40",
                  fontWeight: 600,
                  marginBottom: "8px",
                  fontSize: "12px",
                  textTransform: "uppercase",
                }}
              >
                CONTRASEÑA
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: "18px",
                    width: "18px",
                    color: "#9CA3AF",
                  }}
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    padding: "14px 44px 14px 44px",
                    border: "2px solid #E0E0E0",
                    borderRadius: "10px",
                    fontSize: "15px",
                    background: "#F8F9FA",
                    color: "#343A40",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#D9B86B";
                    e.target.style.background = "#FFFFFF";
                    e.target.style.boxShadow = "0 0 0 3px rgba(217, 184, 107, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E0E0E0";
                    e.target.style.background = "#F8F9FA";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: "absolute",
                    right: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9CA3AF",
                  }}
                  aria-label="Mostrar/ocultar contraseña"
                >
                  {showPass ? <EyeOff style={{ height: "20px", width: "20px" }} /> : <Eye style={{ height: "20px", width: "20px" }} />}
                </button>
              </div>
            </div>

            {/* Boton */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "16px",
                background: "linear-gradient(135deg, #D9B86B 0%, #c9a55a 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "16px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(217, 184, 107, 0.4)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.6 : 1,
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = "0 8px 25px rgba(217, 184, 107, 0.5)";
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(217, 184, 107, 0.4)";
              }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ height: "18px", width: "18px", animation: "spin 1s linear infinite" }} />
                  INGRESANDO...
                </>
              ) : (
                <>
                  <LogIn style={{ height: "18px", width: "18px" }} />
                  INGRESAR AL PANEL
                </>
              )}
            </button>
          </form>

          {/* Separador */}
          <div style={{ marginTop: "20px", paddingTop: "15px", borderTop: "1px solid #F0F0F0", textAlign: "center" }}>
            <p style={{ color: "#6C757D", fontSize: "12px", margin: 0 }}>
              ¿Olvidaste tu contraseña? Contactá al administrador del sistema.
            </p>
          </div>
        </div>

        {/* === FOOTER === */}
        <div
          style={{
            marginTop: "25px",
            textAlign: "center",
            color: "rgba(255,255,255,0.8)",
            fontSize: "11px",
            lineHeight: "1.8",
          }}
        >
          <p>TEL: (0987) 700 707 | EMAIL: VENTAS.ONLINE@VIZA.COM.PY</p>
          <p>WEB: WWW.VIZA.COM.PY | @VIZAHOME</p>
          <p style={{ marginTop: "8px" }}>
            VIZA HOME E.A.S © {new Date().getFullYear()} · ACCESO SOLO PARA PERSONAL AUTORIZADO
          </p>
        </div>
      </div>
    </div>
  );
}
