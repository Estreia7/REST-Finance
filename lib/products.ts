/**
 * Reading product sales.
 *
 * The POS export has two kinds of row filed under the same column, and they
 * want opposite treatment:
 *
 *   SMASHIE DUPLO C/QUEIJO   COMIDAS / SMASHIES   10   130,10 EUR
 *   CEBOLA CARAMELIZADA      INGREDIENTES          7     0,00 EUR
 *
 * The first is a product: it was ordered, it has a price, and ranking it by
 * takings is the question an owner asks. The second is a modifier — the
 * kitchen display needs to know the burger comes with caramelised onion, so
 * the till rings it at nothing. Putting both in one "best sellers" table
 * ranks forty real dishes against three hundred toppings, and sorting that
 * by money buries every modifier at zero while sorting by units floats them
 * to the top.
 *
 * So they are split, and ranked on different measures: products by what they
 * brought in, modifiers by how often they were asked for.
 */

/**
 * Famílias the till uses for kitchen-display modifiers rather than products.
 *
 * Matched by name because that is all the export carries, and upper-cased
 * because the till prints them that way. A família not listed here is a
 * product family, which is the safe default: a new product family shows up
 * in the products table where the owner will see it, rather than silently
 * vanishing into a ranking it does not belong in.
 */
/**
 * The modifier families, as a list.
 *
 * Exported because Prisma needs an array for an `in` filter while the rest of
 * the app wants the predicate below. One definition either way: three copies
 * of this list existed, and one of them had already drifted.
 */
export const MODIFIER_FAMILIA_NAMES = [
  'INGREDIENTES',
  'MOLHOS',
  'EXTRAS',
  'ADICIONAIS',
  'OPCOES',
  'OPÇÕES',
];

const MODIFIER_FAMILIAS: ReadonlySet<string> = new Set(MODIFIER_FAMILIA_NAMES);

export function isModifierFamilia(familia: string | null | undefined): boolean {
  if (!familia) return false;
  return MODIFIER_FAMILIAS.has(familia.trim().toUpperCase());
}

/**
 * Famílias that are not sales at all.
 *
 * STAFF is what the kitchen ate, rung through the till at zero so the stock
 * comes off. It is a real cost and no part of revenue, so a product table
 * that ranked it would be answering a different question — and a staff
 * burger would sit in the best-sellers at nought euros.
 */
const NON_SALES_FAMILIAS = new Set(['STAFF', 'PESSOAL', 'OFERTAS', 'ANULADOS']);

export function isNonSalesFamilia(familia: string | null | undefined): boolean {
  if (!familia) return false;
  return NON_SALES_FAMILIAS.has(familia.trim().toUpperCase());
}

/**
 * Whether a row is a till catch-all rather than a thing that was eaten.
 *
 * The POS books a generic "INGREDIENTES" line whenever an order carries a
 * topping nobody chose specifically — 2 877 of them in one year of real
 * data, which is more than any actual ingredient. Left in, it tops the
 * owner's ranking with the word "ingredients", which answers nothing.
 *
 * Matched only where the product's name is its own família: a real ingredient
 * is never called INGREDIENTES.
 */
export function isCatchAll(name: string, familia: string | null | undefined): boolean {
  if (!familia) return false;
  return name.trim().toUpperCase() === familia.trim().toUpperCase();
}

/** A product with its totals over the period asked for. */
export interface ProductTotals {
  id: string;
  code: string;
  name: string;
  familia: string | null;
  subFamily: string | null;
  /** Units sold. */
  quantity: number;
  /** Takings, VAT included. */
  revenue: number;
  /** Share of the period's product takings, 0–100. Null when nothing sold. */
  share: number | null;
}

/** A sale row as the database hands it back, before any aggregation. */
export interface SaleRow {
  productId: string;
  code: string;
  name: string;
  familia: string | null;
  subFamily: string | null;
  monthIndex: number;
  quantity: number;
  revenue: number;
}

