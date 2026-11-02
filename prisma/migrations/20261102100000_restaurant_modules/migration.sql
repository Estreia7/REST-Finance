-- Extra modules (stock, time clock, ...) switched on per restaurant by an
-- administrator. Empty for every restaurant: modules start off.
-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
