-- An invoice saves at once; what its lines are can be answered later.
ALTER TABLE "invoice_items" ADD COLUMN "pack_factor" DECIMAL(10,3);
ALTER TABLE "invoice_items" ADD COLUMN "needs_setup" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "invoice_items_restaurant_id_needs_setup_idx" ON "invoice_items"("restaurant_id", "needs_setup");
