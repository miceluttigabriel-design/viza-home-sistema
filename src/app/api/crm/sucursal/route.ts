import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SUCURSALES_VIZA, asignarSucursal } from "@/lib/sucursal-usuario";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";

// PUT /api/crm/sucursal — asigna (o quita) la sucursal de UN usuario para
// el CRM. Solo admin / supremo_admin.
// body: { userEmail: string, sucursal: string }  ("" = SIN SUCURSAL)
//
// Escribe SOLO en la tabla aparte "UsuarioSucursal" (auto-creada en el
// primer uso). NUNCA toca User, Quote ni Product: si falla, la app sigue
// funcionando igual y el ranking muestra los datos reales.
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== "admin" && role !== "supremo_admin") {
      return NextResponse.json({ error: "Sin permiso para el CRM" }, { status: 403 });
    }
    // Task 82: usuarios de consulta (viza.compras@, filipe.campos@ — lista
    // en src/lib/usuarios-consulta.ts) NO pueden asignar sucursales: el CRM
    // para ellos es SOLO VISUALIZACIÓN (aunque su rol sea admin).
    if (esEmailSoloLectura(((session.user as any)?.email || ""))) {
      return NextResponse.json(
        { error: "Usuario de consulta SOLO VISUALIZACIÓN: no puede asignar sucursales" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const userEmail = typeof body?.userEmail === "string" ? body.userEmail.trim() : "";
    const sucursal = typeof body?.sucursal === "string" ? body.sucursal.trim() : "";

    if (!userEmail || !userEmail.includes("@")) {
      return NextResponse.json({ error: "Email de usuario inválido" }, { status: 400 });
    }
    if (sucursal && !(SUCURSALES_VIZA as readonly string[]).includes(sucursal)) {
      return NextResponse.json({ error: "Sucursal no válida" }, { status: 400 });
    }

    const ok = await asignarSucursal(userEmail, sucursal);
    if (!ok) {
      return NextResponse.json(
        { error: "No se pudo guardar la sucursal (intenta de nuevo)" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userEmail: userEmail.toLowerCase(),
      sucursal: sucursal || null,
    });
  } catch (error) {
    console.error("Error asignando sucursal CRM:", error);
    return NextResponse.json({ error: "Error al asignar sucursal" }, { status: 500 });
  }
}
