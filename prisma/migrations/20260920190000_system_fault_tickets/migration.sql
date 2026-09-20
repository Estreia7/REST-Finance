-- Faults the app raises for an owner, in the same queue as the requests they
-- write themselves.
--
-- An owner who hits a broken screen does not file a bug report: they try
-- again, shrug, and stop trusting the number. Nobody finds out until they
-- cancel. So the app files it.
--
-- The enum value is added in its own migration (see the one immediately
-- before this) because Postgres will not let a value added by ALTER TYPE be
-- used in the same transaction that added it, and Prisma runs each migration
-- in one. Splitting them keeps `migrate deploy` working on a fresh database
-- and on an existing one alike.

-- The real error and where it came from. Read only by an administrator: the
-- owner's own list selects columns explicitly and does not include this, and
-- it must stay that way — Prisma errors name tables and columns.
ALTER TABLE "support_tickets" ADD COLUMN "technical" TEXT;

-- One owner hitting the same broken screen ten times is one problem, not ten
-- tickets. The count says more about severity than ten identical rows would.
ALTER TABLE "support_tickets" ADD COLUMN "occurrences" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "support_tickets" ADD COLUMN "last_seen_at" TIMESTAMP(3);
