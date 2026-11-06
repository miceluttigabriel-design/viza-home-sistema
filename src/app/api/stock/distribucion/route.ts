import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { puedeIrAStockGeneral } from "@/lib/acceso-stock-general";
import { leerSucursalesStock, leerSaldosSucursal } from "@/lib/stock-sucursal";
import { leerIdeales, productIdsConIdeal } from "@/lib/stock-ideal";
import { leerCores } from "@/lib/producto-cores";

// ─────────────────────────────────────────────────────────────────
// DISTRIBUCIÓN INTELIGENTE DE INVENTARIO (Task 127, pedido del dueño)
//
// "El sistema debe analizar el stock existente entre las sucursales y
//  generar automáticamente un reporte de transferencias internas para
//  equilibrar el inventario. NO debe generar órdenes de compra a
//  proveedores, solo movimientos entre sucursales (de donde sobra a
//  donde falta)".
//
// ALGORITMO (GET /api/stock/distribucion):
//   Entrada (todo de la MISMA base, sin copias):
//     · Nodos: CENTRAL (depósito central) + cada sucursal con stock
//       cargado por la planilla del ERP (StockSucursal).
//     · Saldo ACTUAL por producto y nodo (StockSucursal).
//     · STOCK IDEAL por producto y nodo (ProductStockIdeal, definido
//       por el dueño en CONFIGURAR STOCK IDEAL).
//     · Ficha del producto: COD (sku), TIPO (tipo), COLOR (cores) y
//       DESCRIPCION (name) — regla de negocio 1 del dueño.
//
//   ── CÓMO SE DETERMINA LA CANTIDAD A TRANSFERIR (regla del cálculo) ──
//   · Excedente de un nodo  = saldo actual − stock ideal   (sobra)
//   · Déficit de un nodo    = stock ideal − saldo actual   (falta)
//   · SUCURSAL ORIGEN  = la que tiene saldo MAYOR a su ideal (excedente).
//   · SUCURSAL DESTINO = la que tiene saldo MENOR a su ideal (déficit).
//   · La transferencia SIEMPRE deja al origen EN su ideal (nunca lo
//     vacía: transfiere SOLO el excedente) y lleva al destino HASTA su
//     ideal (nunca lo pasa). Por eso:
//         cantidad = MIN(excedente restante del origen,
//                        déficit restante del destino)
//   · Nodo SIN ideal definido: NO participa (ni da ni recibe). Así un
//     producto recién configurado no "vuela" completo desde CENTRAL.
//   · Un nodo puede ser origen Y destino de productos distintos (o del
//     mismo, en transferencias separadas hacia terceros).
//   · Emparejamiento GREEDY determinista: primero se cubre el déficit
//     MÁS GRANDE de cada producto, sacando primero del nodo con MÁS
//     excedente (menos transferencias, resultado estable).
//   · Si los excedentes NO alcanzan para cubrir todos los déficits, el
//     faltante queda informado en el resumen (sucursalesConFaltante /
//     faltanteNoCubierto). NO se genera ninguna orden de compra: solo
//     movimientos internos, tal como pidió el dueño.
//
//   Salida: filas COD | PRODUCTO | COLOR | ORIGEN | DESTINO | CANTIDAD
//   (+ contexto de saldo/ideal de cada punta) y un resumen.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

function codNumero(s: unknown): number | null {
  const m = String(s ?? "").match(/\d+/g);
  if (!m) return null;
  return Number(m.join(""));
}

interface FilaTransferencia {
  sku: string;
  producto: string;
  color: string | null; // CORES (columna de la Base)
  tipo: string | null; // TIPO PRODUCTO (columna de la Base)
  origen: string;
  destino: string;
  cantidad: number;
  // Contexto para que el dueño vea el porqué de cada línea:
  origenSaldo: number;
  origenIdeal: number;
  destinoSaldo: number;
  destinoIdeal: number;
  destinoFalta: number; // déficit original del destino
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // La vista Stock General es del dueño y de quien él habilite:
    // supremo/admin de siempre + los emails de ACCESO_STOCK_GENERAL
    // (hoy: viza@viza.com.py — VILMAR CESAR ZAGO PEREIRA, Task 127).
    const role = (session.user as any)?.role || "";
    const email = (session.user as any)?.email || "";
    if (role !== "admin" && role !== "supremo_admin" && !puedeIrAStockGeneral(email)) {
      return NextResponse.json(
        { error: "Sin permiso para el módulo de distribución" },
        { status: 403 }
      );
    }

    // ── 1) Nodos reales (CENTRAL primero, resto alfabético) ──
    const sucursales = (await leerSucursalesStock()).map((s) => s.nombre);
    if (sucursales.length === 0) {
      return NextResponse.json({
        ok: true,
        sucursales: [],
        filas: [],
        resumen: { transferencias: 0, unidades: 0, productos: 0, faltanteNoCubierto: 0, sucursalesConFaltante: [] },
        aviso:
          "Todavía no hay inventario por sucursal. Importá la planilla del ERP desde IMPORTAR INVENTARIO (columna SUCURSAL) para activar el módulo.",
      });
    }

