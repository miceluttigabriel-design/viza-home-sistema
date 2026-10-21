"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { LoginForm } from "@/components/viza/login-form";
import { SalesPanel } from "@/components/viza/sales-panel";
import { AdminPanel } from "@/components/viza/admin-panel";
import { GestionAccesos } from "@/components/viza/gestion-accesos";
import { Loader2 } from "lucide-react";
import { setCurrentUserId } from "@/lib/user-scoped-storage";

export default function Home() {
  const { data: session, status } = useSession();
  // Vista interna: "sales" | "admin" | "gestion"
  // - admin/supremo_admin: pueden alternar entre las 3 (supremo tiene "gestion" extra)
  // Regla de oro: el menú depende del ROL del usuario, no de la vista actual.
  const [adminView, setAdminView] = useState<"sales" | "admin" | "gestion">("admin");

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
