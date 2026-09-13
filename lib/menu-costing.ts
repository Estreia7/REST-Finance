/**
 * What a dish costs and what it earns.
 *
 * The arithmetic is simple; the two places it goes wrong are not.
 *
 * VAT. A Portuguese menu price includes it — 13% on restaurant food, 23% on
 * alcohol. Comparing that gross price against net ingredient costs overstates
 * every margin by roughly a seventh, which is exactly the error that lets an
 * owner keep a dish they are losing money on. The menu price is stored gross
 * because that is the number printed on the board and the only one they can
 * check without arithmetic; the net figure is derived here, every time.
 *
 * Units. Recipes are written in grams and millilitres; ingredients are bought
 * in kilos and litres. A missed factor of 1000 makes a dish look either free
 * or catastrophic, so conversion is explicit and refuses combinations it does
 * not understand rather than guessing.
 */

/** Portuguese restaurant VAT, mainland. */
export const VAT_RATES = [
  { rate: 13, label: 'Comida e bebidas não alcoólicas (13%)' },
  { rate: 23, label: 'Bebidas alcoólicas (23%)' },
  { rate: 6, label: 'Taxa reduzida (6%)' },
  { rate: 0, label: 'Isento (0%)' },
] as const;

/** What a kitchen buys in, and what a recipe measures in. */
export const PURCHASE_UNITS = ['kg', 'L', 'un'] as const;
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'L', 'un'] as const;

export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/**
 * How many purchase units one recipe unit is.
 *
 * Null where the pair makes no sense: grams of an ingredient bought by the
 * unit is not a conversion, it is a mistake in the recipe, and silently
 * treating it as 1 would put a plausible-looking wrong number on the screen.
 */
export function unitFactor(recipeUnit: string, purchaseUnit: string): number | null {
  const r = recipeUnit.trim();
  const p = purchaseUnit.trim();

  if (r === p) return 1;

  if (p === 'kg') {
    if (r === 'g') return 0.001;
    return null;
  }
  if (p === 'L') {
    if (r === 'ml') return 0.001;
    return null;
  }
  // Bought by the unit: only whole units convert.
  return null;
}

export interface CostedIngredient {
  unit: string;
  /** Pinned by the owner; wins over the invoice when set. */
  manualUnitCost: number | null;
  /** From the most recent matching invoice. */
  invoiceUnitCost: number | null;
  /** Trim and waste, as a percentage of what is bought. */
  wastePercent: number;
}

/** Which price a costing actually used, so the UI can show its provenance. */
export type CostSource = 'manual' | 'invoice' | 'none';

export function effectiveUnitCost(ingredient: CostedIngredient): {
  cost: number | null;
  source: CostSource;
} {
  if (ingredient.manualUnitCost !== null && Number.isFinite(ingredient.manualUnitCost)) {
    return { cost: ingredient.manualUnitCost, source: 'manual' };
  }
  if (ingredient.invoiceUnitCost !== null && Number.isFinite(ingredient.invoiceUnitCost)) {
    return { cost: ingredient.invoiceUnitCost, source: 'invoice' };
  }
  return { cost: null, source: 'none' };
}

export interface RecipeLineInput {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  ingredient: CostedIngredient;
}

export interface CostedLine {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  /** What this line contributes to the plate, waste included. */
  cost: number | null;
  source: CostSource;
  /** Set when the line could not be costed, naming why. */
  problem: 'no-price' | 'bad-unit' | null;
}

/**
 * One recipe line's contribution to the plate.
 *
 * Waste is applied by inflating the quantity: 1kg of whole fish yielding 800g
 * of plated fish means the 150g on the plate consumed 187.5g of purchase. The
 * naive alternative — adding waste to the cost afterwards — is the same
 * arithmetic only when waste is small, and diverges exactly where it matters.
 */
