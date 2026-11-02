// ============================================================
// T113 v5 — PRUEBA DE HUMO DEL PDF DEL PEDIDO ESPECIAL
// Genera un PDF por CADA plan con números REALES de
// calcularPedidoEspecial() y verifica que: no lanza, el buffer
// pesa y las páginas existen. Corre con: bun scripts/t113-test-pdf.ts
// ============================================================
import { writeFileSync, mkdirSync } from "fs";
import { calcularPedidoEspecial } from "../src/lib/pedido-especial-calc";
import { buildPedidoEspecialPdf } from "../src/lib/pdf/pedido-especial-pdf";

const OUT = "/tmp/pdf-test";
mkdirSync(OUT, { recursive: true });

// Caso base: costo Gs 3.000.000, % contado 10, tramos 2/3/4,
// técnico 8, safra 7 — como la BASE.
const base = {
  costo: 3_000_000,
  modoCosto: "gs" as const,
  cambioUS: 6000,
  pctContado: 10,
  pct1A6: 2,
  pct7A13: 3,
  pct14A30: 4,
  pctTecnico: 8,
  pctSafra: 7,
  fechaEmision: "2026-11-03",
  esMoto: false,
};

const planes = [
  { plan: "contado", cuotas: 1, nombre: "contado" },
  { plan: "cuotas_con_entrega", cuotas: 6, nombre: "cuotas-con-entrega" },
  {
    plan: "cuotas_sin_entrega",
    cuotas: 12,
    nombre: "cuotas-sin-entrega",
    diasSinEntrega: 45,
    extraDetalle: { fechaInicioPago: "2026-12-18" },
  },
  { plan: "mayorista", cuotas: 1, nombre: "mayorista" },
  {
    plan: "safra",
    cuotas: 6,
    nombre: "safra",
    safraEntrada: 500_000,
    safraMeses: 6,
    extraDetalle: { safraEntrada: 500_000, safraMeses: 6 },
  },
  {
    plan: "cheque",
    cuotas: 4,
    nombre: "cheque",
    chequesCantidad: 4,
    chequesFechas: ["2026-12-03", "2027-01-02", "2027-02-01", "2027-03-03"],
  },
] as any[];

let fallos = 0;
for (const caso of planes) {
  const resultado = calcularPedidoEspecial({
    ...base,
    plan: caso.plan,
    cuotas: caso.cuotas,
    diasSinEntrega: caso.diasSinEntrega ?? null,
    safraEntrada: caso.safraEntrada ?? 0,
    safraMeses: caso.safraMeses ?? 1,
    chequesCantidad: caso.chequesCantidad ?? 1,
    chequesFechas: caso.chequesFechas ?? [],
  });
  if (!resultado) {
    console.error(`❌ ${caso.plan}: el cálculo devolvió null`);
    fallos++;
    continue;
  }

  const doc = buildPedidoEspecialPdf({
    numero: "ESPECIAL-01",
    vendedorEmail: "vendedor@viza.com.py",
    vendedorNombre: "Gabriel Micelutti",
    sucursal: "CASA CENTRAL",
    proveedor: "GAFRA",
    tipoProducto: caso.plan === "cheque" ? "MOTOS" : "ELECTRO",
    descripcion: "Producto pedido especial de prueba — plan " + caso.plan,
    plan: caso.plan,
    cuotas: resultado.cuotas,
    valorContado: resultado.valorContado,
    cuotaValor: resultado.cuotaValor,
    valorTecnico: resultado.valorTecnico,
    total: resultado.total,
    totalIntereses: resultado.totalIntereses,
    createdAt: new Date("2026-11-03T10:30:00"),
    detalle: {
      ...caso.extraDetalle,
      safraEntrada: caso.extraDetalle?.safraEntrada ?? 0,
      safraMeses: caso.extraDetalle?.safraMeses ?? 0,
      cronograma: resultado.cronograma,
      cheques: resultado.cheques,
    },
  });

  const buf = Buffer.from(doc.output("arraybuffer"));
  const paginas = doc.getNumberOfPages();
  const ok = buf.length > 4000 && paginas >= 1;
  if (!ok) fallos++;
  console.log(
    `${ok ? "✅" : "❌"} ${caso.nombre.padEnd(20)} total=${resultado.total.toLocaleString("es-PY")} Gs · ${paginas} pág · ${(buf.length / 1024).toFixed(1)} KB`
  );
  writeFileSync(`${OUT}/pedido-especial-${caso.nombre}.pdf`, buf);
}

// También el CONTADO con US$ (conversión) para ver el cuadro TOTAL CONTADO.
const rUsd = calcularPedidoEspecial({
  ...base,
  costo: 2500,
  modoCosto: "usd",
  plan: "contado",
  cuotas: 1,
  diasSinEntrega: null,
  safraEntrada: 0,
  safraMeses: 1,
  chequesCantidad: 1,
  chequesFechas: [],
} as any);
if (rUsd) {
  const doc = buildPedidoEspecialPdf({
    numero: "ESPECIAL-02",
    vendedorEmail: "vendedor@viza.com.py",
    vendedorNombre: "Gabriel Micelutti",
    sucursal: "KATUETE",
    proveedor: "SHOW",
    tipoProducto: "ELECTRO",
    descripcion: "Pedido en dólares — contado",
    plan: "contado",
    cuotas: 1,
    valorContado: rUsd.valorContado,
    cuotaValor: 0,
    valorTecnico: 0,
    total: rUsd.total,
    totalIntereses: 0,
    createdAt: new Date("2026-11-03T10:30:00"),
    detalle: null,
  });
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(`${OUT}/pedido-especial-contado-usd.pdf`, buf);
  console.log(`✅ contado-usd          total=${rUsd.total.toLocaleString("es-PY")} Gs · ${doc.getNumberOfPages()} pág · ${(buf.length / 1024).toFixed(1)} KB`);
}

// Verificación del margen (el dueño: "que aplique la margen conforme"):
// contado = costoProd × (1 + 10/100) = 3.300.000 (a miles).
const rContado = calcularPedidoEspecial({ ...base, plan: "contado", cuotas: 1 } as any);
if (!rContado || rContado.total !== 3_300_000 || rContado.margenAplicado !== 10) {
  console.error(`❌ MARGEN contado: esperado 3.300.000 con margen 10, salió ${rContado?.total} / ${rContado?.margenAplicado}`);
  fallos++;
} else {
  console.log(`✅ MARGEN contado OK: 3.000.000 × (1+10%) = 3.300.000 (margen 10%)`);
}
// cuotas 6: margen = 10 + 6×2 = 22 → total = 3.000.000×1.22 = 3.660.000, cuota = 610.000
const rCuotas = calcularPedidoEspecial({ ...base, plan: "cuotas_con_entrega", cuotas: 6 } as any);
if (!rCuotas || rCuotas.margenAplicado !== 22 || rCuotas.cuotaValor !== 610_000) {
  console.error(`❌ MARGEN cuotas: esperado margen 22 y cuota 610.000, salió ${rCuotas?.margenAplicado} / ${rCuotas?.cuotaValor}`);
  fallos++;
} else {
  console.log(`✅ MARGEN cuotas OK: 10% + 6×2% = 22% → cuota 610.000 (a miles)`);
}

console.log(fallos === 0 ? "\n🎉 TODO OK" : `\n💥 ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
