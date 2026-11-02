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
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";

// GET /api/crm/ranking — CRM: ranking de presupuestos emitidos por usuario.
// DOS formas de entrar:
//   · admin / supremo_admin → ranking GENERAL con todas las sucursales
//     (el front lo filtra con pills) — igual que siempre.
//   · ENCARGADO de sucursal (lista ENCARGADOS_SUCURSAL, ver
//     src/lib/encargados-sucursal.ts) → SOLO el ranking de SU sucursal,
//     sin datos de las demás y con el total recortado a su sucursal.
//   · cualquier otro usuario → 403 (no ve el CRM).
//
// Task 78 (pedido del dueño): cada fila del ranking trae también el
// DESGLOSE POR TIPO DE PLAN (CUOTA / CONTADO / MAYORISTA / SAFRA /
// CHEQUE) para que el CRM pueda filtrar por plan. El plan se deduce del
// PREFIJO del quoteNumber (PRESUPUESTO-01 → CUOTA, MAYOR-01 → MAYORISTA,
// SAFRA-01 → SAFRA, CHEQUE-01 → CHEQUE). Formatos viejos (número
// aleatorio del estilo VZH-MAYOR-20261026-8515) también matchean por
// INCLUDE, así el histórico queda agrupado igual.
//
// Task 111 (pedido del dueño): los presupuestos emitidos SOLO AL
// CONTADO (únicamente el "Plan A: Contado", sin cuotas) se guardan con
// status "emitida_contado" (ver src/lib/guardar-quote.ts) y entran al
// CRM como su PROPIA opción CONTADO — ya no se cuentan como CUOTA.
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
    // Usuarios de CONSULTA (viza.compras@, filipe.campos@ — Task 82): el CRM
    // es SOLO VISUALIZACIÓN y ven el ranking GENERAL (como admin). La
    // asignación de sucursal (PUT /api/crm/sucursal) sigue cerrada para ellos.
    const esConsulta = esEmailSoloLectura(emailSesion);
    const sucursalEncargado = isAdmin || esConsulta
      ? null
      : (ENCARGADOS_SUCURSAL[emailSesion] ?? null);
    if (!isAdmin && !sucursalEncargado && !esConsulta) {
      return NextResponse.json({ error: "Sin permiso para el CRM" }, { status: 403 });
    }

    // Usuarios del sistema (solo columnas seguras: nunca la contraseña).
    // Task 95 (pedido del dueño): en el CRM NO aparecen:
    //   · usuarios INACTIVOS (active = false), ni
    //   · usuarios con rol admin / supremo_admin — los ADM y SUPREMO no son
    //     vendedores: no van al ranking en NINGUNA sucursal.
    // El recorte es acá, en el servidor: así desaparecen de la vista GENERAL,
    // de las pills por sucursal Y del CRM de los encargados (que filtra este
    // mismo ranking por sucursal). La gestión de usuarios sigue completa en
    // el panel ADM (gestion-accesos), que no usa este endpoint.
    const users = await db.user.findMany({
      where: {
        active: true,
        role: { notIn: ["admin", "supremo_admin"] },
      },
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

    // ─── Desglose POR TIPO DE PLAN (Task 78; Task 111 agrega CONTADO) ───
    // Solo (userId, quoteNumber, status): consulta liviana de 3 columnas.
    // Con el prefijo del quoteNumber se arma el desglose CUOTA/MAYORISTA/
    // SAFRA/CHEQUE por usuario. Desde Task 78 los 4 PDFs (PRESUPUESTO
    // normal, MAYORISTA, SAFRA y CHEQUE) guardan su emisión en la base con
    // el MISMO número impreso, así el desglose coincide con lo que ve el
    // vendedor.
    // Task 111: los emitidos SOLO AL CONTADO se guardan con status
    // "emitida_contado" → entran a la opción CONTADO del CRM. Los demás
    // PRESUPUESTO-XX (con cuotas) siguen siendo CUOTA.
    function planDeQuote(quoteNumber: string, status?: string): string {
      if ((status || "") === "emitida_contado") return "CONTADO"; // Task 111
      const qn = (quoteNumber || "").toUpperCase();
      if (qn.includes("MAYOR")) return "MAYORISTA";
      if (qn.includes("SAFRA")) return "SAFRA";
      if (qn.includes("CHEQUE")) return "CHEQUE";
      return "CUOTA"; // PRESUPUESTO-XX y cualquier formato viejo del carrito
    }
    const quotesParaPlan = await db.quote.findMany({
      select: { userId: true, quoteNumber: true, status: true },
    });
    const porPlanPorUser = new Map<string, Record<string, number>>();
    for (const q of quotesParaPlan) {
      if (!q.userId) continue;
      const rec =
        porPlanPorUser.get(q.userId) ??
        { CUOTA: 0, CONTADO: 0, MAYORISTA: 0, SAFRA: 0, CHEQUE: 0 };
      rec[planDeQuote(q.quoteNumber, q.status)]++;
      porPlanPorUser.set(q.userId, rec);
    }
    const porPlanVacio = () => ({
      CUOTA: 0,
      CONTADO: 0,
      MAYORISTA: 0,
      SAFRA: 0,
      CHEQUE: 0,
    });

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
          porPlan: porPlanPorUser.get(u.id) ?? porPlanVacio(),
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
