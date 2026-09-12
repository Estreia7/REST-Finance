import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatMoneyExact,
  formatMoneyCompact,
  formatPercent,
} from '@/lib/format';

/** pt-PT groups thousands with a narrow no-break space (U+202F). */
const strip = (s: string) => s.replace(/[\u202F\u00A0\s]/g, '');

describe('formatMoney', () => {
  it('never leaves stray decimals that read as thousands', () => {
    // The reported bug: 53952.4866 rendered as "53 952,487", which with a
    // comma decimal separator looks like fifty-three million.
    expect(strip(formatMoney(53952.4866))).toBe('€53952');
  });

  it('rounds rather than truncates', () => {
    expect(strip(formatMoney(1999.6))).toBe('€2000');
  });

  it('handles zero and negatives', () => {
    expect(strip(formatMoney(0))).toBe('€0');
    expect(strip(formatMoney(-1234.56))).toBe('€-1235');
  });

  it('returns a safe value for NaN and Infinity', () => {
    // A division by zero upstream must not render "€NaN" to a client.
    expect(formatMoney(NaN)).toBe('€0');
    expect(formatMoney(Infinity)).toBe('€0');
  });
});

describe('formatMoneyExact', () => {
  it('always shows exactly two decimals', () => {
    expect(strip(formatMoneyExact(1234.5))).toBe('€1234,50');
    expect(strip(formatMoneyExact(1234))).toBe('€1234,00');
    expect(strip(formatMoneyExact(1234.567))).toBe('€1234,57');
  });
});

describe('formatMoneyCompact', () => {
  it('shortens thousands and millions', () => {
    expect(strip(formatMoneyCompact(1250))).toBe('€1,3k');
    expect(strip(formatMoneyCompact(53952))).toBe('€54k');
    expect(strip(formatMoneyCompact(2_400_000))).toBe('€2,4M');
  });

  it('leaves small values alone', () => {
    expect(strip(formatMoneyCompact(950))).toBe('€950');
  });

  it('keeps the sign on negatives', () => {
    expect(strip(formatMoneyCompact(-1500))).toBe('€-1,5k');
  });
});

describe('formatPercent', () => {
  it('shows one decimal by default', () => {
    expect(strip(formatPercent(63.5555))).toBe('63,6%');
    expect(strip(formatPercent(30))).toBe('30,0%');
  });

  it('returns a safe value for NaN', () => {
    expect(formatPercent(NaN)).toBe('0%');
  });
});