export function costLine(line: RecipeLineInput): CostedLine {
  const base = {
    ingredientId: line.ingredientId,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
  };

  const factor = unitFactor(line.unit, line.ingredient.unit);
  if (factor === null) {
    return { ...base, cost: null, source: 'none', problem: 'bad-unit' };
  }

  const { cost: unitCost, source } = effectiveUnitCost(line.ingredient);
  if (unitCost === null) {
    return { ...base, cost: null, source: 'none', problem: 'no-price' };
  }

  const waste = Math.min(Math.max(line.ingredient.wastePercent, 0), 99);
  const yieldFactor = 1 - waste / 100;
  const purchased = (line.quantity * factor) / yieldFactor;

  return { ...base, cost: purchased * unitCost, source, problem: null };
}

export interface MenuCosting {
  /** What the customer pays. */
  priceGross: number;
  /** What the restaurant keeps of it. */
  priceNet: number;
  vatAmount: number;
  vatRate: number;

  /** The plate cost, and the lines behind it. */
  foodCost: number;
  lines: CostedLine[];

  /** Net price less food cost: what the dish contributes before labour. */
  grossProfit: number;
  /** Food cost as a share of net price — the number a chef manages to. */
  foodCostPercent: number | null;
  /** Gross profit as a share of net price. */
  marginPercent: number | null;

  /** True when a line could not be costed, so the total understates reality. */
  incomplete: boolean;
  missingCount: number;
}

/**
 * Strips VAT from a gross price.
 *
 * 12.50 at 13% is 11.06, not 10.88: VAT is a fraction of the net price, so it
 * comes out by dividing, never by subtracting 13% of the gross. Getting this
 * backwards is the single most common error in a hand-built menu spreadsheet.
 */
export function netFromGross(gross: number, vatRate: number): number {
  return gross / (1 + vatRate / 100);
}

export function costMenuItem(input: {
  priceGross: number;
  vatRate: number;
  lines: RecipeLineInput[];
}): MenuCosting {
  const priceGross = Number.isFinite(input.priceGross) ? input.priceGross : 0;
  const vatRate = Number.isFinite(input.vatRate) ? input.vatRate : 0;

  const priceNet = netFromGross(priceGross, vatRate);
  const vatAmount = priceGross - priceNet;

  const lines = input.lines.map(costLine);
  const foodCost = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const missingCount = lines.filter((l) => l.problem !== null).length;

  const grossProfit = priceNet - foodCost;

  return {
    priceGross,
    priceNet,
    vatAmount,
    vatRate,
    foodCost,
    lines,
    grossProfit,
    // Undefined rather than zero for a free item: dividing by nothing is not
    // a 0% food cost, it is a question the data cannot answer.
    foodCostPercent: priceNet > 0 ? (foodCost / priceNet) * 100 : null,
    marginPercent: priceNet > 0 ? (grossProfit / priceNet) * 100 : null,
    incomplete: missingCount > 0,
    missingCount,
  };
}

/**
 * The price that would hit a target food-cost percentage.
 *
 * Answers the question an owner actually asks — "what should I charge?" —
 * and returns it gross, because that is what goes on the board.
 */
export function suggestedPrice(
  foodCost: number,
  targetFoodCostPercent: number,
  vatRate: number
): number | null {
  if (!(targetFoodCostPercent > 0) || !Number.isFinite(foodCost)) return null;
  const net = foodCost / (targetFoodCostPercent / 100);
  return net * (1 + vatRate / 100);
}

/**
 * Where a dish sits on the menu-engineering grid.
 *
 * The classic four boxes: popularity against profitability. It earns its
 * place because the advice differs sharply per box — a Puzzle needs selling,
 * a Plowhorse needs repricing, and treating them alike is how a menu drifts.
 *
 * Thresholds are the menu's own averages, not fixed numbers: "profitable"
 * only means anything relative to the rest of the carte.
 */
export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog';

/**
 * The names and advice for each class live in the dictionary, under
 * `menuCalc.class.*`, because they are read by the owner and this module has
 * no language. `MenuClassBadge` resolves them at render time.
 */

export function classify(
  grossProfit: number,
  volume: number,
  avgGrossProfit: number,
  avgVolume: number
): MenuClass {
  const profitable = grossProfit >= avgGrossProfit;
  const popular = volume >= avgVolume;

  if (profitable && popular) return 'star';
  if (!profitable && popular) return 'plowhorse';
  if (profitable && !popular) return 'puzzle';
  return 'dog';
}
