'use client';

import { useState } from 'react';
import { Save, Loader2, Plus, X, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { createCategory } from '../category-actions';
import { useLanguage } from '@/lib/language-context';
import { endDateFor } from '@/lib/recurring-costs';
import { formatMoney } from '@/lib/format';

type CostType = 'COGS' | 'OPEX';
type CostTypeOrEmpty = CostType | '';

interface Category {
  id: string;
  name: string;
  type: 'REVENUE' | 'COGS' | 'OPEX';
}

interface RevenueForm {
  date: string;
  dineInRevenue: string;
  takeawayRevenue: string;
  dineInTickets: string;
  takeawayTickets: string;
  notes: string;
}

interface CostForm {
  date: string;
  type: CostTypeOrEmpty;
  categoryId: string;
  amount: string;
  description: string;
  /** Book this cost every month as well: rent, internet, a contract. */
  recurring: boolean;
  /** Day of the month, 1–31. Empty follows the date. */
  dayOfMonth: string;
  /** How many months, counting this one. Empty runs until stopped. */
  months: string;
}

interface QuickEntryPanelProps {
  activeTab:         'revenue' | 'costs';
  revenueForm:       RevenueForm;
  costForm:          CostForm;
  categories:        Category[];
  /** Called after a category is added, so the parent can reload the list. */
  onCategoryCreated?: () => void;
  isSubmitting:      boolean;
  onRevenueChange:   (form: RevenueForm) => void;
  onCostChange:      (form: CostForm) => void;
  onSubmitRevenue:   (e: React.FormEvent) => void;
  onSubmitCost:      (e: React.FormEvent) => void;
}

const today = new Date().toISOString().split('T')[0];

export default function QuickEntryPanel({
  activeTab, revenueForm, costForm, categories, isSubmitting,
  onRevenueChange, onCostChange, onSubmitRevenue, onSubmitCost, onCategoryCreated,
}: QuickEntryPanelProps) {
  const { t, language } = useLanguage();
  const filteredCategories = (categories ?? []).filter(c => c.type === costForm.type);

  // Adding a category without leaving the entry form: a cost that does not
  // fit an existing category otherwise means abandoning what was typed.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2 || !costForm.type) return;

    setSavingCategory(true);
    const result = await createCategory({ name, type: costForm.type as CostType });
    setSavingCategory(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    // Select it straight away, which is why it was created.
    if (result.data) {
      onCostChange({ ...costForm, categoryId: result.data.id });
      onCategoryCreated?.();
    }

    setCreatingCategory(false);
    setNewCategoryName('');
    toast.success(t('owner.costForm.categoryCreated'));
  };

  const inputClass = 'input-field';

  if (activeTab === 'revenue') {
    const isToday = revenueForm.date === today;
    return (
      // Anchors the walkthrough's "this is the daily habit" step. See lib/tour.ts.
      <div className="max-w-2xl" data-tour="quick-entry">
        <div className="card-glass p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">{t('owner.registerRevenue')}</h2>
            {isToday && (
              <span className="badge badge-success">Hoje</span>
            )}
          </div>
          <form onSubmit={onSubmitRevenue} className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.date')}</label>
              <input
                type="date"
                value={revenueForm.date}
                onChange={e => onRevenueChange({ ...revenueForm, date: e.target.value })}
                className={inputClass}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.dineInRevenue')}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={revenueForm.dineInRevenue}
                    onChange={e => onRevenueChange({ ...revenueForm, dineInRevenue: e.target.value })}
                    className={`${inputClass} pl-8`}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.takeawayRevenue')}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={revenueForm.takeawayRevenue}
                    onChange={e => onRevenueChange({ ...revenueForm, takeawayRevenue: e.target.value })}
                    className={`${inputClass} pl-8`}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.dineInTickets')}</label>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={revenueForm.dineInTickets}
                  onChange={e => onRevenueChange({ ...revenueForm, dineInTickets: e.target.value })}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.takeawayTickets')}</label>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={revenueForm.takeawayTickets}
                  onChange={e => onRevenueChange({ ...revenueForm, takeawayTickets: e.target.value })}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.revenueForm.notes')}</label>
              <textarea
                value={revenueForm.notes}
                onChange={e => onRevenueChange({ ...revenueForm, notes: e.target.value })}
                className={inputClass}
                rows={3}
                placeholder={t('owner.revenueForm.notesPlaceholder')}
              />
            </div>

            <button type="submit" disabled={isSubmitting} className="cta-button w-full justify-center mt-2">
              {isSubmitting
                ? <><Loader2 className="w-4 h-4 animate-spin" />{t('owner.revenueForm.registering')}</>
                : <><Save className="w-4 h-4" />{t('owner.revenueForm.register')}</>
              }
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Costs tab
  return (
    <div className="max-w-2xl">
      <div className="card-glass p-6 md:p-8">
        <h2 className="text-xl font-bold text-foreground mb-6">{t('owner.registerCost')}</h2>
        <form onSubmit={onSubmitCost} className="space-y-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.costForm.date')}</label>
            <input
              type="date"
              value={costForm.date}
              onChange={e => onCostChange({ ...costForm, date: e.target.value })}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.costForm.costType')}</label>
            <select
              value={costForm.type}
              onChange={e => onCostChange({ ...costForm, type: e.target.value as CostTypeOrEmpty, categoryId: '' })}
              className={inputClass}
              required
            >
              <option value="">{t('owner.costForm.selectType')}</option>
              <option value="COGS">{t('owner.costForm.cogs')}</option>
              <option value="OPEX">{t('owner.costForm.opex')}</option>
            </select>
          </div>

          {costForm.type && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">{t('owner.costForm.category')}</label>
                <button
                  type="button"
                  onClick={() => setCreatingCategory(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  {t('owner.costForm.newCategory')}
                </button>
              </div>

              {creatingCategory ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); }
                      if (e.key === 'Escape') { setCreatingCategory(false); setNewCategoryName(''); }
                    }}
                    placeholder={t('owner.costForm.newCategoryPlaceholder')}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={savingCategory || newCategoryName.trim().length < 2}
                    className="cta-button shrink-0 px-4 py-2 text-xs disabled:opacity-50"
                  >
                    {savingCategory ? '...' : t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}
                    className="shrink-0 p-2 text-muted-foreground hover:text-foreground"
                    aria-label={t('common.cancel')}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <select
                  value={costForm.categoryId}
                  onChange={e => onCostChange({ ...costForm, categoryId: e.target.value })}
                  className={inputClass}
                  required
                >
                  <option value="">{t('owner.costForm.selectCategory')}</option>
                  {filteredCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.costForm.amount')}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={costForm.amount}
                onChange={e => onCostChange({ ...costForm, amount: e.target.value })}
                className={`${inputClass} pl-8`}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.costForm.description')}</label>
            <textarea
              value={costForm.description}
              onChange={e => onCostChange({ ...costForm, description: e.target.value })}
              className={inputClass}
              rows={3}
            />
          </div>

          <RecurringFields costForm={costForm} onCostChange={onCostChange} language={language} />

          <button type="submit" disabled={isSubmitting} className="cta-button w-full justify-center mt-2">
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" />{t('owner.costForm.registering')}</>
              : <><Save className="w-4 h-4" />{t('owner.costForm.register')}</>
            }
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * "Repeats every month": the cost being entered becomes the first of a fixed
 * monthly cost — rent, internet, a 12-month contract — and the app books the
 * rest on the chosen day.
 *
 * Closes with one sentence saying exactly what will happen, because a repeat
 * set up wrong books a wrong cost every month until someone notices.
 */
function RecurringFields({
  costForm, onCostChange, language,
}: {
  costForm: CostForm;
  onCostChange: (form: CostForm) => void;
  language: 'pt' | 'en';
}) {
  const { t } = useLanguage();
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(costForm.date);
  const dateDay = dateValid ? Number(costForm.date.slice(8, 10)) : 1;
  const day = Math.min(31, Math.max(1, parseInt(costForm.dayOfMonth, 10) || dateDay));
  const months = costForm.months.trim() ? Math.max(1, parseInt(costForm.months, 10) || 1) : null;
  const amount = parseFloat(costForm.amount) || 0;

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const monthName = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const end = dateValid && months ? endDateFor(costForm.date, day, months) : null;
  // Months between the first date and today are booked at once.
  const today = new Date().toISOString().slice(0, 10);
  const catchesUp = dateValid && costForm.date.slice(0, 7) < today.slice(0, 7);

  const set = (patch: Partial<CostForm>) => onCostChange({ ...costForm, ...patch });

  return (
    <div className={`rounded-xl border p-4 transition-colors ${costForm.recurring ? 'border-primary' : 'border-border'}`}>
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={costForm.recurring}
          onChange={(e) => set({ recurring: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-[hsl(var(--primary))]"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Repeat className="w-3.5 h-3.5 text-primary-ink" aria-hidden="true" />
            {t('recurring.checkbox')}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">{t('recurring.checkboxHint')}</span>
        </span>
      </label>

      {costForm.recurring && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-2">{t('recurring.dayOfMonth')}</span>
              <input
                type="number" min={1} max={31} inputMode="numeric"
                value={costForm.dayOfMonth}
                placeholder={String(dateDay)}
                onChange={(e) => set({ dayOfMonth: e.target.value })}
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-2">{t('recurring.months')}</span>
              <input
                type="number" min={1} max={120} inputMode="numeric"
                value={costForm.months}
                placeholder={t('recurring.noEnd')}
                onChange={(e) => set({ months: e.target.value })}
                className="input-field"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: t('recurring.months12'), value: '12' },
              { label: t('recurring.months24'), value: '24' },
              { label: t('recurring.noEnd'), value: '' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => set({ months: chip.value })}
                aria-pressed={costForm.months === chip.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${costForm.months === chip.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {dateValid && (
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{amount > 0 ? formatMoney(amount, { decimals: 2 }) : '—'}</strong>{' '}
              {t('recurring.summaryOnDay')} <strong className="text-foreground">{day}</strong>{' '}
              {t('recurring.summaryEachMonth')} {monthName(costForm.date)}
              {end
                ? <> {t('recurring.summaryUntil')} {monthName(end)} ({months} {months === 1 ? t('recurring.month') : t('recurring.monthsUnit')}).</>
                : <>{t('recurring.summaryNoEnd')}</>}
              {catchesUp && <> {t('recurring.summaryCatchUp')}</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
