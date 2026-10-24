'use client';

import { Fragment, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/lib/language-context';
import { useChartTheme } from '@/lib/chart-theme';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/format';
import InfoHint from '@/app/components/InfoHint';
import {
  BUDGET_SECTIONS,
  closedMonths,
  emptyMonths,
  sum,
  throughMonth,
  variance,
  type BudgetSection,
  type ComparisonRow,
  type Plan,
  type PlanLine,
} from '@/lib/budget';
import type { BudgetActual, BudgetCategory } from '../budget-actions';
import { MONTH_KEYS, SECTION } from './pnl-shared';
import { SECTION_STYLE, fill, lineName, signedMoney } from './budget-shared';
import { ChartLegend, TooltipCard, TooltipRow, barPath, monthLabel, useDismissableTooltip } from './chart-parts';

/**
 * The budget laid beside what happened.
 *
 * Only closed months are judged: a half-finished month set against a whole
 * month's budget reads as a shortfall every day until the last. The period
 * defaults to the year so far, and any closed month can be looked at alone.
 *
 * A variance is coloured by whether it is good news — more revenue, less
 * cost — not by its sign, because €500 over budget is good on the revenue
 * line and bad on the wages line.
 */

interface Props {
  year: number;
  plan: Plan;
  lines: PlanLine[];
  categories: BudgetCategory[];
  actual: BudgetActual | null;
}

type Period = 'ytd' | number;

const barShape = (p: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
  <path d={barPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)} fill={p.fill} />
);

