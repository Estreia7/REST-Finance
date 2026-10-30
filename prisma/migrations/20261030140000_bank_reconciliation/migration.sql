-- Bank statements and reconciliation.
--
-- Movements come from the bank's own export (CSV, Excel or OFX). A payment is
-- matched to the invoices it settled; one transfer can settle several, hence
-- the separate bank_matches table. import_hash keeps a second import of an
-- overlapping period from adding the same movement twice.

-- CreateEnum
CREATE TYPE "BankKind" AS ENUM ('PAYMENT', 'INCOME', 'FEE', 'CASH');

-- CreateEnum
CREATE TYPE "BankStatus" AS ENUM ('OPEN', 'MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "balance" DECIMAL(12,2),
    "kind" "BankKind" NOT NULL,
    "status" "BankStatus" NOT NULL DEFAULT 'OPEN',
    "import_hash" TEXT NOT NULL,
    "imported_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMP(3),

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_matches" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "cost_entry_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_restaurant_id_import_hash_key" ON "bank_transactions"("restaurant_id", "import_hash");

-- CreateIndex
CREATE INDEX "bank_transactions_restaurant_id_status_date_idx" ON "bank_transactions"("restaurant_id", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_matches_bank_transaction_id_cost_entry_id_key" ON "bank_matches"("bank_transaction_id", "cost_entry_id");

-- CreateIndex
CREATE INDEX "bank_matches_cost_entry_id_idx" ON "bank_matches"("cost_entry_id");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_cost_entry_id_fkey" FOREIGN KEY ("cost_entry_id") REFERENCES "cost_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
