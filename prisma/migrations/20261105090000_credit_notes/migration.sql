-- Credit notes are money coming back, and must never be a cost.
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "receipt_scan_id" TEXT,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "matched_entry_id" TEXT,
    "matched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_notes_restaurant_id_number_key" ON "credit_notes"("restaurant_id", "number");
CREATE INDEX "credit_notes_restaurant_id_status_idx" ON "credit_notes"("restaurant_id", "status");
CREATE INDEX "credit_notes_restaurant_id_vendor_id_status_idx" ON "credit_notes"("restaurant_id", "vendor_id", "status");

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_receipt_scan_id_fkey" FOREIGN KEY ("receipt_scan_id") REFERENCES "receipt_scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Credit notes already booked as costs become what they are. Each waits in
-- Precisa de ti for the invoice it cancels. Soft-deleted, so nothing is lost.
INSERT INTO "credit_notes" ("id", "restaurant_id", "vendor_id", "number", "date", "amount", "updated_at")
SELECT gen_random_uuid()::text, c."restaurant_id", c."vendor_id", TRIM(c."invoice_number"), c."date"::date,
       ABS(c."amount" + COALESCE((SELECT SUM(p."amount") FROM "cost_entries" p WHERE p."split_from_id" = c."id" AND p."deleted_at" IS NULL), 0)),
       CURRENT_TIMESTAMP
FROM "cost_entries" c
WHERE c."invoice_number" ~* '^\s*NC\y' AND c."deleted_at" IS NULL AND c."split_from_id" IS NULL
ON CONFLICT ("restaurant_id", "number") DO NOTHING;

UPDATE "cost_entries" c SET "deleted_at" = CURRENT_TIMESTAMP
WHERE c."deleted_at" IS NULL AND (
  (c."split_from_id" IS NULL AND c."invoice_number" ~* '^\s*NC\y')
  OR c."split_from_id" IN (SELECT r."id" FROM "cost_entries" r WHERE r."invoice_number" ~* '^\s*NC\y')
);