    // ── 2) Productos con STOCK IDEAL configurado ──
    const ids = await productIdsConIdeal();
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        sucursales,
        filas: [],
        resumen: { transferencias: 0, unidades: 0, productos: 0, faltanteNoCubierto: 0, sucursalesConFaltante: [] },
        aviso:
          "Todavía no hay STOCK IDEAL configurado. Abrí CONFIGURAR STOCK IDEAL y anotá cuánto debería haber de cada producto en cada nodo.",
      });
    }

    // ── 3) Ficha de los productos (COD / TIPO / COLOR / DESCRIPCION) ──
    const [productos, coresMap] = await Promise.all([
      db.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, sku: true, name: true, tipo: true },
      }),
      leerCores(ids), // COLOR = columna CORES de la Base (tabla aparte)
    ]);
    const porId = new Map(productos.map((p) => [p.id, p]));

    // ── 4) Saldo actual por nodo + ideales ──
    const saldosPorNodo = await Promise.all(
      sucursales.map((s) => leerSaldosSucursal(s))
    );
    const ideales = await leerIdeales(ids);

    // ── 5) Cálculo producto por producto ──
    const filas: FilaTransferencia[] = [];
    const faltantePorNodo = new Map<string, number>();

    for (const producto of productos) {
      const idealesDelProducto = ideales.get(producto.id);
      if (!idealesDelProducto || idealesDelProducto.size === 0) continue;

      // Saldo actual de cada nodo de ESTE producto.
      const saldoEn = new Map<string, number>();
      sucursales.forEach((s, i) => {
        saldoEn.set(s, Math.round(saldosPorNodo[i].get(producto.id) ?? 0));
      });

      // Excedentes (origen posible) y déficits (destino posible) del producto.
      // SOLO nodos con ideal definido participan (los demás quedan neutrales).
      const excedentes: Array<{ nodo: string; sobra: number }> = [];
      const deficits: Array<{ nodo: string; falta: number; saldo: number; ideal: number }> = [];
      for (const [nodo, ideal] of idealesDelProducto) {
        const saldo = saldoEn.get(nodo) ?? 0;
        const idealRedondeado = Math.round(ideal);
        if (saldo > idealRedondeado) {
          excedentes.push({ nodo, sobra: saldo - idealRedondeado });
        } else if (saldo < idealRedondeado) {
          deficits.push({ nodo, falta: idealRedondeado - saldo, saldo, ideal: idealRedondeado });
        }
      }

      if (excedentes.length === 0 || deficits.length === 0) continue;

      // Orden determinista: déficit más grande primero (el nodo más
      // necesitados se atiende primero); excedente más grande primero
      // (se saca de donde más sobra → menos transferencias).
      const ordenNodos = new Map(sucursales.map((s, i) => [s, i]));
      deficits.sort(
        (a, b) => b.falta - a.falta || (ordenNodos.get(a.nodo) ?? 0) - (ordenNodos.get(b.nodo) ?? 0)
      );
      excedentes.sort(
        (a, b) => b.sobra - a.sobra || (ordenNodos.get(a.nodo) ?? 0) - (ordenNodos.get(b.nodo) ?? 0)
      );

      const sobraRestante = new Map(excedentes.map((e) => [e.nodo, e.sobra]));

      // Emparejamiento greedy: cantidad = MIN(excedente origen, déficit destino).
      for (const d of deficits) {
        let faltaRestante = d.falta;
        for (const e of excedentes) {
          if (faltaRestante <= 0) break;
          const disponible = sobraRestante.get(e.nodo) ?? 0;
          if (disponible <= 0) continue;
          const cantidad = Math.min(disponible, faltaRestante);
          if (cantidad <= 0) continue;
          sobraRestante.set(e.nodo, disponible - cantidad);
          faltaRestante -= cantidad;
          filas.push({
            sku: producto.sku,
            producto: producto.name,
            color: coresMap.get(producto.id) ?? null,
            tipo: producto.tipo,
            origen: e.nodo,
            destino: d.nodo,
            cantidad,
            origenSaldo: (saldoEn.get(e.nodo) ?? 0),
            origenIdeal: Math.round(idealesDelProducto.get(e.nodo) ?? 0),
            destinoSaldo: d.saldo,
            destinoIdeal: d.ideal,
            destinoFalta: d.falta,
          });
        }
        if (faltaRestante > 0) {
          // Los excedentes no alcanzaron para ESTE nodo: queda reportado
          // (NO se inventa una compra — regla del dueño).
          faltantePorNodo.set(d.nodo, (faltantePorNodo.get(d.nodo) ?? 0) + faltaRestante);
        }
      }
    }

    // ── 6) Orden final del reporte: COD numérico, luego destino ──
    filas.sort((a, b) => {
      const na = codNumero(a.sku);
      const nb = codNumero(b.sku);
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na === null && nb !== null) return 1;
      if (na !== null && nb === null) return -1;
      const cmpSku = String(a.sku).localeCompare(String(b.sku));
      if (cmpSku !== 0) return cmpSku;
      return a.destino.localeCompare(b.destino, "es");
    });

    const sucursalesConFaltante = Array.from(faltantePorNodo.entries())
      .map(([nodo, falta]) => ({ nodo, falta }))
      .sort((a, b) => b.falta - a.falta);

    return NextResponse.json({
      ok: true,
      sucursales,
      filas,
      resumen: {
        transferencias: filas.length,
        unidades: filas.reduce((acc, f) => acc + f.cantidad, 0),
        productos: new Set(filas.map((f) => f.sku)).size,
        faltanteNoCubierto: sucursalesConFaltante.reduce((acc, s) => acc + s.falta, 0),
        sucursalesConFaltante,
      },
      generadoEn: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en /api/stock/distribucion:", error);
    return NextResponse.json(
      { error: "Error al calcular la distribución inteligente" },
      { status: 500 }
    );
  }
}
