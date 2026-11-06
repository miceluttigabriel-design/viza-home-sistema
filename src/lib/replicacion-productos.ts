// ─── REPLICACIÓN EN VIVO: LA BASE → STOCK GENERAL (Task 126, pedido del dueño) ───
//
// "cada vez que um producto sea editado y guardado quiero que el mismo
//  replique en el stock por favor... incluso los registros... toda edicion
//  hecha y guardada en estas colunas (PROVEDOR, GRUPO, SUB-GRUPO, MARCA,
//  TIPO PRODUCTO, MODELO, CAPACIDAD, CORES, REF.FABRICA, DESCRIPCION)
//  hay que replicar en el stock general".
//
// LA BASE y STOCK GENERAL ya leen del MISMO modelo Product (misma base de
// datos), así que lo guardado está SIEMPRE en la BD. Lo único que faltaba
// es que la vista STOCK GENERAL se entere AL INSTANTE de que hubo un
// guardado en LA BASE: hasta hoy solo refrescaba al montarse o al cambiar
// un filtro, así que si quedaba abierta en OTRA pestaña (o detrás de la
// ventana de la Base) seguía mostrando los valores de la última carga.
//
// Este módulo avisa "se guardó / eliminó un producto" por TRES canales
// BEST-EFFORT (jamás rompen el guardado del producto):
//   · MISMA pestaña  → window CustomEvent("viza:producto-editado")
//   · OTRAS pestañas → BroadcastChannel("viza-replicacion-productos")
//   · RESPALDO viejo → localStorage + evento "storage" (por si el
//     navegador no tiene BroadcastChannel)
//
// STOCK GENERAL se suscribe (ver stock-general.tsx) y al recibir el aviso
// vuelve a pedir TODOS sus datos → las columnas de la Base (PROVEDOR,
// GRUPO, SUB-GRUPO, MARCA, TIPO PRODUCTO, MODELO, CAPACIDAD, CORES,
// REF.FABRICA, DESCRIPCION), el STOCK/SALDO y el registro de última
// edición (badge naranja del COD) se actualizan solos.
//
// Lib del lado del NAVEGADOR (no usa Prisma ni secretos): se importa solo
// desde componentes "use client". Si algo falla, se ignora en silencio —
// el refresco normal por navegación/filtros sigue igual que siempre.

export const EVENTO_PRODUCTO_EDITADO = "viza:producto-editado";

const NOMBRE_CANAL = "viza-replicacion-productos";
const CLAVE_STORAGE = "viza-replicacion-productos:ultimo";

// Qué viene dentro de cada aviso. Es informativo: el que escucha vuelve a
// pedir sus datos completos a la API (fuente única de verdad), no aplica
// parches locales.
export interface DetalleEdicionProducto {
  id: string;
  sku?: string | null;
  columnas: string[]; // campos que trajo el guardado (el "dirty" de la Base)
  por?: string | null; // quién guardó (ultimaEdicionPor que devuelve el PUT)
  accion?: "guardado" | "eliminado";
  en: number; // Date.now(): ordena eventos y fuerza el "storage" multi-pestaña
}

// ─── Emisor: se llama en LA BASE justo después de guardar bien ───
export function avisarProductoEditado(
  detalle: Omit<DetalleEdicionProducto, "en">
): void {
  if (typeof window === "undefined") return;
  const completo: DetalleEdicionProducto = { ...detalle, en: Date.now() };

  // 1) Misma pestaña (por si STOCK GENERAL u otra vista está montada acá).
  try {
    window.dispatchEvent(
      new CustomEvent<DetalleEdicionProducto>(EVENTO_PRODUCTO_EDITADO, {
        detail: completo,
      })
    );
  } catch {
    // best-effort: el refresco por navegación sigue igual que siempre
  }

  // 2) Otras pestañas / ventanas del mismo navegador.
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const canal = new BroadcastChannel(NOMBRE_CANAL);
      canal.postMessage(completo);
      canal.close();
    }
  } catch {
    // best-effort
  }

  // 3) Resaldo multi-pestaña: escribir SIEMPRE dispara el evento "storage"
  //    en las otras pestañas porque el timestamp hace cambiar el valor.
  try {
    window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(completo));
  } catch {
    // best-effort (modo privado / storage lleno): no pasa nada
  }
}

// ─── Receptor: devuelve la función para dejar de escuchar ───
// Stock General lo llama en un useEffect de montaje; el callback que
// recibe típicamente vuelve a pedir los datos de la vista.
export function suscribirseAEdicionesProductos(
  callback: (detalle: DetalleEdicionProducto) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let canal: BroadcastChannel | null = null;

  const onCustom = (e: Event) => {
    const detalle = (e as CustomEvent<DetalleEdicionProducto>).detail;
    if (detalle) callback(detalle);
  };
  const onCanal = (e: MessageEvent) => {
    if (e.data) callback(e.data as DetalleEdicionProducto);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CLAVE_STORAGE || !e.newValue) return;
    try {
      callback(JSON.parse(e.newValue) as DetalleEdicionProducto);
    } catch {
      // valor corrupto: se ignora (best-effort)
    }
  };

  window.addEventListener(EVENTO_PRODUCTO_EDITADO, onCustom);
  try {
    if (typeof BroadcastChannel !== "undefined") {
      canal = new BroadcastChannel(NOMBRE_CANAL);
      canal.onmessage = onCanal;
    }
  } catch {
    canal = null;
  }
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EVENTO_PRODUCTO_EDITADO, onCustom);
    window.removeEventListener("storage", onStorage);
    try {
      canal?.close();
    } catch {
      // nada que hacer
    }
  };
}