/**
 * Totals per product, newest wording kept, biggest takings first.
 *
 * `share` is of the total passed in rather than of this list, so a filtered
 * view still reports each product's share of the whole period and the
 * percentages do not silently re-base when the owner picks a family.
 */
export function totalsByProduct(rows: SaleRow[], ofTotal?: number): ProductTotals[] {
  const byId = new Map<string, ProductTotals>();

  for (const row of rows) {
    const found = byId.get(row.productId);
    if (found) {
      found.quantity += row.quantity;
      found.revenue += row.revenue;
    } else {
      byId.set(row.productId, {
        id: row.productId,
        code: row.code,
        name: row.name,
        familia: row.familia,
        subFamily: row.subFamily,
        quantity: row.quantity,
        revenue: row.revenue,
        share: null,
      });
    }
  }

  const out = [...byId.values()];
  const total = ofTotal ?? out.reduce((s, p) => s + p.revenue, 0);

  for (const p of out) {
    p.revenue = round2(p.revenue);
    p.share = total > 0 ? round1((p.revenue / total) * 100) : null;
  }

  // By takings, then units, then name — so the order is stable and a table
  // of zero-priced rows is not arbitrary.
  return out.sort(
    (a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name),
  );
}

/**
 * Units asked for per modifier, most-requested first.
 *
 * The till's own catch-all line is dropped: it outnumbers every real
 * ingredient and naming it tells the owner nothing they can prep or order.
 */
export function rankModifiers(rows: SaleRow[], limit = 10): ProductTotals[] {
  const totals = totalsByProduct(
    rows.filter((r) => isModifierFamilia(r.familia) && !isCatchAll(r.name, r.familia)),
  );
  return totals
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * One product's units and takings across the twelve calendar months.
 *
 * Every month is present, zero where nothing sold, so the chart's x-axis is
 * the year rather than only the months that happened to trade — a product
 * that stopped selling in June should show as falling to nothing, not as a
 * line that ends.
 */
export function monthlySeries(rows: SaleRow[]): Array<{ monthIndex: number; quantity: number; revenue: number }> {
  const months = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    quantity: 0,
    revenue: 0,
  }));

  for (const row of rows) {
    const m = months[row.monthIndex];
    if (!m) continue;
    m.quantity += row.quantity;
    m.revenue += row.revenue;
  }

  for (const m of months) m.revenue = round2(m.revenue);
  return months;
}

/**
 * Below this a product is not being sold, it is being included.
 *
 * In a real year of data the item with the most units was a small portion of
 * chips at six cents each: 2 270 of them, because every menu comes with one
 * and the till rings it at a token price so the kitchen sees it. Calling that
 * the restaurant's best seller is wrong in a way the owner would notice
 * immediately — the real answer sits a line below it at 8,81 EUR a go.
 *
 * Twenty cents rather than zero, because the token prices are not all zero,
 * and well under the cheapest thing anyone actually buys (an espresso at a
 * euro), so nothing a customer chooses is caught by it.
 */
export const INCLUDED_UNIT_PRICE = 0.2;

/**
 * The best and worst seller over the period.
 *
 * "Least sold" means least sold of the things that did sell. A product with
 * no sales at all is not the worst performer — it is probably off the menu,
 * and naming it would send the owner looking at a dish they already
 * discontinued.
 *
 * Measured in units, which is what the owner asked: what goes out most, not
 * what is dearest. Items the till includes rather than sells are left out —
 * see INCLUDED_UNIT_PRICE.
 */
export function extremes(totals: ProductTotals[]): {
  best: ProductTotals | null;
  worst: ProductTotals | null;
} {
  const sold = totals.filter(
    (p) => p.quantity > 0 && p.revenue / p.quantity >= INCLUDED_UNIT_PRICE,
  );
  if (sold.length === 0) return { best: null, worst: null };

  const byUnits = [...sold].sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name),
  );

  return {
    best: byUnits[0],
    // The same product when only one sold, which is honest: it is both.
    worst: byUnits[byUnits.length - 1],
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
