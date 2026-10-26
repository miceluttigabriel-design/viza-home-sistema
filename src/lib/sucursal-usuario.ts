// ─── SUCURSALES DE VIZA PARA EL CRM (ranking por usuario) ───
// El CRM muestra el ranking de presupuestos emitidos por usuario, GENERAL
// y POR SUCURSAL. Cada usuario pertenece a una sucursal que:
//   1) se siembra AUTOMÁTICAMENTE desde la planilla oficial de funcionarios
//      (FUN.VIZA: coincidiendo el EMAIL del usuario con el CORREO de la
//      planilla), y
//   2) el admin puede cambiar a mano en cualquier momento con el select del
//      panel CRM (PUT /api/crm/sucursal).
//
// Se guarda en la tabla APARTE "UsuarioSucursal" (una fila por usuario).
// Los modelos User, Quote y Product quedan EXACTAMENTE iguales que siempre.
//
// TABLA AUTO-GESTIONADA (misma lección de CostoEditado): si la tabla todavía
// no existe en la base (por ejemplo porque nunca se corrió `npx prisma db
// push`), la PRIMERA operación que la usa la crea SOLA con SQL idempotente
// (CREATE TABLE / CREATE INDEX IF NOT EXISTS). Así el CRM se activa solo,
// sin pasos manuales ni órdenes de pasos. Y NUNCA rompe la app: si algo
// falla, todas las funciones devuelven el mismo resultado que antes de
// existir esta funcionalidad (todos "SIN SUCURSAL") y el ranking sigue
// funcionando con los datos reales de presupuestos.
import { db } from "@/lib/db";

// Sucursales oficiales de VIZA (de la planilla de funcionarios FUN.VIZA).
// El orden es el que se muestra en los filtros del CRM.
// ("CENTRAL/KATUETE" dejó de existir como filtro del CRM: la oficina central
//  pasa a trabajar dentro de "KATUETE", que ya existe como sucursal propia.)
export const SUCURSALES_VIZA = [
  "KATUETE",
  "LA PALOMA",
  "NUEVA ESPERANZA",
  "SALTOS DEL GUAIRA",
] as const;

