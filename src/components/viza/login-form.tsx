"use client";

import { useState, useMemo } from "react";
import { signIn } from "next-auth/react";
import { Mail, Lock, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

// Generar particulas doradas aleatorias (memoizado para que no cambien en cada render)
function useParticulas(cantidad: number) {
  return useMemo(() => {
    return Array.from({ length: cantidad }, (_, i) => ({
      id: i,
      size: Math.random() * 80 + 20,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: Math.random() * 10 + 15,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.15 + 0.05,
    }));
  }, [cantidad]);
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const particulas = useParticulas(20);

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
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* === FONDO ANIMADO === */}
      {/* Capa de gradiente animado */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #155789 0%, #0d3a5c 50%, #155789 100%)",
          backgroundSize: "200% 200%",
          animation: "gradientMove 15s ease infinite",
          zIndex: 1,
        }}
      />

      {/* Particulas doradas flotantes */}
      {particulas.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            backgroundColor: "#D9B86B",
            borderRadius: "50%",
            opacity: p.opacity,
            animation: `particleFloat ${p.duration}s infinite ease-in-out`,
            animationDelay: `${p.delay}s`,
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Ondas decorativas superiores */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "250px",
          opacity: 0.08,
          zIndex: 3,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 1440 250"
          preserveAspectRatio="none"
          style={{ width: "120%", height: "100%", animation: "waveMove 10s ease-in-out infinite" }}
        >
          <path
            fill="#D9B86B"
            d="M0,128L48,122.7C96,117,192,107,288,112C384,117,480,139,576,144C672,149,768,139,864,122.7C960,107,1056,85,1152,85C1248,85,1344,107,1392,117.3L1440,128L1440,0L0,0Z"
          />
        </svg>
      </div>

      {/* Ondas decorativas inferiores */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "200px",
          opacity: 0.08,
          zIndex: 3,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
          style={{
            width: "120%",
            height: "100%",
            animation: "waveMove 12s ease-in-out infinite reverse",
            transform: "rotate(180deg)",
          }}
        >
          <path
            fill="#D9B86B"
            d="M0,128L48,122.7C96,117,192,107,288,112C384,117,480,139,576,144C672,149,768,139,864,122.7C960,107,1056,85,1152,85C1248,85,1344,107,1392,117.3L1440,128L1440,200L0,200Z"
          />
        </svg>
      </div>

      {/* Banda dorada inferior */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "linear-gradient(90deg, #b89853, #D9B86B, #b89853)",
          zIndex: 5,
        }}
      />

      {/* === CONTENIDO PRINCIPAL === */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "450px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* === ANIMACIÓN LOGO VIZA HOME === */}
        <div
          style={{
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            border: "3px solid #D9B86B",
            animation: "logoEntrance 1s ease-out 0.2s both",
            marginBottom: "20px",
            width: "100%",
            maxWidth: "340px",
            background: "#FFFFFF",
          }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/viza-home-logo-nuevo.png"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              objectFit: "contain",
            }}
          >
            <source src="/viza-home-animacion.mp4" type="video/mp4" />
            {/* Fallback si el navegador no soporta video */}
            <img
              src="/viza-home-logo-nuevo.png"
              alt="VIZA HOME"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </video>
        </div>

        {/* Slogan */}
        <p
          style={{
            color: "#D9B86B",
            fontSize: "13px",
            fontWeight: 600,
            textAlign: "center",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: "20px",
          }}
        >
          TODO PARA TU HOGAR, EN UN SOLO LUGAR
        </p>

        {/* === CARD DE LOGIN === */}
        <div
          style={{
            position: "relative",
            background: "white",
            borderRadius: "20px",
            padding: "40px 35px",
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            borderTop: "4px solid #D9B86B",
            animation: "cardEntrance 0.8s ease-out",
          }}
        >
          {/* Titulo */}
          <h1
            style={{
              color: "#155789",
              fontSize: "26px",
              fontWeight: 800,
              textAlign: "center",
              margin: "0 0 25px 0",
              letterSpacing: "0.5px",
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
                  fontWeight: 700,
                  marginBottom: "8px",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Email
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
                    padding: "15px 15px 15px 44px",
                    border: "2px solid #E0E0E0",
                    borderRadius: "10px",
                    fontSize: "16px",
                    transition: "all 0.3s ease",
                    background: "#F8F9FA",
                    color: "#343A40",
                    outline: "none",
                    boxSizing: "border-box",
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
                  fontWeight: 700,
                  marginBottom: "8px",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Contraseña
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
                    padding: "15px 44px 15px 44px",
                    border: "2px solid #E0E0E0",
                    borderRadius: "10px",
                    fontSize: "16px",
                    transition: "all 0.3s ease",
                    background: "#F8F9FA",
                    color: "#343A40",
                    outline: "none",
                    boxSizing: "border-box",
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
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
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
            fontSize: "12px",
            animation: "footerFadeIn 1s ease-out 0.5s both",
          }}
        >
          <p style={{ margin: "3px 0" }}>TEL: (0987) 700 707 | EMAIL: VENTAS.ONLINE@VIZA.COM.PY</p>
          <p style={{ margin: "3px 0" }}>WEB: WWW.VIZA.COM.PY | @VIZAHOME</p>
          <p style={{ marginTop: "8px", fontSize: "11px", opacity: 0.7 }}>
            VIZA HOME E.A.S © {new Date().getFullYear()} · ACCESO SOLO PARA PERSONAL AUTORIZADO
          </p>
        </div>
      </div>
    </div>
  );
}
