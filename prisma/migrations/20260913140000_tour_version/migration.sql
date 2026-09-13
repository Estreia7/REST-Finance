-- Which version of the first-run walkthrough an account has finished.
--
-- Nullable: null means never seen, which is what triggers the tour. Existing
-- accounts are therefore offered it once, which is intended — nobody has seen
-- it before.

ALTER TABLE "users" ADD COLUMN "tour_version" INTEGER;
