// ─── CONTACTO EDITABLE POR USUARIO (GDA → PRESUPUESTOS) ─────────────────────
// Pedido del dueño: desde el GDA poder MODIFICAR el número de contacto de
// cada usuario (el mismo que sale en la franja del vendedor en TODOS los
// presupuestos) y también AGREGAR el número a los usuarios que todavía no
// tienen uno en la planilla FUN.VIZA.
//
// La planilla FUN.VIZA (src/lib/fun-viza-contactos.ts) sigue siendo la
// fuente INICIAL y el respaldo de siempre. Lo que el dueño edita desde el
// GDA se guarda en la tabla APARTE "UsuarioContacto" y PISA a la planilla
// solo para ese email. Si el número se borra desde el GDA, la fila se
// elimina y vuelve a mostrarse el número original de la planilla.
//
// TABLA AUTO-GESTIONADA (misma lección de CostoEditado / UsuarioSucursal):
// se crea SOLA la primera vez con SQL idempotente, sin necesidad de correr
// `prisma db push` ni ninguna migración. El modelo User queda EXACTAMENTE
// igual que siempre, así que ninguna consulta existente puede romperse. Si
// algo falla (permisos, BD caída), todas las funciones degradan en silencio
// y el sistema sigue mostrando los números de la planilla como antes.
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// Crea la tabla si no existe. SOLO agrega una tabla nueva: jamás toca datos
// existentes. Usa nombres compatibles con PostgreSQL y SQLite.
export async function ensureTablaUsuarioContacto(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "UsuarioContacto" (
         "id" TEXT NOT NULL,
         "userEmail" TEXT NOT NULL,
         "telefono" TEXT NOT NULL DEFAULT '',
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL,
         CONSTRAINT "UsuarioContacto_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UsuarioContacto_userEmail_key"
         ON "UsuarioContacto"("userEmail")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: mapa email → teléfono guardado desde el GDA ───
// Best-effort: si la tabla no existe todavía se crea sola y se reintenta
// una vez; si aun así falla, devuelve un mapa vacío y el sistema usa la
// planilla FUN.VIZA como siempre.
export async function leerMapaContactos(): Promise<Map<string, string>> {
  const intentar = async (): Promise<Map<string, string>> => {
    const filas = await db.$queryRaw<Array<{ userEmail: string; telefono: string }>>`
      SELECT "userEmail", "telefono" FROM "UsuarioContacto"
    `;
    const mapa = new Map<string, string>();
    for (const f of filas) {
      const email = (f.userEmail || "").trim().toLowerCase();
      const tel = (f.telefono || "").trim();
      if (email && tel) mapa.set(email, tel);
    }
    return mapa;
  };
  // Nos aseguramos de que la tabla exista ANTES de consultar: así la primera
  // lectura en una base nueva la crea sola (sin `prisma db push`). Si no se
  // pudo crear, degradamos al mapa vacío y manda la planilla FUN.VIZA.
  if (!(await ensureTablaUsuarioContacto())) return new Map();
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: guardar (o quitar con "") el número de UN usuario ───
// Clave = email en minúscula. Devuelve false si no se pudo guardar (el
// front muestra el error, nada más se rompe).
export async function asignarContacto(
  userEmail: string,
  telefono: string
): Promise<boolean> {
  const email = (userEmail || "").trim().toLowerCase();
  if (!email) return false;
  const valor = (telefono || "").trim();
  const intentar = async (): Promise<void> => {
    if (!valor) {
      // Número vacío = quitar la edición y volver al número de la planilla.
      await db.$executeRaw`
        DELETE FROM "UsuarioContacto" WHERE "userEmail" = ${email}
      `;
      return;
    }
    await db.$executeRaw`
      INSERT INTO "UsuarioContacto"
        ("id", "userEmail", "telefono", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${email}, ${valor}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userEmail") DO UPDATE SET
        "telefono" = ${valor},
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  };
  if (!(await ensureTablaUsuarioContacto())) return false;
  try {
    await intentar();
    return true;
  } catch {
    return false;
  }
}

// ─── Limpieza al ELIMINAR un usuario ───
// Borra la fila de contacto (si existe) para no dejar datos huérfanos.
// Best-effort: nunca frena la eliminación del usuario.
export async function borrarContactoDeUsuario(userEmail: string): Promise<void> {
  const email = (userEmail || "").trim().toLowerCase();
  if (!email) return;
  try {
    await db.$executeRaw`
      DELETE FROM "UsuarioContacto" WHERE "userEmail" = ${email}
    `;
  } catch {
    // tabla ausente / BD caída: no hay nada que limpiar
  }
}
