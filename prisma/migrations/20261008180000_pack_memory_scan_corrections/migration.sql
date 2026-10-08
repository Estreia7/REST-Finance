-- Pack sizes the restaurant has learned, and a record of what the reader got wrong.
--
-- "BATATA DOCE 2,5K" is a 2,5 kg bag. The app could not read the bare "K",
-- so the bag's price became the price of a kilo and every dish using it cost
-- two and a half times what it should. The owner's answer about a wording's
-- package is now remembered, so it is asked once.
--
-- And every confirmed invoice now records where the reading differed from
-- what was saved — supplier, date, total, a line's category, its package —
-- so the administrator can see, per restaurant, how well the reading and the
-- memory are doing.

-- AlterTable
ALTER TABLE "invoice_line_memories" ADD COLUMN "pack_amount" DECIMAL(10,3),
ADD COLUMN "pack_unit" TEXT;

-- AlterTable
ALTER TABLE "receipt_scans" ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "scan_corrections" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "receipt_scan_id" TEXT,
    "vendor_id" TEXT,
    "product_name" TEXT,
    "field" TEXT NOT NULL,
    "read_value" TEXT,
    "saved_value" TEXT,
    "fixed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_corrections_restaurant_id_created_at_idx" ON "scan_corrections"("restaurant_id", "created_at");

-- AddForeignKey
ALTER TABLE "scan_corrections" ADD CONSTRAINT "scan_corrections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_corrections" ADD CONSTRAINT "scan_corrections_receipt_scan_id_fkey" FOREIGN KEY ("receipt_scan_id") REFERENCES "receipt_scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_corrections" ADD CONSTRAINT "scan_corrections_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
