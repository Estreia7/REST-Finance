import type { CorrectionField, FixedBy } from '@/lib/scan-corrections';

/**
 * One restaurant's "brain", summarised for the administrator.
 *
 * Three questions, in the order they are asked when something looks off:
 * what does it know, is the reading getting better, and where is it still
 * wrong. Pure, so the arithmetic is tested without a database.
 */

export interface MemoryRow {
  sourceName: string;
  vendorId: string | null;
  vendorName: string | null;
  categoryName: string | null;
  notIngredient: boolean;
  packAmount: number | null;
  packUnit: string | null;
  confirmations: number;
  lastSeenAt: Date;
}

export interface LinkRow {
  sourceName: string;
  vendorId: string | null;
  ingredientName: string;
}

export interface ItemRow {
  categorySource: 'OWNER' | 'MEMORY' | 'SUGGESTED' | 'INHERITED' | null;
  createdAt: Date;
  receiptScanId: string | null;
}

export interface CorrectionRow {
  receiptScanId: string | null;
  productName: string | null;
  field: string;
  readValue: string | null;
  savedValue: string | null;
  fixedBy: string;
  vendorName: string | null;
  createdAt: Date;
}

export interface AttentionRow {
  ingredientId: string;
  name: string;
  unit: string;
  current: number | null;
  /** What it should be from the newest usable line; null where none can price it. */
  expected: number | null;
  /** The line it is (or would be) priced from. */
  productName: string | null;
  kind: 'wrong' | 'unpriceable';
}

export interface BrainSummary {
  knowledge: {
    wordings: number;
    withCategory: number;
    notIngredient: number;
    withPack: number;
    /** Wordings linked to at least one of the kitchen's ingredients. */
    linked: number;
  };
  efficacy: {
    /** Invoice lines saved in the window. */
    lines: number;
    /** By where their category came from. */
    memory: number;
    suggested: number;
    owner: number;
    other: number;
    /** Share of lines the memory already knew, 0..1 (null with no lines). */
    memoryRate: number | null;
    /** Readings confirmed by the owner, out of those taken. */
    scans: number;
    reviewed: number;
    /** Lines from confirmed readings, and how many of them needed a correction. */
    reviewedLines: number;
    correctedLines: number;
    /** Share of reviewed lines saved exactly as read, 0..1 (null with none). */
    acceptedRate: number | null;
    weekly: Array<{ week: string; lines: number; memory: number; owner: number }>;
  };
  byField: Array<{ field: CorrectionField | string; owner: number; memory: number; check: number }>;
  recent: CorrectionRow[];
  entries: Array<{
    sourceName: string;
    vendorName: string | null;
    categoryName: string | null;
    notIngredient: boolean;
    pack: string | null;
    confirmations: number;
    lastSeenAt: Date | null;
    ingredients: string[];
  }>;
  attention: AttentionRow[];
}

/** The Monday a date's week starts on, as YYYY-MM-DD. */
export function weekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

const FIELD_ORDER: string[] = ['category', 'pack', 'unitPrice', 'vendor', 'date', 'total', 'type'];

