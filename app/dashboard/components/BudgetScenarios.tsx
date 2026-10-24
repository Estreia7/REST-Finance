'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  FlaskConical, Loader2, Pencil, Percent, Plus, Receipt, ShoppingCart, Trash2, TrendingUp, UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { parsePtNumber } from '@/lib/zonesoft-import';
import {
  DEFAULT_MEAL_ALLOWANCE,
  SCENARIO_KINDS,
  computePlan,
  hireMonthlyCost,
  scenarioImpact,
  sum,
  type BudgetSection,
  type PlanLine,
  type Scenario,
  type ScenarioKind,
} from '@/lib/budget';
import { deleteBudgetScenario, saveBudgetScenario, setBudgetScenarioActive } from '../budget-actions';
import { MONTH_KEYS } from './pnl-shared';
import { fill, signedMoney } from './budget-shared';
import Dialog from './Dialog';

/**
 * The "what ifs": one more person, a new oven, a price rise.
 *
 * Each one is a switch. On, it is part of the plan and of every figure above;
 * off, it is only being tried — and its effect on the year is shown either
 * way, so the owner can weigh it before deciding.
 */

const KIND_ICON: Record<ScenarioKind, LucideIcon> = {
  HIRE: UserPlus,
  PURCHASE: ShoppingCart,
  FIXED_COST: Receipt,
  REVENUE_CHANGE: TrendingUp,
  COGS_CHANGE: Percent,
};

interface Props {
  year: number;
  lines: PlanLine[];
  scenarios: Scenario[];
  canEdit: boolean;
  onChange: (scenarios: Scenario[]) => void;
  /** Opened from the plan's grid, by clicking a scenario row. */
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
}

