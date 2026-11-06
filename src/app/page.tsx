"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { LoginForm } from "@/components/viza/login-form";
import { SalesPanel } from "@/components/viza/sales-panel";
import { AdminPanel } from "@/components/viza/admin-panel";
import { GestionAccesos } from "@/components/viza/gestion-accesos";
// Task 91: Orquestador (solo supremo) + Stock General (cuadro azul nuevo)
import { Orquestador } from "@/components/viza/orquestador";
import { StockGeneral } from "@/components/viza/stock-general";
import { Loader2 } from "lucide-react";
import { setCurrentUserId } from "@/lib/user-scoped-storage";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
// Task 127 (pedido del dueño): SOLO el email viza@viza.com.py (VILMAR CESAR
// ZAGO PEREIRA) ve el botón IR A STOCK GENERAL y puede entrar a esa vista
// fuera del supremo (lista única en src/lib/acceso-stock-general.ts).
import { puedeIrAStockGeneral } from "@/lib/acceso-stock-general";

export default function Home() {
  const { data: session, status } = useSession();
  // Vista interna: "orquestador" | "sales" | "admin" | "gestion" | "base" | "stock"
  // Task 91 (mudanza visual, pedido del dueño): null = todavía no navegó a
  // ningún lado → la vista INICIAL depende del ROL:
  //   · supremo_admin → ORQUESTADOR (los 4 cuadros del diagrama, solo él)
  //   · admin → LA BASE directo (con opción de ver el panel, como siempre)
  //   · colaborador/consulta → PANEL DE VENTAS directo (sin cambios)
  // Regla de oro intacta: el menú depende del ROL del usuario, no de la vista.
  const [adminView, setAdminView] = useState<
    "orquestador" | "sales" | "admin" | "gestion" | "base" | "stock" | null
  >(null);

  // Setear el userId actual en localStorage para que los stores (cart, cotizacion,
  // plan-safra, cheque) usen un storage AISLADO POR USUARIO.
  // Esto garantiza que 2 usuarios logueados en la misma PC no se mezclen los carritos.
  useEffect(() => {
    const userId = (session?.user as any)?.id;
    setCurrentUserId(userId || null);
  }, [session]);

  // Pantalla de carga mientras verifica sesión
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-stone-400 mx-auto" />
          <p className="text-sm text-stone-500 mt-2">Cargando VIZA HOME...</p>
        </div>
      </div>
    );
  }

  // No autenticado → LoginForm
  if (!session) {
    return <LoginForm />;
  }

  const role = ((session.user as any)?.role ?? "") as string;
  const user = {
    email: session.user?.email || "",
    name: session.user?.name,
    role,
  };

  // Task 127: ¿este usuario tiene el botón IR A STOCK GENERAL? (hoy: solo
  // viza@viza.com.py — VILMAR CESAR ZAGO PEREIRA; el supremo ya entra por
  // su ORQUESTADOR de siempre). Si la vista "stock" llega pedida por
  // cualquier otro email, se ignora y cae a su vista normal.
  const verStockGeneral = puedeIrAStockGeneral(user.email);

  // Vista efectiva (Task 91): si todavía no navegó (null), la inicial es
  // por rol → supremo cae en el ORQUESTADOR; todos los demás, donde ya
  // caían antes (admin → base, colaborador → panel). Cero cambios para
  // los que no son supremo.
  const view = adminView ?? (role === "supremo_admin" ? "orquestador" : "admin");

  // ═══ SOLO LECTURA TOTAL (Task 79 + Task 82, pedido del dueño) ═══
  // Usuarios de CONSULTA (lista única en src/lib/usuarios-consulta.ts):
  //   · viza.compras@viza.com.py (ENC. COMPRAS, Adriano) — Task 79
  //   · filipe.campos@viza.com.py — Task 82 (ADM solo para visualización)
  // Ven la BASE completa con buscador/filtros/orden/paginación y el CRM
  // (ranking de presupuestos) pero NADA editable: ni celdas, ni etiquetas
  // de color, ni #HASHTAG, ni guardar/borrar/importar.
  // El control va por EMAIL y NO por rol: así el modo lectura se aplica
  // SIEMPRE para estos usuarios, tengan el rol que tengan en la base (el
  // backend también lo rechaza en toda escritura de productos).
  // La vista alterna se activa con el botón VER BASE del panel de ventas
  // (onGoBase SOLO se pasa a estos emails; ningún otro usuario lo recibe).
  const esConsultaBase = esEmailSoloLectura(user.email);
  if (esConsultaBase) {
    if (view === "base") {
      return (
        <AdminPanel user={user} onGoSales={() => setAdminView("sales")} modoLectura />
      );
    }
    return (
      <SalesPanel
        user={user}
        onGoBase={() => setAdminView("base")}
      />
    );
  }

  // Colaborador → solo SalesPanel (no puede ver Admin ni Gestión)
  // Compat hacia atrás: representante = colaborador
  if (role === "colaborador" || role === "representante") {
    // Task 127: VILMAR (viza@viza.com.py) puede entrar al STOCK GENERAL desde
    // su botón (sin BASE y sin ORQUESTADOR: solo COTIZADOR para volver).
    if (view === "stock" && verStockGeneral) {
      return (
        <StockGeneral
          user={user}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    return (
      <SalesPanel
        user={user}
        onGoStock={verStockGeneral ? () => setAdminView("stock") : undefined}
      />
    );
  }

  // Admin "común" → entra DIRECTO a la BASE (Task 91: igual que siempre)
  // y puede cambiar a Ventas (sin Gestión de Accesos). NO ve el orquestador.
  if (role === "admin") {
    if (view === "sales") {
      return <SalesPanel user={user} onGoAdmin={() => setAdminView("admin")} />;
    }
    // Task 127: VILMAR (viza@viza.com.py) puede entrar al STOCK GENERAL desde
    // su botón de la BASE (con BASE y COTIZADOR para volver).
    if (view === "stock" && verStockGeneral) {
      return (
        <StockGeneral
          user={user}
          onGoBase={() => setAdminView("admin")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    return (
      <AdminPanel
        user={user}
        onGoSales={() => setAdminView("sales")}
        onGoStock={verStockGeneral ? () => setAdminView("stock") : undefined}
      />
    );
  }

  // SUPREMO_ADMIN → Acceso Total: Orquestador + Base + Stock + Ventas + Gestión
  // Task 91: el supremo es el ÚNICO que ve los cuadros del orquestador.
  // Los botones de navegación SIEMPRE visibles (regla de oro del menú por rol).
  if (role === "supremo_admin") {
    if (view === "orquestador") {
      return (
        <Orquestador
          user={user}
          onGoBase={() => setAdminView("admin")}
          onGoStock={() => setAdminView("stock")}
          onGoSales={() => setAdminView("sales")}
          onGoGestion={() => setAdminView("gestion")}
        />
      );
    }
    if (view === "stock") {
      return (
        <StockGeneral
          user={user}
          onGoOrquestador={() => setAdminView("orquestador")}
          onGoBase={() => setAdminView("admin")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    if (view === "sales") {
      return (
        <SalesPanel
          user={user}
          onGoAdmin={() => setAdminView("admin")}
          onGoGestion={() => setAdminView("gestion")}
          onGoOrquestador={() => setAdminView("orquestador")}
          isSupremo
        />
      );
    }
    if (view === "gestion") {
      return (
        <GestionAccesos
          user={user}
          onGoSales={() => setAdminView("sales")}
          onGoAdmin={() => setAdminView("admin")}
          onGoOrquestador={() => setAdminView("orquestador")}
        />
      );
    }
    return (
      <AdminPanel
        user={user}
        onGoSales={() => setAdminView("sales")}
        onGoGestion={() => setAdminView("gestion")}
        onGoOrquestador={() => setAdminView("orquestador")}
        isSupremo
      />
    );
  }

  // Otro rol desconocido → logout implícito
  return <LoginForm />;
}
