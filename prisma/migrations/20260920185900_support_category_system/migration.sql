-- Adds the SYSTEM category, for a ticket the app raised rather than an owner.
--
-- Alone in its own migration on purpose: Postgres will not let a value added
-- by ALTER TYPE be used in the same transaction that added it, and Prisma
-- runs each migration file as one transaction. Any migration that inserts a
-- SYSTEM row must therefore come after this one.

ALTER TYPE "SupportCategory" ADD VALUE 'SYSTEM';
