"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { LoginForm } from "@/components/viza/login-form";
import { SalesPanel } from "@/components/viza/sales-panel";
import { AdminPanel } from "@/components/viza/admin-panel";
import { GestionAccesos } from "@/components/viza/gestion-accesos";
import { Orquestador } from "@/components/viza/orquestador";
import { StockGeneral } from "@/components/viza/stock-general";
import { EncargadoCompra } from "@/components/viza/encargado-compra";
import { CrmPanel } from "@/components/viza/crm-panel";
import { Loader2 } from "lucide-react";
import { setCurrentUserId } from "@/lib/user-scoped-storage";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
// Task 127 (pedido del dueño): SOLO el email viza@viza.com.py (VILMAR CESAR
// ZAGO PEREIRA) ve el botón IR A STOCK GENERAL en la BASE, como siempre.
import { puedeIrAStockGeneral } from "@/lib/acceso-stock-general";
// Pedido del dueño: el DEPARTAMENTO DE COMPRA se habilita además del supremo a
// baltazar@viza.com.py y viza@viza.com.py (lista única en
// src/lib/acceso-encargado-compra.ts).
import { puedeUsarEncargadoCompra } from "@/lib/acceso-encargado-compra";
// Task 169 (pedido del dueño): el ORQUESTADOR pasa a ser la pantalla de INICIO
// de TODOS los usuarios y el CRM se abre como módulo propio (cuadro debajo de
// COTIZADOR). Toda la matriz de accesos vive en una sola lista client-safe.
import { accesosDeUsuario } from "@/lib/acceso-modulos";

type Vista =
  | "orquestador"
  | "sales"
  | "base"
  | "gestion"
  | "stock"
  | "compra"
  | "crm";

