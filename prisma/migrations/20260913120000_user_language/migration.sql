-- The account's language, so a choice follows the owner to another device
-- instead of living in one browser's storage.
--
-- Nullable on purpose: null means "never chose", which lets the first login
-- fall back to the browser's own preference. Once set, the account decides.

ALTER TABLE "users" ADD COLUMN "language" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_language_check"
  CHECK ("language" IS NULL OR "language" IN ('pt', 'en'));
