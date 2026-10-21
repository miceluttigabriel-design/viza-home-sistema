// Actualizar los 4 productos de ejemplo con todos los campos de cuotas
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // Los 4 productos de muestra - actualizar con precios por cuota
  const productos = [
    { sku: "MUE-001", precioBase: 450000 }, // Sofá
    { sku: "ELE-001", precioBase: 850000 }, // Heladera
    { sku: "MOT-001", precioBase: 1250000 }, // Moto
    { sku: "OTR-001", precioBase: 195000 }, // Set Herramientas
  ];

  for (const p of productos) {
    // Generar precios por cuota con márgenes acumulativos (similar al Excel)
    // marginContado = 5%, Y=4% (1-6), Z=5% (7-13), AA=4% (14-30)
    const t = p.precioBase; // Asumimos que el precio base es el costo prod
    const marginContado = 0.05;
    const y = 0.04;
    const z = 0.05;
    const aa = 0.04;

    const priceContado = Math.round((t + t * marginContado) / 1000) * 1000;

    // Generar márgenes 1..30 y precios
    const margins: number[] = [];
    let last = marginContado;
    for (let i = 1; i <= 30; i++) {
      let base;
      if (i <= 6) base = y;
      else if (i <= 13) base = z;
      else base = aa;
      last = last + base;
      margins.push(last);
    }

    const prices: Record<string, number> = {};
    for (let i = 1; i <= 30; i++) {
      prices[`price${i}`] = Math.round((t + t * margins[i - 1]) / 1000 / i) * 1000;
    }

    const data = {
      priceContado,
      price1: prices.price1,
      price2: prices.price2,
      price3: prices.price3,
      price4: prices.price4,
      price5: prices.price5,
      price6: prices.price6,
      price7: prices.price7,
      price8: prices.price8,
      price9: prices.price9,
      price10: prices.price10,
      price11: prices.price11,
      price12: prices.price12,
      price13: prices.price13,
      price14: prices.price14,
      price15: prices.price15,
      price16: prices.price16,
      price17: prices.price17,
      price18: prices.price18,
      price19: prices.price19,
      price20: prices.price20,
      price21: prices.price21,
      price22: prices.price22,
      price23: prices.price23,
      price24: prices.price24,
      price25: prices.price25,
      price26: prices.price26,
      price27: prices.price27,
      price28: prices.price28,
      price29: prices.price29,
      price30: prices.price30,
      // Márgenes también para que se vean en admin
      marginContado,
      pct1A6: y,
      pct7A13: z,
      pct14A30: aa,
      marginC1: margins[0],
      marginC2: margins[1],
      marginC3: margins[2],
      marginC4: margins[3],
      marginC5: margins[4],
      marginC6: margins[5],
      marginC7: margins[6],
      marginC8: margins[7],
      marginC9: margins[8],
      marginC10: margins[9],
      marginC11: margins[10],
      marginC12: margins[11],
      marginC13: margins[12],
      marginC14: margins[13],
      marginC15: margins[14],
      marginC16: margins[15],
      marginC17: margins[16],
      marginC18: margins[17],
      marginC19: margins[18],
      marginC20: margins[19],
      marginC21: margins[20],
      marginC22: margins[21],
      marginC23: margins[22],
      marginC24: margins[23],
      marginC25: margins[24],
      marginC26: margins[25],
      marginC27: margins[26],
      marginC28: margins[27],
      marginC29: margins[28],
      marginC30: margins[29],
      costProd: t,
      // price/cost legados
      price: priceContado,
      cost: t,
    };

    await db.product.update({ where: { sku: p.sku }, data });
    console.log(`✓ ${p.sku}: priceContado=${priceContado}, price1=${prices.price1}, price2=${prices.price2}, price12=${prices.price12}, price30=${prices.price30}`);
  }
  console.log("Listo!");
}
main().finally(() => db.$disconnect());
