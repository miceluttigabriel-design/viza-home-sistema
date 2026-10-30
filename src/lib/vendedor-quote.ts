// ─── DATOS DEL VENDEDOR QUE EMITE EL PRESUPUESTO (Task 102, pedido del dueño) ───
// "necesito que salga el nombre del vendedor completo en el presupuesto con
//  la sucursal de él también ok y su número de teléfono, algo bien bonito,
//  no tan grande, bien ubicado, en todos los presupuestos"
//
// Fuente de cada dato (solo lectura, NADA se guarda ni se pide al usuario):
//   · NOMBRE   → User.name de la cuenta que emite (sesión NextAuth). Si la
//                cuenta no tiene nombre guardado, se muestra el email.
//   · SUCURSAL → tabla UsuarioSucursal (la misma del CRM, que el admin puede
//                cambiar a mano); si el usuario todavía no tiene fila, cae al
//                mapa de la planilla oficial FUN.VIZA (coincidencia por email).
//   · TELÉFONO → planilla FUN.VIZA, columna CONTACTO (lib fun-viza-contactos,
//                Task 101 — la misma fuente del número que se ve en el GDA).
//
// Best-effort y a prueba de todo: si la base no responde o el dato no
// existe, el campo simplemente queda vacío y el PDF lo omite. Jamás rompe
// la generación del presupuesto.
import { leerMapaSucursales, MAPA_SUCURSAL_EXCEL } from "@/lib/sucursal-usuario";
import { contactoDe } from "@/lib/fun-viza-contactos";

export interface DatosVendedor {
  email: string;
  nombre: string;
  sucursal: string;
  telefono: string;
}

// Acepta la sesión de NextAuth de forma estructural (sin importar tipos de
// next-auth acá): lo que se usa es user.email y user.name.
export async function datosVendedorDeSesion(
  session: { user?: { email?: string | null; name?: string | null } | null } | null
): Promise<DatosVendedor> {
  const email = ((session?.user?.email as string) || "").trim().toLowerCase();
  const nombreSesion = ((session?.user?.name as string) || "").trim();

  // Sucursal: primero la asignación guardada (editable por el admin en el
  // CRM), después la planilla FUN.VIZA. Si nada coincide, queda vacía.
  let sucursal = "";
  if (email) {
    try {
      const mapa = await leerMapaSucursales(); // best-effort, nunca tira
      sucursal = mapa.get(email) || "";
    } catch {
      // base caída / tabla ausente: seguir con el mapa de la planilla
    }
    if (!sucursal) sucursal = MAPA_SUCURSAL_EXCEL[email] || "";
  }

  return {
    email,
    // Sin nombre guardado se muestra el email (que siempre existe en sesión).
    nombre: nombreSesion || email,
    sucursal,
    telefono: email ? contactoDe(email) : "",
  };
}
