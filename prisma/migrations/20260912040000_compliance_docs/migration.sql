-- Insurance policies, licences and certificates, with their expiry dates.
--
-- The file lives under the storage directory and only its path is kept here,
-- so a database dump does not carry the documents themselves.

CREATE TYPE "ComplianceDocType" AS ENUM (
    'INSURANCE',
    'HACCP',
    'FIRE_SAFETY',
    'ASAE_LICENCE',
    'HYGIENE_CERT',
    'WASTE_CONTRACT',
    'PEST_CONTROL',
    'OTHER'
);

CREATE TABLE "compliance_docs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "type" "ComplianceDocType" NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "compliance_docs_pkey" PRIMARY KEY ("id")
);

-- Drives the expiry warnings on the dashboard.
CREATE INDEX "compliance_docs_restaurant_id_expires_at_idx"
    ON "compliance_docs"("restaurant_id", "expires_at");
CREATE INDEX "compliance_docs_restaurant_id_type_idx"
    ON "compliance_docs"("restaurant_id", "type");

ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
