-- A person's day off, on a day the restaurant is open.
CREATE TABLE "schedule_days_off" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_days_off_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_days_off_employee_id_date_key" ON "schedule_days_off"("employee_id", "date");
CREATE INDEX "schedule_days_off_restaurant_id_date_idx" ON "schedule_days_off"("restaurant_id", "date");

ALTER TABLE "schedule_days_off" ADD CONSTRAINT "schedule_days_off_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_days_off" ADD CONSTRAINT "schedule_days_off_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "schedule_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
