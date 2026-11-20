-- VIZA HOME - LISTA DE BODAS: datos del entregante y modalidad por regalo
-- Aplica SOLO columnas nuevas sobre WeddingListItem. No borra datos.
-- Uso:
--   bunx prisma db execute --file prisma/sql/wedding-list-gifts.sql --schema prisma/schema.prisma

ALTER TABLE "WeddingListItem"
  ADD COLUMN IF NOT EXISTS "giverName" TEXT,
  ADD COLUMN IF NOT EXISTS "giverPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "giverCi" TEXT,
  ADD COLUMN IF NOT EXISTS "quoteType" TEXT NOT NULL DEFAULT 'contado',
  ADD COLUMN IF NOT EXISTS "quoteCuotas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quotedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
