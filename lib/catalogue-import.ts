/**
 * Turning the till's product list into a menu that can be costed.
 *
 * The POS knows what was sold and for how much. It knows nothing about what
 * any of it costs to make, which is the question the Ementa answers — and
 * filling the Ementa means typing two hundred products by hand, which is why
 * it stays empty.
 *
 * So the catalogue is read across. What the till calls a product becomes one
 * of two things, and the difference is the one the owner drew:
 *
 *   - **A dish.** A smashie duplo is meat, a bun, cheese and sauce. It needs
 *     a recipe, and the Ementa is where that is written.
 *   - **An ingredient.** A Super Bock is a bottle; bacon is bacon. There is
 *     nothing to decompose, so it belongs in Preços with a unit cost that the
 *     invoices can keep current.
 *
 * Nothing here invents a recipe. A dish arrives with its real selling price
 * and no lines, and the owner says what goes in it — that is the part only
 * they know. What this removes is the typing, not the thinking.
 */

/** A product as the POS import stored it. */
export interface CatalogueProduct {
  id: string;
  code: string;
  name: string;
  /** The revenue category it belongs to, upper case as the till prints it. */
  familia: string | null;
  subFamily: string | null;
  /** Units sold over the period looked at, for ordering by what matters. */
  quantity: number;
  /** Takings over the same period. Zero for a kitchen-display modifier. */
  revenue: number;
}

export type CatalogueRole = 'dish' | 'ingredient' | 'skip';

export interface ClassifiedProduct extends CatalogueProduct {
  role: CatalogueRole;
  /** Why it was filed that way, so the owner can disagree before importing. */
  reason: string;
  /** Selling price per unit, VAT included. Dishes only. */
  priceGross: number | null;
  /** 13 on food, 23 on alcohol. */
  vatRate: number;
  /**
   * What to call it on the menu.
   *
   * Usually the till's own name. Where the same dish is sold twice — à la
   * carte in COMIDAS at 7,40 and inside a menu in MENUS at 12,14, which is
   * two products and two margins — the family is added, or the Ementa would
   * carry two rows with one name and no way to tell them apart.
   */
  menuName: string;
}

/**
 * Names that more than one product carries, so those rows can say which is
 * which. Compared case-insensitively, since the till is inconsistent about it.
 */
