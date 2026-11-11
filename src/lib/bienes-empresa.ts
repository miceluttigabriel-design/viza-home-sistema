// ═══════════════════════════════════════════════════════════════════════════
// BIENES DE USO DE LA EMPRESA (pedido del dueño)
//
// Hay PROVEEDORES cuyos productos NO son mercadería para la venta: son
// vehículos / bienes de uso interno de la empresa (ej. AUTOMOTOR S.A.).
//
// Regla única, usada por el ENCARGADO DE COMPRA y por STOCK GENERAL:
//   · Encargado de Compra → NO los considera (no se compran).
//   · Stock General      → se ven APARTE, en su propio detalle, para no
//                          mezclarlos con el inventario de venta.
//
// La comparación ignora mayúsculas, puntos y espacios, así "AUTOMOTOR S.A.",
// "AUTOMOTOR SA" y "AUTOMOTOR S.A" son el mismo proveedor.
// ═══════════════════════════════════════════════════════════════════════════

export const PROVEEDORES_BIENES_EMPRESA = ["AUTOMOTOR S.A."] as const;

const normalizar = (v: unknown): string =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// true = el PROVEEDOR (Product.fabricante) es de bienes de uso de la empresa.
// Se aceptan las variantes reales del proveedor: "AUTOMOTOR", "AUTOMOTOR SA",
// "AUTOMOTOR S.A.", "AUTOMOTOR S.A. USADOS"… pero NO "AUTOMOTORS ..." (otro
// proveedor distinto). Por eso se comparan prefijos completos, no cualquier
// texto que empiece con "AUTOMOTOR".
export function esBienDeEmpresa(fabricante?: string | null): boolean {
  const f = normalizar(fabricante);
  if (!f) return false;
  return PROVEEDORES_BIENES_EMPRESA.some((p) => {
    const n = normalizar(p);
    if (!n) return false;
    return f === "AUTOMOTOR" || f === n || f.startsWith(n);
  });
}

// Condición Prisma para buscar los productos de esos proveedores.
// Se usa `contains` con las variantes para tolerar "AUTOMOTOR S.A." /
// "AUTOMOTOR SA" sin usar funciones SQL que no existen en todos los motores.
export function condicionPrismaBienesEmpresa(): Record<string, unknown> {
  return {
    OR: [
      { fabricante: { contains: "AUTOMOTOR S.A", mode: "insensitive" } },
      { fabricante: { contains: "AUTOMOTOR SA", mode: "insensitive" } },
      { fabricante: { equals: "AUTOMOTOR", mode: "insensitive" } },
    ],
  };
}
