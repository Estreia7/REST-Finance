-- A photographed invoice waiting to be reviewed.
ALTER TABLE "receipt_scans" ADD COLUMN "queued" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "receipt_scans_restaurant_id_queued_idx" ON "receipt_scans"("restaurant_id", "queued");
