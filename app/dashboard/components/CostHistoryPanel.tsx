'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2, X, Check, Calendar, Filter, Download } from 'lucide-react';
import { getCostHistory, updateCostEntry, deleteCostEntry, getCategories } from '../actions';
import { useLanguage } from '@/lib/language-context';

interface CostEntry {
  id: string;
  date: Date;
  type: string;
  categoryName: string;
  categoryType: string;
  amount: number;
  description: string | null;
  createdBy: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function CostHistoryPanel({ onDataChange }: { onDataChange?: () => void }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ amount: number; description: string }>({ amount: 0, description: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<'' | 'COGS' | 'OPEX'>('');

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const result = await getCostHistory(
      new Date(dateFrom),
      new Date(dateTo + 'T23:59:59'),
      filterType || undefined
    );
    if (result.success && result.data) {
      setEntries(result.data as CostEntry[]);
    }
    setLoading(false);
  }, [dateFrom, dateTo, filterType]);

  useEffect(() => {
    loadEntries();
    getCategories().then(r => {
      if (r.success && r.data) setCategories(r.data as unknown as Category[]);
    });
  }, [loadEntries]);

  const handleEdit = (entry: CostEntry) => {
    setEditingId(entry.id);
    setEditForm({ amount: entry.amount, description: entry.description || '' });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    const result = await updateCostEntry(editingId, {
      amount: editForm.amount,
      description: editForm.description,
    });
    if (result.success) {
      toast.success(t('costHistory.toast.updated'));
      setEditingId(null);
      await loadEntries();
      onDataChange?.();
    } else {
      toast.error(result.error || t('costHistory.toast.updateFailed'));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const result = await deleteCostEntry(id);
    if (result.success) {
      toast.success(t('costHistory.toast.deleted'));
      await loadEntries();
      onDataChange?.();
    } else {
      toast.error(result.error || t('costHistory.toast.deleteFailed'));
    }
    setDeletingId(null);
  };

  // Category breakdown
  const cogsTotal = entries.filter(e => e.type === 'COGS').reduce((s, e) => s + e.amount, 0);
  const opexTotal = entries.filter(e => e.type === 'OPEX').reduce((s, e) => s + e.amount, 0);
  const grandTotal = cogsTotal + opexTotal;

  const fmt = (n: number) => `€${n.toLocaleString(locale, { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">COGS</div>
          <div className="text-lg font-bold text-foreground">{fmt(cogsTotal)}</div>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">OPEX</div>
          <div className="text-lg font-bold text-foreground">{fmt(opexTotal)}</div>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {t('costHistory.total')}
          </div>
          <div className="text-lg font-bold gradient-text">{fmt(grandTotal)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card-glass p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold text-foreground">{t('costHistory.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={filterType} onChange={e => setFilterType(e.target.value as any)} aria-label={t('costHistory.filterLabel')} className="input-field !py-1.5 !text-xs w-[100px]">
                <option value="">{t('costHistory.filterAll')}</option>
                <option value="COGS">COGS</option>
                <option value="OPEX">OPEX</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label={t('costHistory.dateFrom')} className="input-field !py-1.5 !text-xs w-[130px]" />
              <span className="text-muted-foreground text-xs">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label={t('costHistory.dateTo')} className="input-field !py-1.5 !text-xs w-[130px]" />
              <a href={`/api/export/csv?type=costs&from=${dateFrom}&to=${dateTo}`} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={t('costHistory.exportCsv')} aria-label={t('costHistory.exportCsv')}>
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {t('costHistory.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-3 text-xs font-medium text-muted-foreground">{t('costHistory.col.date')}</th>
                  <th className="text-left py-3 text-xs font-medium text-muted-foreground">{t('costHistory.col.type')}</th>
                  <th className="text-left py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('costHistory.col.category')}</th>
                  <th className="text-left py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('costHistory.col.description')}</th>
                  <th className="text-right py-3 text-xs font-medium text-muted-foreground">{t('costHistory.col.amount')}</th>
                  <th className="text-right py-3 text-xs font-medium text-muted-foreground w-24"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-border-subtle hover:bg-muted transition-colors">
                    {editingId === entry.id ? (
                      <>
                        <td className="py-3 text-foreground font-medium">{fmtDate(entry.date)}</td>
                        <td className="py-3">
                          <span className={`badge ${entry.type === 'COGS' ? 'badge-warning' : 'badge-info'}`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground hidden sm:table-cell">{entry.categoryName}</td>
                        <td className="py-3 hidden md:table-cell">
                          <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} aria-label={t('costHistory.col.description')} className="input-field !py-1 !text-xs w-full" />
                        </td>
                        <td className="py-3 text-right">
                          <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })} aria-label={t('costHistory.col.amount')} className="input-field !py-1 !text-xs !text-right w-24 ml-auto" />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={handleSave} disabled={saving} aria-label={t('costHistory.action.save')} className="p-1.5 rounded-lg bg-success/20 text-green-400 hover:bg-success/30 transition-colors">
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setEditingId(null)} aria-label={t('costHistory.action.cancel')} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 text-foreground font-medium">{fmtDate(entry.date)}</td>
                        <td className="py-3">
                          <span className={`badge ${entry.type === 'COGS' ? 'badge-warning' : 'badge-info'}`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground hidden sm:table-cell">{entry.categoryName}</td>
                        <td className="py-3 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[200px]">{entry.description || '—'}</td>
                        <td className="py-3 text-right font-semibold text-foreground">{fmt(entry.amount)}</td>
                        <td className="py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleEdit(entry)} aria-label={t('costHistory.action.edit')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} aria-label={t('costHistory.action.delete')} className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-red-400 transition-colors">
                              {deletingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={4} className="py-3 text-xs font-bold text-foreground">
                    {t('costHistory.total')} ({entries.length} {t('costHistory.entries')})
                  </td>
                  <td className="py-3 text-right text-xs font-bold gradient-text">{fmt(grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
