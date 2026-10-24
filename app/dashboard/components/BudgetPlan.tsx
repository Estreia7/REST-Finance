'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, FlaskConical, Percent, Euro, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatPercent } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { parsePtNumber } from '@/lib/zonesoft-import';
import InfoHint from '@/app/components/InfoHint';
import type { GlossaryKey } from '@/lib/glossary';
import {
  BUDGET_SECTIONS,
  rescaleMonths,
  spreadEvenly,
  sum,
  type BudgetSection,
  type Plan,
  type PlanLine,
  type ScenarioRow,
} from '@/lib/budget';
import { saveBudgetLine, deleteBudgetLine, type BudgetCategory } from '../budget-actions';
import { MONTH_KEYS, SECTION } from './pnl-shared';
import { SECTION_STYLE, cellMoney, fill, lineName } from './budget-shared';
import Dialog from './Dialog';
import { matchesSearch } from './ListSearch';

/**
 * The plan itself: every line, twelve months across, typed straight into the
 * grid the way an owner would fill a spreadsheet.
 *
 * Each cell saves when the owner leaves it. The year's total is editable too:
 * typing a new total rescales the months in proportion, so a line imported
 * with last year's busy August keeps its August.
 *
 * The "what ifs" sit in their band as read-only rows, marked as such, so the
 * band total visibly includes them; they are changed in the list below.
 */

interface Props {
  year: number;
  lines: PlanLine[];
  plan: Plan;
  categories: BudgetCategory[];
  canEdit: boolean;
  onLinesChange: (lines: PlanLine[]) => void;
  onEditScenario: (id: string) => void;
}

/** The glossary entry behind each band heading. */
const SECTION_TERM: Record<BudgetSection, GlossaryKey> = {
  REVENUE: 'revenue',
  COGS: 'cogs',
  LABOUR: 'labour',
  OPEX: 'opex',
  OCCUPANCY: 'occupancy',
};

const RESULT_ROWS = [
  { key: 'primeCost', after: 'LABOUR', term: 'primeCost' },
  { key: 'controllableIncome', after: 'OPEX', term: 'controllableIncome' },
  { key: 'netIncome', after: 'OCCUPANCY', term: 'netIncome' },
] as const;

/** How a figure reads inside an input: no symbol, comma decimals, no grouping. */
function editable(value: number): string {
  return value === 0 ? '' : value.toLocaleString('pt-PT', { maximumFractionDigits: 2, useGrouping: false });
}

/**
 * A money cell. Keeps its own text while focused so a half-typed "1.2" is not
 * reformatted under the owner's fingers, and commits only a real change.
 */
