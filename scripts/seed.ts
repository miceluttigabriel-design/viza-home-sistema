// Seed VIZA HOME E.A.S - productos de muestra + usuarios
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Usamos placeholders de imágenes con la marca VIZA y estilo visual
const IMG = {
  muebles: (n: string) => `https://placehold.co/600x400/f97316/ffffff/png?text=${encodeURIComponent("VIZA\\n" + n)}`,
  electros: (n: string) => `https://placehold.co/600x400/0ea5e9/ffffff/png?text=${encodeURIComponent("VIZA\\n" + n)}`,
  motos: (n: string) => `https://placehold.co/600x400/dc2626/ffffff/png?text=${encodeURIComponent("VIZA\\n" + n)}`,
};

const products = [
  // ===== MUEBLES =====
  { sku: "MUE-001", name: "Sofá 3 Cuerpos Clásico", description: "Sofá de 3 cuerpos tapizado en tela premium, estructura de madera maciza, patas de hierro.", category: "Muebles", subcategory: "Sillones", price: 450000, cost: 320000, stock: 8, brand: "VIZA Home", imageUrl: IMG.muebles("Sofá 3") },
  { sku: "MUE-002", name: "Sofá Esquinero L Modular", description: "Rincón moderno, capacidad 5 personas, tapizado en pana antidesgarro. Incluye cojines.", category: "Muebles", subcategory: "Sillones", price: 680000, cost: 480000, stock: 5, brand: "VIZA Home", imageUrl: IMG.muebles("Esquinero") },
  { sku: "MUE-003", name: "Sillon Reclinable Individual", description: "Sillón reclinable con sistema relax, reposapiés extensible, tapizado en cuerina.", category: "Muebles", subcategory: "Sillones", price: 195000, cost: 130000, stock: 12, brand: "VIZA Home", imageUrl: IMG.muebles("Reclinable") },
  { sku: "MUE-004", name: "Comedor 4 Sillas Madera", description: "Mesa de comedor para 4 personas con sillas tapizadas. Madera de pino maciza.", category: "Muebles", subcategory: "Comedores", price: 390000, cost: 270000, stock: 6, brand: "VIZA Home", imageUrl: IMG.muebles("Comedor 4") },
  { sku: "MUE-005", name: "Comedor 6 Sillas Cristal", description: "Mesa de cristal templado con estructura cromada, 6 sillas tapizadas en ecocuero.", category: "Muebles", subcategory: "Comedores", price: 720000, cost: 510000, stock: 4, brand: "VIZA Premium", imageUrl: IMG.muebles("Comedor 6") },
  { sku: "MUE-006", name: "Cama Matrimonial 2 Plazas", description: "Cama de plaza de melamina reforzada con mesas de noche incluidas.", category: "Muebles", subcategory: "Dormitorio", price: 540000, cost: 380000, stock: 7, brand: "VIZA Home", imageUrl: IMG.muebles("Cama 2p") },
  { sku: "MUE-007", name: "Cama 1 Plaza Marroquí", description: "Cama individual marroquí, ideal para niños o habitaciones pequeñas. Incluye cajones.", category: "Muebles", subcategory: "Dormitorio", price: 290000, cost: 200000, stock: 9, brand: "VIZA Home", imageUrl: IMG.muebles("Cama 1p") },
  { sku: "MUE-008", name: "Placard 4 Puertas Grande", description: "Placard amplio con 4 puertas correderas, interior con estantes y barra.", category: "Muebles", subcategory: "Dormitorio", price: 610000, cost: 430000, stock: 5, brand: "VIZA Home", imageUrl: IMG.muebles("Placard") },
  { sku: "MUE-009", name: "Mesa de Luz 2 Cajones", description: "Mesa de noche con 2 cajones, acabado nogal. Pies metálicos pintados.", category: "Muebles", subcategory: "Dormitorio", price: 89000, cost: 58000, stock: 18, brand: "VIZA Home", imageUrl: IMG.muebles("Mesa Luz") },
  { sku: "MUE-010", name: "Rack TV Madera y Negro", description: "Rack para TV hasta 55 pulgadas, con estantes abiertos y cajones.", category: "Muebles", subcategory: "Living", price: 260000, cost: 180000, stock: 10, brand: "VIZA Home", imageUrl: IMG.muebles("Rack TV") },
  { sku: "MUE-011", name: "Silla Gamer Pro Ergonómica", description: "Silla gamer reclinable, soporte lumbar ajustable, reposabrazos 4D.", category: "Muebles", subcategory: "Sillas", price: 320000, cost: 220000, stock: 14, brand: "VIZA Gaming", imageUrl: IMG.muebles("Gamer") },

  // ===== ELECTRODOMÉSTICOS =====
  { sku: "ELE-001", name: "Heladera No Frost 383L", description: "Heladera No Frost con freezer inferior, eficiencia A++, capacidad 383 litros.", category: "Electrodomesticos", subcategory: "Cocina", price: 850000, cost: 620000, stock: 6, brand: "VIZA Tech", imageUrl: IMG.electros("Heladera") },
  { sku: "ELE-002", name: "Cocina 4 Hornallas Acero", description: "Cocina a gas con 4 hornallas, horno eléctrico y encendedor automático.", category: "Electrodomesticos", subcategory: "Cocina", price: 520000, cost: 370000, stock: 9, brand: "VIZA Tech", imageUrl: IMG.electros("Cocina 4") },
  { sku: "ELE-003", name: "Anafe 4 Fuego Vitrocerámico", description: "Anafe eléctrico vitrocerámico, 4 fuegos, control táctil digital.", category: "Electrodomesticos", subcategory: "Cocina", price: 380000, cost: 270000, stock: 7, brand: "VIZA Tech", imageUrl: IMG.electros("Anafe") },
  { sku: "ELE-004", name: "Lavarropas Automático 9kg", description: "Lavarropas automático, carga frontal 9kg, 12 programas, eficiencia A+.", category: "Electrodomesticos", subcategory: "Lavanderia", price: 690000, cost: 490000, stock: 5, brand: "VIZA Tech", imageUrl: IMG.electros("Lavarropas") },
  { sku: "ELE-005", name: "Secarropas Condensación 8kg", description: "Secarropas por condensación, 8kg, 16 programas, sensor de humedad.", category: "Electrodomesticos", subcategory: "Lavanderia", price: 780000, cost: 560000, stock: 3, brand: "VIZA Tech", imageUrl: IMG.electros("Secarropas") },
  { sku: "ELE-006", name: "Smart TV 50\" 4K UHD", description: "Smart TV 50 pulgadas 4K UHD, Android TV, Wi-Fi, HDR10+.", category: "Electrodomesticos", subcategory: "Entretenimiento", price: 590000, cost: 410000, stock: 12, brand: "VIZA Tech", imageUrl: IMG.electros("TV 50") },
  { sku: "ELE-007", name: "Smart TV 65\" QLED 4K", description: "Smart TV 65 pulgadas QLED, HDR10, Dolby Vision, control por voz.", category: "Electrodomesticos", subcategory: "Entretenimiento", price: 980000, cost: 720000, stock: 4, brand: "VIZA Premium", imageUrl: IMG.electros("TV 65") },
  { sku: "ELE-008", name: "Aire Acondicionado 3000 Frigorías", description: "Split frío/calor 3000 frigorías, inverter, eficiencia A, control Wi-Fi.", category: "Electrodomesticos", subcategory: "Climatización", price: 620000, cost: 450000, stock: 8, brand: "VIZA Tech", imageUrl: IMG.electros("Aire 3000") },
  { sku: "ELE-009", name: "Aire Split 4500 Inverter", description: "Split inverter 4500 frigorías frío/calor, ideal ambiente grande.", category: "Electrodomesticos", subcategory: "Climatización", price: 870000, cost: 630000, stock: 5, brand: "VIZA Tech", imageUrl: IMG.electros("Aire 4500") },
  { sku: "ELE-010", name: "Microondas 28L Grill", description: "Microondas 28 litros con grill, 10 niveles de potencia, 8 programas.", category: "Electrodomesticos", subcategory: "Cocina", price: 175000, cost: 120000, stock: 15, brand: "VIZA Tech", imageUrl: IMG.electros("Microondas") },
  { sku: "ELE-011", name: "Cafetera Express Italiana", description: "Cafetera express con molinillo, presión 15 bares, espumador de leche.", category: "Electrodomesticos", subcategory: "Cocina", price: 290000, cost: 200000, stock: 9, brand: "VIZA Premium", imageUrl: IMG.electros("Cafetera") },
  { sku: "ELE-012", name: "Aspiradora Robot Inteligente", description: "Robot aspirador con mapeo láser, control por app, autonomía 180 min.", category: "Electrodomesticos", subcategory: "Limpieza", price: 410000, cost: 290000, stock: 6, brand: "VIZA Tech", imageUrl: IMG.electros("Robot") },

  // ===== MOTOS =====
  { sku: "MOT-001", name: "Moto 110cc Urbana", description: "Moto 110cc, arranque eléctrico, frenos a disco delantero, perfecto para reparto.", category: "Motos", subcategory: "Urbana", price: 1250000, cost: 920000, stock: 4, brand: "VIZA Moto", imageUrl: IMG.motos("110cc") },
  { sku: "MOT-002", name: "Moto 150cc Custom", description: "Moto 150cc estilo custom, llantas grandes, asiento cómodo para 2 personas.", category: "Motos", subcategory: "Custom", price: 1680000, cost: 1250000, stock: 3, brand: "VIZA Moto", imageUrl: IMG.motos("150cc") },
  { sku: "MOT-003", name: "Moto 200cc Sport", description: "Moto deportiva 200cc, carenado completo, escape deportivo, ABS.", category: "Motos", subcategory: "Sport", price: 2150000, cost: 1620000, stock: 5, brand: "VIZA Moto", imageUrl: IMG.motos("200cc") },
  { sku: "MOT-004", name: "Moto 250cc Aventura", description: "Moto tipo adventure 250cc, suspensión alta, ideal para rutas y ciudad.", category: "Motos", subcategory: "Adventure", price: 2680000, cost: 2010000, stock: 2, brand: "VIZA Moto", imageUrl: IMG.motos("250cc") },
  { sku: "MOT-005", name: "Casco Integral Premium", description: "Casco integral con visera solar, certificación DOT, interior lavable.", category: "Motos", subcategory: "Accesorios", price: 145000, cost: 98000, stock: 20, brand: "VIZA Moto", imageUrl: IMG.motos("Casco") },
  { sku: "MOT-006", name: "Guantes y Chaqueta Set", description: "Set completo de seguridad: guantes, chaqueta con refuerzos y antiparras.", category: "Motos", subcategory: "Accesorios", price: 220000, cost: 150000, stock: 12, brand: "VIZA Moto", imageUrl: IMG.motos("Set") },
  { sku: "MOT-007", name: "Baul 35L Para Moto", description: "Baúl trasero 35 litros con luz de freno, base universal, incluye llaves.", category: "Motos", subcategory: "Accesorios", price: 95000, cost: 62000, stock: 18, brand: "VIZA Moto", imageUrl: IMG.motos("Baul") },
  { sku: "MOT-008", name: "Moto 110cc Premium Edición", description: "Edición limitada 110cc con detalles premium, frenos ABS, encendido keyless.", category: "Motos", subcategory: "Premium", price: 1480000, cost: 1100000, stock: 2, brand: "VIZA Premium", imageUrl: IMG.motos("110 Premium") },
];

