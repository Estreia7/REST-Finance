-- Renewal cadence for compliance documents.
--
-- Existing rows become NONE, which is correct: nothing recorded so far
-- declared a renewal period, and defaulting them to annual would invent
-- renewal dates nobody entered.

CREATE TYPE "RenewalPeriod" AS ENUM ('NONE', 'MONTHLY', 'ANNUAL');

ALTER TABLE "compliance_docs"
  ADD COLUMN "renewal_period" "RenewalPeriod" NOT NULL DEFAULT 'NONE';
