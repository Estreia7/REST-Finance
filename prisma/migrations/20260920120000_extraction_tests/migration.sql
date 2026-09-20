-- The extraction bench: runs of the document reader against real paperwork,
-- kept so accuracy can be measured rather than guessed at.
--
-- Deliberately not part of `receipt_scans`: those belong to a restaurant and
-- can be linked to a real cost entry. These are laboratory runs, carrying the
-- model, the prompt version, what was read, what was actually on the page,
-- and what it cost — none of which belongs in a client's records.

CREATE TABLE "extraction_tests" (
  "id"             TEXT NOT NULL,
  "user_id"        TEXT NOT NULL,
  "scan_type"      "ScanType"   NOT NULL,
  "image_path"     TEXT NOT NULL,
  "image_name"     TEXT NOT NULL,
  "model"          TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "extracted"      JSONB,
  "truth"          JSONB,
  "field_scores"   JSONB,
  "accuracy"       DOUBLE PRECISION,
  "input_tokens"   INTEGER,
  "output_tokens"  INTEGER,
  "duration_ms"    INTEGER,
  "status"         "ScanStatus" NOT NULL DEFAULT 'PENDING',
  "error"          TEXT,
  "notes"          TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "extraction_tests_pkey" PRIMARY KEY ("id")
);

-- Read newest first, and filtered by document type when comparing invoices
-- against till reports.
CREATE INDEX "extraction_tests_created_at_idx"
  ON "extraction_tests"("created_at");
CREATE INDEX "extraction_tests_scan_type_created_at_idx"
  ON "extraction_tests"("scan_type", "created_at");

ALTER TABLE "extraction_tests"
  ADD CONSTRAINT "extraction_tests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
