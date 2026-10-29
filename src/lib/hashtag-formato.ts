// ─── FORMATO DEL #HASHTAG PARA MOSTRAR (Task 83, pedido del dueño) ───
// En la base el valor se guarda en Gs completos (ej: 200000 = 200.000).
// En el panel de ventas (producto agregado a la cotización) y en el
// presupuesto (PDF) el hashtag se muestra DEBAJO de la descripción del
// producto en MILES, sin los ceros: 200.000 → "# 200 GS".
// (El dueño: "en la base esta 200.000 vá poner 200 en el hastag … pero no
// con todos los zeros").
//
// Lib client-safe: NO importa Prisma ni la base — se puede usar igual en
// componentes React (panel de ventas) y en las rutas de los PDF.

// 200000 → "200" · 1500000 → "1.500" · 250500 → "250,5" (máx 1 decimal)
export function valorHashtagEnMiles(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (!Number.isFinite(valor) || valor <= 0) return "";
  const miles = valor / 1000;
  return miles.toLocaleString("es-PY", { maximumFractionDigits: 1 });
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
