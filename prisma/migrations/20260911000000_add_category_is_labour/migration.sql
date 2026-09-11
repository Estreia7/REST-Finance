-- Add an explicit labour flag to cost categories.
--
-- Prime Cost (COGS + labour) is the headline restaurant health metric. It was
-- previously computed by matching category names against the hardcoded list
-- ('Ordenado 1', 'Segurança Social'), so any restaurant that renamed those
-- categories or created its own silently got labour = 0 — reporting a Prime
-- Cost understated by roughly half, with no error surfaced to the user.

ALTER TABLE "categories" ADD COLUMN "is_labour" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the categories the old hardcoded logic recognised, so existing
-- restaurants keep the behaviour they already had.
UPDATE "categories"
SET "is_labour" = true
WHERE "name" IN ('Ordenado 1', 'Segurança Social');

-- Best-effort backfill for restaurants that renamed their labour categories.
-- Matches common Portuguese payroll terms, case-insensitively, on OPEX only.
UPDATE "categories"
SET "is_labour" = true
WHERE "is_labour" = false
  AND "type" = 'OPEX'
  AND (
    "name" ILIKE '%ordenado%'
    OR "name" ILIKE '%salário%'
    OR "name" ILIKE '%salario%'
    OR "name" ILIKE '%segurança social%'
    OR "name" ILIKE '%seguranca social%'
    OR "name" ILIKE '%vencimento%'
    OR "name" ILIKE '%pessoal%'
    OR "name" ILIKE '%funcionário%'
    OR "name" ILIKE '%funcionario%'
  );

-- Supports the active-category lookups performed on every dashboard load.
CREATE INDEX "categories_restaurant_id_is_active_idx"
  ON "categories"("restaurant_id", "is_active");