// Mapa email → sucursal sacado de la planilla oficial de funcionarios
// (hoja FUN.VIZA, columnas SUCURSAL y CORREO). Solo se usa para SEMBRAR la
// asignación automática la primera vez; después manda lo guardado en la
// base (que el admin puede editar a mano). Emails en minúscula.
export const MAPA_SUCURSAL_EXCEL: Record<string, string> = {
  // CENTRAL (oficina central de VIZA, ahora dentro de KATUETE)
  "viza@viza.com.py": "KATUETE",
  "juliane@viza.com.py": "KATUETE",
  "larazago@viza.com.py": "KATUETE",
  "juliozago@viza.com.py": "KATUETE",
  "filipe.campos@viza.com.py": "KATUETE",
  "julianamoleiro@viza.com.py": "KATUETE",
  "baltazar@viza.com.py": "KATUETE",
  "contabilidad@viza.com.py": "KATUETE",
  "sac@viza.com.py": "KATUETE",
  "rrhh@viza.com.py": "KATUETE",
  "auditoria.stock@viza.com.py": "KATUETE",
  "auditoria@viza.com.py": "KATUETE",
  "documentos@viza.com.py": "KATUETE",
  "viza.marketing@viza.com.py": "KATUETE",
  "viza.artes@viza.com.py": "KATUETE",
  "viza.web@viza.com.py": "KATUETE",
  "ventas.online@viza.com.py": "KATUETE",
  "factura@viza.com.py": "KATUETE",
  "sercom@viza.com.py": "KATUETE",
  "viza.cobranza@viza.com.py": "KATUETE",
  "credito@viza.com.py": "KATUETE",
  "credito1@viza.com.py": "KATUETE",
  // KATUETE
  // cobranza.katuete@viza.com.py sale de KATUETE (pedido del admin): no se
  // siembra más y la migración de abajo le borra la asignación guardada.
  "jeyson@viza.com.py": "KATUETE",
  "caja.katuete@viza.com.py": "KATUETE",
  "fact.katuete@viza.com.py": "KATUETE",
  "deposito.katuete@viza.com.py": "KATUETE",
  "ventas.rafael@viza.com.py": "KATUETE",
  "ventas.carla@viza.com.py": "KATUETE",
  "ventas.emmanuel@viza.com.py": "KATUETE",
  "ventas.paola@viza.com.py": "KATUETE",
  "ventas.richard@viza.com.py": "KATUETE",
  // LA PALOMA
  "antonio.fagner@viza.com.py": "LA PALOMA",
  "caja.paloma@viza.com.py": "LA PALOMA",
  "fac.paloma@viza.com.py": "LA PALOMA",
  "cobranza.paloma@viza.com.py": "LA PALOMA",
  "deposito.paloma@viza.com.py": "LA PALOMA",
  "ventas.alvaliz@viza.com.py": "LA PALOMA",
  "ventas.camila@viza.com.py": "LA PALOMA",
  "ventas.giceli@viza.com.py": "LA PALOMA",
  "venta.ana@viza.com.py": "LA PALOMA",
  "ventas.victor@viza.com.py": "LA PALOMA",
  "viza.redes@viza.com.py": "LA PALOMA",
  // NUEVA ESPERANZA
  "danwillian@viza.com.py": "NUEVA ESPERANZA",
  "caja.ne@viza.com.py": "NUEVA ESPERANZA",
  "fac.ne@viza.com.py": "NUEVA ESPERANZA",
  "cobranza.ne@viza.com.py": "NUEVA ESPERANZA",
  "deposito.ne@viza.com.py": "NUEVA ESPERANZA",
  "ventas.madelin@viza.com.py": "NUEVA ESPERANZA",
  "ventas.adriano@viza.com.py": "NUEVA ESPERANZA",
  "ventas.michael@viza.com.py": "NUEVA ESPERANZA",
  "ventas.nueva@viza.com.py": "NUEVA ESPERANZA",
  // SALTOS DEL GUAIRA
  "librado@viza.com.py": "SALTOS DEL GUAIRA",
  "caja.saltos@viza.com.py": "SALTOS DEL GUAIRA",
  "fac.saltos@viza.com.py": "SALTOS DEL GUAIRA",
  "cobranza.saltos@viza.com.py": "SALTOS DEL GUAIRA",
  "deposito.saltos@viza.com.py": "SALTOS DEL GUAIRA",
  "ventas.rolando@viza.com.py": "SALTOS DEL GUAIRA",
  "ventas.hector@viza.com.py": "SALTOS DEL GUAIRA",
  "ventas.gustavo@viza.com.py": "SALTOS DEL GUAIRA",
  "ventas.yessica@viza.com.py": "SALTOS DEL GUAIRA",
};

// Estado por instancia de serverless (evita repetir el DDL en cada request).
// "lista" = tabla verificada/creada en esta instancia.
// "sinDDL" = no se pudo crear (sin permisos u otro motivo) → no reintentar.
let estadoTabla: "desconocida" | "lista" | "sinDDL" = "desconocida";

// La siembra automática se intenta UNA sola vez por instancia: si la BD no
// está lista o no hay coincidencias, no se vuelve a molestar.
let sembrado = false;

// Prisma avisa con P2021/P2022 cuando la tabla/columna todavía no existe.
const esErrorTablaFaltante = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

// Crea la tabla si no existe. Idempotente e inofensiva: SOLO agrega una
// tabla nueva, jamás toca datos existentes. Usa los mismos nombres de
// tabla/columna/índice que generaría `npx prisma db push` con el schema del
// repo, así que correr el db push después no ve ninguna diferencia.
export async function ensureTablaUsuarioSucursal(): Promise<boolean> {
  if (estadoTabla === "lista") return true;
  if (estadoTabla === "sinDDL") return false;
  try {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "UsuarioSucursal" (
         "id" TEXT NOT NULL,
         "userEmail" TEXT NOT NULL,
         "sucursal" TEXT NOT NULL,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL,
         CONSTRAINT "UsuarioSucursal_pkey" PRIMARY KEY ("id")
       )`
    );
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UsuarioSucursal_userEmail_key"
         ON "UsuarioSucursal"("userEmail")`
    );
    estadoTabla = "lista";
    return true;
  } catch {
    estadoTabla = "sinDDL";
    return false;
  }
}

