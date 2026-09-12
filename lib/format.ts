/**
 * Money and percentage formatting.
 *
 * Centralised because the ad-hoc version was wrong in a way that is easy to
 * miss: `toLocaleString('pt-PT', { minimumFractionDigits: 0 })` sets a floor
 * but no ceiling, so 53952.4866 rendered as "53 952,487". With a comma as the
 * decimal separator that reads as fifty-three million, which is exactly how
 * it was reported.
 *
 * Always set a maximum as well as a minimum.
 */

const LOCALE = 'pt-PT';

/** Euros. Whole numbers by default, since cents add noise to a KPI. */
export function formatMoney(
  value: number,
  { decimals = 0 }: { decimals?: number } = {}
): string {
  if (!Number.isFinite(value)) return '€0';
  return `€${value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Euros with cents, for statements and tables where the exact figure matters. */
export function formatMoneyExact(value: number): string {
  return formatMoney(value, { decimals: 2 });
}

/** Compact axis labels: 1 250 -> "€1,3k". */
export function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value)) return '€0';
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `€${(value / 1_000_000).toLocaleString(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`;
  }
  if (abs >= 1_000) {
    return `€${(value / 1_000).toLocaleString(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}k`;
  }
  return formatMoney(value);
}

/** A ratio already expressed as a percentage number (63.6 -> "63,6%"). */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}
