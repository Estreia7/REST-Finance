-- The council the restaurant pays its derrama municipal to, by the Tax
-- Authority's district/council code. Null until the owner picks it; the tax
-- estimate then keeps using the rate typed by hand.

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "municipality_code" TEXT;
