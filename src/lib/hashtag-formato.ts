// ─── FORMATO DEL #HASHTAG PARA MOSTRAR (Task 83, pedido del dueño) ───
// Task 108 (pedido del dueño, ACTUALIZA la regla de unidad de Task 83):
// el valor que el admin carga en el #HASHTAG es el NÚMERO DEL #, en MILES
// de Gs: cargar "200" = 200.000 GS (el dueño: "nel presupuesto tiene que
// salir # 200 ... dentro del buscador tiene que salir el valor real
// ejemplo 200.000 GS y no 200 GS"). Reglas de muestra:
//   · PRESUPUESTO (los 4 PDFs): "# 200"      (número del #, sin GS)
//   · BUSCADOR (panel de ventas): "# 200.000 GS" (valor REAL en Gs)
//   · Carrito/cotización: "# 200 GS" (miles, como Task 83)
// Salvaguarda de compatibilidad: si el valor ya parece Gs completos
// (>= 1000, ej: hashtags viejos cargados como 200000) se usa TAL CUAL
// — así ambos criterios muestran lo mismo: # 200 en el PDF y 200.000 GS
// en el buscador. Nunca más se ve "# 0,2".
//
// Lib client-safe: NO importa Prisma ni la base — se puede usar igual en
// componentes React (panel de ventas) y en las rutas de los PDF.

// Convierte el valor cargado a Gs REALES: 200 → 200.000 · 200000 → 200.000
// (salvaguarda: < 1000 son miles → ×1000; >= 1000 ya son Gs → tal cual).
// Valores < 1 (ej: 0.2) no son un hashtag real en ningún criterio → se
// ignoran (vacío), nunca vuelve a mostrarse el viejo "# 0,2".
export function valorGsRealesHashtag(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isFinite(valor) || valor < 1) return null;
  return valor < 1000 ? valor * 1000 : valor;
}

// 200 → "200" · 200000 → "200" · 1500000 → "1.500" · 250500 → "250,5" (máx 1 decimal)
export function valorHashtagEnMiles(valor: number | null | undefined): string {
  const gs = valorGsRealesHashtag(valor);
  if (gs === null) return "";
  const miles = gs / 1000;
  return miles.toLocaleString("es-PY", { maximumFractionDigits: 1 });
}

// Valor REAL en Gs con separador de miles, para el BUSCADOR (Task 108):
// 200 → "200.000" · 200000 → "200.000" · 1500000 → "1.500.000"
// El buscador lo muestra así: "# 200.000 GS valido hasta 30/11/2026".
export function textoHashtagValorRealGs(valor: number | null | undefined): string {
  const gs = valorGsRealesHashtag(valor);
  if (gs === null) return "";
  return gs.toLocaleString("es-PY");
}

// 200000 → "# 200 GS" · sin valor → "" (no se muestra nada)
export function textoHashtag(valor: number | null | undefined): string {
  const miles = valorHashtagEnMiles(valor);
  if (!miles) return "";
  return `# ${miles} GS`;
}

// 200000 → "# 200" (SIN el "GS") · sin valor → "" (no se muestra nada)
// Task 88B (pedido del dueño): en los PRESUPUESTOS (PDFs que le llegan al
// cliente) el hashtag sale solo con el número, sin el "GS": "# 200".
// En el sistema (panel de ventas) sigue mostrándose con "GS" como siempre.
export function textoHashtagSinGs(valor: number | null | undefined): string {
  const miles = valorHashtagEnMiles(valor);
  if (!miles) return "";
  return `# ${miles}`;
}

// ─── VENCIMIENTO DEL #HASHTAG (Task 95, pedido del dueño) ───
// El # tiene una FECHA de validez ("YYYY-MM-DD", igual que se guarda en la
// tabla ProductHashtag). Reglas del dueño:
//   · Mientras la fecha NO venció → el vendedor ve el # normal (el valor
//     del # es el PREMIO del vendedor: se lo gana hasta el último día).
//   · El día de la fecha (vence HOY) → en la BASE la celda se pinta ROJO
//     (aviso al admin de que se está terminando) y el vendedor todavía lo
//     ve: es su último día de premio.
//   · Al día siguiente (fecha < hoy) → el # desaparece SOLO para el
//     vendedor (ni búsqueda ni resultados lo muestran) y la celda sigue
//     roja en la base hasta que el admin lo renueve o lo limpie.
// Comparación de fechas como TEXTO "YYYY-MM-DD" (el formato exacto en que
// se guarda), sin convertir a Date: cero problemas de huso horario en la
// comparación en sí.

// Fecha de HOY en Paraguay ("YYYY-MM-DD"). America/Asuncion = UTC-3 fijo
// (sin horario de verano). en-CA devuelve año-mes-día con 2 dígitos.
// Si el entorno no conoce la zona (caso rarísimo), cae a la fecha UTC:
// la diferencia máxima sería 3 horas alrededor de medianoche, inofensiva.
export function hoyParaguay(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Asuncion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Estado de un hashtag según su fecha:
//   "sinFecha" → el admin cargó valor sin fecha → siempre vigente
//   "vigente"  → fecha > hoy   (aún le quedan días)
//   "venceHoy" → fecha == hoy  (último día: ROJO en la base)
//   "vencido"  → fecha < hoy   (ya pasó: ROJO en la base y fuera de la
//                               vista del vendedor)
export type EstadoHashtag = "sinFecha" | "vigente" | "venceHoy" | "vencido";
export function estadoHashtag(
  fecha: string | null | undefined,
  hoy?: string
): EstadoHashtag {
  if (!fecha) return "sinFecha";
  const hoyStr = hoy || hoyParaguay();
  if (fecha > hoyStr) return "vigente";
  if (fecha === hoyStr) return "venceHoy";
  return "vencido";
}

// ¿El vendedor debe VER este hashtag? Sí mientras no venció (incluye el
// último día). Sin fecha = sin vencimiento = siempre visible.
export function hashtagVisibleParaVendedor(
  fecha: string | null | undefined,
  hoy?: string
): boolean {
  const estado = estadoHashtag(fecha, hoy);
  return estado !== "vencido";
}

// ¿La celda del hashtag en la BASE va en ROJO? Sí cuando vence hoy o ya
// venció (fecha <= hoy). Es el aviso visual que pidió el dueño.
export function hashtagCeldaRoja(
  fecha: string | null | undefined,
  hoy?: string
): boolean {
  const estado = estadoHashtag(fecha, hoy);
  return estado === "venceHoy" || estado === "vencido";
}
