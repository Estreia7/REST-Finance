-- Occupancy costs, so the statement can follow USAR.
--
-- USAR places occupancy below controllable income: a manager cannot
-- renegotiate the lease this month, so rent sitting among the controllable
-- costs makes a good operator in an expensive location look like a bad one.

ALTER TABLE "categories"
  ADD COLUMN "is_occupancy" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the default Portuguese names this app creates for new restaurants.
-- Anything a restaurant named itself stays false and is set from Definições;
-- guessing at arbitrary names is how the labour flag went wrong before.
UPDATE "categories"
SET "is_occupancy" = true
WHERE "type" = 'OPEX'
  AND lower("name") IN ('renda', 'arrendamento', 'aluguer');
