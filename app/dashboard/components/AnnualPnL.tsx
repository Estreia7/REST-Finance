'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getAnnualPnL } from '../pnl-actions';
import { formatMoney, formatPercent } from '@/lib/format';
import PnLDrilldown, { type DrillTarget } from './PnLDrilldown';
import { rate, bandLabel, type PtBenchmarkKey } from '@/lib/benchmarks';

type Line = {
  label: string;
  months: number[];
  total: number;
  percentOfRevenue: number | null;
  drill: {
    kind: 'revenue' | 'cogs' | 'opex';
    categoryId?: string;
    channel?: 'total' | 'dineIn' | 'takeaway';
  } | null;
};

type Annual = {
  year: number;
  revenue: Line;
  dineIn: Line;
  takeaway: Line;
  cogs: Line;
  cogsLines: Line[];
  labour: Line;
  labourLines: Line[];
  primeCost: Line;
  opex: Line;
  opexLines: Line[];
  controllableIncome: Line;
  occupancy: Line;
  occupancyLines: Line[];
  netIncome: Line;
};

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * How each band of the statement is painted.
 *
 * Colour here means "which part of the statement is this", never "is this good
 * or bad" — a red row would collide with the compliance indicators, and on a
 * P&L a large cost figure is not itself a problem. The tints are deliberately
 * pale: the figures are the content, and a band that competes with them has
 * gone too far.
 */
type Section = 'revenue' | 'cogs' | 'labour' | 'opex' | 'occupancy' | 'result';

const SECTION: Record<
  Section,
  { head: string; body: string; bodySolid: string; accent: string; rule: string }
> = {
  revenue: {
    head: 'bg-pnl-revenue-bg text-pnl-revenue',
    body: 'bg-pnl-revenue-bg/40',
    // Pinned columns need an opaque fill: a translucent tint lets the months
    // scroll underneath and print through the figures.
    bodySolid: 'bg-[hsl(var(--pnl-revenue-bg))]',
    accent: 'bg-pnl-revenue',
    rule: 'border-pnl-revenue/25',
  },
  cogs: {
    head: 'bg-pnl-cogs-bg text-pnl-cogs',
    body: 'bg-pnl-cogs-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-cogs-bg))]',
    accent: 'bg-pnl-cogs',
    rule: 'border-pnl-cogs/25',
  },
  labour: {
    head: 'bg-pnl-labour-bg text-pnl-labour',
    body: 'bg-pnl-labour-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-labour-bg))]',
    accent: 'bg-pnl-labour',
    rule: 'border-pnl-labour/25',
  },
  opex: {
    head: 'bg-pnl-opex-bg text-pnl-opex',
    body: 'bg-pnl-opex-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-opex-bg))]',
    accent: 'bg-pnl-opex',
    rule: 'border-pnl-opex/25',
  },
  occupancy: {
    head: 'bg-pnl-occupancy-bg text-pnl-occupancy',
    body: 'bg-pnl-occupancy-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-occupancy-bg))]',
    accent: 'bg-pnl-occupancy',
    rule: 'border-pnl-occupancy/25',
  },
  result: {
    head: 'bg-pnl-result-bg text-foreground',
    body: 'bg-pnl-result-bg/50',
    bodySolid: 'bg-[hsl(var(--pnl-result-bg))]',
    accent: 'bg-accent',
    rule: 'border-border',
  },
};

/** Reuses the lamp tokens, so a red here means what a red means elsewhere. */
const HEALTH_DOT: Record<string, string> = {
  good: 'bg-lamp-success',
  watch: 'bg-lamp-warning',
  bad: 'bg-lamp-danger',
  unknown: 'bg-muted-foreground/30',
};

