'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2, X, Check, Calendar, Download } from 'lucide-react';
import { getRevenueHistory, updateDailySummary, deleteDailySummary } from '../actions';

interface RevenueEntry {
  id: string;
  date: Date;
  dineInRevenue: number;
  takeawayRevenue: number;
  revenueTotal: number;
  dineInTickets: number;
  takeawayTickets: number;
  notes: string | null;
  createdBy: string;
}

export default function RevenueHistoryPanel({ onDataChange }: { onDataChange?: () => void }) {
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RevenueEntry>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Date range: default to current month
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const result = await getRevenueHistory(new Date(dateFrom), new Date(dateTo + 'T23:59:59'));
    if (result.success && result.data) {
      setEntries(result.data as RevenueEntry[]);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleEdit = (entry: RevenueEntry) => {
    setEditingId(entry.id);
    setEditForm({
      dineInRevenue: entry.dineInRevenue,
      takeawayRevenue: entry.takeawayRevenue,
      dineInTickets: entry.dineInTickets,
      takeawayTickets: entry.takeawayTickets,
      notes: entry.notes,
    });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    const result = await updateDailySummary(editingId, {
      dineInRevenue: editForm.dineInRevenue,
      takeawayRevenue: editForm.takeawayRevenue,
      dineInTickets: editForm.dineInTickets,
      takeawayTickets: editForm.takeawayTickets,
      notes: editForm.notes ?? undefined,
    });
    if (result.success) {
      toast.success('Entrada atualizada!');
      setEditingId(null);
      await loadEntries();
      onDataChange?.();
    } else {
      toast.error(result.error || 'Erro ao atualizar');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const result = await deleteDailySummary(id);
    if (result.success) {
      toast.success('Entrada eliminada!');
      await loadEntries();
      onDataChange?.();
    } else {
      toast.error(result.error || 'Erro ao eliminar');
    }
    setDeletingId(null);
  };

  const totals = entries.reduce(
    (acc, e) => ({
      dineIn: acc.dineIn + e.dineInRevenue,
      takeaway: acc.takeaway + e.takeawayRevenue,
      total: acc.total + e.revenueTotal,
      dineInTickets: acc.dineInTickets + e.dineInTickets,
      takeawayTickets: acc.takeawayTickets + e.takeawayTickets,
    }),
    { dineIn: 0, takeaway: 0, total: 0, dineInTickets: 0, takeawayTickets: 0 }
  );

  const fmt = (n: number) => `€${n.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });

  return (
    <div className="card-glass p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-foreground">Historial de Receita</h2>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field !py-1.5 !text-xs w-[130px]" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field !py-1.5 !text-xs w-[130px]" />
          <a href={`/api/export/csv?type=revenue&from=${dateFrom}&to=${dateTo}`} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Exportar CSV">
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Sem entradas para este período.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 text-xs font-medium text-muted-foreground">Data</th>
                <th className="text-right py-3 text-xs font-medium text-muted-foreground">Local</th>
                <th className="text-right py-3 text-xs font-medium text-muted-foreground">Takeaway</th>
                <th className="text-right py-3 text-xs font-medium text-muted-foreground">Total</th>
                <th className="text-right py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Tickets</th>
                <th className="text-right py-3 text-xs font-medium text-muted-foreground w-24"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-border-subtle hover:bg-muted transition-colors">
                  {editingId === entry.id ? (
                    <>
                      <td className="py-3 text-foreground font-medium">{fmtDate(entry.date)}</td>
                      <td className="py-3 text-right">
                        <input type="number" step="0.01" value={editForm.dineInRevenue ?? ''} onChange={e => setEditForm({ ...editForm, dineInRevenue: parseFloat(e.target.value) || 0 })} className="input-field !py-1 !text-xs !text-right w-24 ml-auto" />
                      </td>
                      <td className="py-3 text-right">
                        <input type="number" step="0.01" value={editForm.takeawayRevenue ?? ''} onChange={e => setEditForm({ ...editForm, takeawayRevenue: parseFloat(e.target.value) || 0 })} className="input-field !py-1 !text-xs !text-right w-24 ml-auto" />
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">
                        {fmt((editForm.dineInRevenue || 0) + (editForm.takeawayRevenue || 0))}
                      </td>
                      <td className="py-3 text-right hidden sm:table-cell">
                        <div className="flex gap-1 justify-end">
                          <input type="number" value={editForm.dineInTickets ?? ''} onChange={e => setEditForm({ ...editForm, dineInTickets: parseInt(e.target.value) || 0 })} className="input-field !py-1 !text-xs !text-right w-16" />
                          <input type="number" value={editForm.takeawayTickets ?? ''} onChange={e => setEditForm({ ...editForm, takeawayTickets: parseInt(e.target.value) || 0 })} className="input-field !py-1 !text-xs !text-right w-16" />
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={handleSave} disabled={saving} className="p-1.5 rounded-lg bg-success/20 text-green-400 hover:bg-success/30 transition-colors">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 text-foreground font-medium">{fmtDate(entry.date)}</td>
                      <td className="py-3 text-right text-muted-foreground">{fmt(entry.dineInRevenue)}</td>
                      <td className="py-3 text-right text-muted-foreground">{fmt(entry.takeawayRevenue)}</td>
                      <td className="py-3 text-right font-semibold text-foreground">{fmt(entry.revenueTotal)}</td>
                      <td className="py-3 text-right text-muted-foreground hidden sm:table-cell">
                        {entry.dineInTickets + entry.takeawayTickets}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => handleEdit(entry)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-red-400 transition-colors">
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
                <td className="py-3 text-xs font-bold text-foreground">Total</td>
                <td className="py-3 text-right text-xs font-bold text-foreground">{fmt(totals.dineIn)}</td>
                <td className="py-3 text-right text-xs font-bold text-foreground">{fmt(totals.takeaway)}</td>
                <td className="py-3 text-right text-xs font-bold gradient-text">{fmt(totals.total)}</td>
                <td className="py-3 text-right text-xs font-bold text-foreground hidden sm:table-cell">
                  {totals.dineInTickets + totals.takeawayTickets}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
