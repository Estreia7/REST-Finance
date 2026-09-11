'use client';

import { useEffect, useRef, useState } from 'react';
import { calculateKpis, toPercent, rateAgainstBenchmark } from '@/lib/kpi';

/**
 * The hero visual.
 *
 * Rather than mocking up a screenshot, this runs the app's real KPI engine
 * (lib/kpi.ts) over a sample month and renders the result. Every figure and
 * every health rating shown here is computed by the same code the product
 * uses, so the marketing cannot drift away from the behaviour.
 *
 * The sample month is clearly labelled as an example.
 */

// A plausible month for a mid-size Portuguese restaurant. Deliberately NOT a
// flawless one: food cost sits slightly high, which is the situation the
// product exists to surface. A sample where everything is green would both
// overstate typical results and fail to show what the tool actually does.
const SAMPLE = {
  revenueTotal: 48_400,
  cogsTotal: 16_400, // 33.9%, just above the healthy band
  labourTotal: 14_100,
  opexTotal: 11_900,
  dineInRevenue: 34_600,
  takeawayRevenue: 13_800,
  dineInTickets: 1_312,
  takeawayTickets: 704,
};

// Solid fills: these are 8px dots, so a 10% tint would be invisible.
const STATUS_STYLES = {
  good: 'bg-success',
  warning: 'bg-warning',
  bad: 'bg-danger',
} as const;

const STATUS_LABELS = {
  good: 'Dentro do intervalo saudável',
  warning: 'Ligeiramente acima',
  bad: 'Fora do intervalo',
} as const;

function useCountUp(target: number, decimals = 0) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const duration = 900;
        const start = performance.now();
        let frame = 0;

        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          // easeOutCubic: quick to settle, no bounce.
          setValue(target * (1 - Math.pow(1 - t, 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return { ref, display: value.toFixed(decimals) };
}

function Figure({ value, decimals = 0, prefix = '', suffix = '' }: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const { ref, display } = useCountUp(value, decimals);
  return (
    <span ref={ref} className="figure">
      {prefix}
      {Number(display)
        .toLocaleString('pt-PT', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
        // pt-PT separates thousands with U+202F, which the mono face renders
        // as a full-width gap ("48 400"). A thin space keeps the grouping
        // readable without splitting the number visually.
        .replace(/ | /g, ' ')}
      {suffix}
    </span>
  );
}

export default function MetricPanel({ labels }: {
  labels: {
    primeCost: string;
    foodCost: string;
    margin: string;
    revenue: string;
    example: string;
    healthy: string;
  };
}) {
  const k = calculateKpis(SAMPLE);

  const rows = [
    {
      label: labels.primeCost,
      value: toPercent(k.primeCostPct),
      status: rateAgainstBenchmark('primeCostPct', k.primeCostPct),
      healthy: '55-62%',
    },
    {
      label: labels.foodCost,
      value: toPercent(k.foodCostPct),
      status: rateAgainstBenchmark('foodCostPct', k.foodCostPct),
      healthy: '28-32%',
    },
    {
      label: labels.margin,
      value: toPercent(k.netIncomePct),
      status: rateAgainstBenchmark('netIncomePct', k.netIncomePct, { higherIsBetter: true }),
      healthy: '10-15%',
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 border-b border-border-subtle">
        <div>
          <div className="text-xs text-muted-foreground">{labels.revenue}</div>
          <div className="text-2xl font-semibold text-foreground mt-0.5">
            <Figure value={SAMPLE.revenueTotal} prefix="€" />
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{labels.example}</span>
      </div>

      <dl className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-foreground truncate">{row.label}</dt>
              <dd className="text-[11px] text-muted-foreground mt-0.5">
                {labels.healthy} {row.healthy}
              </dd>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-lg font-semibold text-foreground">
                <Figure value={row.value} decimals={1} suffix="%" />
              </span>
              <span
                className={`w-2 h-2 rounded-full ${STATUS_STYLES[row.status]}`}
                role="img"
                aria-label={STATUS_LABELS[row.status]}
              />
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
