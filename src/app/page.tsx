"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { LoginForm } from "@/components/viza/login-form";
import { SalesPanel } from "@/components/viza/sales-panel";
import { AdminPanel } from "@/components/viza/admin-panel";
import { GestionAccesos } from "@/components/viza/gestion-accesos";
import { Loader2 } from "lucide-react";
import { setCurrentUserId } from "@/lib/user-scoped-storage";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";

export default function Home() {
  const { data: session, status } = useSession();
  // Vista interna: "sales" | "admin" | "gestion" | "base"
  // - admin/supremo_admin: pueden alternar entre las 3 (supremo tiene "gestion" extra)
  // - "base" (Task 78/79): viza.compras@ (ENC. COMPRAS) — la vista de la
  //   BASE completa en SOLO LECTURA desde su panel de ventas (por EMAIL,
  //   independiente del rol que tenga en la base).
  // Regla de oro: el menú depende del ROL del usuario, no de la vista actual.
  const [adminView, setAdminView] = useState<"sales" | "admin" | "gestion" | "base">("admin");

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
    if (adminView === "base") {
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
    return <SalesPanel user={user} />;
  }

  // Admin "común" → puede cambiar entre Sales y Admin (sin Gestión de Accesos)
  if (role === "admin") {
    if (adminView === "sales") {
      return <SalesPanel user={user} onGoAdmin={() => setAdminView("admin")} />;
    }
    return <AdminPanel user={user} onGoSales={() => setAdminView("sales")} />;
  }

  // SUPREMO_ADMIN → Acceso Total: Sales + Admin + Gestión de Accesos
  // Los botones de navegación SIEMPRE deben estar visibles para el supremo,
  // sin importar en qué pantalla esté (regla de oro: el menú depende del ROL,
  // no de la vista actual).
  if (role === "supremo_admin") {
    if (adminView === "sales") {
      return (
        <SalesPanel
          user={user}
          onGoAdmin={() => setAdminView("admin")}
          onGoGestion={() => setAdminView("gestion")}
          isSupremo
        />
      );
    }
    if (adminView === "gestion") {
      return (
        <GestionAccesos
          user={user}
          onGoSales={() => setAdminView("sales")}
          onGoAdmin={() => setAdminView("admin")}
        />
      );
    }
    return (
      <AdminPanel
        user={user}
        onGoSales={() => setAdminView("sales")}
        onGoGestion={() => setAdminView("gestion")}
        isSupremo
      />
    );
  }

  // Otro rol desconocido → logout implícito
  return <LoginForm />;
}
