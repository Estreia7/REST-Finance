-- A product sold exactly as it was bought.
--
-- The owner put it plainly: a Super Bock is not an ingredient, it is a
-- product. Lettuce, bacon and burger buns go *into* something; a bottle of
-- beer is poured from no recipe. Until now the catalogue importer dropped
-- drinks into the ingredients table with no selling price, so a quarter of
-- one restaurant's takings had no margin anywhere in the app.
--
-- A drink is two numbers -- what the customer pays and what the wholesaler
-- charged -- so it stays two rows. The menu item carries the price and the
-- VAT; the ingredient carries the purchase cost, because every path that
-- prices anything is keyed on the ingredient: the invoice match on
-- normalized_name, the price history, the reconcile dialog, and
-- invoice_item_links' foreign key.

CREATE TYPE "CostingMode" AS ENUM ('RECIPE', 'PURCHASE');

-- RECIPE for everything that already exists: a dish with no lines yet reads
-- as work still to do, which is what it was already doing.
ALTER TABLE "menu_items"
  ADD COLUMN "costing_mode" "CostingMode" NOT NULL DEFAULT 'RECIPE',
  ADD COLUMN "purchase_item_id" TEXT,
  ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;

-- SetNull, not Cascade: taking a drink off the board must not delete the
-- purchase line, because the owner's answer to "what is this invoice line"
-- hangs off it and has to outlive a menu change.
ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_purchase_item_id_fkey"
  FOREIGN KEY ("purchase_item_id") REFERENCES "ingredients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "menu_items_purchase_item_id_idx" ON "menu_items"("purchase_item_id");

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- Which of today's ingredients are really products? Not the ones in a family
-- called BEBIDAS -- that answer does not survive the next client, whose till
-- calls the same shelf SUMOS E AGUAS, REFRIGERANTES, CRAFT SODAS or something
-- in another language. The question is answered by what the till *did*: an
-- ingredient that the POS sells for real money is a product, and one that
-- rings at nothing is an extra that goes on something else.
--
-- Three conditions, none of them a family name:
--   a) no recipe uses it, so nothing can be repriced by this
--   b) it matches a POS product that took real money per unit
--   c) no menu item of that name exists yet, so nothing is duplicated
--
-- The 0.20 threshold is the one already used to spot till-included items
-- (INCLUDED_UNIT_PRICE, lib/products.ts) -- comfortably under the cheapest
-- thing a customer can choose, an espresso at a euro.

CREATE TEMP TABLE _resale AS
SELECT
  i."id"            AS ingredient_id,
  i."restaurant_id" AS restaurant_id,
  i."name"          AS name,
  c."name"          AS familia,
  p."sub_family"    AS sub_family,
  sold.units        AS units,
  round(sold.revenue / sold.units, 2) AS price_gross
FROM "ingredients" i
JOIN "pos_products" p
  ON p."restaurant_id" = i."restaurant_id"
 AND upper(btrim(p."name")) = upper(btrim(i."name"))
LEFT JOIN "categories" c ON c."id" = p."category_id"
JOIN (
  SELECT s."product_id",
         sum(s."quantity")::numeric AS units,
         sum(s."revenue")::numeric  AS revenue
  FROM "pos_product_sales" s
  GROUP BY s."product_id"
  HAVING sum(s."quantity") > 0
) sold ON sold."product_id" = p."id"
WHERE i."deleted_at" IS NULL
  -- (b) it took real money, not a token price
  AND sold.revenue / sold.units >= 0.20
  -- (a) no recipe depends on it
  AND NOT EXISTS (
    SELECT 1 FROM "recipe_lines" r WHERE r."ingredient_id" = i."id"
  )
  -- A sauce is an ingredient even when it is sold as a paid extra: it goes
  -- *on* something, and the owner will want it inside a burger's recipe.
  -- Truffle mayo took 11 EUR over 24 orders and is still mayonnaise. The
  -- price test cannot see this, so the family still gets a say -- as a veto
  -- only, never as the thing that decides what *is* a product.
  AND upper(btrim(coalesce(c."name", ''))) NOT IN
      ('INGREDIENTES', 'MOLHOS', 'EXTRAS', 'ADICIONAIS', 'OPCOES', 'OPÇÕES')
  -- (c) nothing already on the board under that name
  AND NOT EXISTS (
    SELECT 1 FROM "menu_items" m
    WHERE m."restaurant_id" = i."restaurant_id"
      AND m."deleted_at" IS NULL
      AND upper(btrim(m."name")) = upper(btrim(i."name"))
  );

