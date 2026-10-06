'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { getPnLStatement } from '../actions';
import AnnualPnL from './AnnualPnL';
import { formatMoneyExact, formatPercent } from '@/lib/format';
import InfoHint from '@/app/components/InfoHint';
import Tooltip from '@/app/components/Tooltip';
import { glossaryText, type GlossaryKey } from '@/lib/glossary';
import { useLanguage } from '@/lib/language-context';

interface PnLData {
  month: number; year: number;
  revenue: number; dineIn: number; takeaway: number;
  cogs: number; opex: number;
  grossProfit: number; grossMargin: number;
  netIncome: number; netMargin: number;
  cogsBreakdown: Array<{ category: string; amount: number }>;
  opexBreakdown: Array<{ category: string; amount: number }>;
}

/**
 * One detail line of the statement: a name, an amount, and what share it is.
 *
 * Two percentages, because the owner asks two different questions of the same
 * figure and neither answers the other:
 *
 *   - **of revenue** is the one with a benchmark behind it. "Rent is 9.9% of
 *     sales" can be held against what a Portuguese restaurant should pay;
 *     "rent is 19.6% of overheads" cannot, because a restaurant with small
 *     overheads would show a frightening number for a cheap rent.
 *   - **of the section** is where the money inside that section actually
 *     goes, which is the question when deciding what to cut.
 *
 * They are deliberately not given equal weight. Three figures of the same
 * size on a phone row is a wall nobody reads, so the share of revenue sits
 * beside the amount in the same ink as the rest of the line, and the share of
 * the section follows it smaller and lighter — present when looked for, quiet
 * when not.
 */
function DetailRow({
  label,
  amount,
  revenue,
  sectionTotal,
  sectionLabel,
  revenueLabel,
  term,
}: {
  label: string;
  amount: number;
  revenue: number;
  /** The section this line belongs to: COGS, OPEX, or revenue itself. */
  sectionTotal: number;
  /** Named in the title so "19.6%" says what it is a share of. */
  sectionLabel: string;
  /** Names the other denominator, for the same reason. */
  revenueLabel: string;
  /** Glossary entry, on the standard lines that have one. */
  term?: GlossaryKey;
}) {
  const ofRevenue = revenue > 0 ? (amount / revenue) * 100 : null;
  const ofSection = sectionTotal > 0 ? (amount / sectionTotal) * 100 : null;

  return (
    <div className="flex items-baseline justify-between gap-3 py-2 pl-4">
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {label}
        {term && <InfoHint term={term} />}
      </span>
      <span className="flex items-baseline gap-2 shrink-0">
        <span className="text-sm text-muted-foreground tabular-nums">{formatMoneyExact(amount)}</span>
        {/* Fixed widths, so the percentages form columns the eye runs down
            rather than drifting with the length of each amount. */}
        <span
          className="w-12 text-right text-sm text-muted-foreground tabular-nums"
          title={ofRevenue === null ? undefined : `${formatPercent(ofRevenue)} ${revenueLabel}`}
        >
          {ofRevenue === null ? '' : formatPercent(ofRevenue)}
        </span>
        <span
          className="w-12 text-right text-xs text-muted-foreground/60 tabular-nums"
          title={ofSection === null ? undefined : `${formatPercent(ofSection)} ${sectionLabel}`}
        >
          {ofSection === null ? '' : formatPercent(ofSection)}
        </span>
      </span>
    </div>
  );
}

