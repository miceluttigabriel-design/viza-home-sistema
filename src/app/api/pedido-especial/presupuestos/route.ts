// ─── PEDIDO ESPECIAL — HISTORIAL DE PRESUPUESTOS (Task 113 v3, pedido
// del dueño) ───
//
// "los encargados de sucursales quiero que ellos puedan ver el
//  historico de presupuestos de pedido especial generados… y la
//  situación de los mismos, si fue generado y si está como aprobado…
//  el vendedor va a tener una opción de marcar como aprobado".
//
// GET   → HISTORIAL según quién pregunta (Task 113 v6, pedido del dueño:
//         "el encargado de sucursal va poder ver de todas las sucursales
//         pero hay que crear un filtro nel historial para que el pueda
//         ver apenas en su sucursal también para facilitar"):
//           · admin / supremo_admin → TODOS
//           · encargado de sucursal (ENCARGADOS_SUCURSAL) → TODAS las
//             sucursales, con FILTRO opcional ?sucursal=KATUETE (la
//             pantalla arranca filtrada en la SUYA para facilitarle)
//           · cualquier otro → SOLO los propios (el filtro no aplica)
//         Cualquier usuario logueado (no es nada secreto).
//
// POST  → GUARDAR un presupuesto nuevo (queda GENERADO). El servidor
//         RECALCULA con los % de la Base y la tasa activa (no confía
//         en el cliente) y le da número ESPECIAL-XX. Los usuarios de
//         solo lectura (consulta) no pueden guardar.
//
// PUT   → ACCIONES sobre un presupuesto:
//           · { id, accion: "aprobar", idCtr } → GENERADO → APROBADO
//             (solo el vendedor que lo generó o un admin; el ID CTR es
//             obligatorio).
//           · { id, accion: "verificar" } → APROBADO → VERIFICADO
//             (solo el encargado de la sucursal o un admin — Task 113
//             v6: "primer el marca VERIFICADO OK y después que el tenga
//             la opción de generar orden de compra").
//         Sin accion se entiende "aprobar" (compatibilidad con la
//         pantalla ya desplegada).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import {
  listarPresupuestos,
  crearPresupuesto,
  aprobarPresupuesto,
  verificarPresupuesto,
  validarDatosPresupuesto,
} from "@/lib/pedido-especial-presupuestos";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    const esAdmin = role === "admin" || role === "supremo_admin";
    const email = (session.user?.email || "").trim().toLowerCase();
    // Encargado de sucursal (mismo criterio del CRM). Task 113 v6: ve
    // TODAS las sucursales; el FILTRO de sucursal es para facilitarle.
    const sucursalEncargado = esAdmin
      ? null
      : (ENCARGADOS_SUCURSAL[email] ?? null);
    const esEncargado = !!sucursalEncargado && !esAdmin;

    // Filtro ?sucursal=XXX (vacío/ausente = TODAS para quien puede ver
    // todo; para el vendedor la API lo ignora: solo ve lo propio).
    const url = new URL(req.url);
    const sucursalFiltro = String(url.searchParams.get("sucursal") || "").trim().slice(0, 80);

    const presupuestos = await listarPresupuestos({
      email,
      esAdmin,
      sucursalEncargado,
      sucursalFiltro,
    });

    return NextResponse.json({
      presupuestos,
      vista: esAdmin || esEncargado ? "TODAS" : "MIS",
      sucursal: sucursalEncargado,
    });
  } catch (error) {
    console.error("GET /api/pedido-especial/presupuestos:", error);
    // NUNCA rompe: historial vacío y la pantalla sigue funcionando.
    return NextResponse.json({ presupuestos: [], vista: "MIS", sucursal: null });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const email = (session.user?.email || "").trim().toLowerCase();
    if (esEmailSoloLectura(email)) {
      return NextResponse.json(
        { error: "Tu usuario es de solo consulta: no puede guardar presupuestos." },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => null);
    const datos = validarDatosPresupuesto(body);
    if (!datos) {
      return NextResponse.json(
        { error: "Faltan datos del pedido (proveedor, tipo, descripción, costo o plan)." },
        { status: 400 }
      );
    }
    const usuario = {
      id: String((session.user as any)?.id || ""),
      email,
      nombre: String((session.user as any)?.name || session.user?.name || ""),
    };
    const r = await crearPresupuesto(datos, usuario);
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ presupuesto: r.presupuesto }, { status: 201 });
  } catch (error) {
    console.error("POST /api/pedido-especial/presupuestos:", error);
    return NextResponse.json({ error: "No se pudo guardar el presupuesto." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    const esAdmin = role === "admin" || role === "supremo_admin";
    const email = (session.user?.email || "").trim().toLowerCase();
    const nombre = String((session.user as any)?.name || session.user?.name || "");
    const sucursalEncargado = esAdmin ? null : (ENCARGADOS_SUCURSAL[email] ?? null);
    const body = await req.json().catch(() => null);
    const id = String((body as any)?.id || "");
    const accion = String((body as any)?.accion || "aprobar").trim().toLowerCase();

    // MARCAR VERIFICADO (Task 113 v6): el encargado de la sucursal
    // (o admin) confirma el presupuesto APROBADO — paso previo a la
    // ORDEN DE COMPRA.
    if (accion === "verificar") {
      const r = await verificarPresupuesto(id, { email, nombre, esAdmin, sucursalEncargado });
      if (!r.ok) {
        return NextResponse.json({ error: r.error }, { status: r.status });
      }
      return NextResponse.json({ presupuesto: r.presupuesto });
    }

    // MARCAR APROBADO (Task 113 v5): el ID CTR viaja con la aprobación y
    // la API lo EXIGE (campo obligatorio — el n° de crédito que después
    // verifica el encargado de sucursal).
    const idCtr = String((body as any)?.idCtr || "");
    const r = await aprobarPresupuesto(id, { email, esAdmin }, idCtr);
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ presupuesto: r.presupuesto });
  } catch (error) {
    console.error("PUT /api/pedido-especial/presupuestos:", error);
    return NextResponse.json({ error: "No se pudo actualizar el presupuesto." }, { status: 500 });
  }
}
