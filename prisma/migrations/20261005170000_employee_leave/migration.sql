-- Holidays for the people on the rota.
--
-- start_date on the employee decides the entitlement in the year they join
-- (2 working days per complete month, art. 239.º CT). Nullable: everyone
-- already on the rota was added without it.
--
-- A leave is two inclusive dates, never a day count: how many working days
-- it uses depends on weekends and public holidays, worked out on read.

-- AlterTable
ALTER TABLE "schedule_employees" ADD COLUMN     "start_date" DATE;

-- CreateTable
CREATE TABLE "employee_leaves" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_leaves_restaurant_id_start_date_idx" ON "employee_leaves"("restaurant_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_leaves_employee_id_start_date_idx" ON "employee_leaves"("employee_id", "start_date");

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "schedule_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

