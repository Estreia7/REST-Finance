'use client';

import { Save, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

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
}

interface QuickEntryPanelProps {
  activeTab:         'revenue' | 'costs';
  revenueForm:       RevenueForm;
  costForm:          CostForm;
  categories:        Category[];
  isSubmitting:      boolean;
  onRevenueChange:   (form: RevenueForm) => void;
  onCostChange:      (form: CostForm) => void;
  onSubmitRevenue:   (e: React.FormEvent) => void;
  onSubmitCost:      (e: React.FormEvent) => void;
}

const today = new Date().toISOString().split('T')[0];

export default function QuickEntryPanel({
  activeTab, revenueForm, costForm, categories, isSubmitting,
  onRevenueChange, onCostChange, onSubmitRevenue, onSubmitCost,
}: QuickEntryPanelProps) {
  const { t } = useLanguage();
  const filteredCategories = (categories ?? []).filter(c => c.type === costForm.type);

  const inputClass = 'input-field';

  if (activeTab === 'revenue') {
    const isToday = revenueForm.date === today;
    return (
      <div className="max-w-2xl">
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
              <label className="text-xs font-medium text-muted-foreground block mb-2">{t('owner.costForm.category')}</label>
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
