# Lista de bodas en el cotizador

Funcionalidad como **opción propia del menú PRESUPUESTAR** (igual que PLAN
CUOTA / SAFRA / CHEQUE): el vendedor arma una lista de regalos con el mismo
carrito de la cotización, asigna cada regalo a la persona que lo entrega, elige
la modalidad de cotización y guarda todo en la base de datos con el **título de
los novios**. Al final puede generar el PDF **Lista de Bodas** con el diseño
VIZA.

## Qué se agregó

| Archivo | Para qué |
| --- | --- |
| `prisma/schema.prisma` | Modelos `WeddingList` y `WeddingListItem` (relación con `User`) + datos del entregante y modalidad por regalo. |
| `src/lib/wedding-list.ts` | Tipos, normalización y cálculo compartido de cada regalo (contado / cuotas / modalidades manuales). |
| `src/store/wedding-list.ts` | Estado del formulario: título, fecha, notas, lista en edición y datos por regalo. |
| `src/store/cotizacion.ts` | Acción `setItems` para cargar una lista guardada en el carrito. |
| `src/app/api/wedding-lists/route.ts` | API REST: `POST` (crear), `PUT` (editar), `GET` (listar), `DELETE` (borrar). |
| `src/app/api/wedding-lists/pdf/route.ts` | PDF del presupuesto de bodas: regalos, entregantes, totales y opciones de financiación. |
| `src/app/api/wedding-lists/listado/route.ts` | PDF del **LISTADO**: regalos y entregantes con diseño VIZA HOME, sin opciones de financiación. |
| `src/lib/pdf/weddingListado.ts` | Diseño del listado: azul VIZA + dorado, membrete, flores, tarjetas de regalos y pie institucional. |
| `src/lib/pdf/weddingFloral.ts` | Ramos de flores (PNG en base64) para las esquinas del listado. |
| `src/components/viza/wedding-list-section.tsx` | Tabla editable de regalos y entregantes + guardar/cargar/PDF/listado. |
| `src/components/viza/sales-panel.tsx` | Integración como opción del menú PRESUPUESTAR y botón AGREGAR REGALO. |
| `prisma/sql/wedding-lists.sql` | SQL de creación de tablas (incluye las columnas nuevas). |
| `prisma/sql/wedding-list-gifts.sql` | SQL para agregar las columnas nuevas a una base ya existente. |

## ⚠️ Paso obligatorio: crear/actualizar las tablas

En una base nueva, ejecutar el SQL de creación:

```bash
bunx prisma db execute --file prisma/sql/wedding-lists.sql --schema prisma/schema.prisma
```

En una base donde la lista de bodas **ya existía**, ejecutar solo la migración
de las columnas nuevas:

```bash
bunx prisma db execute --file prisma/sql/wedding-list-gifts.sql --schema prisma/schema.prisma
```

Después regenerar el cliente de Prisma:

```bash
bun run db:generate
```

Las columnas nuevas de `WeddingListItem` son:

- `giverName`, `giverPhone`, `giverCi`: datos de quien entrega el regalo.
- `quoteType`: `contado` / `cuota` / `mayorista` / `safra` / `cheque` / `especial`.
- `quoteCuotas`: cantidad de pagos cuando la modalidad es `cuota` (1-30).
- `quotedAmount`: total cotizado del regalo según la modalidad elegida.

## Cómo se usa

1. Abrir **PRESUPUESTAR → LISTA DE BODAS** (es una opción más, no está dentro de PLAN CUOTA).
2. Agregar los regalos con el buscador de **PRODUCTOS AGREGADOS**. El botón
   **AGREGAR REGALO** de la tabla lleva directo al buscador.
3. Completar el **título de los novios**, la fecha del evento y las
   observaciones.
4. En la **TABLA DE REGALOS Y ENTREGANTES**, para cada producto:
   - Nombre de quien regala, teléfono / WhatsApp y CI (opcional).
   - **Modalidad**: SOLO CONTADO, PLAN CUOTA (elegir 1 a 30 pagos), MAYORISTA,
     SAFRA, CHEQUE o ESPECIAL.
   - Para MAYORISTA / SAFRA / CHEQUE / ESPECIAL se escribe el **total
     cotizado** que devolvió el módulo correspondiente (si se deja vacío se usa
     el precio de contado).
   - El valor del regalo se calcula solo y se muestra al instante.
   - La papelera quita el regalo de la lista.
5. Apretar **GUARDAR LISTA**. Queda en la BD asociada al vendedor que la creó,
   con todos los datos de los entregantes y las modalidades.
6. Al final hay dos documentos:
   - **GENERAR PRESUPUESTO** descarga el presupuesto completo con:
     - Título de los novios, fecha y observaciones.
     - Tabla de regalos con SKU, producto, cantidad, modalidad, valor y la línea
       **ENTREGANTE** con nombre, teléfono y CI.
     - Resumen de regalos/asignados, total según modalidad y total contado.
     - Opciones de financiación ya calculadas.
   - **GENERAR LISTADO** descarga un documento aparte con **otra cara**: azul
     VIZA y dorado como el presupuesto, membrete VIZA home, ramos de flores en
     las esquinas, nombres de los novios en tipografía serif y los regalos en
     tarjetas. Muestra regalo, cantidad, entregante, modalidad y valor, más los
     totales contado / según modalidad en caja azul con borde dorado y el pie
     institucional con sucursales, redes y web. **No incluye las opciones de
     financiación** y tampoco muestra la etiqueta del plan de cuotas en cada
     regalo (esa información es privada).
7. **GUARDADAS** muestra las listas guardadas: **Cargar** vuelve a poner los
   productos y los datos de cada regalo para seguir editando; la papelera
   borra la lista.

## Permisos

- Vendedores (`colaborador` / `representante`): ven, crean, editan y borran
  **solo sus propias** listas.
- `admin` y `supremo_admin`: ven y pueden editar/borrar **todas** las listas.

## Validación realizada

- Columnas aplicadas en la base de producción (Neon) y verificadas por
  `information_schema`.
- `bun run typecheck` → sin errores.
- `bun run lint` → sin errores (2 warnings preexistentes en otros archivos).
- `bun run build` → compila e incluye `/api/wedding-lists`,
  `/api/wedding-lists/pdf` y `/api/wedding-lists/listado`.
- Listado de muestra generado y revisado visualmente (incluida la paginación de
  varias páginas).
