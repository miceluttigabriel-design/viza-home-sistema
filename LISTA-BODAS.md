# Lista de bodas en el cotizador

Funcionalidad nueva como **opción propia del menú PRESUPUESTAR** (igual que PLAN
CUOTA / SAFRA / CHEQUE): el vendedor arma una lista de productos con el mismo
carrito de la cotización, la guarda en la base de datos con el **título de los
novios** y puede generar un PDF con el diseño VIZA.

## Qué se agregó

| Archivo | Para qué |
| --- | --- |
| `prisma/schema.prisma` | Modelos `WeddingList` y `WeddingListItem` (relación con `User`). |
| `src/store/wedding-list.ts` | Estado del formulario (título, fecha, notas, lista en edición). |
| `src/store/cotizacion.ts` | Acción `setItems` para cargar una lista guardada en el carrito. |
| `src/app/api/wedding-lists/route.ts` | API REST: `POST` (crear), `PUT` (editar), `GET` (listar), `DELETE` (borrar). |
| `src/app/api/wedding-lists/pdf/route.ts` | PDF de la lista con planes de financiación. |
| `src/components/viza/wedding-list-section.tsx` | Sección UI de la opción LISTA DE BODAS. |
| `src/components/viza/sales-panel.tsx` | Integración como opción del menú PRESUPUESTAR y planes compartidos del PDF. |

## ⚠️ Paso obligatorio: crear las tablas

Antes de usar la función hay que aplicar el schema (las tablas nuevas NO existen
en la base actual):

```bash
bun run db:push
```

En producción (Vercel + Neon) correr el mismo comando con la `DATABASE_URL` de
producción, o ejecutar este SQL en el editor de Neon:

```sql
CREATE TABLE IF NOT EXISTS "WeddingList" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "eventDate" TEXT,
  "notes" TEXT,
  "vendorName" TEXT NOT NULL DEFAULT 'Vendedor VIZA',
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeddingList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WeddingListItem" (
  "id" TEXT NOT NULL,
  "weddingListId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "data" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeddingListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeddingList_userId_idx" ON "WeddingList"("userId");
CREATE INDEX IF NOT EXISTS "WeddingListItem_weddingListId_idx" ON "WeddingListItem"("weddingListId");

ALTER TABLE "WeddingList" ADD CONSTRAINT "WeddingList_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeddingListItem" ADD CONSTRAINT "WeddingListItem_weddingListId_fkey"
  FOREIGN KEY ("weddingListId") REFERENCES "WeddingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

## Cómo se usa

1. Abrir **PRESUPUESTAR → LISTA DE BODAS** (es una opción más, no está dentro de PLAN CUOTA).
2. Agregar productos con el buscador (como siempre).
3. En la sección **LISTA DE BODAS** escribir el título, ej. `Juan Pérez & María López`
   (opcionalmente fecha del evento y observaciones).
4. Apretar **GUARDAR LISTA**. Queda en la BD asociada al vendedor que la creó.
5. **PDF DE BODAS** descarga el presupuesto con el título de los novios, los
   productos, el total contado y las opciones de financiación ya calculadas.
6. **GUARDADAS** muestra las listas guardadas: **Cargar** vuelve a poner los
   productos en el carrito (con todos sus precios/cuotas) para seguir cotizando,
   y **Cargar** sobre una lista ya abierta permite editarla; el botón de papelera
   la borra.

## Permisos

- Vendedores (`colaborador` / `representante`): ven, crean, editan y borran
  **solo sus propias** listas.
- `admin` y `supremo_admin`: ven y pueden editar/borrar **todas** las listas.

## Validación realizada

- `bun run typecheck` → sin errores.
- `bun run lint` → sin errores (2 warnings preexistentes en otros archivos).
- `bun run build` → compila e incluye `/api/wedding-lists` y `/api/wedding-lists/pdf`.
