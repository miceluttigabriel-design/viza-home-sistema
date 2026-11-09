import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
// SUCURSAL por usuario (GDA: tabla dividida por sucursal, pedido del dueño).
// Lee la tabla aparte "UsuarioSucursal" (la misma del CRM). Best-effort:
// si la tabla todavía no existe o la BD falla, devuelve el mapa vacío y
// todos los usuarios quedan con sucursal "" ("SIN SUCURSAL" en el GDA).
import {
  leerMapaSucursales,
  sembrarDesdeExcel,
  migrarCentralKatuete,
  migrarCentral,
  asignarSucursal,
  SUCURSALES_USUARIO,
} from "@/lib/sucursal-usuario";
// Task 141 (pedido del dueño): número de CONTACTO editable desde el GDA.
// La planilla FUN.VIZA sigue siendo el respaldo; lo que el dueño guarda en
// el GDA pisa a la planilla solo para ese email. Tabla aparte, best-effort.
import { contactoDe } from "@/lib/fun-viza-contactos";
import { leerMapaContactos } from "@/lib/usuario-contacto";

// GET /api/admin/usuarios
// Solo el SUPREMO_ADMIN puede listar todos los usuarios con sus contraseñas (de la bitácora)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== "supremo_admin") {
      return NextResponse.json({ error: "Acceso denegado. Solo SUPREMO_ADMIN." }, { status: 403 });
    }

    const usuarios = await db.user.findMany({
      orderBy: [{ role: "desc" }, { email: "asc" }],
    });

    // Mapa email → sucursal (tabla UsuarioSucursal). Nunca tira: internamente
    // crea la tabla si falta y degrada a mapa vacío si algo falla.
    // MISMO patrón del CRM (/api/crm/ranking): 1) migrar valores viejos
    // ("CENTRAL/KATUETE" → "KATUETE"), 1b) Task 137: mover a CENTRAL los
    // usuarios de la oficina central que el dueño pasó (estaban en KATUETE),
    // 2) sembrar SOLO los usuarios que aún no tienen asignación (jamás
    // sobrescribe lo que el admin cambió a mano en el CRM), 3) releer el
    // mapa. Todo best-effort e idempotente.
    await migrarCentralKatuete();
    await migrarCentral();

    let mapaSucursales = await leerMapaSucursales();
    const sinSucursal = usuarios.filter(
      (u) => !mapaSucursales.has(u.email.trim().toLowerCase())
    );
    if (sinSucursal.length > 0) {
      await sembrarDesdeExcel(sinSucursal.map((u) => u.email));
      mapaSucursales = await leerMapaSucursales();
    }

    // Task 141: números editados/agregados desde el GDA. Si un email no
    // tiene fila acá, se usa el número original de la planilla FUN.VIZA.
    const mapaContactos = await leerMapaContactos();

    const resultado = await Promise.all(
      usuarios.map(async (u) => {
        const ultimoLog = await db.passwordLog.findFirst({
          where: { userId: u.id },
          orderBy: { fechaCambio: "desc" },
        });
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          active: u.active,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          contrasenaActual: ultimoLog?.contrasenaTextoPlano || "(no registrado)",
          fechaUltimoCambio: ultimoLog?.fechaCambio || null,
          cambiadoPor: ultimoLog?.cambiadoPor || null,
          // Sucursal asignada (CRM / planilla FUN.VIZA). "" = SIN SUCURSAL.
          sucursal: mapaSucursales.get(u.email.trim().toLowerCase()) || "",
          // Contacto editable desde el GDA (Task 141). Prioridad:
          // 1) número guardado desde el GDA, 2) planilla FUN.VIZA.
          contacto:
            mapaContactos.get(u.email.trim().toLowerCase()) || contactoDe(u.email),
        };
      })
    );

    return NextResponse.json({ usuarios: resultado, total: resultado.length });
  } catch (err: any) {
    console.error("[/api/admin/usuarios] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// POST /api/admin/usuarios
// Crear un nuevo usuario (solo SUPREMO_ADMIN)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== "supremo_admin") {
      return NextResponse.json({ error: "Acceso denegado. Solo SUPREMO_ADMIN." }, { status: 403 });
    }

    const body = await req.json();
    const { email, name, password, role: newRole, sucursal } = body as {
      email: string;
      name?: string;
      password: string;
      role?: string;
      sucursal?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son obligatorios" }, { status: 400 });
    }
    const finalRole = (newRole === "supremo_admin" || newRole === "admin" || newRole === "colaborador")
      ? newRole
      : "colaborador";

    // Task 138 (pedido del dueño): el CREAR USUARIO del GDA ahora elige la
    // SUCURSAL — "para que no quede usuario sin sucursal". Si viene, tiene
    // que ser una de las válidas (CENTRAL + las 4 de venta); si viene vacía
    // o ausente se crea igual (el admin la asigna después desde el CRM).
    const sucursalNueva = typeof sucursal === "string" ? sucursal.trim().toUpperCase() : "";
    if (sucursalNueva && !(SUCURSALES_USUARIO as readonly string[]).includes(sucursalNueva)) {
      return NextResponse.json({ error: "Sucursal no válida" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const created = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name || email,
        password: hashed,
        role: finalRole,
        active: true,
      },
    });

    await db.passwordLog.create({
      data: {
        userId: created.id,
        email: created.email,
        contrasenaTextoPlano: password,
        cambiadoPor: "SUPREMO_ADMIN",
      },
    });

    // Task 138: asignar la sucursal elegida (best-effort: la tabla aparte
    // UsuarioSucursal se crea sola; si falla el usuario queda creado igual
    // y el front avisa).
    let sucursalAsignada = false;
    if (sucursalNueva) {
      sucursalAsignada = await asignarSucursal(created.email, sucursalNueva);
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      email: created.email,
      sucursal: sucursalNueva || null,
      sucursalAsignada,
    });
  } catch (err: any) {
    console.error("[/api/admin/usuarios POST] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
