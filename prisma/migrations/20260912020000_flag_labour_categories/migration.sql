-- Flag existing wage categories as labour.
--
-- The default categories created for every new restaurant included wages and
-- social security, but never set is_labour. Prime Cost is COGS plus labour, so
-- an unflagged wage category contributes nothing: those restaurants reported a
-- Prime Cost understated by roughly half, with no error shown.
--
-- This catches the names the app has shipped, plus the common variations an
-- owner is likely to have typed.
UPDATE "categories"
SET "is_labour" = true
WHERE "is_labour" = false
  AND "type" = 'OPEX'
  AND (
    "name" ILIKE '%ordenado%'
    OR "name" ILIKE '%salário%'
    OR "name" ILIKE '%salario%'
    OR "name" ILIKE '%vencimento%'
    OR "name" ILIKE '%segurança social%'
    OR "name" ILIKE '%seguranca social%'
    OR "name" ILIKE '%pessoal%'
    OR "name" ILIKE '%funcionário%'
    OR "name" ILIKE '%funcionario%'
    OR "name" ILIKE '%wage%'
    OR "name" ILIKE '%payroll%'
  );
