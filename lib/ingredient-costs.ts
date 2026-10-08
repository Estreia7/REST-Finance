import { packSizeOf, type RememberedPack } from '@/lib/invoice-matching';

/**
 * An invoice line's price, restated per unit of the ingredient it feeds.
 *
 * The ingredient is measured in kilos, litres or units, and a recipe trusts
 * its cost to be "per that unit". The invoice line is in whatever the
 * supplier billed: kilos, grams, or a bag. Copying the line's unit price
 * straight across — which four places used to do — is right only when the two
 * agree, and quietly wrong otherwise: a 2,5 kg bag of sweet potatoes at 6,25
 * became sweet potatoes at 6,25 the kilo, and every dish using them cost two
 * and a half times what it should.
 *
 * Null where the two cannot be reconciled — a line by the bag with no size
 * to read, a line by the kilo for an ingredient counted in units. The caller
 * then leaves the ingredient's cost alone, because no number is better than
 * a confident wrong one.
 */

export interface PricedLine {
  productName: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  total: number;
}

type LineUnit = 'kg' | 'g' | 'L' | 'ml' | 'cl' | 'un';

/** A supplier's unit, read the way suppliers write it. Blank counts as units. */
export function lineUnitOf(raw: string | null | undefined): LineUnit | null {
  const u = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!u || ['un', 'und', 'uni', 'unid', 'unidade', 'unidades', 'u', 'cx', 'caixa', 'pc', 'pç', 'pack', 'emb', 'sc', 'saco', 'dz'].includes(u)) {
    return 'un';
  }
  if (['kg', 'kgs', 'kgr', 'k', 'kilo', 'kilos'].includes(u)) return 'kg';
  if (['g', 'gr', 'grs'].includes(u)) return 'g';
  if (['l', 'lt', 'lts', 'ltr', 'litro', 'litros'].includes(u)) return 'L';
  if (u === 'ml') return 'ml';
  if (u === 'cl') return 'cl';
  return null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function costPerIngredientUnit(
  ingredientUnit: string,
  line: PricedLine,
  remembered?: RememberedPack | null,
): number | null {
  const lineUnit = lineUnitOf(line.unit);
  if (!lineUnit) return null;

  // Recovered from the total where possible: the total and the quantity are
  // the figures a supplier least often gets wrong and a reader least often
  // misreads, and the total already carries any discount on the line.
  const perLineUnit =
    line.quantity > 0 && line.total > 0 ? line.total / line.quantity : line.unitPrice;
  if (!(perLineUnit > 0)) return null;

  const target = ingredientUnit.trim();

  if (target === 'kg' || target === 'L') {
    const weight = target === 'kg';
    if (weight && lineUnit === 'kg') return round4(perLineUnit);
    if (weight && lineUnit === 'g') return round4(perLineUnit * 1000);
    if (!weight && lineUnit === 'L') return round4(perLineUnit);
    if (!weight && lineUnit === 'ml') return round4(perLineUnit * 1000);
    if (!weight && lineUnit === 'cl') return round4(perLineUnit * 100);

    if (lineUnit === 'un') {
      // Billed by the package: worth a price per kilo only if we know what
      // the package holds — from the owner's answer first, then the label.
      if (remembered === 'packages') return null;
      const pack = remembered ?? packSizeOf(line.productName);
      if (!pack || pack.unit !== target) return null;
      return round4(perLineUnit / pack.amount);
    }
    return null;
  }

  // Counted in units: only a line counted in units prices it.
  if (target === 'un') return lineUnit === 'un' ? round4(perLineUnit) : null;

  return null;
}
