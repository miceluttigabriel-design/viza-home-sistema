// ─── PEDIDO ESPECIAL — HISTORIAL DE PRESUPUESTOS (Task 113 v3, pedido
// del dueño) ───
//
// "los encargados de sucursales quiero que ellos puedan ver el
//  historico de presupuestos de pedido especial generados… y la
//  situación de los mismos, si fue generado y si está como aprobado…
//  el vendedor va a tener una opción de marcar como aprobado".
//
// GET   → HISTORIAL según quién pregunta:
//           · admin / supremo_admin → TODOS
//           · encargado de sucursal (ENCARGADOS_SUCURSAL) → los de SU
//             sucursal (+ los propios), SOLO LECTURA
//           · cualquier otro → SOLO los propios
//         Cualquier usuario logueado (no es nada secreto: el vendedor
//         ve el suyo, el encargado el de su sucursal).
//
// POST  → GUARDAR un presupuesto nuevo (queda GENERADO). El servidor
//         RECALCULA con los % de la Base y la tasa activa (no confía
//         en el cliente) y le da número ESPECIAL-XX. Los usuarios de
//         solo lectura (consulta) no pueden guardar.
//
// PUT   → MARCAR COMO APROBADO (GENERADO → APROBADO). Solo el
//         VENDEDOR que lo generó o un admin; el encargado solo lo VE
//         aprobado (tal cual pidió el dueño).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";
import { esEmailSoloLectura } from "@/lib/usuarios-consulta";
import {
  listarPresupuestos,
  crearPresupuesto,
  aprobarPresupuesto,
  validarDatosPresupuesto,
} from "@/lib/pedido-especial-presupuestos";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    const esAdmin = role === "admin" || role === "supremo_admin";
    const email = (session.user?.email || "").trim().toLowerCase();
    // Encargado de sucursal (mismo criterio del CRM): ve el historial de
    // SU sucursal. Los admins ya ven todo.
    const sucursalEncargado = esAdmin
      ? null
      : (ENCARGADOS_SUCURSAL[email] ?? null);
    const esEncargado = !!sucursalEncargado && !esAdmin;

    const presupuestos = await listarPresupuestos({ email, esAdmin, sucursalEncargado });

    return NextResponse.json({
      presupuestos,
      vista: esAdmin ? "TODAS" : esEncargado ? "SUCURSAL" : "MIS",
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
    const body = await req.json().catch(() => null);
    const id = String((body as any)?.id || "");
    // Task 113 v5 (pedido del dueño): el ID CTR viaja con la aprobación y
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
