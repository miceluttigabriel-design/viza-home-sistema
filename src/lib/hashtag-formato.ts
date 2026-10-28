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