export default function Home() {
  const { data: session, status } = useSession();
  // Task 169: null = todavía no navegó → SIEMPRE arranca en el ORQUESTADOR.
  // Regla de oro intacta: el menú depende del TIPO de usuario, no de la vista.
  const [adminView, setAdminView] = useState<Vista | null>(null);

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

  // ─── Task 169: UNA sola fuente de verdad para el tipo de usuario ───
  // SUPREMO > ADMIN > VIP > ESPECIAL > COMÚN. De acá salen el alcance del CRM
  // y qué módulos del Orquestador se pueden abrir. La base y las acciones
  // siguen re-validando en el servidor.
  const accesos = accesosDeUsuario(user);
  const irA = (vista: Vista) => setAdminView(vista);

  // Base SOLO LECTURA para los usuarios de consulta (lista histórica).
  const esConsultaBase = esEmailSoloLectura(user.email, role);
  // DEPARTAMENTO DE COMPRA: supremo + emails habilitados.
  const verEncargadoCompra = puedeUsarEncargadoCompra(user.email, role);
  // Botón IR A STOCK GENERAL dentro de la BASE (solo VILMAR, como siempre).
  const verStockGeneral = puedeIrAStockGeneral(user.email);

  // ─── Vista efectiva con GUARDA de permisos ───
  // Si alguien fuerza una vista a la que no tiene acceso, vuelve al
  // ORQUESTADOR. El Orquestador es la pantalla de inicio de TODOS.
  const pedida: Vista = adminView ?? "orquestador";
  const permitida =
    pedida === "orquestador" ||
    (pedida === "sales" && accesos.puedeVerCotizador) ||
    (pedida === "crm" && accesos.puedeVerCrm) ||
    (pedida === "stock" && accesos.puedeVerStock) ||
    (pedida === "base" && accesos.puedeVerBase) ||
    (pedida === "compra" && verEncargadoCompra) ||
    (pedida === "gestion" && accesos.puedeVerGestion);
  const view: Vista = permitida ? pedida : "orquestador";

  // ═══ ORQUESTADOR: pantalla de inicio de TODOS (Task 169) ═══
  // - Supremo/Admin/VIP: COTIZADOR + CRM GENERAL + STOCK + LA BASE (+ COMPRA
  //   según la lista de emails). El GDA sigue siendo SOLO del supremo.
  // - ESPECIAL: COTIZADOR + CRM de SU SUCURSAL + STOCK. Base y departamentos
  //   quedan VISIBLES pero bloqueados.
  // - COMÚN: COTIZADOR + CRM PERSONAL (solo lo emitido por él) + STOCK.
  if (view === "orquestador") {
    return (
      <Orquestador
        user={user}
        onGoStock={() => irA("stock")}
        onGoSales={() => irA("sales")}
        onGoCrm={() => irA("crm")}
        onGoBase={accesos.puedeVerBase ? () => irA("base") : undefined}
        // DEPARTAMENTO DISTRIBUCIÓN/LOGÍSTICA: para supremo/admin/VIP mantiene
        // el comportamiento de siempre (abre STOCK GENERAL). ESPECIAL/COMÚN lo
        // ven bloqueado.
        onGoDistribucion={accesos.puedeVerBase ? () => irA("stock") : undefined}
        onGoCompra={verEncargadoCompra ? () => irA("compra") : undefined}
        onGoGestion={accesos.esSupremo ? () => irA("gestion") : undefined}
      />
    );
  }

  // ═══ CRM · módulo completo (Task 169) ═══
  // El alcance lo define el servidor (/api/crm/ranking): general, sucursal o
  // personal. Acá solo se pasa el modo y las capacidades de UI.
  if (view === "crm") {
    return (
      <CrmPanel
        user={user}
        modo={accesos.modoCrm}
        puedeAsignar={accesos.puedeAsignarSucursalCrm}
        soloLectura={accesos.crmSoloLectura}
        onVolver={() => irA("orquestador")}
      />
    );
  }

  // ═══ DEPARTAMENTO DE COMPRA (página completa) ═══
  if (view === "compra") {
    return (
      <EncargadoCompra
        open
        modo="pagina"
        onClose={() => irA("orquestador")}
      />
    );
  }

  // ═══ STOCK GENERAL (todos los tipos, pedido del dueño) ═══
  if (view === "stock") {
    return (
      <StockGeneral
        user={user}
        onGoOrquestador={() => irA("orquestador")}
        onGoBase={accesos.puedeVerBase ? () => irA("base") : undefined}
        onGoSales={() => irA("sales")}
      />
    );
  }

  // ═══ COTIZADOR (todos los tipos) ═══
  if (view === "sales") {
    return (
      <SalesPanel
        user={user}
        isSupremo={accesos.esSupremo}
        onGoOrquestador={() => irA("orquestador")}
        onGoAdmin={
          accesos.esSupremo || accesos.esAdmin ? () => irA("base") : undefined
        }
        onGoBase={accesos.esVip ? () => irA("base") : undefined}
        onGoGestion={
          accesos.esSupremo ? () => irA("gestion") : undefined
        }
        onGoStock={verStockGeneral ? () => irA("stock") : undefined}
      />
    );
  }

  // ═══ GESTIÓN DE ACCESOS (SOLO supremo) ═══
  if (view === "gestion") {
    return (
      <GestionAccesos
        user={user}
        onGoSales={() => irA("sales")}
        onGoAdmin={() => irA("base")}
        onGoOrquestador={() => irA("orquestador")}
      />
    );
  }

  // ═══ LA BASE (supremo / admin / VIP solo lectura) ═══
  return (
    <AdminPanel
      user={user}
      onGoSales={() => irA("sales")}
      onGoOrquestador={() => irA("orquestador")}
      onGoStock={verStockGeneral ? () => irA("stock") : undefined}
      onGoGestion={accesos.esSupremo ? () => irA("gestion") : undefined}
      isSupremo={accesos.esSupremo}
      modoLectura={esConsultaBase || accesos.baseSoloLectura}
    />
  );
}