// ─── Lectura: mapa email → sucursal (best-effort) ───
// Si la tabla no existe todavía → se crea sola y se reintenta una vez; si
// aun así falla, devuelve el mapa vacío (todos "SIN SUCURSAL") y el
// ranking sigue funcionando con los datos reales de presupuestos.
export async function leerMapaSucursales(): Promise<Map<string, string>> {
  const intentar = async (): Promise<Map<string, string>> => {
    const filas = await db.usuarioSucursal.findMany({
      select: { userEmail: true, sucursal: true },
    });
    const mapa = new Map<string, string>();
    for (const f of filas) mapa.set(f.userEmail.trim().toLowerCase(), f.sucursal);
    return mapa;
  };
  try {
    return await intentar();
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return new Map();
    if (!(await ensureTablaUsuarioSucursal())) return new Map();
  }
  try {
    return await intentar();
  } catch {
    return new Map();
  }
}

// ─── Escritura: asignar (o quitar con "") la sucursal de UN usuario ───
// Si la tabla no existe todavía → se crea sola y se reintenta una vez.
// Si aun así falla, devuelve false (el front muestra el error, nada más
// se rompe). Clave = email en minúscula.
export async function asignarSucursal(
  userEmail: string,
  sucursal: string
): Promise<boolean> {
  const email = userEmail.trim().toLowerCase();
  if (!email) return false;
  const intentar = async (): Promise<void> => {
    if (!sucursal) {
      // Sucursal vacía = quitar la asignación (queda "SIN SUCURSAL")
      await db.usuarioSucursal.deleteMany({ where: { userEmail: email } });
      return;
    }
    await db.usuarioSucursal.upsert({
      where: { userEmail: email },
      create: { userEmail: email, sucursal },
      update: { sucursal },
    });
  };
  try {
    await intentar();
    return true;
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return false;
    if (!(await ensureTablaUsuarioSucursal())) return false;
  }
  try {
    await intentar();
    return true;
  } catch {
    return false;
  }
}

// ─── Siembra automática desde la planilla de funcionarios ───
// Recibe los emails de usuarios que AÚN no tienen sucursal asignada y les
// asigna la de la planilla FUN.VIZA cuando hay coincidencia por email.
// Best-effort: se intenta UNA sola vez por instancia; si algo falla, los
// usuarios simplemente quedan "SIN SUCURSAL" y el admin los asigna a mano.
export async function sembrarDesdeExcel(emails: string[]): Promise<void> {
  if (sembrado) return;
  const candidatos = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && MAPA_SUCURSAL_EXCEL[e]);
  sembrado = true; // aunque falle no se reintenta en esta instancia
  if (candidatos.length === 0) return;
  for (const email of candidatos) {
    const ok = await asignarSucursal(email, MAPA_SUCURSAL_EXCEL[email]);
    if (!ok) return; // sin tabla/BD caída: degradar sin ruido
  }
}

// ─── Migración puntual pedida por el admin (ajuste del CRM) ───
// 1) "CENTRAL/KATUETE" dejó de existir como filtro del CRM: los usuarios que
//    estaban asignados ahí pasan automáticamente a "KATUETE" (la oficina
//    central trabaja con la sucursal de Katuete, que ya existía).
// 2) cobranza.katuete@viza.com.py sale de KATUETE: se borra su asignación
//    guardada (queda sin sucursal y solo se ve en el ranking GENERAL).
//
// Idempotente y best-effort, mismo estilo de siempre: se intenta UNA sola
// vez por instancia; si la tabla todavía no existe se crea sola y se
// reintenta; si aun así falla, se degrada en silencio. Escribe SOLO en la
// tabla aparte "UsuarioSucursal": NUNCA toca User, Quote ni Product.
let migrado = false;

export async function migrarCentralKatuete(): Promise<void> {
  if (migrado) return;
  migrado = true; // aunque falle no se reintenta en esta instancia
  const intentar = async (): Promise<void> => {
    // Todos los "CENTRAL/KATUETE" pasan a "KATUETE" (1 sola instrucción).
    await db.usuarioSucursal.updateMany({
      where: { sucursal: "CENTRAL/KATUETE" },
      data: { sucursal: "KATUETE" },
    });
    // cobranza.katuete fuera de KATUETE (borrar la fila = quedar sin sucursal).
    await db.usuarioSucursal.deleteMany({
      where: { userEmail: "cobranza.katuete@viza.com.py" },
    });
  };
  try {
    await intentar();
    return;
  } catch (error) {
    if (!esErrorTablaFaltante(error)) return;
    if (!(await ensureTablaUsuarioSucursal())) return;
  }
  try {
    await intentar();
  } catch {
    // sin tabla / BD caída: degradar en silencio, el ranking sigue igual
  }
}
