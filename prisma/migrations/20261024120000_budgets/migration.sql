-- Annual budget: a plan per year in the P&L's own bands, with "what if"
-- items that can be switched on and off. Replaces the single monthly revenue
-- target, which stays in place as a fallback until a budget exists.

-- CreateEnum
CREATE TYPE "BudgetSection" AS ENUM ('REVENUE', 'COGS', 'LABOUR', 'OPEX', 'OCCUPANCY');

-- CreateEnum
CREATE TYPE "BudgetScenarioKind" AS ENUM ('HIRE', 'PURCHASE', 'FIXED_COST', 'REVENUE_CHANGE', 'COGS_CHANGE');

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "imported_from_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "section" "BudgetSection" NOT NULL,
    "category_id" TEXT,
    "channel" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "months" DECIMAL(12,2)[],
    "revenue_share" DECIMAL(6,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_scenarios" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "kind" "BudgetScenarioKind" NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "section" "BudgetSection" NOT NULL,
    "amount" DECIMAL(12,2),
    "percent" DECIMAL(6,2),
    "meal_allowance" DECIMAL(10,2),
    "start_month" INTEGER NOT NULL,
    "spread_months" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_restaurant_id_year_key" ON "budgets"("restaurant_id", "year");

-- CreateIndex
CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines"("budget_id");

-- CreateIndex
CREATE INDEX "budget_scenarios_budget_id_idx" ON "budget_scenarios"("budget_id");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_scenarios" ADD CONSTRAINT "budget_scenarios_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
