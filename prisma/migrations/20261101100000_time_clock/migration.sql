-- AlterTable
ALTER TABLE "schedule_employees" ADD COLUMN     "pin_hash" TEXT;

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "clock_out" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'kiosk',
    "edited_by" TEXT,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_restaurant_id_clock_in_idx" ON "time_entries"("restaurant_id", "clock_in");

-- CreateIndex
CREATE INDEX "time_entries_employee_id_clock_out_idx" ON "time_entries"("employee_id", "clock_out");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_employees_restaurant_id_pin_hash_key" ON "schedule_employees"("restaurant_id", "pin_hash");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "schedule_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

