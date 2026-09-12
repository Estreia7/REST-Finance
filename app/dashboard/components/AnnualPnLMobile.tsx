'use client';

import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/format';
import { rate, bandLabel, type PtBenchmarkKey } from '@/lib/benchmarks';
import InfoHint from '@/app/components/InfoHint';
import { type GlossaryKey } from '@/lib/glossary';
import {
  type Annual,
  type Line,
  type Section,
  MONTH_FULL,
  SECTION,
  HEALTH_DOT,
  HEALTH_TEXT,
} from './pnl-shared';

/**
 * The annual statement, on a phone.
 *
 * Twelve columns cannot be adapted onto a 390px screen by narrowing them. The
 * name column and the pinned total already eat most of the width, and what
 * survives is a sliver of figures with no context — you can see that a number
 * exists without being able to tell which month it belongs to or what it is a
 * share of. Shrinking the type only makes the same layout unreadable in a
 * smaller size.
 *
 * So the phone does not show the year. It shows one month, top to bottom,
 * every line present, which is how an owner reads the statement anyway: at the
 * end of service, checking the month they just finished. The year view stays
 * on the desktop, where twelve columns across is genuinely the better answer
 * and comparison across months is the point.
 *
 * Every figure keeps its share of that month's revenue beside it. Measuring a
 * September cost against annual takings would read absurdly small and tell the
 * owner nothing, so the denominator is the month, not the year.
 */

interface Props {
  data: Annual;
  month: number;
  onMonthChange: (month: number) => void;
  onDrill: (line: Line, monthIndex: number) => void;
}

export default function AnnualPnLMobile({ data, month, onMonthChange, onDrill }: Props) {
  const monthRevenue = data.revenue.months[month];

  return (
    <div className="md:hidden">
      <MonthNav month={month} onChange={onMonthChange} />

      {monthRevenue === 0 && (
        <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Sem receita registada em {MONTH_FULL[month]}. As percentagens só
          aparecem quando houver vendas no mês.
        </p>
      )}

      <div className="-mx-4 mt-4 divide-y divide-border-subtle border-y border-border-subtle">
        <Row line={data.revenue} section="revenue" heading term="revenue" {...{ month, monthRevenue, onDrill }} />
        <Row line={data.dineIn} section="revenue" indent term="dineIn" {...{ month, monthRevenue, onDrill }} />
        <Row line={data.takeaway} section="revenue" indent term="takeaway" {...{ month, monthRevenue, onDrill }} />

        <Row line={data.cogs} section="cogs" heading term="cogs" {...{ month, monthRevenue, onDrill }} />
        {data.cogsLines.map((l) => (
          <Row key={l.label} line={l} section="cogs" indent {...{ month, monthRevenue, onDrill }} />
        ))}

        <Row line={data.labour} section="labour" heading term="labour" {...{ month, monthRevenue, onDrill }} />
        {data.labourLines.map((l) => (
          <Row key={l.label} line={l} section="labour" indent {...{ month, monthRevenue, onDrill }} />
        ))}

        <Row
          line={data.primeCost}
          section="result"
          heading
          benchmark="primeCostPct"
          term="primeCost"
          {...{ month, monthRevenue, onDrill }}
        />

        <Row line={data.opex} section="opex" heading term="opex" {...{ month, monthRevenue, onDrill }} />
        {data.opexLines.map((l) => (
          <Row key={l.label} line={l} section="opex" indent {...{ month, monthRevenue, onDrill }} />
        ))}

        <Row
          line={data.controllableIncome}
          section="result"
          heading
          benchmark="controllableIncomePct"
          higherIsBetter
          term="controllableIncome"
          {...{ month, monthRevenue, onDrill }}
        />

        <Row line={data.occupancy} section="occupancy" heading term="occupancy" {...{ month, monthRevenue, onDrill }} />
        {data.occupancyLines.map((l) => (
          <Row key={l.label} line={l} section="occupancy" indent {...{ month, monthRevenue, onDrill }} />
        ))}

        <Row
          line={data.netIncome}
          section="result"
          heading
          benchmark="netIncomePct"
          higherIsBetter
          term="netIncome"
          {...{ month, monthRevenue, onDrill }}
        />
      </div>
    </div>
  );
}

