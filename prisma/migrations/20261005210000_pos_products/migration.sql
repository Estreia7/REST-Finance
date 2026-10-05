-- Product-level POS sales.
--
-- The per-produto export carries one row per product per day; until now it
-- was rolled up to the family and the product detail thrown away.

-- CreateTable
CREATE TABLE "pos_products" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT,
    "sub_family" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_product_sales" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue_net" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_product_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_products_restaurant_id_category_id_idx" ON "pos_products"("restaurant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_products_restaurant_id_code_key" ON "pos_products"("restaurant_id", "code");

-- CreateIndex
CREATE INDEX "pos_product_sales_product_id_date_idx" ON "pos_product_sales"("product_id", "date");

-- CreateIndex
CREATE INDEX "pos_product_sales_restaurant_id_date_idx" ON "pos_product_sales"("restaurant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "pos_product_sales_restaurant_id_date_product_id_key" ON "pos_product_sales"("restaurant_id", "date", "product_id");

-- AddForeignKey
ALTER TABLE "pos_products" ADD CONSTRAINT "pos_products_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_products" ADD CONSTRAINT "pos_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_product_sales" ADD CONSTRAINT "pos_product_sales_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_product_sales" ADD CONSTRAINT "pos_product_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