async function main() {
  console.log("Limpiando base de datos...");
  await db.quoteItem.deleteMany();
  await db.quote.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany();

  console.log(`Insertando ${products.length} productos VIZA HOME...`);
  for (const p of products) {
    await db.product.create({ data: p });
  }

  // Crear usuarios administradores iniciales.
  // IMPORTANTE: las contraseñas NO se hardcodean en el repo (la repo es pública).
  // Se leen de variables de entorno; si no existen, se genera una aleatoria y se
  // muestra una sola vez en la terminal.
  console.log("Creando usuarios...");
  const { randomBytes } = await import("crypto");
  const genPass = () => `Viza${randomBytes(6).toString("base64url")}!9`;

  const adminPass = process.env.SEED_ADMIN_PASSWORD || genPass();
  const supremoPass = process.env.SEED_SUPREMO_PASSWORD || genPass();
  const vendedorPass = process.env.SEED_VENDEDOR_PASSWORD || genPass();

  const vilmarPass = await bcrypt.hash(adminPass, 10);
  const gabrielPass = await bcrypt.hash(supremoPass, 10);
  const vendedorHash = await bcrypt.hash(vendedorPass, 10);

  // Administradores
  await db.user.create({
    data: {
      email: "viza@viza.com.py",
      name: "Vilmar (Admin)",
      password: vilmarPass,
      role: "admin",
    },
  });

  await db.user.create({
    data: {
      email: "viza.cobranza@viza.com.py",
      name: "Gabriel (Cobranzas)",
      password: gabrielPass,
      role: "admin",
    },
  });

  // Vendedor demo (para ver la lista de precios)
  await db.user.create({
    data: {
      email: "vendedor@viza.com.py",
      name: "COMERCIAL VIZA HOME E.A.S",
      password: vendedorHash,
      role: "representante",
    },
  });

  console.log("Seed completado!");
  console.log(`   - Productos: ${products.length}`);
  console.log(`   - Muebles: ${products.filter(p => p.category === "Muebles").length}`);
  console.log(`   - Electrodomesticos: ${products.filter(p => p.category === "Electrodomesticos").length}`);
  console.log(`   - Motos: ${products.filter(p => p.category === "Motos").length}`);
  console.log("   - Usuarios creados (guardá estas contraseñas, no se vuelven a mostrar):");
  console.log(`     * viza@viza.com.py / ${adminPass} (Vilmar)`);
  console.log(`     * viza.cobranza@viza.com.py / ${supremoPass} (Gabriel)`);
  console.log(`     * vendedor@viza.com.py / ${vendedorPass} (COMERCIAL VIZA HOME E.A.S)`);
}

main()
  .catch((e) => {
    console.error("Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
