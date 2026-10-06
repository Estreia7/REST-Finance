-- Fixed monthly costs: rent, internet, a 12-month contract.
--
-- recurring_costs holds what the owner typed once; cost_entries gains a link
-- back to it on the entries booked automatically. The unique pair
-- (recurring_cost_id, date) is what stops a month being booked twice when two
-- dashboards open at once. Ordinary entries leave the link null, which the
-- unique index ignores.

-- AlterTable
ALTER TABLE "cost_entries" ADD COLUMN     "recurring_cost_id" TEXT;

-- CreateTable
CREATE TABLE "recurring_costs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "type" "CostType" NOT NULL,
    "category_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "day_of_month" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "last_generated_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_costs_restaurant_id_active_idx" ON "recurring_costs"("restaurant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_recurring_cost_id_date_key" ON "cost_entries"("recurring_cost_id", "date");

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_recurring_cost_id_fkey" FOREIGN KEY ("recurring_cost_id") REFERENCES "recurring_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
