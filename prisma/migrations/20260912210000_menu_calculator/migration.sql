-- Menu costing: what each dish actually earns.
--
-- Two things this gets right that a spreadsheet usually does not.
--
-- VAT: a Portuguese menu price includes it — 13% on food, 23% on alcohol.
-- Comparing a gross menu price against net ingredient costs overstates every
-- margin by roughly a seventh, which is the difference between a dish that
-- pays for itself and one that does not. price_gross is what the board says;
-- the net figure is derived at calculation time so it cannot drift.
--
-- Cost source: ingredients can price themselves from the invoices already in
-- the database, matched on normalized_name. When a supplier raises the price
-- of cod, the Bacalhau à Brás margin moves on its own. manual_unit_cost pins
-- the ones no invoice covers.

CREATE TABLE "ingredients" (
  "id"                TEXT NOT NULL,
  "restaurant_id"     TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "normalized_name"   TEXT NOT NULL,
  "unit"              TEXT NOT NULL DEFAULT 'kg',
  "manual_unit_cost"  DECIMAL(10,4),
  "invoice_unit_cost" DECIMAL(10,4),
  "invoice_cost_at"   TIMESTAMP(3),
  "waste_percent"     DECIMAL(5,2) NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  "deleted_at"        TIMESTAMP(3),

  CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_items" (
  "id"             TEXT NOT NULL,
  "restaurant_id"  TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "category"       TEXT,
  "price_gross"    DECIMAL(10,2) NOT NULL,
  "vat_rate"       DECIMAL(5,2) NOT NULL DEFAULT 13,
  "monthly_volume" INTEGER,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "deleted_at"     TIMESTAMP(3),

  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipe_lines" (
  "id"            TEXT NOT NULL,
  "menu_item_id"  TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "quantity"      DECIMAL(10,3) NOT NULL,
  "unit"          TEXT NOT NULL DEFAULT 'g',
  "sort_order"    INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingredients_restaurant_id_deleted_at_idx"
  ON "ingredients"("restaurant_id", "deleted_at");
CREATE INDEX "ingredients_restaurant_id_normalized_name_idx"
  ON "ingredients"("restaurant_id", "normalized_name");

CREATE INDEX "menu_items_restaurant_id_deleted_at_sort_order_idx"
  ON "menu_items"("restaurant_id", "deleted_at", "sort_order");

-- An ingredient appears once per dish: using cod twice in one recipe is one
-- line with a larger quantity, which keeps the costing readable.
CREATE UNIQUE INDEX "recipe_lines_menu_item_id_ingredient_id_key"
  ON "recipe_lines"("menu_item_id", "ingredient_id");
CREATE INDEX "recipe_lines_menu_item_id_idx" ON "recipe_lines"("menu_item_id");

ALTER TABLE "ingredients"
  ADD CONSTRAINT "ingredients_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_lines"
  ADD CONSTRAINT "recipe_lines_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict, not cascade: deleting an ingredient still used by a recipe would
-- silently make that dish cheaper and its margin a lie. The UI soft-deletes
-- and refuses while a recipe still references it.
ALTER TABLE "recipe_lines"
  ADD CONSTRAINT "recipe_lines_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
