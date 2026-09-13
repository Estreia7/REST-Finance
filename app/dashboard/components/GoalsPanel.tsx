'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Target, Loader2, Save } from 'lucide-react';
import { updateRevenueTarget } from '../actions';
import InfoHint from '@/app/components/InfoHint';
import { useLanguage } from '@/lib/language-context';

interface GoalsPanelProps {
  restaurant: any;
  stats: { revenue: number };
  onUpdate: () => void;
}

export default function GoalsPanel({ restaurant, stats, onUpdate }: GoalsPanelProps) {
  const { t } = useLanguage();
  const currentTarget = Number(restaurant?.monthlyRevenueTarget || 0);
  const [target, setTarget] = useState(currentTarget.toString());
  const [saving, setSaving] = useState(false);

  const targetValue = parseFloat(target) || 0;
  const progress = targetValue > 0 ? Math.min(100, (stats.revenue / targetValue) * 100) : 0;

  // Calculate daily pace
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const dailyPace = dayOfMonth > 0 ? stats.revenue / dayOfMonth : 0;
  const projectedMonthly = dailyPace * daysInMonth;
  const dailyNeeded = targetValue > 0 && (daysInMonth - dayOfMonth) > 0
    ? (targetValue - stats.revenue) / (daysInMonth - dayOfMonth)
    : 0;

  const handleSave = async () => {
    setSaving(true);
    const result = await updateRevenueTarget(parseFloat(target) || 0);
    if (result.success) {
      toast.success(t('goals.saved'));
      onUpdate();
    } else {
      toast.error(result.error || t('goals.saveError'));
    }
    setSaving(false);
  };

  const fmt = (n: number) => `€${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Set target */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">{t('goals.title')}</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-2">{t('goals.targetValue')}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
              <input
                type="number" step="100" min="0"
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="input-field pl-8"
                placeholder={t('goals.targetPlaceholder')}
              />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="cta-button h-[46px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('goals.save')}
          </button>
        </div>
      </div>

      {/* Progress */}
      {targetValue > 0 && (
        <div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground">{t('goals.progress')}<InfoHint term="progress" /></h3>
            <span className={`text-2xl font-black ${progress >= 100 ? 'text-green-400' : progress >= 70 ? 'gradient-text' : 'text-amber-400'}`}>
              {progress.toFixed(0)}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-4 rounded-full bg-muted overflow-hidden mb-6">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${progress >= 100 ? 'bg-success' : 'gradient-bg'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted rounded-xl p-4">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {t('goals.currentRevenue')}<InfoHint term="revenue" />
              </div>
              <div className="text-lg font-bold text-foreground">{fmt(stats.revenue)}</div>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {t('goals.target')}<InfoHint term="target" />
              </div>
              <div className="text-lg font-bold text-foreground">{fmt(targetValue)}</div>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {t('goals.remaining')}<InfoHint term="remaining" />
              </div>
              <div className="text-lg font-bold text-foreground">{fmt(Math.max(0, targetValue - stats.revenue))}</div>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {t('goals.projectedMonthly')}<InfoHint term="projectedMonthly" />
              </div>
              <div className={`text-lg font-bold ${projectedMonthly >= targetValue ? 'text-green-400' : 'text-amber-400'}`}>
                {fmt(projectedMonthly)}
              </div>
            </div>
          </div>

          {/* Daily pace */}
          <div className="mt-4 p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {t('goals.dailyPace')}<InfoHint term="dailyPace" />
                </div>
                <div className="text-sm font-bold text-foreground">{fmt(dailyPace)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {t('goals.dailyNeeded')}<InfoHint term="dailyNeeded" />
                </div>
                <div className={`text-sm font-bold ${dailyNeeded <= dailyPace ? 'text-green-400' : 'text-amber-400'}`}>
                  {dailyNeeded > 0 ? fmt(dailyNeeded) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('goals.daysLeft')}</div>
                <div className="text-sm font-bold text-foreground">{daysInMonth - dayOfMonth}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
