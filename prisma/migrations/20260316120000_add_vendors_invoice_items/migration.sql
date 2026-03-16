-- Add taxId to restaurants
ALTER TABLE "restaurants" ADD COLUMN "tax_id" TEXT;

-- Add soft delete and update tracking to daily_summaries
ALTER TABLE "daily_summaries" ADD COLUMN "updated_at" TIMESTAMP(3);
ALTER TABLE "daily_summaries" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Fix Decimal precision on daily_summaries
ALTER TABLE "daily_summaries" ALTER COLUMN "dine_in_revenue" TYPE DECIMAL(12, 2);
ALTER TABLE "daily_summaries" ALTER COLUMN "takeaway_revenue" TYPE DECIMAL(12, 2);
ALTER TABLE "daily_summaries" ALTER COLUMN "revenue_total" TYPE DECIMAL(12, 2);

-- Fix Decimal precision on restaurants
ALTER TABLE "restaurants" ALTER COLUMN "monthly_revenue_target" TYPE DECIMAL(12, 2);

-- Add vendor, soft delete, and update tracking to cost_entries
ALTER TABLE "cost_entries" ADD COLUMN "vendor_id" TEXT;
ALTER TABLE "cost_entries" ADD COLUMN "updated_at" TIMESTAMP(3);
ALTER TABLE "cost_entries" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Fix Decimal precision on cost_entries
ALTER TABLE "cost_entries" ALTER COLUMN "amount" TYPE DECIMAL(12, 2);

-- Create vendors table
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- Create invoice_items table
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "cost_entry_id" TEXT,
    "vendor_id" TEXT,
    "receipt_scan_id" TEXT,
    "product_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "quantity" DECIMAL(10, 3) NOT NULL,
    "unit" TEXT,
    "unit_price" DECIMAL(10, 4) NOT NULL,
    "total_price" DECIMAL(12, 2) NOT NULL,
    "invoice_date" TIMESTAMP(3),
    "invoice_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- Create unique index on vendors
CREATE UNIQUE INDEX "vendors_restaurant_id_name_key" ON "vendors"("restaurant_id", "name");

-- Create indexes on cost_entries
CREATE INDEX "cost_entries_restaurant_id_date_idx" ON "cost_entries"("restaurant_id", "date");
CREATE INDEX "cost_entries_restaurant_id_type_date_idx" ON "cost_entries"("restaurant_id", "type", "date");

-- Create indexes on invoice_items
CREATE INDEX "invoice_items_restaurant_id_normalized_name_vendor_id_invoice_date_idx" ON "invoice_items"("restaurant_id", "normalized_name", "vendor_id", "invoice_date");
CREATE INDEX "invoice_items_restaurant_id_invoice_date_idx" ON "invoice_items"("restaurant_id", "invoice_date");

-- Add foreign keys
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipt_scans" ADD CONSTRAINT "receipt_scans_linked_entry_id_fkey" FOREIGN KEY ("linked_entry_id") REFERENCES "cost_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_cost_entry_id_fkey" FOREIGN KEY ("cost_entry_id") REFERENCES "cost_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_receipt_scan_id_fkey" FOREIGN KEY ("receipt_scan_id") REFERENCES "receipt_scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
