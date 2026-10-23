# 🔐 Seguridad — VIZA HOME

Este documento registra los riesgos detectados, lo que ya se corrigió y lo que
falta hacer. **El repositorio es público**, así que cualquier secreto que haya
estado en el código debe considerarse comprometido.

> Última revisión: 2026-10-23

---

## 🚨 Acciones urgentes (hacé esto primero)

1. **Cambiar TODAS las contraseñas** que aparecían en `DEPLOY-VERCEL.md` y en
   los scripts del repo (supremo admin, admins y colaboradores).
   ```bash
   SUPREMO_EMAIL="viza.cobranza@viza.com.py" bunx tsx scripts/resetear-supremo-admin.ts
   ```
   Para el resto de usuarios: usar **Gestión de Accesos → Resetear contraseña**.
2. **Rotar `NEXTAUTH_SECRET`** en Vercel (Settings → Environment Variables).
   Al cambiarlo, todas las sesiones activas se cierran (es lo esperado).
3. **Verificar que `.env` nunca fue commiteado**:
   ```bash
   git log --all --full-history -- .env
   ```
   Si aparece, hay que rotar todo lo que contenía y limpiar el historial
   (git filter-repo / BFG).
4. **Revisar accesos al repositorio**: quién tiene permiso de escritura.

---

## ✅ Correcciones aplicadas en este commit

| # | Problema | Solución |
| --- | --- | --- |
| 1 | `NEXTAUTH_SECRET` tenía un valor por defecto hardcodeado en `src/lib/auth.ts` (permitía falsificar sesiones de admin). | En producción el servidor **falla al arrancar** si la variable no está definida. |
| 2 | `GET /api/quotes` no pedía sesión y devolvía presupuestos de todos los clientes. | Requiere sesión; `colaborador` solo ve los propios. |
| 3 | Rutas de PDF (`/api/quotes/pdf`, `/cheque-pdf`, `/safra-pdf`) eran públicas. | Requieren sesión. |
| 4 | Sin límite de intentos de login (fuerza bruta). | Rate limit: 5 intentos / 15 min por IP + email (`src/lib/rate-limit.ts`). |
| 5 | `PrismaClient` logueaba **todas** las queries en producción (ruido y fuga de datos en logs). | Solo `error` en producción. |
| 6 | Contraseñas hardcodeadas en `scripts/` y en `DEPLOY-VERCEL.md`. | Reemplazadas por variables de entorno / generación aleatoria. |
| 7 | `scripts/export-users-txt.ts` escribía en una ruta inexistente y dentro del proyecto. | Escribe fuera del repo, con aviso de confidencialidad. |
| 8 | Persistencia de Zustand rota: guardaba `"[object Object]"` y el carrito no sobrevivía al reload. | Storage JSON por usuario (`createUserScopedStorage`). |
| 9 | `npm run build` / `dev` / `start` usaban comandos Unix (`cp -r`, `tee`, `NODE_ENV=...`), rompían en Windows. | Scripts multiplataforma (`scripts/*.mjs`). |
| 10 | `db:push` forzaba `--accept-data-loss` por defecto. | Ahora pide confirmación; el forzado es `db:push:force`. |

---

## ⚠️ Riesgos pendientes (requieren decisión del negocio)

### 1. Contraseñas guardadas en texto plano — CRÍTICO

`PasswordLog.contrasenaTextoPlano` guarda la contraseña legible de cada usuario
y el endpoint `/api/admin/usuarios/[id]/historial` la devuelve al `supremo_admin`.
Además, `cambiar-contrasena` y `resetar` escriben ahí.

**Por qué es grave:** si la base se filtra (o alguien obtiene una sesión de
supremo), se llevan **todas las contraseñas**, y como la gente reutiliza
contraseñas, también las de sus correos/bancos.

**Recomendación:**

- Dejar de guardar contraseñas. El reset puede devolver la nueva contraseña
  **una sola vez** en la respuesta HTTP (el admin la copia y se la pasa al
  usuario); no hace falta persistirla.
- La “bitácora” pasa a mostrar solo `fechaCambio` + `cambiadoPor`, sin el valor.
- Deprecar la columna en una migración posterior.

Mientras no se cambie, limitar quién es `supremo_admin` y auditar sus accesos.

### 2. `typescript.ignoreBuildErrors: true`

`next.config.ts` ignora los errores de TypeScript en el build. Eso permite
deployar código roto. Se agregó `bun run typecheck` y CI para detectarlos, pero
lo ideal es poner `ignoreBuildErrors: false` cuando el typecheck esté limpio.

### 3. Tipos de cambio hardcodeados

`1100` (R$→Gs) y `6000` (US$→Gs) están repetidos en varios archivos. Si cambia
el dólar, hay que tocar código y redeployar. Conviene moverlos a variables de
entorno o a una tabla `Setting` en la base.

### 4. Rate limit en memoria

El límite de login vive en la memoria de cada instancia serverless. En Vercel
con varias instancias el límite real es más alto. Para protección fuerte:
Upstash Redis o Vercel KV.

### 5. Datos sensibles en `localStorage`

Los stores guardan cliente y carrito por usuario en el navegador. En una PC
compartida, alguien con acceso al navegador puede leerlos. No es crítico, pero
conviene limpiar el storage al cerrar sesión.

### 6. Sin backups verificados

Neon tiene backups automáticos; conviene probar una restauración al menos una
vez y documentar el procedimiento.

---

## 🧭 Buenas prácticas para el equipo

- Nunca pegar contraseñas, tokens o datos de clientes en issues/commits.
- Usar contraseñas distintas para el sistema y el correo.
- Activar 2FA en GitHub y Vercel.
- Revisar `git status` antes de cada commit (sobre todo `.env` y archivos Excel).
- Si una credencial se filtró: **rotarla primero**, después limpiar el historial.
