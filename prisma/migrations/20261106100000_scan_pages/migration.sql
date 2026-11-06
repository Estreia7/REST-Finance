-- The pages of a document after the first.
ALTER TABLE "receipt_scans" ADD COLUMN "page_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
