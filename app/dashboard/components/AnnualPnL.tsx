'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getAnnualPnL } from '../pnl-actions';
import { formatMoney, formatPercent } from '@/lib/format';
import PnLDrilldown, { type DrillTarget } from './PnLDrilldown';

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
  grossProfit: Line;
  opex: Line;
  opexLines: Line[];
  labour: Line;
  netIncome: Line;
};

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
    indent = false,
    bold = false,
    emphasis = false,
  }: {
    line: Line;
    indent?: boolean;
    bold?: boolean;
    emphasis?: boolean;
  }) => (
    <tr className={emphasis ? 'border-t border-border' : ''}>
      <th
        scope="row"
        className={`sticky left-0 z-10 bg-card text-left px-4 py-2 font-normal whitespace-nowrap
                    ${indent ? 'pl-8 text-muted-foreground' : 'text-foreground'}
                    ${bold ? 'font-semibold' : ''}`}
      >
        {line.label}
      </th>

      {MONTH_ABBR.map((_, i) => (
        <td key={i} className="px-2.5 py-2 text-right">
          <Cell line={line} monthIndex={i} bold={bold} />
        </td>
      ))}

      <td className="px-4 py-2 text-right border-l border-border-subtle">
        <Cell line={line} monthIndex={null} bold />
      </td>

      <td className="px-4 py-2 text-right text-muted-foreground figure whitespace-nowrap">
        {line.percentOfRevenue === null ? '' : formatPercent(line.percentOfRevenue)}
      </td>
    </tr>
  );

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

        {/* The table is wider than a phone; it scrolls rather than the page. */}
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
                <th scope="col" className="px-4 py-2 text-right font-medium border-l border-border-subtle">
                  Total
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">% rec.</th>
              </tr>
            </thead>

            <tbody>
              <Row line={data.revenue} bold />
              <Row line={data.dineIn} indent />
              <Row line={data.takeaway} indent />

              <Row line={data.cogs} bold emphasis />
              {data.cogsLines.map((l) => (
                <Row key={l.label} line={l} indent />
              ))}

              <Row line={data.grossProfit} bold emphasis />

              <Row line={data.opex} bold emphasis />
              {data.opexLines.map((l) => (
                <Row key={l.label} line={l} indent />
              ))}

              <Row line={data.netIncome} bold emphasis />
            </tbody>
          </table>
        </div>
      </div>

      <PnLDrilldown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
