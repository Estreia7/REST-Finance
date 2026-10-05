/**
 * A year of amounts by category, shaped for a stacked monthly chart.
 *
 * Shared by what was sold and what was spent, so the two charts fold their
 * categories the same way and can be read against each other.
 */

/** The name of the folded tail. The chart translates it on display. */
export const OTHER_SERIES = 'Outras';
/** Amounts with no category. Also translated by the chart. */
export const UNCATEGORISED_SERIES = 'Sem categoria';
/** Beyond six bands a stack is unreadable and its legend longer than it. */
export const MAX_SERIES = 6;

export interface MonthlySeries {
  /** Largest first, the folded tail last. */
  series: string[];
  /** Twelve points, one per month, a value for every series. */
  data: Array<Record<string, number | string>>;
}

export function foldMonthlySeries(
  year: number,
  rows: Array<{ monthIndex: number; name: string; amount: number }>,
  max = MAX_SERIES,
): MonthlySeries {
  const byName = new Map<string, number[]>();
  for (const row of rows) {
    if (row.monthIndex < 0 || row.monthIndex > 11) continue;
    let months = byName.get(row.name);
    if (!months) {
      months = Array.from({ length: 12 }, () => 0);
      byName.set(row.name, months);
    }
    months[row.monthIndex] += row.amount;
  }

  // A category that never moved — a till modifier, a cost type never used —
  // would be a flat band of nothing in the legend.
  const ranked = [...byName.entries()]
    .map(([name, months]) => ({ name, months, total: months.reduce((s, m) => s + m, 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Six named colours and a neutral for the rest: a seventh category gets
  // folded rather than handed the neutral under its own name, which would
  // read as "Outras" in the legend.
  const top = ranked.slice(0, max);
  const rest = ranked.slice(max);

  const round = (v: number) => Math.round(v * 100) / 100;

  const data = Array.from({ length: 12 }, (_, m) => {
    const point: Record<string, number | string> = {
      month: `${year}-${String(m + 1).padStart(2, '0')}`,
      monthIndex: m,
    };
    for (const c of top) point[c.name] = round(c.months[m]);
    if (rest.length) point[OTHER_SERIES] = round(rest.reduce((s, c) => s + c.months[m], 0));
    return point;
  });

  return {
    series: [...top.map((c) => c.name), ...(rest.length ? [OTHER_SERIES] : [])],
    data,
  };
}