-- One menu item per purchase line, priced at what it actually sold for.
--
-- 23% on alcohol and 13% on everything else, by the same words the importer
-- matches on. A wine at 13% would be an understated tax bill, which is the
-- owner's problem and not a rounding error.
INSERT INTO "menu_items" (
  "id", "restaurant_id", "name", "category", "price_gross", "vat_rate",
  "monthly_volume", "active", "sort_order", "created_at", "updated_at",
  "costing_mode", "purchase_item_id", "needs_review"
)
SELECT
  gen_random_uuid()::text,
  r.restaurant_id,
  r.name,
  r.familia,
  r.price_gross,
  -- Two signals, because neither alone is enough: "VILLA ALVOR BRANCO" gives
  -- itself away in the name, "BRITANGO GARRAFA" only by sitting on the VINHOS
  -- shelf. A wine taxed at 13% is an understated bill, not a rounding error.
  CASE WHEN r.name ~* '(cerveja|super bock|sagres|heineken|imperial|caneca|vinho|tinto|branco|verde|rose|rosé|sangria|porto|whisky|gin|vodka|rum|licor|aguardente|brandy|martini|cocktail|caipirinha|moscatel|espumante|champanhe|saque|saqué|sake|somersby|macieira|croft|ferreira|borges|constantino)'
         OR coalesce(r.sub_family, '') ~* '(cerveja|vinho|alcool|álcool|garrafeira|espirituos|whisky|gin|licor|destilad)'
       THEN 23 ELSE 13 END,
  -- The import covers more than a year, so a month is the total over twelve,
  -- never less than one: a product that sold at all sells sometimes.
  GREATEST(1, round(r.units / 12.0)::int),
  true,
  0,
  now(),
  now(),
  'PURCHASE',
  r.ingredient_id,
  -- Every one of these is flagged for the owner to confirm.
  --
  -- Not for want of trying to work it out. A milkshake is made and a beer is
  -- opened, and four different signals were tested against real tills to tell
  -- them apart: the family name (every POS spells it differently), the price
  -- (lemonades run 0,00-3,00 and beers 0,75-10,00, straight through each
  -- other), a litre size in the name (catches COCA COLA 0.33CL, misses 7UP),
  -- and repeated first words (catches MILKSHAKE, also catches AGUA and SUPER
  -- BOCK, which are brands with variants). Each one traded one wrong answer
  -- for another.
  --
  -- The distinction is simply not in the data: the till records what was sold
  -- and for how much, never whether the kitchen assembled it. So it is not
  -- guessed. Each row arrives priced, costable and marked for a glance, and
  -- the owner settles a shelf of drinks in about a minute -- which he can do,
  -- because he knows which ones he makes.
  true
FROM _resale r;

-- Something sold by the bottle is bought by the bottle.
--
-- guessPurchaseUnit read the word "AGUA 0.5L" and said litres, so an invoice
-- for half-litre bottles would have been read as a price per litre -- half
-- the real cost, on a quarter of the takings. Only rows no recipe uses are
-- touched, which is every row here by construction.
UPDATE "ingredients" i
SET "unit" = 'un', "updated_at" = now()
WHERE i."id" IN (SELECT ingredient_id FROM _resale)
  AND i."unit" <> 'un';

DROP TABLE _resale;
