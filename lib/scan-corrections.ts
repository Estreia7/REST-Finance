import { lineArithmeticHolds, samePack, type PackSize, type RememberedPack } from '@/lib/invoice-matching';

/**
 * Where an invoice's reading differed from what was saved.
 *
 * Run once, when the owner confirms the invoice. The reader's answer is the
 * stored scan; the saved answer is what the owner confirmed, with the
 * restaurant's memory already applied. Every difference is a thing the reader
 * got wrong, and who put it right says whether the memory is earning its keep:
 * a category the memory fixed is a question the owner was spared.
 *
 * Pure, so the rules can be tested without a database.
 */

export type CorrectionField = 'vendor' | 'date' | 'total' | 'type' | 'category' | 'pack' | 'unitPrice';
export type FixedBy = 'owner' | 'memory' | 'check';

export interface Correction {
  /** The line's wording, or null for a field of the invoice itself. */
  productName: string | null;
  field: CorrectionField;
  readValue: string | null;
  savedValue: string | null;
  fixedBy: FixedBy;
}

/** The reader's answer, as stored with the scan. */
export interface Reading {
  vendor?: string;
  date?: string;
  grandTotal?: number;
  suggestedType?: string;
  items?: Array<{
    product: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    total: number;
    category?: string;
    packAmount?: number;
    packUnit?: string;
  }>;
}

/** What was saved, as the owner confirmed it. */
export interface Saved {
  vendor: string;
  date: string;
  total: number;
  type: string;
  lines: Array<{
    productName: string;
    /** The category's name, so it can be compared with the reader's. */
    categoryName: string | null;
    categorySource?: 'OWNER' | 'MEMORY' | 'SUGGESTED';
    /** The package answer, where there was a package to answer about. */
    pack?: RememberedPack | null;
    /** Who settled the package: the owner, the memory, or agreeing labels. */
    packDecidedBy?: FixedBy;
  }>;
}

/** Text compared the way a person would: case, accents and spacing aside. */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}

export function formatPack(pack: PackSize | RememberedPack | null | undefined): string | null {
  if (!pack) return null;
  if (pack === 'packages') return 'un';
  return `${Number(pack.amount.toFixed(3))} ${pack.unit}`;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function diffReading(reading: Reading, saved: Saved): Correction[] {
  const out: Correction[] = [];
  const header = (field: CorrectionField, read: string | null, kept: string | null) =>
    out.push({ productName: null, field, readValue: read, savedValue: kept, fixedBy: 'owner' });

  if (reading.vendor !== undefined && !sameText(reading.vendor, saved.vendor)) {
    header('vendor', reading.vendor || null, saved.vendor);
  }
  if (reading.date && reading.date.slice(0, 10) !== saved.date.slice(0, 10)) {
    header('date', reading.date.slice(0, 10), saved.date.slice(0, 10));
  }
  if (typeof reading.grandTotal === 'number' && Math.abs(reading.grandTotal - saved.total) >= 0.005) {
    header('total', money(reading.grandTotal), money(saved.total));
  }
  if (reading.suggestedType && reading.suggestedType !== saved.type) {
    header('type', reading.suggestedType, saved.type);
  }

  const read = new Map((reading.items ?? []).map((item) => [item.product, item]));
  for (const line of saved.lines) {
    const item = read.get(line.productName);
    if (!item) continue;

    // The category, where the reader offered one and something else stuck.
    if (item.category && line.categoryName && !sameText(item.category, line.categoryName)) {
      out.push({
        productName: line.productName,
        field: 'category',
        readValue: item.category,
        savedValue: line.categoryName,
        // A memory or a similar wording that overrode the reader is the
        // brain doing its job; the owner changing it is the brain learning.
        fixedBy: line.categorySource === 'OWNER' ? 'owner' : 'memory',
      });
    }

    // The package. Reading no size and counting in packages agree; reading
    // no size where the package held 2,5 kg is the mistake that priced a bag
    // of sweet potatoes as a kilo.
    if (line.pack !== undefined) {
      const readPack: PackSize | null =
        item.packAmount && (item.packUnit === 'kg' || item.packUnit === 'L')
          ? { amount: item.packAmount, unit: item.packUnit }
          : null;
      const kept = line.pack === 'packages' ? null : line.pack ?? null;
      const agree = (!readPack && !kept) || samePack(readPack, kept);
      if (!agree) {
        out.push({
          productName: line.productName,
          field: 'pack',
          readValue: formatPack(readPack),
          savedValue: formatPack(line.pack ?? null),
          fixedBy: line.packDecidedBy ?? 'owner',
        });
      }
    }

    // A unit price that does not multiply out to the total was recovered
    // from the total. Said here because it was the reader's misreading.
    // A line given away at zero is not a misreading.
    if (item.quantity > 0 && item.total > 0 && !lineArithmeticHolds({ productName: item.product, ...item })) {
      out.push({
        productName: line.productName,
        field: 'unitPrice',
        readValue: String(item.unitPrice),
        savedValue: String(Math.round((item.total / item.quantity) * 10000) / 10000),
        fixedBy: 'check',
      });
    }
  }

  return out;
}
