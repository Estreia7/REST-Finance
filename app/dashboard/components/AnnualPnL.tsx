'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getAnnualPnL } from '../pnl-actions';
import { formatMoney, formatPercent } from '@/lib/format';
import PnLDrilldown, { type DrillTarget } from './PnLDrilldown';
import { rate, bandLabel, type PtBenchmarkKey } from '@/lib/benchmarks';
import InfoHint from '@/app/components/InfoHint';
import { type GlossaryKey } from '@/lib/glossary';
import AnnualPnLMobile from './AnnualPnLMobile';
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
 * Twelve months across, with each figure showing its share of annual revenue.
 *
 * Percentages are what make a P&L readable: 30% food cost means something to
 * a restaurant owner in a way that a euro figure does not, and comparing
 * months only works once they are normalised against that month's takings.
 *
 * Any figure that is a sum of entries is clickable, which is how a wrong
 * month gets traced back to the day it was mistyped.
 */
export default function AnnualPnL() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<Annual | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  /**
   * Which month the phone is showing.
   *
   * Twelve columns cannot be adapted onto a 390px screen by narrowing them —
   * the name column and the pinned total already eat most of the width, and
   * what survives is a sliver of figures with no context. So the phone reads
   * the statement the way an owner actually reads it after service: one
   * month, top to bottom, every line present. The year stays on the desktop,
   * where twelve columns across is genuinely the better view.
   *
   * Defaults to the current month when the chosen year is this one, and to
   * December for a year already closed.
   */
  const [mobileMonth, setMobileMonth] = useState(
    year === currentYear ? new Date().getMonth() : 11
  );

  useEffect(() => {
    setMobileMonth(year === currentYear ? new Date().getMonth() : 11);
  }, [year, currentYear]);

  useEffect(() => {
    setLoading(true);
    getAnnualPnL(year).then((result) => {
      if ('data' in result && result.data) setData(result.data as Annual);
      setLoading(false);
    });
  }, [year]);

  const openDrill = (line: Line, monthIndex: number | null) => {
    if (!line.drill) return;
    const amount = monthIndex === null ? line.total : line.months[monthIndex];
    if (amount === 0) return;

    setDrill({
      year,
      month: monthIndex === null ? 0 : monthIndex + 1,
      kind: line.drill.kind,
      categoryId: line.drill.categoryId,
      channel: line.drill.channel,
      label: lineLabel(line),
      expected: amount,
    });
  };

  /**
   * The line's name in the interface language.
   *
   * Only the standard statement lines carry a key; a detail row is the owner's
   * own category name and stays exactly as they typed it.
   */
  const lineLabel = (line: Line) =>
    line.labelKey ? t(`annualPnl.line.${line.labelKey}`) : line.label;

  /** A figure cell. Clickable only when there is something to show. */
  const Cell = ({
    line,
    monthIndex,
    bold = false,
  }: {
    line: Line;
    monthIndex: number | null;
    bold?: boolean;
  }) => {
    const amount = monthIndex === null ? line.total : line.months[monthIndex];
    const interactive = Boolean(line.drill) && amount !== 0;
    const classes = `figure tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ${
      amount < 0 ? 'text-danger' : 'text-foreground'
    }`;

    if (!interactive) {
      return <span className={classes}>{amount === 0 ? '—' : formatMoney(amount)}</span>;
    }

    return (
      <button
        type="button"
        onClick={() => openDrill(line, monthIndex)}
        className={`${classes} hover:text-primary-ink hover:underline underline-offset-2 rounded-sm
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        title={t('annualPnl.viewEntries')}
      >
        {formatMoney(amount)}
      </button>
    );
  };

  const Row = ({
    line,
    section,
    heading = false,
    indent = false,
    benchmark,
    higherIsBetter = false,
    term,
  }: {
    line: Line;
    section: Section;
    /** The band's own total line, which carries its colour and weight. */
    heading?: boolean;
    indent?: boolean;
    /** Rates the share against its band, for the subtotals worth judging. */
    benchmark?: PtBenchmarkKey;
    higherIsBetter?: boolean;
    /**
     * Explains the line's name. Only the band totals carry one: the detail
     * rows underneath are the owner's own category names, which need no
     * glossary, and an icon on every row would bury the figures.
     */
    term?: GlossaryKey;
  }) => {
    const style = SECTION[section];

    // A ratio means little without a target: 34% food cost reads differently
    // depending on whether you were aiming at 30% or 38%.
    const health =
      benchmark && line.percentOfRevenue !== null
        ? rate(benchmark, line.percentOfRevenue / 100, { higherIsBetter })
        : 'unknown';

    return (
      <tr className={heading ? `${style.head} border-t ${style.rule}` : style.body}>
        <th
          scope="row"
          className={`sticky left-0 z-10 text-left px-4 py-2 whitespace-nowrap
                      ${heading ? `${style.head} font-semibold` : `${style.bodySolid} font-normal`}
                      ${indent ? 'pl-8 text-muted-foreground' : ''}`}
        >
          {/* A colour stripe on the band's own line, so the section is legible
              even where the tint is too faint to survive a projector. */}
          {heading && (
            <span
              className={`inline-block align-middle mr-2 w-1 h-3.5 rounded-full ${style.accent}`}
              aria-hidden="true"
            />
          )}
          {lineLabel(line)}
          {term && <InfoHint term={term} />}

          {benchmark && (
            <span
              className={`ml-2 align-middle inline-flex items-center gap-1 text-[11px] font-normal
                          ${HEALTH_TEXT[health]}`}
              title={bandLabel(benchmark, higherIsBetter)}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT[health]}`} aria-hidden="true" />
              {bandLabel(benchmark, higherIsBetter)}
            </span>
          )}
        </th>

        {MONTH_KEYS.map((_, i) => (
          <td
            key={i}
            // The last month needs clearance, or the pinned Total sits on top
            // of it and clips the figure mid-digit.
            className={`px-2.5 py-2 text-right ${i === 11 ? 'pr-6' : ''}`}
          >
            <Cell line={line} monthIndex={i} bold={heading} />
          </td>
        ))}

        {/* Total and share are pinned together at the right edge, so a figure
            in the middle of the year keeps its name on one side and its
            yearly context on the other. Both need an opaque background of
            their own, or the months scroll underneath and print through. */}
        <td
          className={`sticky right-[76px] z-10 px-4 py-2 text-right border-l shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)] ${style.rule}
                      ${heading ? style.head : style.bodySolid}`}
        >
          <Cell line={line} monthIndex={null} bold />
        </td>

        <td
          className={`sticky right-0 z-10 w-[76px] px-4 py-2 text-right figure whitespace-nowrap
                      border-l ${style.rule}
                      ${heading ? `${style.head} font-semibold` : `${style.bodySolid} text-muted-foreground`}`}
        >
          {line.percentOfRevenue === null ? '' : formatPercent(line.percentOfRevenue)}
        </td>
      </tr>
    );
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('annualPnl.loading')}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-glass p-6 text-sm text-muted-foreground">
        {t('annualPnl.loadError')}
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

  return (
    <>
      <div className="card-glass p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground">
              {t('annualPnl.title')} {year}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {/* The phone taps; only a desktop clicks. */}
              <span className="hidden md:inline">{t('annualPnl.hintDesktop')}</span>
              <span className="md:hidden">{t('annualPnl.hintMobile')}</span>
            </p>
          </div>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field !py-2 !text-sm !w-[110px] shrink-0"
            aria-label={t('annualPnl.year')}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* ── Phone: one month, read top to bottom ───────────────────────── */}
        <AnnualPnLMobile
          data={data}
          month={mobileMonth}
          onMonthChange={setMobileMonth}
          onDrill={openDrill}
        />

        {/* ── Desktop: the full year across ──────────────────────────────
            Wider than a phone, and wider than most laptops once twelve months
            and a total are across. The label and the percentage are pinned to
            either edge so a figure in the middle always has both its name and
            its share of revenue in view. */}
        <div className="hidden md:block overflow-x-auto -mx-6 px-6">
          <table className="min-w-full w-max text-sm border-collapse">
            <caption className="sr-only">
              {year} · {t('annualPnl.caption')}
            </caption>
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th scope="col" className="sticky left-0 z-10 bg-card text-left px-4 py-2 font-medium">
                  &nbsp;
                </th>
                {MONTH_KEYS.map((m) => (
                  <th key={m} scope="col" className="px-2.5 py-2 text-right font-medium">
                    {t(`annualPnl.monthAbbr.${m}`)}
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky right-[76px] z-10 bg-card px-4 py-2 text-right font-medium border-l border-border-subtle shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)]"
                >
                  {t('annualPnl.total')}
                </th>
                <th
                  scope="col"
                  className="sticky right-0 z-10 w-[76px] bg-card px-4 py-2 text-right font-medium border-l border-border-subtle"
                >
                  {t('annualPnl.pctOfRevenue')}<InfoHint term="pctOfRevenue" />
                </th>
              </tr>
            </thead>

            <tbody>
              <Row line={data.revenue} section="revenue" heading term="revenue" />
              <Row line={data.dineIn} section="revenue" indent term="dineIn" />
              <Row line={data.takeaway} section="revenue" indent term="takeaway" />

              <Row line={data.cogs} section="cogs" heading term="cogs" />
              {data.cogsLines.map((l) => (
                <Row key={l.label} line={l} section="cogs" indent />
              ))}

              <Row line={data.labour} section="labour" heading term="labour" />
              {data.labourLines.map((l) => (
                <Row key={l.label} line={l} section="labour" indent />
              ))}

              {/* USAR's headline subtotal: cost of sales plus labour, before
                  anything else. There is deliberately no gross-profit line —
                  a margin taken before labour does not predict much. */}
              <Row line={data.primeCost} section="result" heading benchmark="primeCostPct" term="primeCost" />

              <Row line={data.opex} section="opex" heading term="opex" />
              {data.opexLines.map((l) => (
                <Row key={l.label} line={l} section="opex" indent />
              ))}

              <Row
                line={data.controllableIncome}
                section="result"
                heading
                benchmark="controllableIncomePct"
                higherIsBetter
                term="controllableIncome"
              />

              {/* Below the controllable line, because the lease is not
                  something this month's decisions can change. */}
              <Row line={data.occupancy} section="occupancy" heading term="occupancy" />
              {data.occupancyLines.map((l) => (
                <Row key={l.label} line={l} section="occupancy" indent />
              ))}

              <Row
                line={data.netIncome}
                section="result"
                heading
                benchmark="netIncomePct"
                higherIsBetter
                term="netIncome"
              />
            </tbody>
          </table>
        </div>
      </div>

      <PnLDrilldown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
