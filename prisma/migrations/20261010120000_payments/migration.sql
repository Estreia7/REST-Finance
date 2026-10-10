-- Payments: what is paid, what is still to pay, and when it falls due.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MULTIBANCO', 'TRANSFER', 'DIRECT_DEBIT');

-- AlterTable
ALTER TABLE "cost_entries"
  ADD COLUMN "invoice_number" TEXT,
  ADD COLUMN "payment_method" "PaymentMethod",
  ADD COLUMN "paid_at" DATE,
  ADD COLUMN "due_date" DATE;

-- AlterTable
ALTER TABLE "recurring_costs"
  ADD COLUMN "payment_method" "PaymentMethod",
  ADD COLUMN "vendor_id" TEXT;

-- AddForeignKey
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN "payment_terms_days" INTEGER;

-- CreateIndex
CREATE INDEX "cost_entries_restaurant_id_paid_at_idx" ON "cost_entries"("restaurant_id", "paid_at");

-- Backfill: a scanned invoice already carries its document number on its
-- lines. Copied onto the original entry, which is the one that is paid, so
-- an invoice that came in by photograph is not listed as waiting for one.
-- Existing costs are otherwise left unpaid, to be reviewed by the owner.
UPDATE "cost_entries" AS ce
SET "invoice_number" = src."invoice_number"
FROM (
  SELECT COALESCE(e."split_from_id", e."id") AS root_id,
         MAX(NULLIF(TRIM(i."invoice_number"), '')) AS invoice_number
  FROM "invoice_items" i
  JOIN "cost_entries" e ON e."id" = i."cost_entry_id"
  GROUP BY COALESCE(e."split_from_id", e."id")
) AS src
WHERE ce."id" = src.root_id
  AND src."invoice_number" IS NOT NULL
  AND ce."invoice_number" IS NULL;
