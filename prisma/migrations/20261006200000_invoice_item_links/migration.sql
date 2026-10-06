-- Remembering what a supplier's wording means, and joining duplicates.
--
-- "CARNE PICADA NOVILHO 80/20" is the kitchen's "Carne Smash", and only the
-- owner knows that. Asked once, kept here, never asked again.
--
-- A wording may map to several ingredients: a case of meat feeds both the
-- burger mince and the extra portion sold on the side. And an ingredient may
-- be an alias of another — the POS brings its modifiers in as ingredients, so
-- "EXTRA CARNE" and "Carne Smash" arrive as two rows for one product.

ALTER TABLE "ingredients" ADD COLUMN "alias_of_id" TEXT;

ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_alias_of_id_fkey"
  FOREIGN KEY ("alias_of_id") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "invoice_item_links" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "vendor_id" TEXT,
    "ingredient_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_item_links_restaurant_id_source_name_idx" ON "invoice_item_links"("restaurant_id", "source_name");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_item_links_restaurant_id_source_name_vendor_id_ingr_key" ON "invoice_item_links"("restaurant_id", "source_name", "vendor_id", "ingredient_id");

-- AddForeignKey
ALTER TABLE "invoice_item_links" ADD CONSTRAINT "invoice_item_links_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item_links" ADD CONSTRAINT "invoice_item_links_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item_links" ADD CONSTRAINT "invoice_item_links_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
