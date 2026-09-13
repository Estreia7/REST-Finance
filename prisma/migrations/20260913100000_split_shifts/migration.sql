-- Split shifts: lunch and dinner as one turno with the afternoon off.
--
-- Nullable throughout, so every existing shift stays exactly as it was: a
-- straight shift simply has no break. The pair is set together or not at all,
-- which the application enforces and the check below guarantees.

ALTER TABLE "shifts"
  ADD COLUMN "break_start_min" INTEGER,
  ADD COLUMN "break_end_min"   INTEGER;

ALTER TABLE "shift_templates"
  ADD COLUMN "break_start_min" INTEGER,
  ADD COLUMN "break_end_min"   INTEGER;

-- Half a break is not a break. Without this a partial write would leave a
-- shift whose hours cannot be computed.
ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_break_pair_check"
  CHECK (("break_start_min" IS NULL) = ("break_end_min" IS NULL));

ALTER TABLE "shift_templates"
  ADD CONSTRAINT "shift_templates_break_pair_check"
  CHECK (("break_start_min" IS NULL) = ("break_end_min" IS NULL));
