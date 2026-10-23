import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isProduction = process.env.NODE_ENV === "production";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // En produccion NO loguear queries: ensucia los logs de Vercel y puede
    // exponer datos de clientes/productos. Solo errores.
    log: isProduction ? ["error"] : ["warn", "error"],
  });

if (!isProduction) globalForPrisma.prisma = db;
