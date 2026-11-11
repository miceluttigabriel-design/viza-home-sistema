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
import { esUsuarioVip } from "@/lib/encargados-sucursal";

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

  // Task 144 (pedido del dueño): el ORQUESTADOR deja de ser exclusivo del
  // supremo. También pueden VERLO los ADMINS y los usuarios VIP (los dos de
  // USUARIOS_VIP: filipe.campos@ y viza.compras@). Los permisos de cada
  // módulo NO cambian: el GDA, IMPORTAR EXCEL y DISTRIBUCIÓN INTELIGENTE
  // siguen siendo SOLO para el supremo (se controlan más abajo y en cada
  // componente).
  const emailUsuario = user.email.trim().toLowerCase();
  // Task 165: VIP = rol promovido desde el GDA (User.role = "vip") o la lista
  // histórica USUARIOS_VIP. El VIP ve el ORQUESTADOR y la BASE, pero SOLO
  // LECTURA (ver esConsultaBase más abajo).
  const esVip = esUsuarioVip(emailUsuario, role);
  const puedeVerOrquestador =
    role === "supremo_admin" || role === "admin" || esVip;

  // Task 127: ¿este usuario tiene el botón IR A STOCK GENERAL? (hoy: solo
  // viza@viza.com.py — VILMAR CESAR ZAGO PEREIRA; el supremo ya entra por
  // su ORQUESTADOR de siempre). Si la vista "stock" llega pedida por
  // cualquier otro email, se ignora y cae a su vista normal.
  const verStockGeneral = puedeIrAStockGeneral(user.email);

  // Vista efectiva (Task 91 + Task 144): si todavía no navegó (null), la
  // inicial es el ORQUESTADOR para el SUPREMO, los ADMINS y los VIPs (todos
  // los que pueden verlo). El resto sigue cayendo donde caía antes
  // (colaborador/consulta → panel de ventas).
  const view = adminView ?? (puedeVerOrquestador ? "orquestador" : "admin");

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
  const esConsultaBase = esEmailSoloLectura(user.email, role);
  if (esConsultaBase) {
    // Task 144: los consulta que además son VIP (filipe.campos@ y
    // viza.compras@) pueden abrir el ORQUESTADOR. Siguen siendo SOLO LECTURA
    // en la Base y NO reciben onGoGestion (GDA solo supremo).
    if (view === "orquestador" && puedeVerOrquestador) {
      return (
        <Orquestador
          user={user}
          onGoBase={() => setAdminView("base")}
          onGoStock={() => setAdminView("stock")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    if (view === "stock" && puedeVerOrquestador) {
      return (
        <StockGeneral
          user={user}
          onGoOrquestador={() => setAdminView("orquestador")}
          onGoBase={() => setAdminView("base")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    if (view === "base") {
      return (
        <AdminPanel
          user={user}
          onGoSales={() => setAdminView("sales")}
          onGoOrquestador={
            puedeVerOrquestador ? () => setAdminView("orquestador") : undefined
          }
          modoLectura
        />
      );
    }
    return (
      <SalesPanel
        user={user}
        onGoBase={() => setAdminView("base")}
        onGoOrquestador={
          puedeVerOrquestador ? () => setAdminView("orquestador") : undefined
        }
      />
    );
  }

  // Colaborador → solo SalesPanel (no puede ver Admin ni Gestión)
  // Compat hacia atrás: representante = colaborador
  if (role === "colaborador" || role === "representante" || role === "especial") {
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
  // y puede cambiar a Ventas (sin Gestión de Accesos).
  // Task 144 (pedido del dueño): el ADMIN también puede ver el ORQUESTADOR.
  // No recibe onGoGestion: el GDA sigue siendo SOLO del supremo.
  if (role === "admin") {
    if (view === "orquestador" && puedeVerOrquestador) {
      return (
        <Orquestador
          user={user}
          onGoBase={() => setAdminView("admin")}
          onGoStock={() => setAdminView("stock")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    if (view === "sales") {
      return (
        <SalesPanel
          user={user}
          onGoAdmin={() => setAdminView("admin")}
          onGoOrquestador={
            puedeVerOrquestador ? () => setAdminView("orquestador") : undefined
          }
        />
      );
    }
    // Task 127 + 144: el ADMIN puede entrar al STOCK GENERAL desde el
    // ORQUESTADOR (y VILMAR desde su botón de siempre). Sin GDA.
    if (view === "stock" && (verStockGeneral || puedeVerOrquestador)) {
      return (
        <StockGeneral
          user={user}
          onGoOrquestador={
            puedeVerOrquestador ? () => setAdminView("orquestador") : undefined
          }
          onGoBase={() => setAdminView("admin")}
          onGoSales={() => setAdminView("sales")}
        />
      );
    }
    return (
      <AdminPanel
        user={user}
        onGoSales={() => setAdminView("sales")}
        onGoOrquestador={
          puedeVerOrquestador ? () => setAdminView("orquestador") : undefined
        }
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
