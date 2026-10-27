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
} from "@/lib/sucursal-usuario";

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
    // ("CENTRAL/KATUETE" → "KATUETE"), 2) sembrar SOLO los usuarios que aún
    // no tienen asignación (jamás sobrescribe lo que el admin cambió a mano
    // en el CRM), 3) releer el mapa. Todo best-effort e idempotente.
    await migrarCentralKatuete();

    let mapaSucursales = await leerMapaSucursales();
    const sinSucursal = usuarios.filter(
      (u) => !mapaSucursales.has(u.email.trim().toLowerCase())
    );
    if (sinSucursal.length > 0) {
      await sembrarDesdeExcel(sinSucursal.map((u) => u.email));
      mapaSucursales = await leerMapaSucursales();
    }

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
    const { email, name, password, role: newRole } = body as {
      email: string;
      name?: string;
      password: string;
      role?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son obligatorios" }, { status: 400 });
    }
    const finalRole = (newRole === "supremo_admin" || newRole === "admin" || newRole === "colaborador")
      ? newRole
      : "colaborador";

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

    return NextResponse.json({ ok: true, id: created.id, email: created.email });
  } catch (err: any) {
    console.error("[/api/admin/usuarios POST] Error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
