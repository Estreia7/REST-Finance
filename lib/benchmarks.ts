/**
 * Benchmark bands, and where each number comes from.
 *
 * Every band carries its source, because a benchmark without provenance is
 * just an opinion — and because the honest answer to "is 34% labour good?"
 * depends entirely on which country's data you are comparing against.
 *
 * The Portuguese adjustment is the point of this file. US restaurant
 * benchmarks are the ones everybody quotes, and for labour they are actively
 * misleading here:
 *
 *   - The US full-service median of 36.5% is inflated by tipped-wage
 *     structures, employer health insurance and high turnover, none of which
 *     apply in Portugal.
 *   - Portuguese employers pay a flat 23.75% Social Security (TSU) plus
 *     mandatory 13th and 14th months (subsídio de férias and de Natal),
 *     roughly +16.7% on base pay. That lands in different places but totals
 *     differently from the US structure.
 *   - AHRESP reports urban rents above 20% of turnover for many Portuguese
 *     independents — double the US "occupancy under 10%" rule. Telling a
 *     Lisbon owner they are failing on occupancy, when the lease is signed and
 *     non-controllable, is advice they cannot act on.
 *
 * So labour and occupancy use Portuguese ranges; food cost travels well and
 * uses the international one.
 */

export type BenchmarkBand = {
  /** Ratios, not display percentages. */
  good: { min: number; max: number };
  /** Beyond this is trouble rather than merely off-target. */
  concern: number;
  label: string;
  /** Shown in the UI, so the owner can judge the number for themselves. */
  source: string;
  /** Only set where the Portuguese range differs from the usual US one. */
  note?: string;
};

export const PT_BENCHMARKS = {
  foodCostPct: {
    good: { min: 0.25, max: 0.32 },
    concern: 0.38,
    label: 'Custo das mercadorias',
    source: 'NRA Restaurant Operations Report 2025 (mediana 32,0%); guias PT 25–35%',
  },

  labourPct: {
    good: { min: 0.3, max: 0.38 },
    concern: 0.43,
    label: 'Pessoal',
    source: 'Guias de gestão PT (30–40% da faturação)',
    note:
      'A referência americana (36,5%) não se aplica: inclui gorjetas como salário e seguros de saúde. ' +
      'Em Portugal conta a TSU de 23,75% e os subsídios de férias e Natal.',
  },

  primeCostPct: {
    good: { min: 0.55, max: 0.65 },
    concern: 0.7,
    label: 'Prime cost',
    source: 'USAR / NRA — serviço completo 60–65%',
    note: 'O número que melhor prevê se um restaurante sobrevive. Acima de 70% raramente dá lucro.',
  },

  occupancyPct: {
    good: { min: 0, max: 0.12 },
    concern: 0.2,
    label: 'Renda e ocupação',
    source: 'AHRESP — rendas urbanas acima de 20% em muitos independentes',
    note:
      'A regra americana dos 10% é irrealista em zonas urbanas portuguesas. ' +
      'É um custo não-controlável: só muda quando o contrato muda.',
  },

  controllableIncomePct: {
    good: { min: 0.15, max: 1 },
    concern: 0.08,
    label: 'Resultado controlável',
    source: 'USAR — o que sobra antes da renda e amortizações',
  },

  netIncomePct: {
    good: { min: 0.05, max: 1 },
    concern: 0.02,
    label: 'Resultado líquido',
    source: 'NRA 3–5% serviço completo; Banco de Portugal — EBITDA 13,4% (2024, todos os setores)',
  },
} as const;

export type PtBenchmarkKey = keyof typeof PT_BENCHMARKS;

export type Health = 'good' | 'watch' | 'bad' | 'unknown';

/**
 * Where a value sits against its band.
 *
 * `higherIsBetter` separates the two kinds of metric: for a cost, being under
 * the band is good and over it is bad; for a margin, the reverse. Getting this
 * backwards would colour a struggling restaurant green, so the direction is
 * explicit at every call site rather than inferred from the key.
 */
export function rate(
  key: PtBenchmarkKey,
  value: number | null,
  { higherIsBetter = false }: { higherIsBetter?: boolean } = {}
): Health {
  if (value === null || !Number.isFinite(value)) return 'unknown';

  const band = PT_BENCHMARKS[key];

  if (higherIsBetter) {
    if (value >= band.good.min) return 'good';
    if (value >= band.concern) return 'watch';
    return 'bad';
  }

  if (value <= band.good.max) return 'good';
  if (value < band.concern) return 'watch';
  return 'bad';
}

/** The band as a readable range, for the tooltip beside a figure. */
export function bandLabel(key: PtBenchmarkKey, higherIsBetter = false): string {
  const { good } = PT_BENCHMARKS[key];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  if (higherIsBetter) return `alvo ≥ ${pct(good.min)}`;
  if (good.min === 0) return `alvo ≤ ${pct(good.max)}`;
  // Only the upper bound carries the sign: "55%–65%" says it twice.
  return `alvo ${Math.round(good.min * 100)}–${pct(good.max)}`;
}
