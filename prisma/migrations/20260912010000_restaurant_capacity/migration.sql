-- Dining room capacity and service length, for RevPASH (revenue per available
-- seat-hour). Nullable: the metric is hidden until an owner supplies them,
-- rather than being computed from an assumed seat count.
ALTER TABLE "restaurants" ADD COLUMN "seats" INTEGER;
ALTER TABLE "restaurants" ADD COLUMN "service_hours_per_day" DECIMAL(4,1);
