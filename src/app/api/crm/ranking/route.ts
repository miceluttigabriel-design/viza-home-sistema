import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  SUCURSALES_USUARIO,
  MAPA_SUCURSAL_EXCEL,
  leerMapaSucursales,
  sembrarDesdeExcel,
  migrarCentralKatuete,
  migrarCentral,
} from "@/lib/sucursal-usuario";
import { sucursalEncargadoDe } from "@/lib/encargados-sucursal-server";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import { listarPresupuestosCrm } from "@/lib/pedido-especial-presupuestos";

// GET /api/crm/ranking — CRM: ranking de presupuestos emitidos por usuario.
// DOS formas de entrar:
//   · admin / supremo_admin → ranking GENERAL con todas las sucursales
//     (el front lo filtra con pills) — igual que siempre.
//   · ENCARGADO de sucursal (lista ENCARGADOS_SUCURSAL, ver
//     src/lib/encargados-sucursal.ts) → SOLO el ranking de SU sucursal,
//     sin datos de las demás y con el total recortado a su sucursal.
//   · COMÚN → SOLO su propia fila (Task 169).
//
// Task 170 (pedido del dueño): acepta ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD y
// calcula TODOS los totales dentro de ese período (o de todo el histórico si
// no se manda nada). El filtro de plan incluye PEDIDO ESPECIAL.
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
// Task 170 (pedido del dueño): el CRM se puede consultar POR FECHA. El front
// manda ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (ambos opcionales) y TODOS los
// totales del ranking se calculan dentro de ese período. Sin fechas = todo el
// histórico, como antes. Las fechas se interpretan en hora de Paraguay
// (America/Asuncion = UTC-3 fijo).
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ─── Período de consulta (Task 170) ───
    // Acepta SOLO el formato YYYY-MM-DD; cualquier otra cosa se ignora para
    // no romper la consulta. "hasta" incluye el día completo (23:59:59.999).
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/;
    const desdeTxt = (req.nextUrl.searchParams.get("desde") || "").trim();
    const hastaTxt = (req.nextUrl.searchParams.get("hasta") || "").trim();
    const desdeFecha = soloFecha.test(desdeTxt)
      ? new Date(`${desdeTxt}T00:00:00.000-03:00`)
      : null;
    const hastaFecha = soloFecha.test(hastaTxt)
      ? new Date(`${hastaTxt}T23:59:59.999-03:00`)
      : null;
    const hayPeriodo = !!(desdeFecha || hastaFecha);
    const filtroFecha = hayPeriodo
      ? {
          createdAt: {
            ...(desdeFecha ? { gte: desdeFecha } : {}),
            ...(hastaFecha ? { lte: hastaFecha } : {}),
          },
        }
      : {};
    // Fragmento SQL equivalente para las tablas crudas del PEDIDO ESPECIAL.
    const filtroFechaSql = hayPeriodo
      ? Prisma.sql`${desdeFecha ? Prisma.sql`AND "createdAt" >= ${desdeFecha}` : Prisma.empty} ${
          hastaFecha ? Prisma.sql`AND "createdAt" <= ${hastaFecha}` : Prisma.empty
        }`
      : Prisma.empty;

    const role = (session.user as any)?.role;
    const isAdmin = role === "admin" || role === "supremo_admin";
    // Encargado de sucursal (panel de ventas): entra con el CRM de SU
    // sucursal, SOLO LECTURA. La clave es el email de la sesión en minúscula.
    const emailSesion = (session.user?.email || "").trim().toLowerCase();
    // Usuarios de CONSULTA (viza.compras@, filipe.campos@ — Task 82): el CRM
    // es SOLO VISUALIZACIÓN y ven el ranking GENERAL (como admin). La
    // asignación de sucursal (PUT /api/crm/sucursal) sigue cerrada para ellos.
    const esConsulta = esEmailSoloLectura(emailSesion, role);
    // Task 165: el ENCARGADO puede ser de la lista fija (ENCARGADOS_SUCURSAL)
    // o un usuario promovido a ESPECIAL desde el GDA (UsuarioSucursal).
    const sucursalEncargado = isAdmin || esConsulta
      ? null
      : await sucursalEncargadoDe(emailSesion, role);
    // Task 169 (pedido del dueño): el CRM ahora vive en el ORQUESTADOR y lo
    // puede abrir CUALQUIER usuario autenticado. El alcance se recorta acá,
    // en el servidor:
    //   · admin / supremo → general (todas las sucursales)
    //   · VIP / consulta  → general SOLO LECTURA
    //   · ESPECIAL        → su sucursal (sucursalEncargado)
    //   · COMÚN           → SOLO su propia fila (vista PERSONAL)
    // Un COMÚN nunca recibe datos de otros usuarios: más abajo se devuelve
    // únicamente su fila y sus pedidos especiales.
    const esVistaPersonal = !isAdmin && !esConsulta && !sucursalEncargado;

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

    // Sucursal de cada usuario (tabla aparte, auto-creada en el primer uso).
    // Primera vez: se siembra solo desde la planilla de funcionarios
    // (FUN.VIZA) coincidiendo el email; lo que no coincide queda
    // "SIN SUCURSAL" y el admin lo asigna a mano desde el panel.
    // Ajuste del CRM (una sola vez, best-effort): "CENTRAL/KATUETE" dejó de
    // existir como filtro → sus usuarios pasan a "KATUETE". (Task 77: la
    // parte que sacaba a cobranza.katuete@ de KATUETE quedó revertida —
    // vuelve a KATUETE por la siembra del mapa.)
    await migrarCentralKatuete();
    // Task 137 (pedido del dueño): los usuarios de la oficina central que
    // estaban en KATUETE pasan a SU sucursal CENTRAL (una sola pasada en la
    // vida de la base; después manda lo que el admin ajuste a mano).
    await migrarCentral();

    let mapaSuc = await leerMapaSucursales();
    const sinSucursal = users.filter(
      (u) => !mapaSuc.has(u.email.trim().toLowerCase())
    );
    if (sinSucursal.length > 0) {
      await sembrarDesdeExcel(sinSucursal.map((u) => u.email));
      mapaSuc = await leerMapaSucursales();
    }

    // Resuelve la sucursal con la MISMA prioridad de siempre: primero la
    // asignación guardada (editable en el CRM/GDA) y, si todavía no hay fila,
    // la planilla oficial. Así el filtro de CENTRAL funciona incluso antes
    // de que la tabla UsuarioSucursal exista.
    const sucursalDe = (email: string): string => {
      const key = String(email || "").trim().toLowerCase();
      return mapaSuc.get(key) || MAPA_SUCURSAL_EXCEL[key] || "SIN SUCURSAL";
    };

    // ─── Task 168 (pedido del dueño) ───
    // Los usuarios de CENTRAL quedan FUERA del CRM: no aparecen en el
    // ranking, no suman en el total general y sus pedidos especiales tampoco
    // se listan. El resto de los usuarios sigue igual que siempre.
    const usersCrm = users.filter((u) => sucursalDe(u.email) !== "CENTRAL");

    // Cantidad de presupuestos emitidos por usuario + fecha del último.
    // Quote.userId ya existe desde siempre en el sistema: groupBy sobre
    // tablas existentes, imposible romper nada.
    const [totales, aprobadas] = await Promise.all([
      db.quote.groupBy({
        by: ["userId"],
        where: filtroFecha,
        _count: true,
        _max: { createdAt: true },
      }),
      db.quote.groupBy({
        by: ["userId"],
        where: { status: "aprobada", ...filtroFecha },
        _count: true,
      }),
    ]);

    // Presupuestos especiales (tabla PedidoEspecialPresupuesto, keyed por
    // vendedorEmail). Se suman al ranking: cuenta como EMITIDO cada uno,
    // APROBADO/VERIFICADO cuenta como APROBADA, y el plan se deduce del
    // campo `plan`. Así los emitidos del PEDIDO ESPECIAL también figuran
    // en el CRM (ranking por usuario y total general).
    const [especialesTotales, especialesAprobados, especialesPorPlan] =
      await Promise.all([
        db.$queryRaw<Array<{ vendedorEmail: string; count: number; ultimo: Date }>>`
          SELECT "vendedorEmail", COUNT(*)::int as count, MAX("createdAt") as ultimo
          FROM "PedidoEspecialPresupuesto"
          WHERE 1=1 ${filtroFechaSql}
          GROUP BY "vendedorEmail"
        `,
        db.$queryRaw<Array<{ vendedorEmail: string; count: number }>>`
          SELECT "vendedorEmail", COUNT(*)::int as count
          FROM "PedidoEspecialPresupuesto"
          WHERE "estado" IN ('APROBADO', 'VERIFICADO') ${filtroFechaSql}
          GROUP BY "vendedorEmail"
        `,
        db.$queryRaw<
          Array<{ vendedorEmail: string; plan: string; count: number }>
        >`
          SELECT "vendedorEmail", "plan", COUNT(*)::int as count
          FROM "PedidoEspecialPresupuesto"
          WHERE 1=1 ${filtroFechaSql}
          GROUP BY "vendedorEmail", "plan"
        `,
      ]);

    // Mapa email (minúscula) → userId para unir especiales al ranking.
    // Solo usuarios que entran al CRM (CENTRAL ya quedó afuera).
    const emailToUserId = new Map<string, string>();
    for (const u of usersCrm) {
      emailToUserId.set(String(u.email || "").trim().toLowerCase(), u.id);
    }

    const totalPorUser = new Map<string, { total: number; ultimo: Date | null }>();
    for (const g of totales) {
      if (!g.userId) continue; // presupuestos sin usuario: no van al ranking por persona
      totalPorUser.set(g.userId, { total: g._count, ultimo: g._max.createdAt ?? null });
    }
    // Sumar especiales al total por usuario.
    for (const e of especialesTotales) {
      const uid = emailToUserId.get(String(e.vendedorEmail || "").trim().toLowerCase());
      if (!uid) continue;
      const prev = totalPorUser.get(uid) ?? { total: 0, ultimo: null };
      const ultimoNuevo = e.ultimo
        ? prev.ultimo
          ? prev.ultimo > e.ultimo
            ? prev.ultimo
            : e.ultimo
          : e.ultimo
        : prev.ultimo;
      totalPorUser.set(uid, { total: prev.total + Number(e.count), ultimo: ultimoNuevo });
    }

    const aprobadasPorUser = new Map<string, number>();
    for (const g of aprobadas) {
      if (!g.userId) continue;
      aprobadasPorUser.set(g.userId, g._count);
    }
    // Sumar especiales aprobados.
    for (const e of especialesAprobados) {
      const uid = emailToUserId.get(String(e.vendedorEmail || "").trim().toLowerCase());
      if (!uid) continue;
      aprobadasPorUser.set(uid, (aprobadasPorUser.get(uid) ?? 0) + Number(e.count));
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
    function planDeEspecial(plan: string): string {
      const p = (plan || "").toLowerCase();
      if (p === "contado") return "CONTADO";
      if (p === "mayorista") return "MAYORISTA";
      if (p === "safra") return "SAFRA";
      if (p === "cheque") return "CHEQUE";
      return "CUOTA"; // cuotas_con_entrega / cuotas_sin_entrega
    }
    // Desglose por TIPO DE PLAN. Task 170 (pedido del dueño): se agrega
    // "ESPECIAL" como filtro propio del CRM, con la cantidad de PEDIDOS
    // ESPECIALES emitidos por cada usuario en el período. Los pedidos siguen
    // sumando además a su plan de origen (CUOTA/CONTADO/etc.) y al total.
    const porPlanVacio = () => ({
      CUOTA: 0,
      CONTADO: 0,
      MAYORISTA: 0,
      SAFRA: 0,
      CHEQUE: 0,
      ESPECIAL: 0,
    });
    const quotesParaPlan = await db.quote.findMany({
      where: filtroFecha,
      select: { userId: true, quoteNumber: true, status: true },
    });
    const porPlanPorUser = new Map<string, Record<string, number>>();
    for (const q of quotesParaPlan) {
      if (!q.userId) continue;
      const rec = porPlanPorUser.get(q.userId) ?? porPlanVacio();
      rec[planDeQuote(q.quoteNumber, q.status)]++;
      porPlanPorUser.set(q.userId, rec);
    }
    // Sumar especiales al desglose por plan.
    for (const e of especialesPorPlan) {
      const uid = emailToUserId.get(String(e.vendedorEmail || "").trim().toLowerCase());
      if (!uid) continue;
      const rec = porPlanPorUser.get(uid) ?? porPlanVacio();
      rec[planDeEspecial(e.plan)] = (rec[planDeEspecial(e.plan)] ?? 0) + Number(e.count);
      porPlanPorUser.set(uid, rec);
    }
    // Filtro "PEDIDO ESPECIAL": cantidad total de pedidos especiales del
    // usuario en el período (independiente del plan elegido en cada pedido).
    for (const e of especialesTotales) {
      const uid = emailToUserId.get(String(e.vendedorEmail || "").trim().toLowerCase());
      if (!uid) continue;
      const rec = porPlanPorUser.get(uid) ?? porPlanVacio();
      rec.ESPECIAL = Number(e.count);
      porPlanPorUser.set(uid, rec);
    }

    const ranking = usersCrm
      .map((u) => {
        const t = totalPorUser.get(u.id);
        return {
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role,
          active: u.active,
          sucursal: sucursalDe(u.email),
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

    // ─── PEDIDOS ESPECIALES EN EL CRM (Task 113 v8, pedido del dueño) ───
    // "en el CRM tiene que salir también los PEDIDOS ESPECIALES que se
    // emitirán… de todos": admin/consulta ven TODOS; el encargado ve los
    // de SU sucursal (mismo alcance del ranking). NUNCA lanza.
    // Task 168: los pedidos de usuarios de CENTRAL tampoco se listan.
    // Task 170: si hay período, también se recortan por fecha (coherente con
    // todos los demás totales del CRM).
    const todosPedidosEspeciales = (
      await listarPresupuestosCrm({
        sucursal: sucursalEncargado || null,
      })
    ).filter((p) => {
      if (!hayPeriodo) return true;
      const t = new Date(p.createdAt).getTime();
      if (Number.isNaN(t)) return true;
      if (desdeFecha && t < desdeFecha.getTime()) return false;
      if (hastaFecha && t > hastaFecha.getTime()) return false;
      return true;
    });
    const pedidosEspeciales = todosPedidosEspeciales.filter(
      (p) => sucursalDe(p.vendedorEmail) !== "CENTRAL"
    );

    // ─── Vista PERSONAL (Task 169): COMÚN ve SOLO lo que él mismo emitió ───
    // Se recorta en el servidor: el cliente no recibe nombres, emails ni
    // totales de ningún otro usuario. Es la garantía de privacidad aunque
    // alguien llame la API a mano o fuerce la vista en el front.
    // La fila se arma con los datos del PROPIO usuario (aunque sea de
    // CENTRAL): así ve su conteo real, sin aparecer en el ranking general.
    if (esVistaPersonal) {
      const propio = users.find(
        (u) => String(u.email || "").trim().toLowerCase() === emailSesion
      );
      const tPropio = propio ? totalPorUser.get(propio.id) : undefined;
      const filaPropia = propio
        ? {
            id: propio.id,
            name: propio.name || propio.email,
            email: propio.email,
            role: propio.role,
            active: propio.active,
            sucursal: sucursalDe(propio.email),
            total: tPropio?.total ?? 0,
            aprobadas: aprobadasPorUser.get(propio.id) ?? 0,
            porPlan: porPlanPorUser.get(propio.id) ?? porPlanVacio(),
            ultimo: tPropio?.ultimo ? tPropio.ultimo.toISOString() : null,
          }
        : null;
      const pedidosPropios = todosPedidosEspeciales.filter(
        (p) => String(p.vendedorEmail || "").trim().toLowerCase() === emailSesion
      );
      return NextResponse.json({
        ranking: filaPropia ? [filaPropia] : [],
        sucursales: [],
        totalGeneral: filaPropia?.total ?? 0,
        pedidosEspeciales: pedidosPropios,
        modoPersonal: true,
      });
    }

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
        pedidosEspeciales,
      });
    }

    return NextResponse.json({
      ranking,
      // Task 137: la lista del CRM incluye CENTRAL para la ASIGNACIÓN de
      // usuarios (el select de la tabla). Task 168: CENTRAL no entra al
      // ranking ni al total, y el front lo saca de las pills de filtro.
      sucursales: SUCURSALES_USUARIO,
      // TOTAL EMITIDOS = presupuestos normales (quote) + pedidos especiales
      // de los usuarios que SÍ entran al CRM (Central queda afuera).
      totalGeneral: ranking.reduce((acc, r) => acc + r.total, 0),
      pedidosEspeciales,
    });
  } catch (error) {
    console.error("Error CRM ranking:", error);
    return NextResponse.json(
      { error: "Error al calcular el ranking del CRM" },
      { status: 500 }
    );
  }
}
