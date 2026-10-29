// Task 97 — Test de lógica: MARGEN MAYORISTA % → VALOR MAYORISTA automático
// + detector de AIRES + base por producto. Corre con: bun run scripts/t97-test-mayorista.ts
// Los casos de AIRES están verificados contra los valores CACHEADOS de la
// planilla real LISTA VIZA HOME (fila 35: CGs=14.800.000 × 1.05 = 15.540.000).
import {
  esProductoAire,
  baseMayorista,
  calcularValorMayorista,
} from "../src/lib/margen-mayorista";

let ok = 0;
let fail = 0;
function CHECK(nombre: string, cond: boolean, extra = "") {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nombre}${extra ? "  " + extra : ""}`);
  } else {
    fail++;
    console.log(`  ✗ FALLO: ${nombre}${extra ? "  " + extra : ""}`);
  }
}

console.log("── 1) Detector de AIRES (esProductoAire) ──");
CHECK(
  "GRUPO 'AIRES ACONDICIONADOS' → aire",
  esProductoAire({ categoria: "AIRES ACONDICIONADOS", tipo: "AIRE COMPLETO", name: "AIRE ACOND. GW 12.000BTU" })
);
CHECK(
  "TIPO 'AIRE COMPLETO' (categoria VAZIO) → aire",
  esProductoAire({ categoria: "VAZIO", tipo: "AIRE COMPLETO", name: "AIRE A. GOODWEATHER 60.000BTU" })
);
CHECK(
  "DESCRIPCION arranca con AIRE (categoria vacia) → aire (caso fila 35 de la planilla)",
  esProductoAire({ categoria: null, tipo: null, name: "AIRE A. GOODWEATHER 60.000BTU. GW-60CAINV.R410 3PZ" })
);
CHECK(
  "'AIRE ACOD. HAUSTEC F/C 60.000BTU CASSETTE' → aire",
  esProductoAire({ categoria: "AIRES ACONDICIONADOS", tipo: "AIRE COMPLETO", name: "AIRE ACOD. HAUSTEC F/C 60.000BTU CASSETTE" })
);
CHECK("EXTRACTOR DE AIRE (nombre no arranca con AIRE, grupo ELECTRO UTILITARIOS) → NO aire", !esProductoAire({ categoria: "ELECTRO UTILITARIOS", tipo: "EXTRACTOR DE AIRE", name: "EXTRACTOR DE AIRE MCHI-9005 220V." }));
CHECK("CEPILLO DE AIRE BELLISSIMA → NO aire", !esProductoAire({ categoria: "HIGIENE Y CUIDADO PERSONAL", tipo: "CEPILLO", name: "CEPILLO DE AIRE BELLISSIMA 3 EN 1CERAMIC AIR" }));
CHECK("DEPURADOR AIRE DCM → NO aire", !esProductoAire({ categoria: "ELECTRO UTILITARIOS", tipo: "DEPURADOR", name: "DEPURADOR AIRE DCM 60 CM COLORMAQ" }));
CHECK("CORTINA DE AIRE FM 1210N-2Y (VAZIO) → NO aire", !esProductoAire({ categoria: "VAZIO", tipo: "VAZIO", name: "CORTINA DE AIRE FM 1210N-2Y GW 1MTS" }));
CHECK("AIRFRYER → NO aire (no contiene 'AIRE')", !esProductoAire({ categoria: "ELECTRODOMESTICOS", tipo: "AIRFRYER", name: "AIRFRYER MIDEA 5L" }));
CHECK("MUEBLES → NO aire", !esProductoAire({ categoria: "MUEBLES", tipo: "ROPERO", name: "ROPERO 3 PUERTAS" }));
CHECK("null → NO aire (defensivo)", !esProductoAire(null));
CHECK("minúsculas/acentos → aire", esProductoAire({ categoria: "Aires Acondicionados", tipo: null, name: null }));

console.log("\n── 2) Base por producto (baseMayorista) ──");
CHECK(
  "AIRE → base COSTO GS",
  baseMayorista({ categoria: "AIRES ACONDICIONADOS", costGs: 1000000, costProd: 999999 }).base === 1000000
);
CHECK(
  "AIRE → flag esAire true",
  baseMayorista({ categoria: "AIRES ACONDICIONADOS", costGs: 1000000, costProd: 999999 }).esAire === true
);
CHECK(
  "MUEBLE → base COSTO PROD.",
  baseMayorista({ categoria: "MUEBLES", costGs: 1000000, costProd: 777777 }).base === 777777
);
CHECK(
  "sin costos → base 0 (no revienta)",
  baseMayorista({ categoria: "MUEBLES", costGs: null, costProd: null }).base === 0
);

console.log("\n── 3) VALOR MAYORISTA automático (calcularValorMayorista) ──");
// Casos verificados contra los valores CACHEADOS de la planilla real:
const fila35 = { categoria: null, tipo: null, name: "AIRE A. GOODWEATHER 60.000BTU", costGs: 14800000, costProd: 0 };
CHECK(
  "fila 35 planilla: 14.800.000 × (1+0.05) = 15.540.000 (igual al Excel)",
  calcularValorMayorista(fila35, 0.05) === 15540000,
  `→ ${calcularValorMayorista(fila35, 0.05)}`
);
const fila37 = { categoria: "AIRES ACONDICIONADOS", tipo: "AIRE COMPLETO", name: "AIRE ACOND HAUSTEC 18.000 BTU", costGs: 2649982.5, costProd: 0 };
CHECK(
  "fila 37 planilla: 2.649.982,5 × 1.05 = 2.782.481,625 (igual al Excel, sin redondeo)",
  calcularValorMayorista(fila37, 0.05) === 2782481.625,
  `→ ${calcularValorMayorista(fila37, 0.05)}`
);
const fila42 = { categoria: "AIRES ACONDICIONADOS", costGs: 5254107, costProd: 0 };
CHECK(
  "fila 42 planilla: 5.254.107 × 1.05 = 5.516.812,35 (igual al Excel)",
  calcularValorMayorista(fila42, 0.05) === 5516812.35,
  `→ ${calcularValorMayorista(fila42, 0.05)}`
);
CHECK(
  "ruido flotante limpio: 1.950.000 × 1.05 = 2.047.500 (no 2047500.0000000002)",
  calcularValorMayorista({ categoria: "AIRES ACONDICIONADOS", costGs: 1950000, costProd: 0 }, 0.05) === 2047500
);
CHECK(
  "DEMÁS productos: base COSTO PROD. — 1.000.000 × (1+0.10) = 1.100.000",
  calcularValorMayorista({ categoria: "MUEBLES", costGs: 999999, costProd: 1000000 }, 0.1) === 1100000
);
CHECK(
  "margen en STRING '0.05' (como llega del input pct) → calcula igual",
  calcularValorMayorista(fila35, "0.05") === 15540000
);
CHECK("margen null → null (VALOR manual se respeta)", calcularValorMayorista(fila35, null) === null);
CHECK("margen undefined → null", calcularValorMayorista(fila35, undefined) === null);
CHECK("margen '' (celda vaciada) → null", calcularValorMayorista(fila35, "") === null);
CHECK("margen 0 → null (no pisa el VALOR a mano)", calcularValorMayorista(fila35, 0) === null);
CHECK("base 0 (aire sin COSTO GS) → null (no escribe 0 encima)", calcularValorMayorista({ categoria: "AIRES ACONDICIONADOS", costGs: null, costProd: 500000 }, 0.05) === null);
CHECK("base 0 (mueble sin COSTO PROD.) → null", calcularValorMayorista({ categoria: "MUEBLES", costGs: 100, costProd: null }, 0.05) === null);
CHECK("margen 10% de la planilla (4 filas VAZIO): 1.000.000 × 1.1 = 1.100.000", calcularValorMayorista({ categoria: "AIRES ACONDICIONADOS", costGs: 1000000, costProd: 0 }, 0.1) === 1100000);

console.log("\n══════════════════════════════════════");
console.log(`RESULTADO: ${ok} OK · ${fail} FALLOS`);
if (fail > 0) process.exit(1);
