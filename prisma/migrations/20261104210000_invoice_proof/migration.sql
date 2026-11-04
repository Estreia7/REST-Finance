-- Each line's VAT, and whether a reading adds up to its invoice.
ALTER TABLE "invoice_items" ADD COLUMN "vat_rate" DECIMAL(5,2);
ALTER TABLE "invoice_items" ADD COLUMN "gross_total" DECIMAL(12,2);

ALTER TABLE "receipt_scans" ADD COLUMN "proof_status" TEXT;
ALTER TABLE "receipt_scans" ADD COLUMN "proof_resolved_at" TIMESTAMP(3);

CREATE INDEX "receipt_scans_restaurant_id_proof_status_idx" ON "receipt_scans"("restaurant_id", "proof_status");
