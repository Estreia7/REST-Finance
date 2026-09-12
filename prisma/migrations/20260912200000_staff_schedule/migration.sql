-- Staff scheduling: a weekly rota the owner can send to the team.
--
-- The people on a rota are not the people who log into the accounting. A
-- kitchen porter belongs on the schedule and will never open the app, so
-- schedule_employees is its own table rather than a view over memberships;
-- requiring an email and an invite would make the feature unusable for half
-- the team it exists to organise.
--
-- Times are minutes from midnight rather than timestamps. A weekly grid that
-- repeats has no business carrying timezone or DST baggage, and integers sum
-- into weekly hours without any conversion.

CREATE TABLE "schedule_employees" (
  "id"            TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "role"          TEXT,
  "color"         TEXT NOT NULL DEFAULT 'slate',
  "sort_order"    INTEGER NOT NULL DEFAULT 0,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"    TIMESTAMP(3),

  CONSTRAINT "schedule_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shift_templates" (
  "id"            TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "start_min"     INTEGER NOT NULL,
  "end_min"       INTEGER NOT NULL,
  "sort_order"    INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shifts" (
  "id"            TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "employee_id"   TEXT NOT NULL,
  "date"          DATE NOT NULL,
  "start_min"     INTEGER NOT NULL,
  "end_min"       INTEGER NOT NULL,
  "note"          TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_closures" (
  "id"            TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "date"          DATE NOT NULL,
  "reason"        TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "schedule_closures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "schedule_employees_restaurant_id_active_sort_order_idx"
  ON "schedule_employees"("restaurant_id", "active", "sort_order");

CREATE INDEX "shift_templates_restaurant_id_sort_order_idx"
  ON "shift_templates"("restaurant_id", "sort_order");

-- One shift per person per day: a split shift carries a note rather than a
-- second row, which keeps the grid at one cell per person per day.
CREATE UNIQUE INDEX "shifts_employee_id_date_key" ON "shifts"("employee_id", "date");
CREATE INDEX "shifts_restaurant_id_date_idx" ON "shifts"("restaurant_id", "date");

CREATE UNIQUE INDEX "schedule_closures_restaurant_id_date_key"
  ON "schedule_closures"("restaurant_id", "date");
CREATE INDEX "schedule_closures_restaurant_id_date_idx"
  ON "schedule_closures"("restaurant_id", "date");

ALTER TABLE "schedule_employees"
  ADD CONSTRAINT "schedule_employees_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shift_templates"
  ADD CONSTRAINT "shift_templates_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade here only: deleting an employee row is the hard delete the UI never
-- performs. Removing someone from the team sets deleted_at and keeps their
-- shifts, because a schedule that rewrites history is not a record.
ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "schedule_employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_closures"
  ADD CONSTRAINT "schedule_closures_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
