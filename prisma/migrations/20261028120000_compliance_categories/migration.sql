-- Compliance documents: a category instead of a specific type, and the file
-- becomes optional.
--
-- The eight specific types were half categories and half documents (HACCP is
-- a licence, pest control is hygiene). Each old value maps to the category it
-- belongs to, so no row loses its place. The document itself is still named by
-- the owner in `name`.
--
-- A document can be recorded before it is scanned: the dates are what get
-- chased, and the paper may still be in a drawer.

CREATE TYPE "ComplianceCategory" AS ENUM ('LICENCE', 'INSURANCE', 'SAFETY', 'HYGIENE', 'CONTRACT', 'OTHER');

ALTER TABLE "compliance_docs"
  ALTER COLUMN "type" TYPE "ComplianceCategory" USING (
    CASE "type"::text
      WHEN 'INSURANCE'      THEN 'INSURANCE'
      WHEN 'HACCP'          THEN 'LICENCE'
      WHEN 'ASAE_LICENCE'   THEN 'LICENCE'
      WHEN 'FIRE_SAFETY'    THEN 'SAFETY'
      WHEN 'HYGIENE_CERT'   THEN 'HYGIENE'
      WHEN 'PEST_CONTROL'   THEN 'HYGIENE'
      WHEN 'WASTE_CONTRACT' THEN 'CONTRACT'
      ELSE 'OTHER'
    END
  )::"ComplianceCategory";

DROP TYPE "ComplianceDocType";

ALTER TABLE "compliance_docs"
  ALTER COLUMN "file_path" DROP NOT NULL,
  ALTER COLUMN "mime_type" DROP NOT NULL,
  ALTER COLUMN "size_bytes" DROP NOT NULL;
