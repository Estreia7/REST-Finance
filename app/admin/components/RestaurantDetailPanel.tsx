'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Calendar, Pencil, Trash2, Check, X, Users, DollarSign, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getRestaurantDetail, getRestaurantRevenue, getRestaurantCosts, adminUpdateEntry, adminDeleteEntry, updateClient } from '../actions';

interface RestaurantDetailPanelProps {
  restaurantId: string;
  onBack: () => void;
}

export default function RestaurantDetailPanel({ restaurantId, onBack }: RestaurantDetailPanelProps) {
  const { t, language } = useLanguage();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'revenue' | 'costs'>('overview');
  const [entries, setEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editTrial, setEditTrial] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const result = await getRestaurantDetail(restaurantId);
    if (result.success && result.data) {
      setDetail(result.data);
      setEditName(result.data.name);
      setEditPlan(result.data.plan);
      setEditTrial(result.data.trialEndsAt ? new Date(result.data.trialEndsAt).toISOString().split('T')[0] : '');
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    if (tab === 'revenue') {
      const r = await getRestaurantRevenue(restaurantId, new Date(dateFrom), new Date(dateTo + 'T23:59:59'));
      if (r.success && r.data) setEntries(r.data);
    } else if (tab === 'costs') {
      const r = await getRestaurantCosts(restaurantId, new Date(dateFrom), new Date(dateTo + 'T23:59:59'));
      if (r.success && r.data) setEntries(r.data);
    }
    setEntriesLoading(false);
  }, [restaurantId, tab, dateFrom, dateTo]);

  useEffect(() => {
    if (tab !== 'overview') loadEntries();
  }, [tab, loadEntries]);

  const handleSaveDetail = async () => {
    setSavingDetail(true);
    const result = await updateClient({
      restaurantId,
      name: editName,
      plan: editPlan as any,
      trialEndsAt: editTrial ? new Date(editTrial) : null,
    });
    if (result.success) { toast.success(t('admin.detail.saved')); await loadDetail(); }
    else toast.error(translateError(language, result.error));
    setSavingDetail(false);
  };

  const handleEditEntry = async (type: 'revenue' | 'cost', id: string) => {
    setSaving(true);
    const data = type === 'revenue'
      ? { dineInRevenue: editAmount, takeawayRevenue: 0 }
      : { amount: editAmount };
    const result = await adminUpdateEntry(type, id, data);
    if (result.success) { toast.success(t('admin.detail.entryUpdated')); setEditingId(null); await loadEntries(); }
    else toast.error(translateError(language, result.error));
    setSaving(false);
  };

  const handleDeleteEntry = async (type: 'revenue' | 'cost', id: string) => {
    if (!confirm(t('admin.detail.confirmDeleteEntry'))) return;
    const result = await adminDeleteEntry(type, id);
    if (result.success) { toast.success(t('admin.detail.entryDeleted')); await loadEntries(); }
    else toast.error(translateError(language, result.error));
  };

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const fmt = (n: number) => `€${n.toLocaleString(locale, { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString(locale);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!detail) return <div className="text-center py-16 text-muted-foreground">{t('admin.detail.notFound')}</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label={t('admin.detail.back')}
          title={t('admin.detail.back')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <h2 className="text-xl font-bold text-foreground">{detail.name}</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle">
        {/* Renamed from `t` so it no longer shadows the translation function. */}
        {(['overview', 'revenue', 'costs'] as const).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === tabKey ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {tabKey === 'overview'
              ? t('admin.detail.tabOverview')
              : tabKey === 'revenue'
                ? t('admin.detail.tabRevenue')
                : t('admin.detail.tabCosts')}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card-glass p-4 text-center">
              <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" aria-hidden="true" />
              <div className="text-lg font-bold text-foreground">{fmt(detail.currentMonthRevenue)}</div>
              <div className="text-[10px] text-muted-foreground">{t('admin.detail.revenueThisMonth')}</div>
            </div>
            <div className="card-glass p-4 text-center">
              <DollarSign className="w-4 h-4 text-red-400 mx-auto mb-1" aria-hidden="true" />
              <div className="text-lg font-bold text-foreground">{fmt(detail.currentMonthCosts)}</div>
              <div className="text-[10px] text-muted-foreground">{t('admin.detail.costsThisMonth')}</div>
            </div>
            <div className="card-glass p-4 text-center">
              <Users className="w-4 h-4 text-muted-foreground mx-auto mb-1" aria-hidden="true" />
              <div className="text-lg font-bold text-foreground">{detail.memberships?.length || 0}</div>
              <div className="text-[10px] text-muted-foreground">{t('admin.detail.members')}</div>
            </div>
          </div>

          {/* Edit restaurant */}
          <div className="card-glass p-6">
            <h3 className="text-sm font-bold text-foreground mb-4">{t('admin.detail.editTitle')}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="rd-name" className="text-xs text-muted-foreground block mb-1">{t('admin.detail.fieldName')}</label>
                <input id="rd-name" type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rd-plan" className="text-xs text-muted-foreground block mb-1">{t('admin.detail.fieldPlan')}</label>
                  <select id="rd-plan" value={editPlan} onChange={e => setEditPlan(e.target.value)} className="input-field">
                    <option value="TRIAL">{t('admin.plan.TRIAL')}</option>
                    <option value="MONTHLY">{t('admin.plan.MONTHLY')}</option>
                    <option value="YEARLY">{t('admin.plan.YEARLY')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rd-trial" className="text-xs text-muted-foreground block mb-1">{t('admin.detail.fieldTrialUntil')}</label>
                  <input id="rd-trial" type="date" value={editTrial} onChange={e => setEditTrial(e.target.value)} className="input-field" />
                </div>
              </div>
              <button onClick={handleSaveDetail} disabled={savingDetail} className="cta-button py-2 px-4 text-sm">
                {savingDetail ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : t('admin.detail.save')}
              </button>
            </div>
          </div>

          {/* Staff list */}
          <div className="card-glass p-6">
            <h3 className="text-sm font-bold text-foreground mb-4">{t('admin.detail.membersTitle')} ({detail.memberships?.length || 0})</h3>
            <div className="space-y-2">
              {detail.memberships?.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-border-subtle">
                  <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{(m.user.name || m.user.email)[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-foreground">{m.user.name || '—'}</div>
                    <div className="text-[10px] text-muted-foreground">{m.user.email}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(tab === 'revenue' || tab === 'costs') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label={t('admin.detail.dateFrom')} className="input-field !py-1.5 !text-xs w-[130px]" />
            <span className="text-muted-foreground text-xs" aria-hidden="true">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label={t('admin.detail.dateTo')} className="input-field !py-1.5 !text-xs w-[130px]" />
          </div>

          {entriesLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">{t('admin.detail.noEntries')}</div>
          ) : (
            <div className="card-glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.detail.colDate')}</th>
                    {tab === 'costs' && <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.detail.colType')}</th>}
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.detail.colAmount')}</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => (
                    <tr key={e.id} className="border-b border-border-subtle hover:bg-muted">
                      <td className="py-2 px-4 text-foreground text-xs">{fmtDate(e.date)}</td>
                      {tab === 'costs' && <td className="py-2 px-4 text-muted-foreground text-xs">{e.type} — {e.categoryName}</td>}
                      <td className="py-2 px-4 text-right font-semibold text-foreground text-xs">
                        {fmt(tab === 'revenue' ? e.revenueTotal : e.amount)}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleDeleteEntry(tab === 'revenue' ? 'revenue' : 'cost', e.id)}
                            aria-label={t('admin.detail.deleteEntry')}
                            title={t('admin.detail.deleteEntry')}
                            className="p-1 rounded hover:bg-danger/10 text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
