# VIZA HOME E.A.S — Sistema de Cotización y Ventas

Sistema interno para cotizar, armar planes de pago y generar presupuestos en PDF
para **VIZA HOME E.A.S** (Paraguay).

- **Producción:** https://viza-home-sistema.vercel.app
- **Base de datos:** PostgreSQL (Neon) en producción · SQLite opcional en local
- **Autenticación:** NextAuth (credenciales + JWT) con roles

---

## ✨ Qué hace el sistema

| Módulo | Descripción |
| --- | --- |
| **Catálogo / Ventas** | Búsqueda de productos por SKU, nombre, marca, categoría, etc. Precios al contado y en 1–30 cuotas. |
| **Carrito / Cotización** | Armado de presupuesto con cliente, vendedor, descuentos e IVA. |
| **Planes de pago** | Plan **CHEQUE** (cheques a futuro con cronograma e intereses) y Plan **SAFRA** (cuotas con entrada, refuerzos y fechas). |
| **PDF** | Presupuestos con diseño VIZA (logo, colores, pie de página) para contado, cuotas, cheque y safra. |
| **Panel Admin** | ABM de productos, edición de costos/márgenes, etiquetas de color, importación/exportación de Excel, historial de ediciones. |
| **Gestión de accesos** | Solo `supremo_admin`: crear usuarios, activar/desactivar, resetear contraseña. |
| **Estadísticas** | `/api/stats` con métricas para el panel. |

### Roles

| Rol | Acceso |
| --- | --- |
| `colaborador` / `representante` | Solo panel de ventas (catálogo + presupuestos). |
| `admin` | Ventas + panel de administración de productos. |
| `supremo_admin` | Todo lo anterior + gestión de accesos y usuarios. |

---

## 🧰 Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix)
- **Prisma 6** (`@prisma/client`) — PostgreSQL
- **NextAuth 4** (JWT) + **bcryptjs**
- **Zustand** (estado del carrito/planes, persistido por usuario en `localStorage`)
- **jsPDF** (presupuestos), **ExcelJS** (import/export), **Recharts** (gráficos)

---

## 🚀 Puesta en marcha (local)

### 1. Requisitos

- Node.js **20+** (probado con 22) o **Bun 1.2+**
- Una base PostgreSQL (Neon, Supabase, Docker, etc.)
  - *Opcional:* SQLite para pruebas rápidas (ver nota al final)

### 2. Instalar dependencias

```bash
bun install
# o: npm install
```

El `postinstall` ejecuta `prisma generate` automáticamente.

### 3. Variables de entorno

```bash
cp .env.example .env
```

Completá como mínimo:

```env
DATABASE_URL="postgresql://usuario:clave@host/db?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="un-secreto-aleatorio-de-32-o-mas-caracteres"
```

Generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ En producción `NEXTAUTH_SECRET` es **obligatorio**: el servidor no arranca sin él.

### 4. Crear las tablas

```bash
bun run db:push
```

### 5. Crear el primer usuario

```bash
# Crea/resetea el supremo admin (genera contraseña si no pasás SUPREMO_PASSWORD)
bunx tsx scripts/resetear-supremo-admin.ts
```

### 6. Arrancar

```bash
bun run dev
# http://localhost:3000
```

---

## 📜 Scripts disponibles

| Comando | Qué hace |
| --- | --- |
| `bun run dev` | Servidor de desarrollo en `http://localhost:3000`. |
| `bun run build` | Build de producción (Next.js). |
| `bun run build:standalone` | Build + copia de `static`/`public` para el output standalone. |
| `bun run start` | Sirve el build normal (`next start`). |
| `bun run start:standalone` | Sirve el build standalone en producción (multiplataforma). |
| `bun run lint` | ESLint. |
| `bun run typecheck` | Verificación de tipos (`tsc --noEmit`). |
| `bun run db:push` | Sincroniza el schema con la base (pide confirmación si hay pérdida de datos). |
| `bun run db:push:force` | Igual pero con `--accept-data-loss` (**peligroso**). |
| `bun run db:studio` | Prisma Studio para ver/editar datos. |
| `bun run db:migrate` | Crea una migración de Prisma. |

