-- The NIF a business changed to, and the day invoices start being made out to it.
ALTER TABLE "restaurants" ADD COLUMN "new_tax_id" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "new_tax_id_from" DATE;
