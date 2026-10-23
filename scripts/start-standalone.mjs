/**
 * Arranca el servidor de producción (build standalone) de forma
 * multiplataforma, sin depender de `NODE_ENV=...` de Unix.
 *
 * Uso:  node scripts/start-standalone.mjs   (o bun run start:standalone)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const server = join(process.cwd(), ".next", "standalone", "server.js");

if (!existsSync(server)) {
  console.error(
    "✗ No existe .next/standalone/server.js\n  Corré: bun run build:standalone"
  );
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: process.env.PORT || "3000",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
