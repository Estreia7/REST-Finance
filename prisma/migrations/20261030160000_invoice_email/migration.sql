-- Invoices by email.
--
-- Each restaurant can have a private address, <inbox_token>@<domain>, that
-- suppliers copy their invoices to. An emailed invoice is read like a scan
-- and waits, marked source EMAIL, until the owner saves or sets it aside.

-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('APP', 'EMAIL');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "inbox_token" TEXT;

-- AlterTable
ALTER TABLE "receipt_scans" ADD COLUMN "source" "ScanSource" NOT NULL DEFAULT 'APP',
ADD COLUMN "from_email" TEXT,
ADD COLUMN "file_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_inbox_token_key" ON "restaurants"("inbox_token");

-- CreateIndex
CREATE INDEX "receipt_scans_restaurant_id_source_reviewed_at_idx" ON "receipt_scans"("restaurant_id", "source", "reviewed_at");