function AmountInput({
  value, onCommit, label, disabled, className = '',
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(editable(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(editable(value));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const parsed = text.trim() === '' ? 0 : parsePtNumber(text);
    if (parsed === null) {
      setText(editable(value));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded !== value) onCommit(rounded);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? text : value === 0 ? '' : Math.round(value).toLocaleString('pt-PT')}
      placeholder="—"
      aria-label={label}
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true);
        setText(editable(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(editable(value));
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      className={`w-full min-w-0 bg-transparent text-right tabular-nums rounded-md px-1.5 py-1
                  border border-transparent hover:border-border focus:border-primary/60 focus:bg-card
                  focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50
                  disabled:hover:border-transparent ${className}`}
    />
  );
}

/** A share of revenue, typed as a percentage. */
function ShareInput({
  share, onCommit, label, disabled,
}: {
  share: number;
  onCommit: (share: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 w-[3.75rem]">
      <AmountInput
        value={Math.round(share * 10000) / 100}
        onCommit={(pct) => onCommit(Math.max(0, pct) / 100)}
        label={label}
        disabled={disabled}
        className="!text-xs !py-0.5"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </span>
  );
}

export default function BudgetPlan({
  year, lines, plan, categories, canEdit, onLinesChange, onEditScenario,
}: Props) {
  const { t, language } = useLanguage();
  const [adding, setAdding] = useState<BudgetSection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mobileMonth, setMobileMonth] = useState(() =>
    year === new Date().getFullYear() ? new Date().getMonth() : 0
  );

  const computedById = useMemo(() => new Map(plan.lines.map((l) => [l.id, l])), [plan.lines]);
  const monthName = (i: number) => t(`annualPnl.monthAbbr.${MONTH_KEYS[i]}`);
  const name = (line: PlanLine) => lineName(line, categories, t);

  /** Saves a line, showing the change at once and undoing it if the save fails. */
  const save = async (next: PlanLine) => {
    const before = lines;
    onLinesChange(lines.map((l) => (l.id === next.id ? next : l)));
    const result = await saveBudgetLine({
      year,
      id: next.id,
      section: next.section,
      categoryId: next.categoryId,
      label: next.label,
      months: next.months,
      revenueShare: next.revenueShare,
    });
    if ('error' in result) {
      onLinesChange(before);
      toast.error(translateError(language, result.error ?? 'budget.line.saveError'));
    }
  };

  const setMonth = (line: PlanLine, m: number, value: number) => {
    const months = [...line.months];
    months[m] = value;
    void save({ ...line, months });
  };

  const setTotal = (line: PlanLine, total: number) =>
    void save({ ...line, months: rescaleMonths(line.months, total) });

  /** Between euros and a share of revenue, keeping this year's figures. */
  const toggleShare = (line: PlanLine) => {
    const computed = computedById.get(line.id)?.computed ?? line.months;
    if (line.revenueShare !== null) {
      void save({ ...line, revenueShare: null, months: computed });
      return;
    }
    const revenue = sum(plan.sections.REVENUE);
    const share = revenue > 0 ? Math.round((sum(computed) / revenue) * 10000) / 10000 : 0.3;
    void save({ ...line, revenueShare: share });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const before = lines;
    onLinesChange(lines.filter((l) => l.id !== id));
    const result = await deleteBudgetLine(id);
    if ('error' in result) {
      onLinesChange(before);
      toast.error(translateError(language, result.error ?? 'budget.line.saveError'));
    } else {
      toast.success(t('budget.line.deleted'));
    }
  };

  const linesOf = (section: BudgetSection) => lines.filter((l) => l.section === section);
  const scenarioRowsOf = (section: BudgetSection) => plan.scenarioRows.filter((r) => r.section === section);

  const resultLine = (key: (typeof RESULT_ROWS)[number]['key']) => plan[key];
  const revenueTotal = sum(plan.sections.REVENUE);
  const pctOf = (value: number) => (revenueTotal > 0 ? formatPercent((value / revenueTotal) * 100) : '');

  // ── Desktop rows ─────────────────────────────────────────────────────────

  const lineRow = (line: PlanLine) => {
    const style = SECTION[SECTION_STYLE[line.section]];
    const computed = computedById.get(line.id);
    const months = computed?.computed ?? line.months;
    const total = computed?.total ?? sum(line.months);
    const label = name(line);
    const isShare = line.revenueShare !== null;

    return (
      <tr key={line.id} className={`${style.body} group`}>
        <th
          scope="row"
          className={`sticky left-0 z-10 ${style.bodySolid} text-left font-normal pl-8 pr-2 py-1 text-muted-foreground`}
        >
          <div className="flex items-center gap-1.5 max-w-[15rem]">
            <span className="truncate" title={label}>{label}</span>
            {isShare && (
              <ShareInput
                share={line.revenueShare as number}
                onCommit={(share) => void save({ ...line, revenueShare: share })}
                label={fill(t('budget.line.shareLabel'), { line: label })}
                disabled={!canEdit}
              />
            )}
            {canEdit && (
              <span className="ml-auto flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                {line.section === 'COGS' && (
                  <button
                    type="button"
                    onClick={() => toggleShare(line)}
                    className="p-1 rounded hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={isShare ? t('budget.addLine.modeEuros') : t('budget.addLine.modeShare')}
                    aria-label={isShare ? t('budget.addLine.modeEuros') : t('budget.addLine.modeShare')}
                  >
                    {isShare ? <Euro className="w-3.5 h-3.5" aria-hidden="true" /> : <Percent className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(line.id)}
                  className="p-1 rounded hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={fill(t('budget.line.delete'), { line: label })}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {confirmDelete === line.id && (
            <div role="alert" className="mt-1 flex items-center gap-2 text-xs text-foreground">
              {t('budget.line.confirmDelete')}
              <button type="button" onClick={() => void remove(line.id)} className="font-semibold text-danger hover:underline">
                {t('common.delete')}
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:underline">
                {t('common.cancel')}
              </button>
            </div>
          )}
        </th>
        {months.map((value, m) => (
          <td key={m} className={`px-0.5 py-1 w-[5.5rem] ${m === 11 ? 'pr-6' : ''}`}>
            {isShare || !canEdit ? (
              <span className="block px-1.5 text-right tabular-nums text-foreground">{cellMoney(value)}</span>
            ) : (
              <AmountInput
                value={value}
                onCommit={(v) => setMonth(line, m, v)}
                label={fill(t('budget.line.cellLabel'), { line: label, month: monthName(m) })}
              />
            )}
          </td>
        ))}
        <td className={`sticky right-[76px] z-10 ${style.bodySolid} border-l ${style.rule} px-2 py-1 w-[7rem] shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)]`}>
          {isShare || !canEdit ? (
            <span className="block px-1.5 text-right tabular-nums font-semibold">{cellMoney(total)}</span>
          ) : (
            <AmountInput
              value={total}
              onCommit={(v) => setTotal(line, v)}
              label={fill(t('budget.line.totalLabel'), { line: label })}
              className="font-semibold"
            />
          )}
        </td>
        <td className={`sticky right-0 z-10 w-[76px] ${style.bodySolid} border-l ${style.rule} px-4 py-1 text-right figure text-muted-foreground`}>
          {line.section === 'REVENUE' ? '' : pctOf(total)}
        </td>
      </tr>
    );
  };

  const scenarioLine = (row: ScenarioRow) => {
    const style = SECTION[SECTION_STYLE[row.section]];
    return (
      <tr key={row.scenario.id} className={style.body}>
        <th scope="row" className={`sticky left-0 z-10 ${style.bodySolid} text-left font-normal pl-8 pr-2 py-1.5`}>
          <button
            type="button"
            onClick={() => onEditScenario(row.scenario.id)}
            className="flex items-center gap-1.5 max-w-[15rem] text-muted-foreground italic hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <FlaskConical className="w-3.5 h-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
            <span className="truncate">{row.scenario.label}</span>
            <span className="sr-only">({t('budget.scenarios.tag')})</span>
          </button>
        </th>
        {row.months.map((v, m) => (
          <td key={m} className={`px-2 py-1.5 text-right tabular-nums italic text-muted-foreground ${m === 11 ? 'pr-6' : ''}`}>
            {cellMoney(v)}
          </td>
        ))}
        <td className={`sticky right-[76px] z-10 ${style.bodySolid} border-l ${style.rule} px-3.5 py-1.5 text-right tabular-nums italic font-semibold shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)]`}>
          {cellMoney(row.total)}
        </td>
        <td className={`sticky right-0 z-10 w-[76px] ${style.bodySolid} border-l ${style.rule} px-4 py-1.5 text-right figure text-muted-foreground`}>
          {row.section === 'REVENUE' ? '' : pctOf(row.total)}
        </td>
      </tr>
    );
  };

  const headingRow = ({
    key, label, months, section, term, isResult = false,
  }: {
    key: string;
    label: string;
    months: number[];
    section: BudgetSection | 'result';
    term?: GlossaryKey;
    isResult?: boolean;
  }) => {
    const style = SECTION[section === 'result' ? 'result' : SECTION_STYLE[section]];
    const total = sum(months);
    return (
      <tr key={key} className={`${style.head} border-t ${style.rule}`}>
        <th scope="row" className={`sticky left-0 z-10 ${style.head} text-left font-semibold px-4 py-2 whitespace-nowrap`}>
          <span className={`inline-block align-middle mr-2 w-1 h-3.5 rounded-full ${style.accent}`} aria-hidden="true" />
          {label}
          {term && <InfoHint term={term} />}
        </th>
        {months.map((v, m) => (
          <td key={m} className={`px-2 py-2 text-right figure tabular-nums whitespace-nowrap font-semibold ${v < 0 ? 'text-danger' : ''} ${m === 11 ? 'pr-6' : ''}`}>
            {cellMoney(v)}
          </td>
        ))}
        <td className={`sticky right-[76px] z-10 ${style.head} border-l ${style.rule} px-3.5 py-2 text-right figure font-semibold whitespace-nowrap shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)] ${total < 0 ? 'text-danger' : ''}`}>
          {cellMoney(total)}
        </td>
        <td className={`sticky right-0 z-10 w-[76px] ${style.head} border-l ${style.rule} px-4 py-2 text-right figure font-semibold`}>
          {section === 'REVENUE' && !isResult ? '' : pctOf(total)}
        </td>
      </tr>
    );
  };

  const addRow = (section: BudgetSection) => {
    if (!canEdit) return null;
    const style = SECTION[SECTION_STYLE[section]];
    return (
      <tr key={`add-${section}`} className={style.body}>
        <th scope="row" className={`sticky left-0 z-10 ${style.bodySolid} text-left font-normal pl-7 py-1`}>
          <button
            type="button"
            onClick={() => setAdding(section)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('budget.line.add')}
          </button>
        </th>
        <td colSpan={14} />
      </tr>
    );
  };

  // ── Phone: one month, every line ─────────────────────────────────────────

  const mobileValue = (line: PlanLine) => computedById.get(line.id)?.computed[mobileMonth] ?? 0;

  return (
    <>
      {/* ── Desktop ── */}
      <div className="hidden md:block overflow-x-auto -mx-6 px-6">
        <table className="min-w-full w-max text-sm border-collapse">
          <caption className="sr-only">{fill(t('budget.title'), { year })}</caption>
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th scope="col" className="sticky left-0 z-10 bg-card text-left px-4 py-2 font-medium min-w-[14rem]">&nbsp;</th>
              {MONTH_KEYS.map((m, i) => (
                <th key={m} scope="col" className={`px-2 py-2 text-right font-medium ${i === 11 ? 'pr-6' : ''}`}>
                  {t(`annualPnl.monthAbbr.${m}`)}
                </th>
              ))}
              <th scope="col" className="sticky right-[76px] z-10 bg-card px-3.5 py-2 text-right font-medium border-l border-border-subtle shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.10)]">
                <span title={canEdit ? t('budget.line.totalHint') : undefined}>{t('annualPnl.total')}</span>
              </th>
              <th scope="col" className="sticky right-0 z-10 w-[76px] bg-card px-4 py-2 text-right font-medium border-l border-border-subtle">
                {t('annualPnl.pctOfRevenue')}
              </th>
            </tr>
          </thead>
          <tbody>
            {BUDGET_SECTIONS.map((section) => sectionRows(section))}
          </tbody>
        </table>
      </div>

      {/* ── Phone ── */}
      <div className="md:hidden space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{t('annualPnl.month')}</span>
          <select
            value={mobileMonth}
            onChange={(e) => setMobileMonth(Number(e.target.value))}
            className="input-field !py-2 !text-sm !w-auto"
          >
            {MONTH_KEYS.map((m, i) => (
              <option key={m} value={i}>{t(`annualPnl.monthFull.${m}`)}</option>
            ))}
          </select>
        </label>

        {BUDGET_SECTIONS.map((section) => {
          const style = SECTION[SECTION_STYLE[section]];
          const result = RESULT_ROWS.find((r) => r.after === section);
          return (
            <div key={section} className="space-y-3">
              <section className={`rounded-xl border ${style.rule} overflow-hidden`}>
                <div className={`${style.head} flex items-center justify-between px-3 py-2 text-sm font-semibold`}>
                  <span className="flex items-center gap-2">
                    <span className={`w-1 h-3.5 rounded-full ${style.accent}`} aria-hidden="true" />
                    {t(`budget.section.${section}`)}
                  </span>
                  <span className="tabular-nums">{cellMoney(plan.sections[section][mobileMonth])}</span>
                </div>
                <ul className={`${style.body} divide-y divide-border-subtle`}>
                  {linesOf(section).map((line) => {
                    const label = name(line);
                    const isShare = line.revenueShare !== null;
                    return (
                      <li key={line.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                        <span className="flex-1 min-w-0 truncate text-muted-foreground">{label}</span>
                        {isShare && (
                          <ShareInput
                            share={line.revenueShare as number}
                            onCommit={(share) => void save({ ...line, revenueShare: share })}
                            label={fill(t('budget.line.shareLabel'), { line: label })}
                            disabled={!canEdit}
                          />
                        )}
                        <span className="w-28 shrink-0">
                          {isShare || !canEdit ? (
                            <span className="block px-1.5 text-right tabular-nums">{cellMoney(mobileValue(line))}</span>
                          ) : (
                            <AmountInput
                              value={line.months[mobileMonth]}
                              onCommit={(v) => setMonth(line, mobileMonth, v)}
                              label={fill(t('budget.line.cellLabel'), { line: label, month: monthName(mobileMonth) })}
                              className="!py-1.5"
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                  {scenarioRowsOf(section).map((row) => (
                    <li key={row.scenario.id}>
                      <button
                        type="button"
                        onClick={() => onEditScenario(row.scenario.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm italic text-muted-foreground text-left"
                      >
                        <FlaskConical className="w-3.5 h-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                        <span className="flex-1 min-w-0 truncate">{row.scenario.label}</span>
                        <span className="tabular-nums">{cellMoney(row.months[mobileMonth])}</span>
                      </button>
                    </li>
                  ))}
                  {canEdit && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setAdding(section)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('budget.line.add')}
                      </button>
                    </li>
                  )}
                </ul>
              </section>
              {result && (
                <div className={`${SECTION.result.head} rounded-xl flex items-center justify-between px-3 py-2 text-sm font-semibold`}>
                  <span>{t(`annualPnl.line.${result.key}`)}</span>
                  <span className={`tabular-nums ${resultLine(result.key)[mobileMonth] < 0 ? 'text-danger' : ''}`}>
                    {cellMoney(resultLine(result.key)[mobileMonth])}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <AddLineDialog
          year={year}
          section={adding}
          categories={categories.filter(
            (c) => c.section === adding && !lines.some((l) => l.categoryId === c.id)
          )}
          revenueTotal={revenueTotal}
          onClose={() => setAdding(null)}
          onAdded={(line) => {
            onLinesChange([...lines, line]);
            setAdding(null);
          }}
        />
      )}
    </>
  );

  function sectionRows(section: BudgetSection) {
    const result = RESULT_ROWS.find((r) => r.after === section);
    return (
      <Fragment key={section}>
        {headingRow({
          key: `head-${section}`,
          label: t(`budget.section.${section}`),
          months: plan.sections[section],
          section,
          term: SECTION_TERM[section],
        })}
        {linesOf(section).map(lineRow)}
        {scenarioRowsOf(section).map(scenarioLine)}
        {addRow(section)}
        {result &&
          headingRow({
            key: result.key,
            label: t(`annualPnl.line.${result.key}`),
            months: resultLine(result.key),
            section: 'result',
            term: result.term,
            isResult: true,
          })}
      </Fragment>
    );
  }
}

/**
 * A new line: one of the restaurant's categories for this band, or a name of
 * the owner's own. Categories already in the budget are left out, so the same
 * cost is not planned twice and then compared twice.
 */
function AddLineDialog({
  year, section, categories, revenueTotal, onClose, onAdded,
}: {
  year: number;
  section: BudgetSection;
  categories: BudgetCategory[];
  revenueTotal: number;
  onClose: () => void;
  onAdded: (line: PlanLine) => void;
}) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'euros' | 'share'>(section === 'COGS' ? 'share' : 'euros');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const shown = categories.filter((c) => matchesSearch(search, c.name));
  const sectionName = t(`budget.section.${section}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = amount.trim() === '' ? 0 : parsePtNumber(amount);
    if (value === null || value < 0) {
      toast.error(t('budget.error.invalid'));
      return;
    }
    if (!categoryId && !label.trim()) {
      toast.error(t('budget.error.nameRequired'));
      return;
    }
    const share = mode === 'share' ? value / 100 : null;
    setSaving(true);
    const input = {
      year,
      section,
      categoryId,
      label: categoryId ? '' : label.trim(),
      months: share === null ? spreadEvenly(value) : spreadEvenly(0),
      revenueShare: share,
    };
    const result = await saveBudgetLine(input);
    setSaving(false);
    if ('error' in result || !result.data) {
      toast.error(translateError(language, ('error' in result && result.error) || 'budget.line.saveError'));
      return;
    }
    onAdded({ ...input, id: result.data.id, channel: null });
  };

  return (
    <Dialog title={fill(t('budget.addLine.title'), { section: sectionName })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {section !== 'REVENUE' && (
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground mb-1.5">{t('budget.addLine.category')}</legend>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('budget.addLine.noCategories')}</p>
            ) : (
              <>
                {categories.length > 8 && (
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('budget.addLine.searchCategory')}
                    aria-label={t('budget.addLine.searchCategory')}
                    className="input-field !py-2 !text-sm"
                  />
                )}
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border-subtle">
                  {shown.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t('budget.addLine.noMatch')}</p>
                  )}
                  {shown.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="budget-category"
                        checked={categoryId === c.id}
                        onChange={() => {
                          setCategoryId(c.id);
                          setLabel('');
                        }}
                        className="accent-primary"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        )}

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {section === 'REVENUE' ? t('budget.scenarioForm.name') : t('budget.addLine.orName')}
          </span>
          <input
            type="text"
            value={label}
            maxLength={120}
            onChange={(e) => {
              setLabel(e.target.value);
              if (e.target.value) setCategoryId(null);
            }}
            placeholder={t('budget.addLine.namePlaceholder')}
            className="input-field"
          />
        </label>

        {section === 'COGS' && (
          <div role="radiogroup" aria-label={t('budget.addLine.modeShare')} className="inline-flex rounded-xl bg-muted p-1 text-sm">
            {(['share', 'euros'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${mode === m ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {m === 'share' ? t('budget.addLine.modeShare') : t('budget.addLine.modeEuros')}
              </button>
            ))}
          </div>
        )}

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {mode === 'share' ? t('budget.addLine.share') : t('budget.addLine.annualTotal')}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mode === 'share' ? '30' : '12000'}
            className="input-field tabular-nums"
          />
          <span className="block mt-1.5 text-xs text-muted-foreground">
            {mode === 'share'
              ? revenueTotal > 0 && parsePtNumber(amount)
                ? `≈ ${cellMoney((revenueTotal * (parsePtNumber(amount) ?? 0)) / 100)} / ${year}`
                : ''
              : t('budget.addLine.annualHint')}
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className="cta-button">
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t('budget.addLine.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