/**
 * The month stepper.
 *
 * Arrows rather than a dropdown alone: stepping back one month is the
 * overwhelmingly common move, and a twelve-item select turns that into a
 * two-tap operation for something that should be one tap. The month name is
 * itself a select, so jumping from October to March stays possible.
 *
 * Both arrows are 44px, the floor for a target meant to be hit with a thumb
 * while holding a phone one-handed.
 */
function MonthNav({ month, onChange }: { month: number; onChange: (m: number) => void }) {
  const step = (delta: number) => onChange(Math.min(11, Math.max(0, month + delta)));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={month === 0}
        className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                   text-muted-foreground disabled:opacity-30 active:bg-muted transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="relative flex-1 min-w-0">
        <select
          value={month}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-11 appearance-none rounded-xl bg-muted text-center text-sm font-semibold
                     text-foreground px-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Mês"
        >
          {MONTH_FULL.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        disabled={month === 11}
        className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                   text-muted-foreground disabled:opacity-30 active:bg-muted transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Mês seguinte"
      >
        <ChevronRight className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}

interface RowProps {
  line: Line;
  section: Section;
  month: number;
  /** This month's revenue: the denominator for the share beside each figure. */
  monthRevenue: number;
  onDrill: (line: Line, monthIndex: number) => void;
  heading?: boolean;
  indent?: boolean;
  benchmark?: PtBenchmarkKey;
  higherIsBetter?: boolean;
  term?: GlossaryKey;
}

function Row({
  line,
  section,
  month,
  monthRevenue,
  onDrill,
  heading = false,
  indent = false,
  benchmark,
  higherIsBetter = false,
  term,
}: RowProps) {
  const style = SECTION[section];
  const amount = line.months[month];
  const share = monthRevenue !== 0 ? (amount / monthRevenue) * 100 : null;

  const health =
    benchmark && share !== null ? rate(benchmark, share / 100, { higherIsBetter }) : 'unknown';

  const interactive = Boolean(line.drill) && amount !== 0;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`flex items-baseline min-w-0 ${
            heading ? 'font-semibold' : indent ? 'text-muted-foreground' : ''
          }`}
        >
          {heading && (
            <span
              className={`inline-block shrink-0 self-center mr-2 w-1 h-3.5 rounded-full ${style.accent}`}
              aria-hidden="true"
            />
          )}
          {/* Wraps rather than truncates: these are the owner's own category
              names, and "Bebidas com nomes muito l…" loses the word that
              distinguishes it from the category above. The figure keeps its
              own column either way. */}
          <span className="[overflow-wrap:anywhere]">{line.label}</span>
          {term && <InfoHint term={term} />}
        </span>

        <span className="flex items-baseline gap-2 shrink-0">
          <span
            className={`figure tabular-nums ${heading ? 'font-semibold' : ''} ${
              amount < 0 ? 'text-danger' : 'text-foreground'
            }`}
          >
            {amount === 0 ? '—' : formatMoney(amount)}
          </span>
          {/* Fixed width, so the percentages form a column the eye can run
              down instead of drifting with the length of each figure.

              The sign is dropped: the figure beside it is already red and
              already signed, and "-9 646 € -32,0%" says negative twice. The
              share answers "how big a bite of this month's takings", which
              is a magnitude. */}
          <span className="w-[46px] text-right text-xs text-muted-foreground tabular-nums">
            {share === null ? '' : formatPercent(Math.abs(share))}
          </span>
        </span>
      </div>

      {benchmark && (
        <div className={`mt-1 flex items-center gap-1 text-[11px] ${HEALTH_TEXT[health]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT[health]}`} aria-hidden="true" />
          {bandLabel(benchmark, higherIsBetter)}
        </div>
      )}
    </>
  );

  const padding = `px-4 ${indent ? 'pl-8' : ''} py-2.5`;

  // A row that does nothing must not look like a row that does: only the rows
  // with entries behind them take the button treatment and the touch target.
  if (!interactive) {
    return <div className={`${heading ? style.head : style.body} ${padding} text-sm`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onDrill(line, month)}
      className={`w-full text-left text-sm min-h-[44px] ${heading ? style.head : style.body} ${padding}
                  active:bg-muted transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {body}
    </button>
  );
}
