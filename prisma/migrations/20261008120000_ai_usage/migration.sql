-- One row per call to an AI model, and what it cost.
--
-- Until now an owner's scan threw its token counts away; only the
-- administrator's bench kept them. So nobody could say what the reader costs
-- a month, or which restaurant spends it. The cost is stored as it was at the
-- time of the call, because the price list changes and last month's bill does
-- not change with it.

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT,
    "user_id" TEXT,
    "source" TEXT NOT NULL,
    "scan_type" "ScanType",
    "model" TEXT NOT NULL,
    "prompt_version" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "succeeded" BOOLEAN NOT NULL,
    "stop_reason" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_restaurant_id_created_at_idx" ON "ai_usage"("restaurant_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
