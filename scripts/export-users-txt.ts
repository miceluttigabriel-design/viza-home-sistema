import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({
    orderBy: { role: "asc" },
    select: { email: true, name: true, role: true, id: true },
  });

  const lines: string[] = [];
  lines.push("=".repeat(80));
  lines.push("  LISTADO DE USUARIOS Y CONTRASEÑAS - VIZA HOME E.A.S");
  lines.push("  Sistema de Cotización y Presupuestos");
  lines.push("=".repeat(80));
  lines.push("");

  // SUPREMO ADMIN
  lines.push("👑 SUPREMO ADMINISTRADOR (Acceso Total + Gestión de Contraseñas)");
  lines.push("-".repeat(80));
  for (const u of users.filter(u => u.role === "supremo_admin")) {
    const log = await db.passwordLog.findFirst({
      where: { userId: u.id },
      orderBy: { fechaCambio: "desc" },
    });
    const pwd = log?.contrasenaTextoPlano || "(no registrado)";
    lines.push(`  ${u.email.padEnd(40)} | ${pwd}`);
    lines.push(`  ${u.name || ""}`);
    lines.push("");
  }

  // ADMINS
  lines.push("🔐 USUARIOS ADMIN (Acceso Total: Admin + Ventas)");
  lines.push("-".repeat(80));
  for (const u of users.filter(u => u.role === "admin")) {
    const log = await db.passwordLog.findFirst({
      where: { userId: u.id },
      orderBy: { fechaCambio: "desc" },
    });
    const pwd = log?.contrasenaTextoPlano || "(no registrado)";
    lines.push(`  ${u.email.padEnd(40)} | ${pwd}`);
    lines.push(`  ${u.name || ""}`);
    lines.push("");
  }

  // REPRESENTANTES
  lines.push("👥 USUARIOS REGULARES (Solo Ventas - Solo Lectura en Admin)");
  lines.push("-".repeat(80));
  for (const u of users.filter(u => u.role === "representante")) {
    const log = await db.passwordLog.findFirst({
      where: { userId: u.id },
      orderBy: { fechaCambio: "desc" },
    });
    const pwd = log?.contrasenaTextoPlano || "(no registrado)";
    lines.push(`  ${u.email.padEnd(40)} | ${pwd}`);
    lines.push(`  ${u.name || ""}`);
  }

  lines.push("");
  lines.push("=".repeat(80));
  lines.push("  Total usuarios: " + users.length);
  lines.push("  Supremo Admin: 1");
  lines.push("  Admin: " + users.filter(u => u.role === "admin").length);
  lines.push("  Representante: " + users.filter(u => u.role === "representante").length);
  lines.push("=".repeat(80));
  lines.push("");
  lines.push("  ⚠️ IMPORTANTE: Cambiar contraseñas en el primer acceso");
  lines.push("  Este archivo es confidencial - Solo para uso del Supremo Admin");
  lines.push("");

  const output = lines.join("\n");
  console.log(output);

  // Guardar archivo FUERA del repositorio: contiene contraseñas legibles.
  // Podés cambiar la ruta con la variable USERS_EXPORT_PATH.
  const fs = await import("fs");
  const path = await import("path");
  const outputPath =
    process.env.USERS_EXPORT_PATH ||
    path.join(process.cwd(), "..", "LISTADO-USUARIOS-VIZA-HOME.txt");
  fs.writeFileSync(outputPath, output);
  console.log(`\n>>> Archivo guardado: ${outputPath}`);
  console.log(">>> ⚠️  Archivo confidencial: no lo subas a GitHub ni lo compartas.");

  await db.$disconnect();
}

main().catch(console.error);
