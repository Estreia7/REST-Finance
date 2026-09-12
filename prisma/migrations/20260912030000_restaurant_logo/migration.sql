-- Restaurant logo. The file lives under the storage directory and only the
-- path is kept here; it is served through an authenticated route so uploads
-- are not world-readable by guessing a URL.
ALTER TABLE "restaurants" ADD COLUMN "logo_path" TEXT;
