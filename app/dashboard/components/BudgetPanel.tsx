'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney, formatPercent } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { parsePtNumber } from '@/lib/zonesoft-import';
import InfoHint from '@/app/components/InfoHint';
import {
  BUDGET_SECTIONS,
  computePlan,
  sum,
  type BudgetSection,
  type PlanLine,
  type Scenario,
} from '@/lib/budget';
import { getBudget, importBudgetFromPreviousYear, type BudgetView } from '../budget-actions';
import BudgetPlan from './BudgetPlan';
import BudgetScenarios from './BudgetScenarios';
import BudgetComparison from './BudgetComparison';
import Dialog from './Dialog';
import { MONTH_KEYS } from './pnl-shared';
import { fill, signedMoney } from './budget-shared';

/**
 * The annual budget, which replaced the single monthly revenue target.
 *
 * A target of one number for every month told an owner nothing in August
 * that it had not told them in February. A budget plans each month in the
 * P&L's own bands, can start from last year's real figures, carries the
 * "what ifs" the owner is weighing, and is then laid beside what happened.
 */
export default function BudgetPanel() {
  const { t, language } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [view, setView] = useState<'plan' | 'compare'>('plan');
  const [data, setData] = useState<BudgetView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  /** A blank plan the owner chose to start; saved with its first line. */
  const [startedBlank, setStartedBlank] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingScenario, setEditingScenario] = useState<string | null>(null);
  /** Months the last import found empty, kept on screen until dismissed. */
  const [emptyMonths, setEmptyMonths] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getBudget(year);
    if ('data' in result) {
      setData(result.data);
      setLines(result.data.budget?.lines ?? []);
      setScenarios(result.data.budget?.scenarios ?? []);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    setStartedBlank(false);
    setEmptyMonths([]);
    void load();
  }, [load]);

  const plan = useMemo(() => computePlan(lines, scenarios), [lines, scenarios]);
  const basePlan = useMemo(() => computePlan(lines, scenarios, { withScenarios: false }), [lines, scenarios]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const hasBudget = lines.length > 0 || scenarios.length > 0;
  const canEdit = data?.canEdit ?? false;

  const header = (
    <div className="card-glass p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">
            {fill(t('budget.title'), { year })}
            <InfoHint term="budget" />
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('budget.subtitle')}
            {data?.budget?.importedFromYear && (
              <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {fill(t('budget.basedOn'), { year: data.budget.importedFromYear })}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t('budget.view.label')} className="inline-flex rounded-xl bg-muted p-1 text-sm">
            {(['plan', 'compare'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  view === v ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`budget.view.${v}`)}
              </button>
            ))}
          </div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field !py-2 !text-sm !w-[110px]"
            aria-label={t('budget.year')}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {canEdit && data?.previousYearHasData && hasBudget && view === 'plan' && (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {fill(t('budget.import.open'), { year: year - 1 })}
            </button>
          )}
        </div>
      </div>
      {data && !canEdit && <p className="mt-3 text-xs text-muted-foreground">{t('budget.readOnly')}</p>}
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {header}
        <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('budget.loading')}
        </div>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="space-y-4">
        {header}
        <div className="card-glass p-6 text-sm text-muted-foreground">{t('budget.loadError')}</div>
      </div>
    );
  }

  const revenue = sum(plan.sections.REVENUE);
  const costs = sum(BUDGET_SECTIONS.filter((s) => s !== 'REVENUE').flatMap((s) => plan.sections[s]));
  const result = sum(plan.netIncome);
  const baseResult = sum(basePlan.netIncome);
  const anyActive = scenarios.some((s) => s.active);

  return (
    <div className="space-y-4">
      {header}

      {emptyMonths.length > 0 && (
        <div role="status" className="card-glass p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 text-foreground">
            {fill(t('budget.import.emptyMonths'), {
              year: year - 1,
              months: emptyMonths.map((m) => t(`annualPnl.monthFull.${MONTH_KEYS[m]}`)).join(', '),
            })}
          </p>
          <button type="button" onClick={() => setEmptyMonths([])} className="text-xs text-muted-foreground hover:text-foreground">
            {t('common.close')}
          </button>
        </div>
      )}

      {view === 'compare' ? (
        hasBudget ? (
          <BudgetComparison year={year} plan={plan} lines={lines} categories={data.categories} actual={data.actual} />
        ) : (
          <div className="card-glass p-6 text-sm text-muted-foreground">{fill(t('budget.compare.noBudget'), { year })}</div>
        )
      ) : !hasBudget && !startedBlank ? (
        <div className="card-glass p-6 sm:p-8 text-center">
          <h4 className="font-semibold text-foreground">{fill(t('budget.empty.title'), { year })}</h4>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{t('budget.empty.body')}</p>
          {canEdit && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {data.previousYearHasData && (
                <button type="button" onClick={() => setImporting(true)} className="cta-button">
                  <Download className="w-4 h-4" aria-hidden="true" />
                  {fill(t('budget.import.open'), { year: year - 1 })}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStartedBlank(true)}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted"
              >
                {t('budget.empty.blank')}
              </button>
            </div>
          )}
          {canEdit && !data.previousYearHasData && (
            <p className="mt-3 text-xs text-muted-foreground">{fill(t('budget.empty.noPrevious'), { year: year - 1 })}</p>
          )}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card-glass p-4">
              <dt className="text-xs text-muted-foreground">{t('budget.summary.revenue')}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatMoney(revenue)}</dd>
            </div>
            <div className="card-glass p-4">
              <dt className="text-xs text-muted-foreground">{t('budget.summary.costs')}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatMoney(costs)}</dd>
              {revenue > 0 && (
                <dd className="text-xs text-muted-foreground">{fill(t('budget.summary.margin'), { pct: formatPercent((costs / revenue) * 100) })}</dd>
              )}
            </div>
            <div className="card-glass p-4">
              <dt className="text-xs text-muted-foreground">{t('budget.summary.result')}</dt>
              <dd className={`mt-1 text-xl font-bold tabular-nums ${result < 0 ? 'text-danger' : 'text-foreground'}`}>{formatMoney(result)}</dd>
              <dd className="text-xs text-muted-foreground">
                {revenue > 0 && fill(t('budget.summary.margin'), { pct: formatPercent((result / revenue) * 100) })}
                {anyActive && (
                  <span className="block">
                    {fill(t('budget.summary.withoutScenarios'), { value: formatMoney(baseResult) })}
                    {' · '}
                    <span className={result - baseResult < 0 ? 'text-danger' : 'text-success'}>{signedMoney(result - baseResult)}</span>
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="card-glass p-4 sm:p-6">
            <BudgetPlan
              year={year}
              lines={lines}
              plan={plan}
              categories={data.categories}
              canEdit={canEdit}
              onLinesChange={setLines}
              onEditScenario={setEditingScenario}
            />
          </div>

          <BudgetScenarios
            year={year}
            lines={lines}
            scenarios={scenarios}
            canEdit={canEdit}
            onChange={setScenarios}
            editingId={editingScenario}
            onEditingChange={setEditingScenario}
          />
        </>
      )}

      {importing && (
        <ImportDialog
          year={year}
          replacing={lines.length > 0}
          onClose={() => setImporting(false)}
          onImported={async (months) => {
            setImporting(false);
            setEmptyMonths(months);
            await load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Fills the plan from the year before, with the growth the owner expects.
 * Warns when it will replace lines already there; the "what ifs" are kept.
 */
function ImportDialog({
  year: targetYear, replacing, onClose, onImported,
}: {
  year: number;
  replacing: boolean;
  onClose: () => void;
  onImported: (emptyMonths: number[]) => void;
}) {
  const { t, language } = useLanguage();
  const [revenueGrowth, setRevenueGrowth] = useState('0');
  const [costGrowth, setCostGrowth] = useState('0');
  const [sections, setSections] = useState<BudgetSection[]>([...BUDGET_SECTIONS]);
  const [saving, setSaving] = useState(false);
  const source = targetYear - 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = parsePtNumber(revenueGrowth.trim() || '0');
    const cost = parsePtNumber(costGrowth.trim() || '0');
    if (rev === null || cost === null || sections.length === 0) {
      toast.error(t('budget.error.invalid'));
      return;
    }
    setSaving(true);
    const res = await importBudgetFromPreviousYear({ year: targetYear, revenueGrowth: rev, costGrowth: cost, sections });
    setSaving(false);
    if ('error' in res || !res.data) {
      toast.error(translateError(language, 'error' in res ? res.error : undefined));
      return;
    }
    toast.success(fill(t('budget.import.done'), { count: res.data.imported, year: source }));
    onImported(res.data.emptyMonths);
  };

  return (
    <Dialog title={fill(t('budget.import.title'), { year: source })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">{t('budget.import.revenueGrowth')}</span>
            <input type="text" inputMode="decimal" value={revenueGrowth} onChange={(e) => setRevenueGrowth(e.target.value)} className="input-field tabular-nums" />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">{t('budget.import.costGrowth')}</span>
            <input type="text" inputMode="decimal" value={costGrowth} onChange={(e) => setCostGrowth(e.target.value)} className="input-field tabular-nums" />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs text-muted-foreground mb-1.5">{t('budget.import.sections')}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {BUDGET_SECTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sections.includes(s)}
                  onChange={(e) =>
                    setSections((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                  }
                  className="accent-primary"
                />
                {t(`budget.section.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {sections.includes('COGS') && <p className="text-xs text-muted-foreground">{t('budget.import.cogsNote')}</p>}
        {replacing && (
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-foreground">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            {fill(t('budget.import.replaceWarning'), { year: source })}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving || sections.length === 0} className="cta-button">
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t('budget.import.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
