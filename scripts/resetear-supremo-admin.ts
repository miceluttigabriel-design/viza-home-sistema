/**
 * RESETEAR SUPREMO ADMIN - Script bulletproof
 *
 * Garantiza que el usuario supremo admin esté SIEMPRE en estado correcto:
 *   - Email: viza.cobranza@viza.com.py
 *   - Nombre: GABRIEL HENRIQUE MICELUTTI DA SILVA
 *   - Rol: supremo_admin
 *   - Activo: true
 *   - Contraseña: VizaSupremo2026!Cob (con V y S mayúsculas, y el signo !)
 *
 * Este script:
 *   1. Verifica si el supremo existe en la BD
 *   2. Si NO existe → lo crea con la contraseña correcta
 *   3. Si existe → actualiza todos los campos (rol, activo, contraseña)
 *   4. Inserta en la bitácora PasswordLog para que el supremo pueda
 *      ver su propia contraseña desde su panel (recuperación)
 *   5. Verifica que el login funcione con bcrypt.compare()
 *
 * Uso:
 *   npx tsx scripts/resetear-supremo-admin.ts
 *
 * O ejecutá el .bat:
 *   scripts-windows\7-RESETEAR-SUPREMO-ADMIN.bat
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SUPREMO_EMAIL = "viza.cobranza@viza.com.py";
const SUPREMO_NOMBRE = "GABRIEL HENRIQUE MICELUTTI DA SILVA";
const SUPREMO_PASSWORD = "VizaSupremo2026!Cob"; // V y S mayúsculas, con !

async function main() {
  console.log("=== RESETEAR SUPREMO ADMIN ===\n");
  console.log(`Email objetivo: ${SUPREMO_EMAIL}`);
  console.log(`Password objetivo: ${SUPREMO_PASSWORD} (V y S mayúsculas, con !)`);
  console.log("");

  // 1. Buscar al supremo en la BD
  const existente = await db.user.findUnique({
    where: { email: SUPREMO_EMAIL },
  });

  if (!existente) {
    console.log("⚠️  El supremo admin NO existe en la BD. Creándolo...");
  } else {
    console.log("✓ El supremo admin ya existe en la BD. Estado actual:");
    console.log(`  - Rol: ${existente.role}`);
    console.log(`  - Activo: ${existente.active}`);
    console.log(`  - Hash bcrypt: ${existente.password.substring(0, 25)}...`);
  }

  // 2. Generar el hash bcrypt con rounds=10 (mismo que NextAuth usa)
  const nuevoHash = await bcrypt.hash(SUPREMO_PASSWORD, 10);
  console.log("");
  console.log(`Nuevo hash bcrypt generado: ${nuevoHash.substring(0, 30)}...`);

  // 3. Crear o actualizar el supremo
  let supremo;
  if (!existente) {
    supremo = await db.user.create({
      data: {
        email: SUPREMO_EMAIL,
        name: SUPREMO_NOMBRE,
        password: nuevoHash,
        role: "supremo_admin",
        active: true,
      },
    });
    console.log("");
    console.log("✓ Supremo admin CREADO en la BD");
  } else {
    supremo = await db.user.update({
      where: { email: SUPREMO_EMAIL },
      data: {
        name: SUPREMO_NOMBRE,
        password: nuevoHash,
        role: "supremo_admin",
        active: true,
      },
    });
    console.log("");
    console.log("✓ Supremo admin ACTUALIZADO en la BD (rol, activo, contraseña)");
  }

  // 4. Registrar el cambio en la bitácora PasswordLog
  //    (para que el supremo pueda ver su propia contraseña desde su panel)
  await db.passwordLog.create({
    data: {
      userId: supremo.id,
      email: SUPREMO_EMAIL,
      contrasenaTextoPlano: SUPREMO_PASSWORD,
      cambiadoPor: "SISTEMA_RESET",
    },
  });

  // 5. Verificar que el login funcione
  console.log("");
  console.log("=== VERIFICACIÓN FINAL ===");
  const verificado = await db.user.findUnique({
    where: { email: SUPREMO_EMAIL },
  });

  if (!verificado) {
    console.log("❌ ERROR: No se pudo verificar el supremo después de crearlo");
    process.exit(1);
  }

  console.log(`Email: ${verificado.email}`);
  console.log(`Nombre: ${verificado.name}`);
  console.log(`Rol: ${verificado.role}`);
  console.log(`Activo: ${verificado.active}`);

  const passwordValido = await bcrypt.compare(SUPREMO_PASSWORD, verificado.password);
  console.log(`Contraseña '${SUPREMO_PASSWORD}' válida: ${passwordValido ? "✓ SÍ" : "❌ NO"}`);

  // Verificar variantes de contraseña (para detectar errores de tipeo comunes)
  console.log("");
  console.log("=== TEST CON VARIANTES COMUNES (deben dar false) ===");
  const variantes = [
    "vizasupremo2026!Cob",     // minúscula al inicio
    "VIZASUPREMO2026!Cob",     // todo mayúscula
    "vizasupremo2026cob",      // sin mayúsculas ni signo
    "VizaSupremo2026!cob",     // c minúscula al final
    "Vizasupremo2026!Cob",     // S minúscula
    "vizasupremo2026!cob",     // todo minúscula
  ];
  for (const v of variantes) {
    const ok = await bcrypt.compare(v, verificado.password);
    console.log(`  '${v}' → ${ok ? "✓ SÍ (NO debería)" : "❌ NO (correcto)"}`);
  }

  console.log("");
  console.log("=== RESUMEN ===");
  console.log("El supremo admin está listo para hacer login:");
  console.log(`  Email:     ${SUPREMO_EMAIL}`);
  console.log(`  Password:  ${SUPREMO_PASSWORD}`);
  console.log("  (IMPORTANTE: V y S mayúsculas + signo ! + C mayúscula al final)");
  console.log("");
  console.log("Si no podés entrar, revisá que estés escribiendo exactamente:");
  console.log("  VizaSupremo2026!Cob");
  console.log("");
  console.log("Copialo del LEEME-INSTALACION.txt o pegalo directo para evitar");
  console.log("errores de tipeo.");

  await db.$disconnect();
}

main().catch((err) => {
  console.error("ERROR FATAL:", err);
  process.exit(1);
});
