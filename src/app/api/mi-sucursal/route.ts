import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerMapaSucursales } from "@/lib/sucursal-usuario";
import { ENCARGADOS_SUCURSAL } from "@/lib/encargados-sucursal";

// GET /api/mi-sucursal (Task 104, pedido del dueño)
// Devuelve la sucursal del USUARIO LOGUEADO para resaltar en verde el
// cuadrito de SU sucursal en el buscador del panel de ventas.
//   · Fuente 1: tabla aparte UsuarioSucursal (la siembra FUN.VIZA + los
//     ajustes del admin en el CRM) vía leerMapaSucursales().
//   · Fuente 2 (respaldo): lista estática ENCARGADOS_SUCURSAL.
// SOLO LECTURA, sin efectos: sin sesión o sin sucursal → { sucursal: "" } y
// el buscador simplemente pinta los cuadritos sin resaltar a ninguno.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ sucursal: "" });
    }
    const email = ((session.user as { email?: string | null })?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return NextResponse.json({ sucursal: "" });
    }
    const mapa = await leerMapaSucursales();
    const sucursal = mapa.get(email) || ENCARGADOS_SUCURSAL[email] || "";
    return NextResponse.json({ sucursal });
  } catch {
    // Best-effort: sin sucursal el buscador funciona igual que siempre
    return NextResponse.json({ sucursal: "" });
  }
}
