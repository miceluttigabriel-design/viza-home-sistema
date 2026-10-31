import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { leerUltimaImportacionStock } from "@/lib/stock-import-log";

// GET /api/stock-import-info (Task 105, pedido del dueño)
// "cada vez que yo suba el excel para actualizar stock y agregar nuevos
//  productos seria importante que lo equipo tenga esto informado en su
//  panel... cantidad de productos nuevos agregados y horario de
//  actualizacion de stock".
//
// Devuelve la ÚLTIMA importación de stock registrada para el mini cuadrito
// del panel de ventas (header, lado izquierdo):
//   { ultima: { fecha: "2026-10-31T17:35:00.000Z", nuevos: 12,
//               actualizados: 640, usuarioEmail: "..." } }
//   · Sin sesión                    → { ultima: null }
//   · Nunca se importó (o la tabla  → { ultima: null } (el cuadrito muestra
//     todavía no existe)              "sin registros" y nada más cambia)
//
// SOLO LECTURA, sin efectos: no escribe nada, no toca la base salvo el
// CREATE TABLE IF NOT EXISTS auto-gestionado de la lib (mismo patrón del
// Task 98). El registro lo escribe import-stock/apply al aplicar la
// planilla — acá solo se lee.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ ultima: null });
    }
    const ultima = await leerUltimaImportacionStock();
    return NextResponse.json({ ultima });
  } catch {
    // Best-effort: sin dato el cuadrito queda vacío y el panel funciona
    // igual que siempre.
    return NextResponse.json({ ultima: null });
  }
}
