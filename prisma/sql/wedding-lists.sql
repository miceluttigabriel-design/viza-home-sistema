-- VIZA HOME - Tablas para LISTA DE BODAS
-- Aplica SOLO las tablas nuevas, sin tocar las existentes.
-- Uso: bunx prisma db execute --file prisma/sql/wedding-lists.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "WeddingList" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "eventDate" TEXT,
  "notes" TEXT,
  "vendorName" TEXT NOT NULL DEFAULT 'Vendedor VIZA',
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
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

ALTER TABLE "WeddingList" DROP CONSTRAINT IF EXISTS "WeddingList_userId_fkey";
ALTER TABLE "WeddingList"
  ADD CONSTRAINT "WeddingList_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WeddingListItem" DROP CONSTRAINT IF EXISTS "WeddingListItem_weddingListId_fkey";
ALTER TABLE "WeddingListItem"
  ADD CONSTRAINT "WeddingListItem_weddingListId_fkey"
  FOREIGN KEY ("weddingListId") REFERENCES "WeddingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