### Scripts de mantenimiento (`scripts/`)

| Script | Para qué |
| --- | --- |
| `resetear-supremo-admin.ts` | Crea/resetea el supremo admin. Contraseña por env o aleatoria. |
| `seed.ts` | Carga productos de ejemplo y 3 usuarios iniciales. |
| `seed-users.ts` | Carga el listado de usuarios de la empresa (contraseñas aleatorias o por env). |
| `import-excel-windows.ts` | Importa el Excel maestro de productos. |
| `migrate-to-postgres.ts` | Migra datos de SQLite local a PostgreSQL. |
| `export-users-txt.ts` | Exporta usuarios **y contraseñas** a un `.txt` fuera del repo (confidencial). |
| `update-sample-prices.ts` | Recalcula precios de los productos de muestra. |

---

## 📁 Estructura

```
src/
├─ app/
│  ├─ page.tsx                 # Router por rol (sales / admin / gestión)
│  ├─ layout.tsx               # Providers + fuentes
│  └─ api/
│     ├─ auth/                 # NextAuth + cambio de contraseña
│     ├─ products/             # CRUD, import/export Excel, etiquetas
│     ├─ quotes/               # Guardar presupuestos + PDF (normal, cheque, safra)
│     ├─ admin/usuarios/       # Gestión de accesos (solo supremo)
│     └─ stats/                # Métricas
├─ components/
│  ├─ viza/                    # Componentes del negocio (paneles, login, PDFs)
│  └─ ui/                      # shadcn/ui
├─ lib/
│  ├─ auth.ts                  # Configuración NextAuth
│  ├─ db.ts                    # Cliente Prisma
│  ├─ rate-limit.ts            # Anti fuerza bruta en login
│  ├─ pdf/                     # Diseño de los PDFs
│  └─ user-scoped-storage.ts   # Persistencia aislada por usuario
├─ store/                      # Zustand: cart, cotización, cheque, safra
└─ hooks/
prisma/schema.prisma           # Modelos: User, PasswordLog, Product, Quote, QuoteItem
scripts/                       # Seeds, migraciones e importadores
public/                        # Logos y video institucional
BACKUP/                        # Copias viejas de componentes (no se compila)
```

---

## 🔐 Seguridad

Antes de tocar código sensible, leé **[SECURITY.md](./SECURITY.md)**.

Puntos clave:

- Nunca subir `.env` al repositorio (ya está en `.gitignore`).
- `NEXTAUTH_SECRET` obligatorio y distinto entre local y producción.
- El repositorio es **público**: no incluir contraseñas, tokens ni datos de clientes.
- El login tiene límite de intentos (5 cada 15 min por IP + email).

---

## ☁️ Deploy

Instrucciones paso a paso en **[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**.

Resumen:

1. Importar el repo en Vercel.
2. Cargar `DATABASE_URL`, `NEXTAUTH_URL` y `NEXTAUTH_SECRET`.
3. Aplicar el schema con `prisma db push`.
4. Crear el supremo admin con `scripts/resetear-supremo-admin.ts`.

---

## 🧪 Solución de problemas

| Problema | Causa / solución |
| --- | --- |
| `NEXTAUTH_SECRET no está configurado` | Falta la variable en `.env` o en Vercel. |
| `Can't reach database server` | `DATABASE_URL` incorrecta o Neon suspendido. |
| Login responde “Email o contraseña incorrectos” siempre | Usuario inactivo o contraseña desincronizada: correr `resetear-supremo-admin.ts`. |
| `prisma generate` falla en Windows | Cerrar procesos de Node y volver a ejecutar `bun install`. |
| Carrito “vacío” al recargar | Ya corregido: la persistencia ahora guarda JSON por usuario. Si tenías datos viejos, se descartan una vez. |

### Nota sobre SQLite en local

El `schema.prisma` está fijado a `provider = "postgresql"`. Para usar SQLite
temporalmente, cambiá el provider a `sqlite` y usá
`DATABASE_URL="file:./db/custom.db"` (no lo commitees).

---

## 📄 Licencia

Software privado de **VIZA HOME E.A.S**. Todos los derechos reservados.
No se permite su redistribución sin autorización.