function duplicatedNames(products: CatalogueProduct[]): Set<string> {
  const seen = new Map<string, number>();
  for (const p of products) {
    const key = p.name.trim().toUpperCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/**
 * Families whose rows are the ingredients themselves.
 *
 * These are the kitchen-display modifiers: bacon, caramelised onion, burger
 * sauce. They ring at nothing on the till because they go on something else,
 * which is exactly what makes them ingredients rather than dishes.
 */
const INGREDIENT_FAMILIAS = new Set([
  'INGREDIENTES', 'MOLHOS', 'EXTRAS', 'ADICIONAIS', 'OPCOES', 'OPÇÕES',
]);

/**
 * Families that sell a thing as it was bought.
 *
 * A bottle of beer is poured from no recipe. Costing it needs one number —
 * what the bottle costs — so it is an ingredient with a selling price, not a
 * dish with a single line pointing at itself.
 */
const SINGLE_ITEM_FAMILIAS = new Set([
  'BEBIDAS', 'CAFETARIA', 'GARRAFEIRA', 'VINHOS', 'CERVEJAS',
]);

/**
 * Families with nothing to cost.
 *
 * STAFF is what the kitchen ate, DESCONTINUADOS is off the menu. Both are
 * real history and neither is a dish anyone can still order, so importing
 * them would be two hundred rows of work for a menu nobody sells from.
 */
const SKIP_FAMILIAS = new Set(['STAFF', 'PESSOAL', 'DESCONTINUADOS', 'ANULADOS']);

/**
 * Drinks that carry the alcohol rate.
 *
 * Portugal charges 23% on alcohol and 13% on everything else a restaurant
 * serves, and the difference is the owner's margin — assuming one rate for
 * all drinks would misprice every wine on the list. Matched on the name
 * because the till's families do not separate them.
 */
const ALCOHOL_WORDS = [
  'cerveja', 'super bock', 'sagres', 'heineken', 'imperial', 'caneca',
  'vinho', 'tinto', 'branco', 'verde', 'rose', 'rosé', 'sangria', 'porto',
  'whisky', 'gin', 'vodka', 'rum', 'licor', 'aguardente', 'brandy',
  'martini', 'cocktail', 'caipirinha', 'moscatel', 'espumante', 'champanhe',
  'saque', 'saqué', 'sake',
];

export function isAlcohol(name: string): boolean {
  const n = name.toLowerCase();
  return ALCOHOL_WORDS.some((w) => n.includes(w));
}

/** The VAT a product is sold at. */
export function vatRateFor(name: string): number {
  return isAlcohol(name) ? 23 : 13;
}

/**
 * The average price one of these actually sold at.
 *
 * Taken from the takings rather than from a price list, because the takings
 * are what the till really charged — after the discounts, the menu deals and
 * the price rise halfway through the year. Null when nothing sold, since a
 * price invented for a product with no sales is a guess presented as a fact.
 */
export function averagePrice(revenue: number, quantity: number): number | null {
  if (quantity <= 0 || revenue <= 0) return null;
  return Math.round((revenue / quantity) * 100) / 100;
}

/**
 * A name that tells two products apart.
 *
 * The family is usually enough — the same burger à la carte and inside a
 * menu. It is not always: the real catalogue has SMASHIE FRANGO under two
 * till codes in the same family and the same sub-family, one of them
 * presumably recreated at some point. So this falls through to the
 * sub-family and finally to the code, which is unique by construction —
 * otherwise two rows would arrive with one name and the second would be
 * silently dropped by the unique index.
 */
function disambiguate(product: CatalogueProduct, familia: string): string {
  const sub = (product.subFamily ?? '').trim();
  if (sub && sub.toUpperCase() !== familia) return `${product.name} (${sub})`;
  if (familia) return `${product.name} (${familia})`;
  return `${product.name} (${product.code})`;
}

/**
 * What each product should become.
 *
 * Every row gets a reason, because this is shown to the owner to approve
 * before anything is written. A screen that says "47 ingredients" without
 * saying which, or why, is asking them to trust it blindly.
 */
export function classifyProduct(
  product: CatalogueProduct,
  /** Names carried by more than one product, from duplicatedNames(). */
  duplicates?: Set<string>,
): ClassifiedProduct {
  const familia = (product.familia ?? '').trim().toUpperCase();
  const price = averagePrice(product.revenue, product.quantity);
  const vatRate = vatRateFor(product.name);

  const isDuplicate = duplicates?.has(product.name.trim().toUpperCase()) ?? false;
  const menuName = isDuplicate ? disambiguate(product, familia) : product.name;

  const base = { ...product, priceGross: null as number | null, vatRate, menuName };

  if (SKIP_FAMILIAS.has(familia)) {
    return { ...base, role: 'skip', reason: 'notOnMenu' };
  }

  // A row named after its own family is the till's catch-all, booked when no
  // specific topping was chosen. It is not a thing anyone can buy.
  if (familia && product.name.trim().toUpperCase() === familia) {
    return { ...base, role: 'skip', reason: 'catchAll' };
  }

  if (INGREDIENT_FAMILIAS.has(familia)) {
    return { ...base, role: 'ingredient', reason: 'modifier' };
  }

  if (SINGLE_ITEM_FAMILIAS.has(familia)) {
    // Sold as bought, so it is priced like a dish and costed like an
    // ingredient: both, and the importer writes both.
    return { ...base, role: 'ingredient', reason: 'soldAsBought', priceGross: price };
  }

  // Everything else is something the kitchen makes. Without a price there is
  // nothing to measure a margin against, so it waits rather than arriving
  // priced at zero.
  if (price === null) {
    return { ...base, role: 'skip', reason: 'noSales' };
  }

  return { ...base, role: 'dish', reason: 'composed', priceGross: price };
}

export interface CataloguePlan {
  dishes: ClassifiedProduct[];
  ingredients: ClassifiedProduct[];
  skipped: ClassifiedProduct[];
}

/**
 * The whole catalogue, sorted so the decisions that matter come first.
 *
 * By takings within each group: an owner reviewing a long list should meet
 * the dish that carries the room before the one that sold twice.
 */
export function planCatalogue(products: CatalogueProduct[]): CataloguePlan {
  const duplicates = duplicatedNames(products);
  const classified = products.map((p) => classifyProduct(p, duplicates));

  // Last resort. The family and the sub-family settle almost every
  // collision, but the real catalogue has one product under two codes
  // with both the same — and a name that still repeats here would be
  // written once and dropped the second time by the unique index, losing
  // a dish without saying so. The code is unique by construction.
  const used = new Set<string>();
  for (const p of classified) {
    if (p.role === 'skip') continue;
    const key = p.menuName.trim().toUpperCase();
    if (used.has(key)) p.menuName = `${p.menuName} [${p.code}]`;
    used.add(p.menuName.trim().toUpperCase());
  }
  const byRevenue = (a: ClassifiedProduct, b: ClassifiedProduct) =>
    b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name);
  // Modifiers all ring at zero, so takings cannot order them.
  const byQuantity = (a: ClassifiedProduct, b: ClassifiedProduct) =>
    b.quantity - a.quantity || a.name.localeCompare(b.name);

  return {
    dishes: classified.filter((p) => p.role === 'dish').sort(byRevenue),
    ingredients: classified.filter((p) => p.role === 'ingredient').sort(byQuantity),
    skipped: classified.filter((p) => p.role === 'skip').sort(byRevenue),
  };
}

/**
 * The unit a kitchen buys this in.
 *
 * A guess, and a shallow one: anything poured is a litre, anything else is a
 * unit unless it reads like something weighed. The owner corrects it in
 * Preços, where it is one dropdown — and guessing wrong costs them a moment,
 * where guessing a quantity would cost them a wrong margin.
 */
const LITRE_WORDS = ['agua', 'água', 'sumo', 'refrigerante', 'cola', 'cerveja', 'vinho', 'leite', 'azeite', 'oleo', 'óleo', 'molho', 'maionese', 'ketchup'];
const KILO_WORDS = ['carne', 'bacon', 'queijo', 'frango', 'bife', 'peixe', 'bacalhau', 'polvo', 'batata', 'cebola', 'tomate', 'alface', 'presunto', 'fiambre', 'cogumelo'];

export function guessPurchaseUnit(name: string): 'kg' | 'L' | 'un' {
  const n = name.toLowerCase();
  if (LITRE_WORDS.some((w) => n.includes(w))) return 'L';
  if (KILO_WORDS.some((w) => n.includes(w))) return 'kg';
  return 'un';
}