export default function BudgetComparison({ year, plan, lines, categories, actual }: Props) {
  const { t, language } = useLanguage();
  const chart = useChartTheme();
  const { plotRef, chartProps, tooltipProps } = useDismissableTooltip();
  const closed = closedMonths(year, new Date());
  const [period, setPeriod] = useState<Period>('ytd');

  const pick = (months: number[]) =>
    period === 'ytd' ? throughMonth(months, closed) : months[period] ?? 0;

  const actualSections = actual?.sections ?? {
    REVENUE: emptyMonths(), COGS: emptyMonths(), LABOUR: emptyMonths(), OPEX: emptyMonths(), OCCUPANCY: emptyMonths(),
  };
  const actualNet = actual?.netIncome ?? emptyMonths();

  /** The real months behind a planned line, or null when nothing maps to it. */
  const actualOf = (line: PlanLine): number[] | null => {
    if (!actual) return null;
    if (line.categoryId) return actual.byCategory[line.categoryId] ?? emptyMonths();
    if (line.channel === 'dineIn') return actual.dineIn;
    if (line.channel === 'takeaway') return actual.takeaway;
    if (line.channel === 'total') return actual.sections.REVENUE;
    return null;
  };

  const points = MONTH_KEYS.map((m, i) => ({
    label: monthLabel('', language, i),
    budget: plan.sections.REVENUE[i],
    actual: i < closed ? actualSections.REVENUE[i] : null,
  }));

  const VarianceCells = ({ row, budget, real }: { row: ComparisonRow; budget: number; real: number | null }) => {
    if (real === null) {
      return (
        <>
          <td className="px-1.5 sm:px-3 py-2 text-right tabular-nums">{formatMoney(budget)}</td>
          <td className="px-1.5 sm:px-3 py-2 text-right text-muted-foreground">—</td>
          <td className="px-1.5 sm:px-3 py-2 text-right text-muted-foreground">—</td>
        </>
      );
    }
    const v = variance(row, budget, real);
    const tone = Math.round(v.difference) === 0 ? 'text-muted-foreground' : v.favourable ? 'text-success' : 'text-danger';
    return (
      <>
        <td className="px-1.5 sm:px-3 py-2 text-right tabular-nums">{formatMoney(v.budget)}</td>
        <td className="px-1.5 sm:px-3 py-2 text-right tabular-nums">{formatMoney(v.actual)}</td>
        <td className={`px-1.5 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap ${tone}`}>
          {signedMoney(v.difference)}
          {v.percent !== null && (
            <span className="block text-[11px] opacity-80">{`${v.percent > 0 ? '+' : ''}${formatPercent(v.percent)}`}</span>
          )}
          {Math.round(v.difference) !== 0 && (
            <span className="sr-only">
              {v.favourable ? t('budget.compare.favourable') : t('budget.compare.unfavourable')}
            </span>
          )}
        </td>
      </>
    );
  };

  const sectionRows = (section: BudgetSection) => {
    const style = SECTION[SECTION_STYLE[section]];
    const sectionLines = lines.filter((l) => l.section === section);
    const computed = new Map(plan.lines.map((l) => [l.id, l.computed]));
    let matchedActual = 0;

    const detail = sectionLines.map((line) => {
      const real = actualOf(line);
      if (real) matchedActual += pick(real);
      return (
        <tr key={line.id} className={style.body}>
          <th scope="row" className="text-left font-normal pl-4 sm:pl-7 pr-1.5 sm:pr-3 py-2 text-muted-foreground">
            {lineName(line, categories, t)}
          </th>
          <VarianceCells row={section} budget={pick(computed.get(line.id) ?? line.months)} real={real ? pick(real) : null} />
        </tr>
      );
    });

    // A "what if" that starts after the period has nothing to say about it.
    const scenarioRows = plan.scenarioRows
      .filter((r) => r.section === section && Math.round(pick(r.months)) !== 0)
      .map((r) => (
        <tr key={r.scenario.id} className={style.body}>
          <th scope="row" className="text-left font-normal italic pl-4 sm:pl-7 pr-1.5 sm:pr-3 py-2 text-muted-foreground">
            {r.scenario.label} <span className="text-[11px] not-italic">· {t('budget.scenarios.tag')}</span>
          </th>
          <VarianceCells row={section} budget={pick(r.months)} real={null} />
        </tr>
      ));

    // What was spent in this band under categories nobody budgeted for. Shown
    // so the lines still add up to the band, and because an unplanned cost is
    // exactly what a comparison is for.
    const unbudgeted = actual ? pick(actualSections[section]) - matchedActual : 0;
    const showUnbudgeted = actual && section !== 'REVENUE' && Math.abs(unbudgeted) >= 1;

    return (
      <Fragment key={section}>
        <tr className={`${style.head} border-t ${style.rule} font-semibold`}>
          <th scope="row" className="text-left px-2 sm:px-4 py-2">
            <span className={`hidden sm:inline-block align-middle mr-2 w-1 h-3.5 rounded-full ${style.accent}`} aria-hidden="true" />
            {t(`budget.section.${section}`)}
          </th>
          <VarianceCells row={section} budget={pick(plan.sections[section])} real={actual ? pick(actualSections[section]) : null} />
        </tr>
        {detail}
        {scenarioRows}
        {showUnbudgeted && (
          <tr className={style.body}>
            <th scope="row" className="text-left font-normal pl-4 sm:pl-7 pr-1.5 sm:pr-3 py-2 text-muted-foreground">
              {t('budget.compare.unbudgeted')}
            </th>
            <VarianceCells row={section} budget={0} real={unbudgeted} />
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card-glass p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-foreground mb-1">{t('budget.compare.chartTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('budget.compare.chartSubtitle')}</p>
        </div>
        <ChartLegend
          items={[
            { key: 'budget', color: chart.data.other, label: t('budget.compare.budget'), value: formatMoney(sum(plan.sections.REVENUE)) },
            {
              key: 'actual',
              color: chart.data.revenue,
              label: t('budget.compare.actual'),
              value: formatMoney(throughMonth(actualSections.REVENUE, closed)),
            },
          ]}
        />
        <div ref={plotRef}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart {...chartProps} data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={2} tickMargin={8} />
              <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => formatMoneyCompact(v)} />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: chart.grid, opacity: 0.35 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const budget = Number(payload.find((p) => p.dataKey === 'budget')?.value ?? 0);
                  const realValue = payload.find((p) => p.dataKey === 'actual')?.value;
                  const real = realValue === null || realValue === undefined ? null : Number(realValue);
                  return (
                    <TooltipCard title={`${label} ${year}`}>
                      <TooltipRow color={chart.data.other} label={t('budget.compare.budget')} value={formatMoney(budget)} />
                      <TooltipRow color={chart.data.revenue} label={t('budget.compare.actual')} value={real === null ? '—' : formatMoney(real)} />
                      {real !== null && (
                        <div className="pt-1.5 mt-1.5 border-t border-border-subtle">
                          <TooltipRow label={t('budget.compare.difference')} value={signedMoney(real - budget)} strong />
                        </div>
                      )}
                    </TooltipCard>
                  );
                }}
              />
              <Bar
                dataKey="budget"
                name={t('budget.compare.budget')}
                fill={chart.data.other}
                maxBarSize={14}
                shape={barShape}
              />
              <Bar
                dataKey="actual"
                name={t('budget.compare.actual')}
                fill={chart.data.revenue}
                maxBarSize={14}
                shape={barShape}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-glass p-4 sm:p-6">
        {closed === 0 ? (
          <p className="text-sm text-muted-foreground">{fill(t('budget.compare.notStarted'), { year })}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm text-muted-foreground">
                {t('budget.compare.closedOnly')}
                <InfoHint term="budgetVariance" />
              </p>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('budget.compare.period')}</span>
                <select
                  value={String(period)}
                  onChange={(e) => setPeriod(e.target.value === 'ytd' ? 'ytd' : Number(e.target.value))}
                  className="input-field !py-2 !text-sm !w-auto"
                >
                  <option value="ytd">
                    {closed === 12
                      ? t('annualPnl.wholeYear')
                      : fill(t('budget.compare.ytd'), { month: t(`annualPnl.monthFull.${MONTH_KEYS[closed - 1]}`).toLowerCase() })}
                  </option>
                  {MONTH_KEYS.slice(0, closed).map((m, i) => (
                    <option key={m} value={i}>{t(`annualPnl.monthFull.${m}`)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th scope="col" className="text-left px-2 sm:px-4 py-2 font-medium">&nbsp;</th>
                    <th scope="col" className="px-1.5 sm:px-3 py-2 text-right font-medium">{t('budget.compare.budget')}</th>
                    <th scope="col" className="px-1.5 sm:px-3 py-2 text-right font-medium">{t('budget.compare.actual')}</th>
                    <th scope="col" className="px-1.5 sm:px-3 py-2 text-right font-medium">{t('budget.compare.difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_SECTIONS.map(sectionRows)}
                  <tr className={`${SECTION.result.head} border-t ${SECTION.result.rule} font-semibold`}>
                    <th scope="row" className="text-left px-2 sm:px-4 py-2.5">
                      {t('annualPnl.line.netIncome')}
                      <InfoHint term="netIncome" />
                    </th>
                    <VarianceCells row="NET" budget={pick(plan.netIncome)} real={actual ? pick(actualNet) : null} />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