export function summariseBrain(input: {
  memories: MemoryRow[];
  links: LinkRow[];
  items: ItemRow[];
  scans: Array<{ id: string; reviewedAt: Date | null }>;
  corrections: CorrectionRow[];
  attention: AttentionRow[];
  recentLimit?: number;
}): BrainSummary {
  const { memories, links, items, scans, corrections, attention, recentLimit = 50 } = input;

  // ── What it knows ─────────────────────────────────────────────────────
  const linkedNames = new Set(links.map((l) => l.sourceName));
  const allNames = new Set([...memories.map((m) => m.sourceName), ...linkedNames]);

  // One row per wording and supplier; links from any supplier attach to the
  // wording, since that is how they are matched.
  const entries = new Map<string, BrainSummary['entries'][number]>();
  for (const m of memories) {
    const key = `${m.sourceName}|${m.vendorId ?? ''}`;
    entries.set(key, {
      sourceName: m.sourceName,
      vendorName: m.vendorName,
      categoryName: m.categoryName,
      notIngredient: m.notIngredient,
      pack: m.packUnit === 'un'
        ? 'un'
        : m.packAmount && m.packUnit ? `${Number(m.packAmount.toFixed(3))} ${m.packUnit}` : null,
      confirmations: m.confirmations,
      lastSeenAt: m.lastSeenAt,
      ingredients: [],
    });
  }
  for (const link of links) {
    const target =
      [...entries.values()].find((e) => e.sourceName === link.sourceName) ??
      (() => {
        const created = {
          sourceName: link.sourceName, vendorName: null, categoryName: null, notIngredient: false,
          pack: null, confirmations: 0, lastSeenAt: null, ingredients: [] as string[],
        };
        entries.set(`${link.sourceName}|link`, created);
        return created;
      })();
    if (!target.ingredients.includes(link.ingredientName)) target.ingredients.push(link.ingredientName);
  }

  // ── Is it getting better ──────────────────────────────────────────────
  let memory = 0, suggested = 0, owner = 0, other = 0;
  const weeks = new Map<string, { lines: number; memory: number; owner: number }>();
  for (const item of items) {
    if (item.categorySource === 'MEMORY') memory++;
    else if (item.categorySource === 'SUGGESTED') suggested++;
    else if (item.categorySource === 'OWNER') owner++;
    else other++;
    const w = weekOf(item.createdAt);
    const row = weeks.get(w) ?? { lines: 0, memory: 0, owner: 0 };
    row.lines++;
    if (item.categorySource === 'MEMORY') row.memory++;
    if (item.categorySource === 'OWNER') row.owner++;
    weeks.set(w, row);
  }

  const reviewedIds = new Set(scans.filter((s) => s.reviewedAt).map((s) => s.id));
  const reviewedLines = items.filter((i) => i.receiptScanId && reviewedIds.has(i.receiptScanId)).length;
  const correctedLines = new Set(
    corrections
      .filter((c) => c.productName && c.receiptScanId && reviewedIds.has(c.receiptScanId))
      .map((c) => `${c.receiptScanId}|${c.productName}`),
  ).size;

  // ── Where it is still wrong ───────────────────────────────────────────
  const fields = new Map<string, { owner: number; memory: number; check: number }>();
  for (const c of corrections) {
    const row = fields.get(c.field) ?? { owner: 0, memory: 0, check: 0 };
    const by = (['owner', 'memory', 'check'] as FixedBy[]).includes(c.fixedBy as FixedBy)
      ? (c.fixedBy as FixedBy)
      : 'owner';
    row[by]++;
    fields.set(c.field, row);
  }
  const rank = (f: string) => (FIELD_ORDER.indexOf(f) + 1 || 99);

  return {
    knowledge: {
      wordings: allNames.size,
      withCategory: memories.filter((m) => m.categoryName).length,
      notIngredient: memories.filter((m) => m.notIngredient).length,
      withPack: memories.filter((m) => m.packUnit).length,
      linked: linkedNames.size,
    },
    efficacy: {
      lines: items.length,
      memory, suggested, owner, other,
      memoryRate: items.length ? memory / items.length : null,
      scans: scans.length,
      reviewed: reviewedIds.size,
      reviewedLines,
      correctedLines,
      acceptedRate: reviewedLines ? Math.max(0, reviewedLines - correctedLines) / reviewedLines : null,
      weekly: [...weeks.entries()]
        .map(([week, v]) => ({ week, ...v }))
        .sort((a, b) => a.week.localeCompare(b.week)),
    },
    byField: [...fields.entries()]
      .map(([field, v]) => ({ field, ...v }))
      .sort((a, b) => rank(a.field) - rank(b.field)),
    recent: [...corrections]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, recentLimit),
    entries: [...entries.values()].sort(
      (a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0) || a.sourceName.localeCompare(b.sourceName),
    ),
    attention,
  };
}
