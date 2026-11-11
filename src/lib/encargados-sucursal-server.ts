// ─── SUCURSAL DEL ENCARGADO (servidor) ──────────────────────────────────────
// Task 165 (pedido del dueño): el TIPO "ESPECIAL" ahora también puede
// promoverse desde el GDA (User.role = "especial"). Para los encargados de
// siempre la sucursal sale de la lista fija ENCARGADOS_SUCURSAL; para los
// promovidos desde el GDA sale de la tabla UsuarioSucursal (la MISMA que ya
// usa el CRM y el GDA para asignar la sucursal del usuario).
//
// Este archivo es SOLO SERVIDOR (lee la base con Prisma vía
// leerMapaSucursales). Los componentes de cliente siguen usando la lista
// estática de src/lib/encargados-sucursal.ts.
import { ENCARGADOS_SUCURSAL } from "./encargados-sucursal";
import { leerMapaSucursales } from "./sucursal-usuario";

export async function sucursalEncargadoDe(
  email: string | null | undefined,
  role: string | null | undefined
): Promise<string | null> {
  const e = (email || "").trim().toLowerCase();
  if (!e) return null;

  // 1) Encargados de siempre: lista fija (no toca la base).
  const fija = ENCARGADOS_SUCURSAL[e];
  if (fija) return fija;

  // 2) Promovidos a ESPECIAL desde el GDA: su sucursal asignada.
  if (role === "especial") {
    try {
      const mapa = await leerMapaSucursales();
      const s = mapa.get(e);
      return s && s.trim() ? s : null;
    } catch {
      // Best-effort: sin tabla/BD caída se comporta como sin sucursal.
      return null;
    }
  }

  return null;
}
