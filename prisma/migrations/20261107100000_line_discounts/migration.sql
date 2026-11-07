-- A supplier's discount taken off a line, and the promotion it came from.
ALTER TABLE "invoice_items" ADD COLUMN "discount" DECIMAL(12,2);
ALTER TABLE "invoice_items" ADD COLUMN "discount_label" TEXT;

-- Money off is not a purchase: nobody has to say what it is.
UPDATE "invoice_items" SET "needs_setup" = false WHERE "total_price" < 0 AND "needs_setup" = true;
