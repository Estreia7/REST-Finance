'use client';

import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/format';
import { rate, bandLabel, type PtBenchmarkKey } from '@/lib/benchmarks';
import InfoHint from '@/app/components/InfoHint';
import { type GlossaryKey } from '@/lib/glossary';
import { useLanguage } from '@/lib/language-context';
import {
  type Annual,
  type Line,
  type Section,
  MONTH_KEYS,
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
 * So the phone shows one period at a time, top to bottom, every line present.
 * The twelve-across grid stays on the desktop, where comparing months side by
 * side is genuinely the better answer.
 *
 * The period opens on the **year**, because that is what the owner asked for
 * by tapping "Anual". An earlier version opened on a month, which meant
 * tapping Anual and being shown October — the heading said one thing and the
 * figures another, and the year's totals were not reachable on a phone at
 * all. The month is still one tap away in the same control, since "how was
 * September" is the other question this screen answers.
 *
 * Every figure keeps its share of that period's revenue beside it. Measuring
 * a September cost against annual takings would read absurdly small, so the
 * denominator follows the period on show.
 */

/** The period in view: a month index, or the whole year. */
export const YEAR_VIEW = -1;

interface Props {
  data: Annual;
  /** A month index 0-11, or YEAR_VIEW for the twelve months added up. */
  month: number;
  onMonthChange: (month: number) => void;
  onDrill: (line: Line, monthIndex: number) => void;
}

export default function AnnualPnLMobile({ data, month, onMonthChange, onDrill }: Props) {
  const { t } = useLanguage();
  const isYear = month === YEAR_VIEW;
  const periodRevenue = isYear ? data.revenue.total : data.revenue.months[month];

  return (
    <div className="md:hidden">
      <PeriodNav month={month} onChange={onMonthChange} />

      {periodRevenue === 0 && (
        <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {isYear
            ? `${t('annualPnl.noRevenueIn')} ${data.year}.`
            : `${t('annualPnl.noRevenueIn')} ${t(`annualPnl.monthFull.${MONTH_KEYS[month]}`)}.`}{' '}
          {t('annualPnl.noRevenueHint')}
        </p>
      )}

      <div className="-mx-4 mt-4 divide-y divide-border-subtle border-y border-border-subtle">
        <Row line={data.revenue} section="revenue" heading term="revenue" {...{ month, periodRevenue, onDrill }} />
        <Row line={data.dineIn} section="revenue" indent term="dineIn" {...{ month, periodRevenue, onDrill }} />
        {/* What was sold, where the till has told us. Listed rather than
            collapsed: the phone shows one month at a time, so there is room,
            and a chevron to open four lines is a tap for nothing. */}
        {data.revenueLines.map((l) => (
          <Row key={l.label} line={l} section="revenue" indent {...{ month, periodRevenue, onDrill }} />
        ))}
        <Row line={data.takeaway} section="revenue" indent term="takeaway" {...{ month, periodRevenue, onDrill }} />

        <Row line={data.cogs} section="cogs" heading term="cogs" {...{ month, periodRevenue, onDrill }} />
        {data.cogsLines.map((l) => (
          <Row key={l.label} line={l} section="cogs" indent {...{ month, periodRevenue, onDrill }} />
        ))}

        <Row line={data.labour} section="labour" heading term="labour" {...{ month, periodRevenue, onDrill }} />
        {data.labourLines.map((l) => (
          <Row key={l.label} line={l} section="labour" indent {...{ month, periodRevenue, onDrill }} />
        ))}

        <Row
          line={data.primeCost}
          section="result"
          heading
          benchmark="primeCostPct"
          term="primeCost"
          {...{ month, periodRevenue, onDrill }}
        />

        <Row line={data.opex} section="opex" heading term="opex" {...{ month, periodRevenue, onDrill }} />
        {data.opexLines.map((l) => (
          <Row key={l.label} line={l} section="opex" indent {...{ month, periodRevenue, onDrill }} />
        ))}

        <Row
          line={data.controllableIncome}
          section="result"
          heading
          benchmark="controllableIncomePct"
          higherIsBetter
          term="controllableIncome"
          {...{ month, periodRevenue, onDrill }}
        />

        <Row line={data.occupancy} section="occupancy" heading term="occupancy" {...{ month, periodRevenue, onDrill }} />
        {data.occupancyLines.map((l) => (
          <Row key={l.label} line={l} section="occupancy" indent {...{ month, periodRevenue, onDrill }} />
        ))}

        <Row
          line={data.netIncome}
          section="result"
          heading
          benchmark="netIncomePct"
          higherIsBetter
          term="netIncome"
          {...{ month, periodRevenue, onDrill }}
        />
      </div>
    </div>
  );
}

/**
 * The period stepper: the whole year, or one month of it.
 *
 * The year sits before January rather than in a separate control, so stepping
 * left from January lands on it — the owner reads a month, wonders how the
 * year is going, and the answer is one tap in the direction they were already
 * going.
 *
 * Arrows rather than a dropdown alone: stepping back one month is the
 * overwhelmingly common move, and a thirteen-item select turns that into a
 * two-tap operation for something that should be one tap. The name is itself
 * a select, so jumping from October to March stays possible.
 *
 * Both arrows are 44px, the floor for a target meant to be hit with a thumb
 * while holding a phone one-handed.
 */
function PeriodNav({ month, onChange }: { month: number; onChange: (m: number) => void }) {
  const { t } = useLanguage();
  // YEAR_VIEW is -1, so it already steps correctly at the bottom of the range.
  const step = (delta: number) => onChange(Math.min(11, Math.max(YEAR_VIEW, month + delta)));

  const arrow =
    'w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center ' +
    'text-muted-foreground disabled:opacity-30 active:bg-muted transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={month === YEAR_VIEW}
        className={arrow}
        aria-label={t('annualPnl.previousMonth')}
      >
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="relative flex-1 min-w-0">
        <select
          value={month}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-11 appearance-none rounded-xl bg-muted text-center text-sm font-semibold
                     text-foreground px-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('annualPnl.period')}
        >
          <option value={YEAR_VIEW}>{t('annualPnl.wholeYear')}</option>
          {MONTH_KEYS.map((m, i) => (
            <option key={m} value={i}>{t(`annualPnl.monthFull.${m}`)}</option>
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
        className={arrow}
        aria-label={t('annualPnl.nextMonth')}
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
  periodRevenue: number;
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
  periodRevenue,
  onDrill,
  heading = false,
  indent = false,
  benchmark,
  higherIsBetter = false,
  term,
}: RowProps) {
  const { t } = useLanguage();
  const style = SECTION[section];
  // The year's figure is the one the server already totalled, not a sum of
  // the twelve done here: rounding each month and adding them drifts from
  // the statement the desktop shows for the same year.
  const amount = month === YEAR_VIEW ? line.total : line.months[month];
  const share = periodRevenue !== 0 ? (amount / periodRevenue) * 100 : null;

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
          <span className="[overflow-wrap:anywhere]">
            {line.labelKey ? t(`annualPnl.line.${line.labelKey}`) : line.label}
          </span>
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
