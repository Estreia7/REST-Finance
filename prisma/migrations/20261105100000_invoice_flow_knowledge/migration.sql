-- An invoice saved by itself still has to say how it was paid.
ALTER TABLE "cost_entries" ADD COLUMN "payment_to_confirm" BOOLEAN NOT NULL DEFAULT false;

-- How each supplier prints its invoices, told to the reader.
CREATE TABLE "supplier_knowledge" (
    "id" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "doc_type" TEXT,
    "note" TEXT NOT NULL,
    "source" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_knowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_knowledge_tax_id_active_idx" ON "supplier_knowledge"("tax_id", "active");

ALTER TABLE "supplier_knowledge" ADD CONSTRAINT "supplier_knowledge_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
