-- Support requests, raised by an owner and answered by an administrator.

CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "SupportCategory" AS ENUM ('QUESTION', 'PROBLEM', 'SUGGESTION', 'BILLING');

CREATE TABLE "support_tickets" (
  "id"            TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "subject"       TEXT NOT NULL,
  "message"       TEXT NOT NULL,
  "category"      "SupportCategory" NOT NULL DEFAULT 'QUESTION',
  "status"        "SupportStatus"   NOT NULL DEFAULT 'OPEN',
  "reply"         TEXT,
  "replied_at"    TIMESTAMP(3),
  "replied_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- Both sides read these newest first, and the admin queue filters by status.
CREATE INDEX "support_tickets_restaurant_id_created_at_idx"
  ON "support_tickets"("restaurant_id", "created_at");
CREATE INDEX "support_tickets_status_created_at_idx"
  ON "support_tickets"("status", "created_at");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_replied_by_id_fkey"
  FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
