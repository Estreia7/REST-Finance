-- The same takings net of VAT, as the till reports them.
--
-- Kept because the difference between gross and net is the VAT actually
-- charged on that category. A Portuguese restaurant pays 13% on food and 23%
-- on drink, and a category like MENUS mixes both, so no single assumed rate
-- is right for any of them — the only honest figure is the one the till
-- applied. Nullable: a source that does not carry a net column says nothing
-- about VAT, and a zero there would be a lie rather than a gap.

ALTER TABLE "daily_category_revenue" ADD COLUMN "revenue_net" DECIMAL(12,2);
