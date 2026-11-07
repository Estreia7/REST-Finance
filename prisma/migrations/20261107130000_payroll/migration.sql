-- Someone's pay, typed in Equipa and booked as fixed monthly costs.
ALTER TABLE "schedule_employees" ADD COLUMN "gross_salary" DECIMAL(10,2);
ALTER TABLE "schedule_employees" ADD COLUMN "subsidies_spread" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "schedule_employees" ADD COLUMN "pay_day" INTEGER NOT NULL DEFAULT 31;

-- A fixed cost may book only in some months (a subsidy paid in June and November).
ALTER TABLE "recurring_costs" ADD COLUMN "months" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- The person a fixed cost is the pay of, and which part of it.
ALTER TABLE "recurring_costs" ADD COLUMN "employee_id" TEXT;
ALTER TABLE "recurring_costs" ADD COLUMN "payroll_kind" TEXT;
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "schedule_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "recurring_costs_employee_id_idx" ON "recurring_costs"("employee_id");