const HEALTH_TEXT: Record<string, string> = {
  good: 'text-success',
  watch: 'text-warning',
  bad: 'text-danger',
  unknown: 'text-muted-foreground',
};

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
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<Annual | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

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
      label: line.label,
      expected: amount,
    });
  };

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
        title="Ver lançamentos"
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
  }: {
    line: Line;
    section: Section;
    /** The band's own total line, which carries its colour and weight. */
    heading?: boolean;
    indent?: boolean;
    /** Rates the share against its band, for the subtotals worth judging. */
    benchmark?: PtBenchmarkKey;
    higherIsBetter?: boolean;
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
          {line.label}

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

        {MONTH_ABBR.map((_, i) => (
          <td key={i} className="px-2.5 py-2 text-right">
            <Cell line={line} monthIndex={i} bold={heading} />
          </td>
        ))}

        {/* Total and share are pinned together at the right edge, so a figure
            in the middle of the year keeps its name on one side and its
            yearly context on the other. Both need an opaque background of
            their own, or the months scroll underneath and print through. */}
        <td
          className={`sticky right-[76px] z-10 px-4 py-2 text-right border-l ${style.rule}
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
        A carregar demonstração anual...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-glass p-6 text-sm text-muted-foreground">
        Não foi possível carregar a demonstração anual.
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

  return (
    <>
      <div className="card-glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground">
              Demonstração de resultados {year}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Clica num valor para ver os lançamentos que o compõem.
            </p>
          </div>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field !py-2 !text-sm !w-[110px] shrink-0"
            aria-label="Ano"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Wider than a phone, and wider than most laptops once twelve months
            and a total are across. The label and the percentage are pinned to
            either edge so a figure in the middle always has both its name and
            its share of revenue in view. */}
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="min-w-full w-max text-sm border-collapse">
            <caption className="sr-only">
              Demonstração de resultados de {year}, por mês, com percentagem da receita
            </caption>
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th scope="col" className="sticky left-0 z-10 bg-card text-left px-4 py-2 font-medium">
                  &nbsp;
                </th>
                {MONTH_ABBR.map((m) => (
                  <th key={m} scope="col" className="px-2.5 py-2 text-right font-medium">{m}</th>
                ))}
                <th
                  scope="col"
                  className="sticky right-[76px] z-10 bg-card px-4 py-2 text-right font-medium border-l border-border-subtle"
                >
                  Total
                </th>
                <th
                  scope="col"
                  className="sticky right-0 z-10 w-[76px] bg-card px-4 py-2 text-right font-medium border-l border-border-subtle"
                >
                  % rec.
                </th>
              </tr>
            </thead>

            <tbody>
              <Row line={data.revenue} section="revenue" heading />
              <Row line={data.dineIn} section="revenue" indent />
              <Row line={data.takeaway} section="revenue" indent />

              <Row line={data.cogs} section="cogs" heading />
              {data.cogsLines.map((l) => (
                <Row key={l.label} line={l} section="cogs" indent />
              ))}

              <Row line={data.labour} section="labour" heading />
              {data.labourLines.map((l) => (
                <Row key={l.label} line={l} section="labour" indent />
              ))}

              {/* USAR's headline subtotal: cost of sales plus labour, before
                  anything else. There is deliberately no gross-profit line —
                  a margin taken before labour does not predict much. */}
              <Row line={data.primeCost} section="result" heading benchmark="primeCostPct" />

              <Row line={data.opex} section="opex" heading />
              {data.opexLines.map((l) => (
                <Row key={l.label} line={l} section="opex" indent />
              ))}

              <Row
                line={data.controllableIncome}
                section="result"
                heading
                benchmark="controllableIncomePct"
                higherIsBetter
              />

              {/* Below the controllable line, because the lease is not
                  something this month's decisions can change. */}
              <Row line={data.occupancy} section="occupancy" heading />
              {data.occupancyLines.map((l) => (
                <Row key={l.label} line={l} section="occupancy" indent />
              ))}

              <Row
                line={data.netIncome}
                section="result"
                heading
                benchmark="netIncomePct"
                higherIsBetter
              />
            </tbody>
          </table>
        </div>
      </div>

      <PnLDrilldown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
