-- Categories per invoice line, and a memory per restaurant that learns them.
--
-- An invoice used to carry one category. A Makro delivery with meat, beer and
-- bleach was booked whole under "Comida": the bleach inflated food cost and
-- the beer disappeared into it. Now each line has its own category, an
-- invoice of several categories becomes one cost entry per category, and
-- what the owner answers is remembered so the next invoice asks less.

-- CreateEnum
CREATE TYPE "LineCategorySource" AS ENUM ('OWNER', 'MEMORY', 'SUGGESTED', 'INHERITED');

-- AlterTable
ALTER TABLE "cost_entries" ADD COLUMN "split_from_id" TEXT;

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN "category_id" TEXT,
ADD COLUMN "category_source" "LineCategorySource";

-- CreateTable
CREATE TABLE "invoice_line_memories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "vendor_id" TEXT,
    "category_id" TEXT,
    "not_ingredient" BOOLEAN NOT NULL DEFAULT false,
    "confirmations" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_entries_split_from_id_idx" ON "cost_entries"("split_from_id");

-- CreateIndex
CREATE INDEX "invoice_line_memories_restaurant_id_vendor_id_idx" ON "invoice_line_memories"("restaurant_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_memories_restaurant_id_source_name_vendor_id_key" ON "invoice_line_memories"("restaurant_id", "source_name", "vendor_id");

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_split_from_id_fkey" FOREIGN KEY ("split_from_id") REFERENCES "cost_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_memories" ADD CONSTRAINT "invoice_line_memories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_memories" ADD CONSTRAINT "invoice_line_memories_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_memories" ADD CONSTRAINT "invoice_line_memories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lines saved before today take their invoice's category, marked INHERITED so
-- the memory never learns from them: a mixed invoice booked whole under one
-- category would teach the wrong answer for every line but one.
UPDATE "invoice_items" AS i
SET "category_id" = c."category_id",
    "category_source" = 'INHERITED'
FROM "cost_entries" AS c
WHERE i."cost_entry_id" = c."id"
  AND c."category_id" IS NOT NULL;
