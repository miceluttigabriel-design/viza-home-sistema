/**
 * RESETEAR SUPREMO ADMIN
 *
 * Garantiza que el usuario supremo admin exista y esté activo, con una
 * contraseña conocida por vos (NO hardcodeada en el repositorio).
 *
 * Uso:
 *   SUPREMO_EMAIL="tu@email.com" SUPREMO_PASSWORD="TuClaveSegura123!" \
 *     bunx tsx scripts/resetear-supremo-admin.ts
 *
 * Si no pasás SUPREMO_PASSWORD, el script genera una contraseña aleatoria
 * fuerte y la muestra UNA sola vez en la terminal.
 *
 * Este script NO guarda la contraseña en texto plano (PasswordLog): esa
 * bitácora es un riesgo de seguridad. Si la perdés, volvé a correr el script.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const db = new PrismaClient();

const SUPREMO_EMAIL = (process.env.SUPREMO_EMAIL || "viza.cobranza@viza.com.py")
  .toLowerCase()
  .trim();
const SUPREMO_NOMBRE =
  process.env.SUPREMO_NOMBRE || "GABRIEL HENRIQUE MICELUTTI DA SILVA";

function generarPassword(): string {
  return `Viza${randomBytes(9).toString("base64url")}!9`;
}

async function main() {
  const password = process.env.SUPREMO_PASSWORD || generarPassword();
  const generada = !process.env.SUPREMO_PASSWORD;

  console.log("=== RESETEAR SUPREMO ADMIN ===\n");
  console.log(`Email objetivo: ${SUPREMO_EMAIL}`);

  if (password.length < 8) {
    console.error("✗ SUPREMO_PASSWORD debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const existente = await db.user.findUnique({ where: { email: SUPREMO_EMAIL } });

  const supremo = existente
    ? await db.user.update({
        where: { email: SUPREMO_EMAIL },
        data: {
          name: SUPREMO_NOMBRE,
          password: hash,
          role: "supremo_admin",
          active: true,
        },
      })
    : await db.user.create({
        data: {
          email: SUPREMO_EMAIL,
          name: SUPREMO_NOMBRE,
          password: hash,
          role: "supremo_admin",
          active: true,
        },
      });

  console.log(
    existente
      ? "✓ Supremo admin ACTUALIZADO (rol, activo, contraseña)"
      : "✓ Supremo admin CREADO"
  );

  // Limpiar contraseñas viejas en texto plano de ese usuario.
  const borrados = await db.passwordLog.deleteMany({ where: { userId: supremo.id } });
  if (borrados.count > 0) {
    console.log(`✓ ${borrados.count} registro(s) de contraseña en texto plano eliminados`);
  }

  // Verificación final
  const verificado = await db.user.findUnique({ where: { email: SUPREMO_EMAIL } });
  const ok = verificado
    ? await bcrypt.compare(password, verificado.password)
    : false;

  console.log("\n=== VERIFICACIÓN ===");
  console.log(`Email:  ${verificado?.email}`);
  console.log(`Nombre: ${verificado?.name}`);
  console.log(`Rol:    ${verificado?.role}`);
  console.log(`Activo: ${verificado?.active}`);
  console.log(`Login válido: ${ok ? "✓ SÍ" : "✗ NO"}`);

  if (!ok) {
    console.error("✗ Algo falló: la contraseña no valida contra el hash guardado.");
    process.exit(1);
  }

  if (generada) {
    console.log("\n=== CONTRASEÑA GENERADA (guardala ahora) ===");
    console.log(`  ${password}`);
    console.log("  No se vuelve a mostrar. Cambiala al entrar al sistema.\n");
  } else {
    console.log("\n✓ Contraseña tomada de SUPREMO_PASSWORD.\n");
  }
}

main()
  .catch((err) => {
    console.error("ERROR FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
