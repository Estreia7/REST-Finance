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

/** Euros, always to the cent: the owner wants the exact figure on every screen. */
export function formatMoney(
  value: number,
  { decimals = 2 }: { decimals?: number } = {}
): string {
  if (!Number.isFinite(value)) return formatMoney(0, { decimals });
  return `€${value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * How many decimals a set of unit prices needs to be told apart and read true.
 *
 * Two is enough for most, but a bin bag at 0,0976 and then 0,1037 would both read
 * €0,10: a real rise that looks like no change. Prices under a euro keep what they
 * have, so quantity times price still reaches the line. Stored to four decimals.
 */
export function priceDecimals(prices: number[]): number {
  const known = prices.filter(Number.isFinite);
  const apart = new Set(known.map((p) => p.toFixed(4))).size;
  for (const decimals of [2, 3]) {
    const told = new Set(known.map((p) => p.toFixed(decimals))).size === apart;
    const whole = known.every((p) => Math.abs(p) >= 1 || Number(p.toFixed(decimals)) === Number(p.toFixed(4)));
    if (told && whole) return decimals;
  }
  return 4;
}

/** The decimals for a price axis: its ticks sit closer together than the prices do. */
export function axisDecimals(prices: number[]): number {
  const known = prices.filter(Number.isFinite);
  const spread = known.length > 0 ? Math.max(...known) - Math.min(...known) : 0;
  const ticks = spread > 0 ? Math.ceil(-Math.log10(spread / 4)) : 2;
  return Math.min(4, Math.max(priceDecimals(known), ticks));
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
  return formatMoney(value, { decimals: 0 });
}

/** A ratio already expressed as a percentage number (63.6 -> "63,6%"). */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}
