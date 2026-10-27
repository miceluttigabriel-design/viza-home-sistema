import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  SUCURSALES_VIZA,
  leerMapaSucursales,
  sembrarDesdeExcel,
  migrarCentralKatuete,
} from "@/lib/sucursal-usuario";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";

// GET /api/crm/ranking — CRM: ranking de presupuestos emitidos por usuario.
// DOS formas de entrar:
//   · admin / supremo_admin → ranking GENERAL con todas las sucursales
//     (el front lo filtra con pills) — igual que siempre.
//   · ENCARGADO de sucursal (lista ENCARGADOS_SUCURSAL, ver
//     src/lib/encargados-sucursal.ts) → SOLO el ranking de SU sucursal,
//     sin datos de las demás y con el total recortado a su sucursal.
//   · cualquier otro usuario → 403 (no ve el CRM).
//
// SOLO LECTURA: nunca crea, edita ni borra presupuestos, usuarios ni
// productos. La única escritura posible es la SIEMBRA automática de la
// sucursal desde la planilla de funcionarios (tabla aparte
// "UsuarioSucursal", best-effort: si falla, todo queda "SIN SUCURSAL").
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    const isAdmin = role === "admin" || role === "supremo_admin";
    // Encargado de sucursal (panel de ventas): entra con el CRM de SU
    // sucursal, SOLO LECTURA. La clave es el email de la sesión en minúscula.
    const emailSesion = (session.user?.email || "").trim().toLowerCase();
    const sucursalEncargado = isAdmin
      ? null
      : (ENCARGADOS_SUCURSAL[emailSesion] ?? null);
    if (!isAdmin && !sucursalEncargado) {
      return NextResponse.json({ error: "Sin permiso para el CRM" }, { status: 403 });
    }

    // Usuarios del sistema (solo columnas seguras: nunca la contraseña).
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    // Cantidad de presupuestos emitidos por usuario + fecha del último.
    // Quote.userId ya existe desde siempre en el sistema: groupBy sobre
    // tablas existentes, imposible romper nada.
    const [totales, aprobadas, totalGeneral] = await Promise.all([
      db.quote.groupBy({
        by: ["userId"],
        _count: true,
        _max: { createdAt: true },
      }),
      db.quote.groupBy({
        by: ["userId"],
        _count: true,
        where: { status: "aprobada" },
      }),
      db.quote.count(),
    ]);

    const totalPorUser = new Map<string, { total: number; ultimo: Date | null }>();
    for (const g of totales) {
      if (!g.userId) continue; // presupuestos sin usuario: no van al ranking por persona
      totalPorUser.set(g.userId, { total: g._count, ultimo: g._max.createdAt ?? null });
    }
    const aprobadasPorUser = new Map<string, number>();
    for (const g of aprobadas) {
      if (!g.userId) continue;
      aprobadasPorUser.set(g.userId, g._count);
    }

    // Sucursal de cada usuario (tabla aparte, auto-creada en el primer uso).
    // Primera vez: se siembra solo desde la planilla de funcionarios
    // (FUN.VIZA) coincidiendo el email; lo que no coincide queda
    // "SIN SUCURSAL" y el admin lo asigna a mano desde el panel.
    // Ajuste del CRM (una sola vez, best-effort): "CENTRAL/KATUETE" dejó de
    // existir como filtro → sus usuarios pasan a "KATUETE". (Task 77: la
    // parte que sacaba a cobranza.katuete@ de KATUETE quedó revertida —
    // vuelve a KATUETE por la siembra del mapa.)
    await migrarCentralKatuete();

    let mapaSuc = await leerMapaSucursales();
    const sinSucursal = users.filter(
      (u) => !mapaSuc.has(u.email.trim().toLowerCase())
    );
    if (sinSucursal.length > 0) {
      await sembrarDesdeExcel(sinSucursal.map((u) => u.email));
      mapaSuc = await leerMapaSucursales();
    }

    const ranking = users
      .map((u) => {
        const t = totalPorUser.get(u.id);
        return {
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role,
          active: u.active,
          sucursal: mapaSuc.get(u.email.trim().toLowerCase()) || "SIN SUCURSAL",
          total: t?.total ?? 0,
          aprobadas: aprobadasPorUser.get(u.id) ?? 0,
          ultimo: t?.ultimo ? t.ultimo.toISOString() : null,
        };
      })
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.aprobadas - a.aprobadas ||
          a.name.localeCompare(b.name, "es")
      );

    // ─── Vista ENCARGADO: solo SU sucursal, sin datos de las demás ───
    // Mismo ranking ya calculado, recortado a su sucursal. El total que ve
    // también es solo de su sucursal (nunca el total de la empresa).
    if (sucursalEncargado) {
      const rankingSucursal = ranking.filter(
        (r) => r.sucursal === sucursalEncargado
      );
      const totalSucursal = rankingSucursal.reduce(
        (acc, r) => acc + r.total,
        0
      );
      return NextResponse.json({
        ranking: rankingSucursal,
        sucursales: [], // sin filtros: solo ve su sucursal
        totalGeneral: totalSucursal,
        vistaSucursal: sucursalEncargado,
      });
    }

    return NextResponse.json({
      ranking,
      sucursales: SUCURSALES_VIZA,
      totalGeneral,
    });
  } catch (error) {
    console.error("Error CRM ranking:", error);
    return NextResponse.json(
      { error: "Error al calcular el ranking del CRM" },
      { status: 500 }
    );
  }
}
