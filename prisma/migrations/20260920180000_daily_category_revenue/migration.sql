-- A day's revenue in one menu category, as the till grouped it.
--
-- `daily_summaries` answers "what did we take today" and splits it by
-- channel. This answers "where did it come from" — how much was comida, how
-- much was bebida — which is the question an owner asks when a good month and
-- a bad month have the same total.
--
-- A table rather than columns on daily_summaries, because the categories
-- differ per restaurant: one groups by BEBIDAS/COMIDAS/MENUS, another by
-- lunch/dinner/events. A column per category would mean a migration every
-- time a restaurant renamed a section of its menu.

CREATE TABLE "daily_category_revenue" (
    "id"            TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "date"          TIMESTAMP(3) NOT NULL,
    "category_id"   TEXT NOT NULL,
    "revenue"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity"      INTEGER NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_category_revenue_pkey" PRIMARY KEY ("id")
);

-- Read as "this month, by category" and "this category, over time".
CREATE INDEX "daily_category_revenue_restaurant_id_date_idx"
  ON "daily_category_revenue"("restaurant_id", "date");
CREATE INDEX "daily_category_revenue_category_id_date_idx"
  ON "daily_category_revenue"("category_id", "date");

-- One row per category per day, so re-importing the same export corrects
-- rather than doubles the revenue.
CREATE UNIQUE INDEX "daily_category_revenue_restaurant_id_date_category_id_key"
  ON "daily_category_revenue"("restaurant_id", "date", "category_id");

ALTER TABLE "daily_category_revenue"
  ADD CONSTRAINT "daily_category_revenue_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_category_revenue"
  ADD CONSTRAINT "daily_category_revenue_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