export default function PnLPanel() {
  const { language, t } = useLanguage();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'year'>('month');

  useEffect(() => {
    setLoading(true);
    getPnLStatement(month, year).then(r => {
      if (r.success && r.data) setData(r.data as PnLData);
      setLoading(false);
    });
  }, [month, year]);

  // Shared formatter: the local one set a minimum with no maximum, the same
  // defect that made a figure elsewhere read as millions.
  const fmt = formatMoneyExact;

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  return (
    <div className="space-y-4">
      {/* Monthly statement, or the twelve-month view with percentages. */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
        {([['month', 'Mensal'], ['year', 'Anual']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={view === value}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'year' ? (
        <AnnualPnL />
      ) : (
      <>
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field !py-2 !text-sm w-[160px]">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field !py-2 !text-sm w-[100px]">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground text-sm">{t('pnl.noData')}</div>
      ) : (
        <>
          {/* P&L Statement */}
          <div className="card-glass p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">
              Demonstração de Resultados
              <InfoHint term="pnlStatement" />
              {' '}— {months[month - 1]} {year}
            </h3>

            {/* Two columns of percentages need saying which is which, or the
                second reads as a stray number. Right-aligned over the columns
                they label, and in the same widths. */}
            <div className="flex items-baseline justify-end gap-2 pb-2 mb-1 border-b border-border-subtle">
              <span className="w-12 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                {t('pnl.ofRevenueShort')}
              </span>
              <span className="w-12 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">
                {t('pnl.ofSectionShort')}
              </span>
            </div>

            <div className="space-y-1">
              {/* Revenue */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-bold text-foreground">Receita Total<InfoHint term="revenue" /></span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="font-bold text-foreground tabular-nums">{fmt(data.revenue)}</span>
                  {/* The denominator everything below is measured
                      against, so it is 100% by definition. */}
                  <span className="w-12 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    {data.revenue > 0 ? formatPercent(100) : ''}
                  </span>
                  <span className="w-12" aria-hidden="true" />
                </span>
              </div>
              {/* The two channels are a share of revenue and of revenue
                  again, so the second column would repeat the first. Only the
                  one that says something is drawn. */}
              <DetailRow
                label={t('pnl.dineIn')}
                term="dineIn"
                amount={data.dineIn}
                revenue={data.revenue}
                revenueLabel={t('pnl.ofRevenueLong')}
                sectionTotal={0}
                sectionLabel=""
              />
              <div className="border-b border-border-subtle">
                <DetailRow
                  label={t('pnl.takeaway')}
                  term="takeaway"
                  amount={data.takeaway}
                  revenue={data.revenue}
                  revenueLabel={t('pnl.ofRevenueLong')}
                  sectionTotal={0}
                  sectionLabel=""
                />
              </div>

              {/* COGS */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-semibold text-foreground">COGS<InfoHint term="cogs" /></span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="font-semibold text-red-400 tabular-nums">-{fmt(data.cogs)}</span>
                  <span className="w-12 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    {data.revenue > 0 ? formatPercent((data.cogs / data.revenue) * 100) : ''}
                  </span>
                  {/* A section is 100% of itself; saying so adds nothing. */}
                  <span className="w-12" aria-hidden="true" />
                </span>
              </div>
              {data.cogsBreakdown.map((item, i) => (
                <DetailRow
                  key={i}
                  label={item.category}
                  amount={item.amount}
                  revenue={data.revenue}
                  revenueLabel={t('pnl.ofRevenueLong')}
                  sectionTotal={data.cogs}
                  sectionLabel={t('pnl.ofCogs')}
                />
              ))}

              {/* Gross Profit */}
              <div className="flex justify-between py-3 border-y border-border bg-surface -mx-6 px-6">
                <span className="font-bold text-foreground">Lucro Bruto<InfoHint term="grossProfit" /></span>
                <div className="flex items-center gap-2">
                  <Tooltip text={glossaryText('grossMargin', language)} underline={false}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.grossMargin >= 60 ? 'bg-success/15 text-green-400' : data.grossMargin >= 50 ? 'bg-warning/15 text-amber-400' : 'bg-danger/15 text-red-400'}`}>
                      {data.grossMargin.toFixed(1)}%
                    </span>
                  </Tooltip>
                  <span className={`font-bold ${data.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(data.grossProfit)}</span>
                </div>
              </div>

              {/* OPEX */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-semibold text-foreground">OPEX<InfoHint term="opex" /></span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="font-semibold text-red-400 tabular-nums">-{fmt(data.opex)}</span>
                  <span className="w-12 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    {data.revenue > 0 ? formatPercent((data.opex / data.revenue) * 100) : ''}
                  </span>
                  {/* A section is 100% of itself; saying so adds nothing. */}
                  <span className="w-12" aria-hidden="true" />
                </span>
              </div>
              {data.opexBreakdown.map((item, i) => (
                <DetailRow
                  key={i}
                  label={item.category}
                  amount={item.amount}
                  revenue={data.revenue}
                  revenueLabel={t('pnl.ofRevenueLong')}
                  sectionTotal={data.opex}
                  sectionLabel={t('pnl.ofOpex')}
                />
              ))}

              {/* Net Income */}
              <div className="flex justify-between py-4 border-t-2 border-border mt-2">
                <span className="text-lg font-black text-foreground">{t('pnl.netIncome')}<InfoHint term="netIncome" /></span>
                <div className="flex items-center gap-2">
                  <Tooltip text={glossaryText('netMargin', language)} underline={false}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.netMargin >= 15 ? 'bg-success/15 text-green-400' : data.netMargin >= 5 ? 'bg-warning/15 text-amber-400' : 'bg-danger/15 text-red-400'}`}>
                      {data.netMargin.toFixed(1)}%
                    </span>
                  </Tooltip>
                  <span className={`text-lg font-black ${data.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {data.netIncome >= 0 ? '' : '-'}{fmt(Math.abs(data.netIncome))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* The share cards each carry their own glossary key, because
                "COGS %" needs the denominator named — the tooltip for COGS
                alone never says "of every €100 you sold". */}
            {([
              { label: 'Receita', term: 'revenue', value: data.revenue, color: 'text-foreground' },
              { label: 'COGS %', term: 'cogsPct', value: data.revenue > 0 ? (data.cogs / data.revenue * 100) : 0, suffix: '%', color: 'text-amber-400' },
              { label: 'OPEX %', term: 'opexPct', value: data.revenue > 0 ? (data.opex / data.revenue * 100) : 0, suffix: '%', color: 'text-info' },
              { label: 'Margem Líq.', term: 'netMargin', value: data.netMargin, suffix: '%', color: data.netMargin >= 15 ? 'text-green-400' : 'text-red-400' },
            ] as Array<{ label: string; term: GlossaryKey; value: number; suffix?: string; color: string }>).map((card, i) => (
              <div key={i} className="card-glass p-4 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {card.label}
                  <InfoHint term={card.term} />
                </div>
                <div className={`text-xl font-bold ${card.color}`}>
                  {card.suffix ? `${card.value.toFixed(1)}${card.suffix}` : fmt(card.value)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
