/**
 * Copia los archivos que `next build` deja fuera de `.next/standalone`.
 *
 * Reemplaza el viejo `cp -r` de package.json (que solo funciona en Linux/Mac)
 * y hace el build Standalone funcionar también en Windows.
 *
 * Uso:  node scripts/copy-standalone.mjs
 */
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");

if (!existsSync(standalone)) {
  console.error(
    "✗ No existe .next/standalone.\n  Corré primero: bun run build (o npm run build)"
  );
  process.exit(1);
}

if (existsSync(staticDir)) {
  cpSync(staticDir, join(standalone, ".next", "static"), { recursive: true });
}

if (existsSync(publicDir)) {
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

console.log("✓ Build standalone listo: .next/static y public copiados.");
