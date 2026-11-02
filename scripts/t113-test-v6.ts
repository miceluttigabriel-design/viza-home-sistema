// ============================================================
// PRUEBA DE HUMO — Task 113 v6 (bun scripts/t113-test-v6.ts)
// 1. Cascada de % con la peldaña PROVEEDOR ("en margen se usa conforme
//    de proveedor"): par → proveedor → tipo → general.
// 2. Tipos extra: un tipo sin productos cae al promedio GENERAL.
// 3. PDFs del pedido especial (6 planes) con el cronograma SAFRA
//    conforme el panel (PAGO / INTERÉS / SALDO + total).
// 4. PDF de la ORDEN DE COMPRA.
// Corre SIN base de datos (todo con las funciones puras).
// ============================================================
import { writeFileSync, mkdirSync } from "fs";
import {
  calcularPromediosPorcentajes,
  resolverGrupo,
  type FilaPorcentajeProducto,
} from "../src/lib/pedido-especial-porcentajes";
import {
  calcularPedidoEspecial,
  formatearMontoInput,
  type ParamsPedidoEspecial,
} from "../src/lib/pedido-especial-calc";
import { buildPedidoEspecialPdf } from "../src/lib/pdf/pedido-especial-pdf";
import { buildOrdenCompraPdf } from "../src/lib/pdf/orden-compra-pdf";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle?: string) {
  if (cond) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// ─── 1) CASCADA CON PROVEEDOR ───
console.log("\n[1] Cascada par → proveedor → tipo → general");
// BASE sintética:
//   GAFRA||MOTOS : 2 productos con contado 0.10 y 0.20 → par = 0.15
//   GAFRA||ELECTRO : 1 producto con contado 0.30 (otro tipo del MISMO proveedor)
//   SHOW||MOTOS : 1 producto con contado 0.50 (otro proveedor, mismo tipo)
//   resto global: KENTON||HERRAMIENTAS 1 producto con contado 0.05
const filas: FilaPorcentajeProducto[] = [
  { fabricante: "GAFRA", tipo: "MOTOS", marginContado: 0.1, pct1A6: 0.02, pct7A13: 0.03, pct14A30: 0.04, margenTecnico: 0.08, safra: "7" },
  { fabricante: "GAFRA", tipo: "MOTOS", marginContado: 0.2, pct1A6: 0.02, pct7A13: 0.03, pct14A30: 0.04, margenTecnico: 0.1, safra: "5" },
  { fabricante: "GAFRA", tipo: "ELECTRO", marginContado: 0.3, pct1A6: 0.01, pct7A13: 0.02, pct14A30: 0.03, margenTecnico: 0.12, safra: null },
  { fabricante: "SHOW", tipo: "MOTOS", marginContado: 0.5, pct1A6: 0.05, pct7A13: 0.06, pct14A30: 0.07, margenTecnico: 0.2, safra: "9" },
  { fabricante: "KENTON", tipo: "HERRAMIENTAS", marginContado: 0.05, pct1A6: 0.01, pct7A13: 0.01, pct14A30: 0.01, margenTecnico: 0.06, safra: null },
];
const mapa = calcularPromediosPorcentajes(filas);

// A) Par con datos: GAFRA+MOTOS = (0.10+0.20)/2 = 0.15 → 15 %
const parGafraMotos = resolverGrupo(mapa, "GAFRA", "MOTOS");
check("par GAFRA+MOTOS usa el promedio del par (15 %)", Math.abs(parGafraMotos.pctContado - 15) < 0.001, `=${parGafraMotos.pctContado}`);

// B) Par SIN datos (GAFRA+HERRAMIENTAS no existe): ANTES caía al tipo
//    HERRAMIENTAS (5 %, de KENTON — de OTRO proveedor); AHORA gana el
//    PROVEEDOR GAFRA ((0.10+0.20+0.30)/3 = 0.20 → 20 %).
const gafraHerr = resolverGrupo(mapa, "GAFRA", "HERRAMIENTAS");
check("par vacío → PROVEEDOR GAFRA (20 %, no el 5 % del tipo de otro)", Math.abs(gafraHerr.pctContado - 20) < 0.001, `=${gafraHerr.pctContado}`);

// C) Proveedor CON datos de otro tipo (SHOW solo tiene MOTOS): la
//    peldaña PROVEEDOR gana → 50 % (no el 30 % del tipo ELECTRO de GAFRA).
const showElectro = resolverGrupo(mapa, "SHOW", "ELECTRO");
check("proveedor con datos de otro tipo → PROVEEDOR SHOW (50 %)", Math.abs(showElectro.pctContado - 50) < 0.001, `=${showElectro.pctContado}`);

// D) Tipo sin datos (KENTON+ELECTRO? ELECTRO existe — usar HERRAMIENTAS
//    con proveedor desconocido "NUEVO"): proveedor vacío → tipo
//    HERRAMIENTAS = 5 %.
const nuevoHerr = resolverGrupo(mapa, "NUEVO", "HERRAMIENTAS");
check("proveedor nuevo → tipo HERRAMIENTAS (5 %)", Math.abs(nuevoHerr.pctContado - 5) < 0.001, `=${nuevoHerr.pctContado}`);

// E) Nada en ningún lado → global ((0.10+0.20+0.30+0.50+0.05)/5 = 0.23)
const fantasma = resolverGrupo(mapa, "XX", "YY");
check("todo vacío → promedio GENERAL (23 %)", Math.abs(fantasma.pctContado - 23) < 0.001, `=${fantasma.pctContado}`);

// F) SAFRA también respeta la peldaña proveedor: GAFRA+HERRAMIENTAS →
//    safra del proveedor GAFRA = (7+5)/2 = 6.
check("SAFRA por proveedor (GAFRA 6 %)", Math.abs(gafraHerr.pctSafra - 6) < 0.0001, `=${gafraHerr.pctSafra}`);

// ─── 2) TIPO EXTRA ───
console.log("\n[2] Tipo creado (sin productos)");
// De un proveedor CON datos: gana el PROVEEDOR (GAFRA = 20 %).
const extraGafra = resolverGrupo(mapa, "GAFRA", "TIPO-NUEVO-CREADO");
check("tipo extra de GAFRA → proveedor GAFRA (20 %)", Math.abs(extraGafra.pctContado - 20) < 0.001, `=${extraGafra.pctContado}`);
// De un proveedor DESCONOCIDO: cae al promedio GENERAL (23 %).
const extraFantasma = resolverGrupo(mapa, "FANTASMA", "TIPO-NUEVO-CREADO");
check("tipo extra de proveedor desconocido → general (23 %)", Math.abs(extraFantasma.pctContado - 23) < 0.001, `=${extraFantasma.pctContado}`);

// ─── 3) CÁLCULO SIN CAMBIOS (regresión de las rondas 2-4) ───
console.log("\n[3] Cálculo de planes (regresión)");
const paramsBase: ParamsPedidoEspecial = {
  costo: 3_000_000,
  modoCosto: "gs",
  cambioUS: 6000,
  pctContado: 10,
  pct1A6: 2,
  pct7A13: 3,
  pct14A30: 4,
  pctTecnico: 15,
  pctSafra: 7,
  plan: "contado",
  cuotas: 6,
  diasSinEntrega: null,
  safraEntrada: 0,
  safraMeses: 6,
  chequesCantidad: 4,
  chequesFechas: [],
  esMoto: false,
  fechaEmision: "2026-11-03",
};
const contado = calcularPedidoEspecial({ ...paramsBase });
check("contado = 3.300.000", contado?.total === 3_300_000, `=${contado?.total}`);
const cuotas6 = calcularPedidoEspecial({ ...paramsBase, plan: "cuotas_con_entrega" });
check("cuotas 6: margen 10+2×6=22 % → cuota 610.000", cuotas6?.cuotaValor === 610_000, `=${cuotas6?.cuotaValor}`);
const safra = calcularPedidoEspecial({ ...paramsBase, plan: "safra" });
check("safra: cronograma con pago final comercial", !!safra && safra.cronograma.length > 0 && safra.total > 3_300_000);
const cheque = calcularPedidoEspecial({
  ...paramsBase,
  plan: "cheque",
  chequesFechas: ["2026-12-03", "2027-01-02", "2027-02-01", "2027-03-03"],
});
check("cheque: 4 cheques de 887.000", cheque?.cheques.length === 4 && cheque.cheques[0].valor === 887_000, `=${cheque?.cheques[0]?.valor}`);
check("formatearMontoInput 15000000 → 15.000.000", formatearMontoInput("15000000") === "15.000.000");

// ─── 4) PDFs ───
console.log("\n[4] PDFs (pedido especial v6 + orden de compra)");
const filaPdfBase = {
  numero: "ESPECIAL-99",
  vendedorEmail: "vendedor@viza.com.py",
  vendedorNombre: "GABRIEL MICELUTTI",
  sucursal: "KATUETE",
  proveedor: "GAFRA",
  tipoProducto: "MOTOS",
  descripcion: "Moto Zanella 110 Z1 Base 2025 roja — pedido especial de prueba v6",
  modoCosto: "gs",
  costoOriginal: 3_000_000,
  costoGs: 3_000_000,
  cambioUS: 6000,
  createdAt: new Date("2026-11-03T12:00:00Z"),
};
mkdirSync("scripts/t113-muestras-v6", { recursive: true });

const planes: Array<[string, Partial<ParamsPedidoEspecial>]> = [
  ["contado", { plan: "contado" }],
  ["cuotas-con-entrega", { plan: "cuotas_con_entrega" }],
  ["cuotas-sin-entrega", { plan: "cuotas_sin_entrega", diasSinEntrega: 45 }],
  ["mayorista", { plan: "mayorista" }],
  ["safra", { plan: "safra", safraEntrada: 500_000, safraMeses: 6 }],
  [
    "cheque",
    { plan: "cheque", chequesFechas: ["2026-12-03", "2027-01-02", "2027-02-01", "2027-03-03"] },
  ],
];
for (const [nombre, over] of planes) {
  const r = calcularPedidoEspecial({ ...paramsBase, ...over } as ParamsPedidoEspecial);
  if (!r) {
    fallos++;
    console.log(`  ✗ ${nombre}: cálculo null`);
    continue;
  }
  const doc = buildPedidoEspecialPdf({
    ...filaPdfBase,
    plan: r.plan,
    cuotas: r.cuotas,
    valorContado: r.valorContado,
    cuotaValor: r.cuotaValor,
    valorTecnico: r.valorTecnico,
    total: r.total,
    totalIntereses: r.totalIntereses,
    detalle: {
      fechaInicioPago: over.plan === "cuotas_sin_entrega" ? "2026-12-18" : "",
      safraEntrada: over.safraEntrada ?? 0,
      safraMeses: over.safraMeses ?? 0,
      cronograma: r.cronograma,
      cheques: r.cheques,
    },
  });
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(`scripts/t113-muestras-v6/pedido-especial-${nombre}.pdf`, buf);
  check(`PDF ${nombre} (${(buf.length / 1024).toFixed(0)} KB, ${doc.getNumberOfPages()} pág)`, buf.length > 5000);
}

// ORDEN DE COMPRA
const oc = buildOrdenCompraPdf({
  ...filaPdfBase,
  ordenNumero: "OC-01",
  idCtr: "12345",
  verificadoPorNombre: "JEYSON MARCELO WEISS",
  fechaVerificado: new Date("2026-11-03T15:00:00Z").toISOString(),
});
const ocBuf = Buffer.from(oc.output("arraybuffer"));
writeFileSync("scripts/t113-muestras-v6/orden-compra.pdf", ocBuf);
check(`PDF orden de compra (${(ocBuf.length / 1024).toFixed(0)} KB, ${oc.getNumberOfPages()} pág)`, ocBuf.length > 5000 && oc.getNumberOfPages() === 1);

console.log(fallos === 0 ? "\nTODO OK ✓" : `\nFALLOS: ${fallos} ✗`);
process.exit(fallos === 0 ? 0 : 1);