export default function BudgetScenarios({
  year, lines, scenarios, canEdit, onChange, editingId, onEditingChange,
}: Props) {
  const { t, language } = useLanguage();
  const [creating, setCreating] = useState<ScenarioKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const monthName = (m: number) => t(`annualPnl.monthFull.${MONTH_KEYS[m - 1]}`);

  const impacts = useMemo(
    () => new Map(scenarios.map((s) => [s.id, scenarioImpact(lines, scenarios, s.id)])),
    [lines, scenarios]
  );
  const baseResult = useMemo(() => sum(computePlan(lines, scenarios, { withScenarios: false }).netIncome), [lines, scenarios]);
  const plannedResult = useMemo(() => sum(computePlan(lines, scenarios).netIncome), [lines, scenarios]);

  const describe = (s: Scenario) => {
    const values = {
      amount: formatMoney(s.amount ?? 0),
      month: monthName(s.startMonth),
      pct: `${(s.percent ?? 0) > 0 ? '+' : ''}${(s.percent ?? 0).toLocaleString('pt-PT')}%`,
      cost: formatMoney(hireMonthlyCost(s.amount ?? 0, s.mealAllowance ?? 0)),
      n: s.spreadMonths ?? 1,
    };
    const key = s.kind === 'PURCHASE' && (s.spreadMonths ?? 1) > 1 ? 'PURCHASE_SPREAD' : s.kind;
    return fill(t(`budget.scenarios.describe.${key}`), values);
  };

  const toggle = async (s: Scenario) => {
    const before = scenarios;
    setBusy(s.id);
    onChange(scenarios.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    const result = await setBudgetScenarioActive(s.id, !s.active);
    setBusy(null);
    if ('error' in result) {
      onChange(before);
      toast.error(translateError(language, result.error));
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const before = scenarios;
    onChange(scenarios.filter((s) => s.id !== id));
    const result = await deleteBudgetScenario(id);
    if ('error' in result) {
      onChange(before);
      toast.error(translateError(language, result.error));
    } else {
      toast.success(t('budget.scenarios.deleted'));
    }
  };

  const editing = scenarios.find((s) => s.id === editingId) ?? null;

  return (
    <section className="card-glass p-4 sm:p-6" aria-labelledby="budget-scenarios-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 id="budget-scenarios-title" className="font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            {t('budget.scenarios.title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('budget.scenarios.subtitle')}</p>
        </div>
        {scenarios.length > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {fill(t('budget.scenarios.compare'), {
              base: formatMoney(baseResult),
              planned: formatMoney(plannedResult),
            })}
          </p>
        )}
      </div>

      {scenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">{t('budget.scenarios.empty')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-y border-border-subtle mb-4">
          {scenarios.map((s) => {
            const Icon = KIND_ICON[s.kind];
            const impact = impacts.get(s.id) ?? 0;
            return (
              <li key={s.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 py-3 ${s.active ? '' : 'opacity-70'}`}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.active}
                  aria-label={fill(t('budget.scenarios.toggle'), { label: s.label })}
                  disabled={!canEdit || busy === s.id}
                  onClick={() => void toggle(s)}
                  className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                              disabled:cursor-not-allowed ${s.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${s.active ? 'translate-x-4' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{describe(s)}</div>
                </div>
                <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ml-12 sm:ml-0 ${impact < 0 ? 'text-danger' : impact > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                  {fill(t('budget.scenarios.impact'), { value: signedMoney(impact) })}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditingChange(s.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={fill(t('budget.scenarios.edit'), { label: s.label })}
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    {confirmDelete === s.id ? (
                      <span role="alert" className="flex items-center gap-2 text-xs pl-1">
                        {t('budget.scenarios.confirmDelete')}
                        <button type="button" onClick={() => void remove(s.id)} className="font-semibold text-danger hover:underline">
                          {t('common.delete')}
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:underline">
                          {t('common.cancel')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(s.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={fill(t('budget.scenarios.delete'), { label: s.label })}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('budget.scenarios.add')}>
          {SCENARIO_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setCreating(kind)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-foreground
                           hover:bg-muted hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                <Icon className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                {t(`budget.scenarios.kind.${kind}`)}
              </button>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <ScenarioDialog
          year={year}
          lines={lines}
          scenarios={scenarios}
          kind={editing?.kind ?? (creating as ScenarioKind)}
          existing={editing}
          readOnly={!canEdit}
          onClose={() => {
            setCreating(null);
            onEditingChange(null);
          }}
          onSaved={(saved) => {
            onChange(
              scenarios.some((s) => s.id === saved.id)
                ? scenarios.map((s) => (s.id === saved.id ? saved : s))
                : [...scenarios, saved]
            );
            setCreating(null);
            onEditingChange(null);
            toast.success(t('budget.scenarios.saved'));
          }}
        />
      )}
    </section>
  );
}

/**
 * One "what if", created or edited. Shows its effect on the year as it is
 * typed, worked out against the plan exactly as the list will show it.
 */
function ScenarioDialog({
  year, lines, scenarios, kind, existing, readOnly, onClose, onSaved,
}: {
  year: number;
  lines: PlanLine[];
  scenarios: Scenario[];
  kind: ScenarioKind;
  existing: Scenario | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (scenario: Scenario) => void;
}) {
  const { t, language } = useLanguage();
  const startDefault = year === new Date().getFullYear() ? Math.min(new Date().getMonth() + 2, 12) : 1;

  const [label, setLabel] = useState(existing?.label ?? t(`budget.scenarios.defaultLabel.${kind}`));
  const [startMonth, setStartMonth] = useState(existing?.startMonth ?? startDefault);
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount).replace('.', ',') : '');
  const [percent, setPercent] = useState(existing?.percent != null ? String(existing.percent).replace('.', ',') : '');
  const [meal, setMeal] = useState(
    (existing?.mealAllowance ?? DEFAULT_MEAL_ALLOWANCE).toFixed(2).replace('.', ',')
  );
  const [spread, setSpread] = useState(String(existing?.spreadMonths ?? 1));
  const [section, setSection] = useState<BudgetSection>(existing?.section ?? 'OPEX');
  const [saving, setSaving] = useState(false);

  const percentKind = kind === 'REVENUE_CHANGE' || kind === 'COGS_CHANGE';
  const num = (v: string) => (v.trim() === '' ? null : parsePtNumber(v));

  const draft: Scenario = {
    id: existing?.id ?? '__draft__',
    kind,
    label: label.trim(),
    active: existing?.active ?? true,
    section: kind === 'HIRE' ? 'LABOUR' : kind === 'FIXED_COST' ? section : kind === 'PURCHASE' ? 'OPEX' : kind === 'REVENUE_CHANGE' ? 'REVENUE' : 'COGS',
    amount: percentKind ? null : num(amount),
    percent: percentKind ? num(percent) : null,
    mealAllowance: kind === 'HIRE' ? num(meal) ?? 0 : null,
    startMonth,
    spreadMonths: kind === 'PURCHASE' ? Math.max(1, Math.trunc(num(spread) ?? 1)) : null,
  };
  const valid = Boolean(draft.label) && (percentKind ? draft.percent !== null : draft.amount !== null && draft.amount >= 0);

  const impact = valid
    ? scenarioImpact(lines, [...scenarios.filter((s) => s.id !== draft.id), draft], draft.id)
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || readOnly) return;
    setSaving(true);
    const { id: _ignored, ...fields } = draft;
    const result = await saveBudgetScenario({ ...fields, year, id: existing?.id });
    setSaving(false);
    if ('error' in result || !result.data) {
      toast.error(translateError(language, 'error' in result ? result.error : undefined));
      return;
    }
    onSaved({ ...draft, id: result.data.id });
  };

  const field = 'block';
  const caption = 'text-xs text-muted-foreground block mb-1.5';

  return (
    <Dialog title={existing ? t('budget.scenarioForm.titleEdit') : t('budget.scenarioForm.titleNew')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm font-medium text-foreground">{t(`budget.scenarios.kind.${kind}`)}</p>

        <label className={field}>
          <span className={caption}>{t('budget.scenarioForm.name')}</span>
          <input type="text" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} className="input-field" required disabled={readOnly} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          {kind === 'HIRE' && (
            <>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.grossSalary')}</span>
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" className="input-field tabular-nums" disabled={readOnly} />
              </label>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.mealAllowance')}</span>
                <input type="text" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} className="input-field tabular-nums" disabled={readOnly} />
              </label>
            </>
          )}
          {kind === 'PURCHASE' && (
            <>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.price')}</span>
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="6000" className="input-field tabular-nums" disabled={readOnly} />
              </label>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.spread')}</span>
                <input type="number" min={1} max={120} step={1} value={spread} onChange={(e) => setSpread(e.target.value)} className="input-field tabular-nums" disabled={readOnly} />
              </label>
            </>
          )}
          {kind === 'FIXED_COST' && (
            <>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.monthlyAmount')}</span>
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" className="input-field tabular-nums" disabled={readOnly} />
              </label>
              <label className={field}>
                <span className={caption}>{t('budget.scenarioForm.section')}</span>
                <select value={section} onChange={(e) => setSection(e.target.value as BudgetSection)} className="input-field" disabled={readOnly}>
                  {(['OPEX', 'OCCUPANCY', 'LABOUR'] as const).map((s) => (
                    <option key={s} value={s}>{t(`budget.section.${s}`)}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {percentKind && (
            <label className={field}>
              <span className={caption}>{t('budget.scenarioForm.percent')}</span>
              <input type="text" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="5" className="input-field tabular-nums" disabled={readOnly} />
            </label>
          )}
          <label className={field}>
            <span className={caption}>{t('budget.scenarioForm.startMonth')}</span>
            <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className="input-field" disabled={readOnly}>
              {MONTH_KEYS.map((m, i) => (
                <option key={m} value={i + 1}>{t(`annualPnl.monthFull.${m}`)}</option>
              ))}
            </select>
          </label>
        </div>

        {kind === 'HIRE' && (
          <div className="rounded-xl bg-muted px-3.5 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t('budget.scenarioForm.hireCost')}</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(hireMonthlyCost(num(amount) ?? 0, num(meal) ?? 0), { decimals: 2 })}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('budget.scenarioForm.hireExplain')}</p>
          </div>
        )}
        {kind === 'PURCHASE' && <p className="text-xs text-muted-foreground">{t('budget.scenarioForm.spreadNote')}</p>}
        {percentKind && <p className="text-xs text-muted-foreground">{t('budget.scenarioForm.percentHint')}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <span className="text-sm text-muted-foreground">{t('budget.scenarioForm.impact')}</span>
          <span
            aria-live="polite"
            className={`text-base font-bold tabular-nums ${impact === null ? 'text-muted-foreground' : impact < 0 ? 'text-danger' : impact > 0 ? 'text-success' : ''}`}
          >
            {impact === null ? '—' : signedMoney(impact)}
          </span>
        </div>

        {!readOnly && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!valid || saving} className="cta-button">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('budget.scenarioForm.submit')}
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
