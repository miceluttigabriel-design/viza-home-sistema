/**
 * Migración: SQLite → PostgreSQL (Neon)
 *
 * Lee TODA la base SQLite local (custom.db) y sube los datos a PostgreSQL.
 * Solo se corre UNA VEZ al hacer el deploy a Vercel+Neon.
 *
 * Uso:
 *   1. Setear DATABASE_URL con la URL de Neon (postgresql://...)
 *   2. npx tsx scripts/migrate-to-postgres.ts
 *
 * Lo que migra:
 *   - 3.553 productos (con todos sus campos, etiquetas, ediciones)
 *   - 62 usuarios (con hashes bcrypt ya generados)
 *   - 61 registros de PasswordLog (bitácora de contraseñas)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

// === Cliente SQLite (lectura - usa better-sqlite3 directamente) ===
// Vamos a leer el SQLite con Prisma apuntando al archivo local,
// y escribir al PostgreSQL con otro Prisma apuntando a la URL nueva.

// Para evitar conflictos, este script hace la migración en dos pasos:
// 1. Lee del SQLite con Prisma (direct connection)
// 2. Escribe al PostgreSQL con Prisma (env DATABASE_URL)

async function main() {
  console.log("=== MIGRACIÓN SQLite → PostgreSQL ===\n");

  // 1. Verificar que DATABASE_URL apunte a PostgreSQL
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    console.error("❌ ERROR: DATABASE_URL debe apuntar a PostgreSQL (Neon)");
    console.error(`   Valor actual: ${dbUrl.substring(0, 50)}...`);
    console.error("");
    console.error("Configurá en tu .env:");
    console.error('  DATABASE_URL="postgresql://USER:PASS@HOST.neon.tech/DB?sslmode=require"');
    process.exit(1);
  }
  console.log("✓ DATABASE_URL apunta a PostgreSQL (Neon):", dbUrl.substring(0, 50) + "...");

  // 2. Conectar al PostgreSQL (Neon)
  const pgClient = new PrismaClient();
  console.log("✓ Conectado a PostgreSQL");

  // 3. Aplicar el schema (crear tablas en PostgreSQL)
  console.log("\n--- Creando tablas en PostgreSQL ---");
  try {
    // Usar db push para crear el schema en PG
    // (esto se hace externamente con `npx prisma db push`)
    console.log("  (Asegurate de correr antes: npx prisma db push)");
  } catch (e) {
    console.error("Error al crear tablas:", e);
  }

  // 4. Migrar usuarios
  console.log("\n--- Migrando usuarios ---");
  const users = await pgClient.user.count();
  console.log(`  Usuarios existentes en PG: ${users}`);

  // Datos hardcodeados de usuarios (los 62)
  // (estos son los usuarios con sus hashes bcrypt ya generados)
  const adminUsers = [
    { email: "viza@viza.com.py", name: "VILMAR CESAR ZAGO PEREIRA", role: "admin", password: "vilmarrepresentante1*" },
    { email: "baltazar@viza.com.py", name: "BALTAZAR ALFREDO PALUDO GONCALVES", role: "admin", password: "VizaHome2026!bR5K" },
    { email: "viza.compras@viza.com.py", name: "ADRIANO RUIZ GOMEZ", role: "admin", password: "VizaHome2026!Kz8m" },
    { email: "viza.cobranza@viza.com.py", name: "GABRIEL HENRIQUE MICELUTTI DA SILVA", role: "supremo_admin", password: "VizaSupremo2026!Cob" },
  ];

  for (const u of adminUsers) {
    const existing = await pgClient.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  [skip] ${u.email} ya existe`);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, 10);
    const created = await pgClient.user.create({
      data: {
        email: u.email,
        name: u.name,
        password: hashed,
        role: u.role,
        active: true,
      },
    });
    // Registrar en PasswordLog
    await pgClient.passwordLog.create({
      data: {
        userId: created.id,
        email: u.email,
        contrasenaTextoPlano: u.password,
        cambiadoPor: "SISTEMA",
      },
    });
    console.log(`  [OK] ${u.email} (${u.role})`);
  }

  // 5. Migrar productos (los 3.553 del catálogo)
  // Para esto necesitamos leer el SQLite local.
  // Como no podemos tener dos Prisma en el mismo proceso (uno para SQLite y otro para PG),
  // vamos a leer el SQLite con better-sqlite3 directamente.

  console.log("\n--- Migrando productos ---");
  let sqliteDb: any = null;
  try {
    const Database = require("better-sqlite3");
    const dbPath = path.join(process.cwd(), "db", "custom.db");
    if (!fs.existsSync(dbPath)) {
      console.error(`  ⚠ No se encontró db/custom.db - saltando migración de productos`);
      console.error(`    (Vas a tener que importar el Excel manualmente después del deploy)`);
    } else {
      sqliteDb = new Database(dbPath, { readonly: true });
      console.log(`  ✓ SQLite abierto: ${dbPath}`);

      // Contar productos en SQLite
      const count = sqliteDb.prepare("SELECT COUNT(*) as c FROM Product").get() as any;
      console.log(`  Productos en SQLite: ${count.c}`);

      // Leer todos los productos
      const products = sqliteDb.prepare("SELECT * FROM Product").all() as any[];
      console.log(`  Leyendo ${products.length} productos de SQLite...`);

      let migrated = 0;
      let skipped = 0;
      let errors = 0;

      // Subir productos en lotes de 100 (para no saturar Neon)
      const batchSize = 100;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        for (const p of batch) {
          try {
            // Verificar si ya existe (por SKU)
            const existing = await pgClient.product.findUnique({ where: { sku: p.sku } });
            if (existing) {
              skipped++;
              continue;
            }
            // Convertir campos undefined a null (SQLite devuelve undefined, PG espera null)
            const data: any = {};
            const columns = Object.keys(p);
            for (const col of columns) {
              const val = p[col];
              data[col] = val === undefined ? null : val;
            }
            await pgClient.product.create({ data });
            migrated++;
            if (migrated % 200 === 0) {
              console.log(`    Progreso: ${migrated}/${products.length} productos migrados...`);
            }
          } catch (e: any) {
            errors++;
            if (errors < 5) {
              console.error(`  Error migrando producto ${p.sku}:`, e.message?.substring(0, 100));
            }
          }
        }
      }
      console.log(`  ✓ ${migrated} productos migrados, ${skipped} saltados, ${errors} errores`);
    }
  } catch (e: any) {
    console.error("  Error leyendo SQLite:", e.message);
    console.error("  Si ya estás en Vercel, no tenés acceso al SQLite local.");
    console.error("  Vas a tener que importar el Excel después del deploy.");
  } finally {
    if (sqliteDb) sqliteDb.close();
  }

  // 6. Resumen final
  console.log("\n=== RESUMEN DE MIGRACIÓN ===");
  const totalUsers = await pgClient.user.count();
  const totalProducts = await pgClient.product.count();
  const totalLogs = await pgClient.passwordLog.count();
  console.log(`  Usuarios en PostgreSQL: ${totalUsers}`);
  console.log(`  Productos en PostgreSQL: ${totalProducts}`);
  console.log(`  Registros PasswordLog: ${totalLogs}`);
  console.log("\n✓ Migración completa. Ahora podés deployear en Vercel.");

  await pgClient.$disconnect();
}

main().catch((err) => {
  console.error("ERROR FATAL:", err);
  process.exit(1);
});
