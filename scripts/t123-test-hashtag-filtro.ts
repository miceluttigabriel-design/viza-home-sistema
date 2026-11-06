// T123 — prueba de humo de la lógica del filtro #HASHTAG (reglas puras).
// Verifica las MISMAS reglas que usa idsProductosConHashtag:
//   · valor >= 1 es un # real; < 1 o null no (valorGsRealesHashtag)
//   · vendedor: hashtagVisibleParaVendedor(fecha, hoy) — vencido fuera
// Replica el filtrado sobre filas sintéticas (sin DB, igual criterio).
import { hashtagVisibleParaVendedor, hoyParaguay, textoHashtagValorRealGs } from "../src/lib/hashtag-formato";

let ok = 0;
let total = 0;
function check(nombre: string, cond: boolean) {
  total++;
  if (cond) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    console.log(`  ✗ FALLO: ${nombre}`);
  }
}

const hoy = hoyParaguay();
console.log(`hoy (Paraguay) = ${hoy}`);

// Filas sintéticas de ProductHashtag (productId, valor, fecha)
const filas = [
  { productId: "p1", valor: 200, fecha: "2099-12-31" },   // vigente
  { productId: "p2", valor: 150, fecha: "2020-01-01" },   // vencido
  { productId: "p3", valor: 200, fecha: null },            // sin fecha = sin vencimiento
  { productId: "p4", valor: 0.2, fecha: "2099-12-31" },    // valor < 1: NO es # real
  { productId: "p5", valor: null, fecha: "2099-12-31" },   // sin valor: NO es # real
];

// where del findMany en idsProductosConHashtag: valor: { gte: 1 }
const conValorReal = filas.filter((f) => (f.valor ?? 0) >= 1);
check("valor >= 1 deja fuera p4 (0.2) y p5 (null)", conValorReal.every((f) => !["p4", "p5"].includes(f.productId)) && conValorReal.length === 3);

// Admin/consulta (soloVisibles=false): TODOS los de valor real, incluido vencido
const idsAdmin = conValorReal.map((f) => f.productId);
check("admin ve p1, p2, p3 (p2 vencido incluido)", JSON.stringify(idsAdmin) === JSON.stringify(["p1", "p2", "p3"]));

// Vendedor (soloVisibles=true): solo no vencidos
const idsVendedor = conValorReal
  .filter((f) => hashtagVisibleParaVendedor(f.fecha, hoy))
  .map((f) => f.productId);
check("vendedor ve p1 y p3 (p2 vencido fuera)", JSON.stringify(idsVendedor) === JSON.stringify(["p1", "p3"]));

// Regla de visibilidad directa
check("vigente (2099) visible", hashtagVisibleParaVendedor("2099-12-31", hoy));
check("vencido (2020) NO visible", !hashtagVisibleParaVendedor("2020-01-01", hoy));
check("sin fecha visible", hashtagVisibleParaVendedor(null, hoy));

// El # que vería el vendedor en cada fila del listado (T123: fila muestra su #)
check("# de p1 se muestra como 200.000 GS", textoHashtagValorRealGs(200) === "200.000");

console.log(`\n${ok}/${total} checks OK`);
if (ok !== total) process.exit(1);
