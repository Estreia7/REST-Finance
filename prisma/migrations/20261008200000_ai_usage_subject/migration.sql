-- What each AI call read, so the usage console can name the document.
--
-- A call showed as "Daniel's restaurant, one call, a few cents" with nothing
-- to say which invoice it was. It now keeps the supplier, document number,
-- date, total and line count of what it read. Calls logged before this have
-- none, and say so.

-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN "subject" JSONB;
