'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ClipboardList, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { getAuditLogs } from '../actions';

interface LogEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actor?: { name: string | null; email: string } | null;
  restaurant?: { name: string } | null;
}

export default function ActivityLogPanel() {
  const { t, language } = useLanguage();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getAuditLogs({ limit: 100 });
    if (result.success && result.data) setLogs(result.data as LogEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  /**
   * Audit actions are stored identifiers such as `admin.cost.delete`. The ones
   * we know about read as a sentence; anything we do not recognise is shown
   * verbatim rather than hidden, so a newly added action still appears in the
   * log instead of vanishing from it.
   */
  const actionLabel = (action: string) => {
    const key = `admin.auditAction.${action.replace(/\./g, '_')}`;
    const translated = t(key);
    return translated === key ? action : translated;
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">{t('admin.activity.title')}</h2>
        <button
          onClick={load}
          aria-label={t('admin.activity.refresh')}
          title={t('admin.activity.refresh')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('admin.activity.empty')}</p>
        </div>
      ) : (
        <div className="card-glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.activity.colDate')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.activity.colUser')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('admin.activity.colRestaurant')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.activity.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-border-subtle hover:bg-muted">
                  <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                  <td className="py-2 px-4 text-xs text-foreground">{log.actor?.name || log.actor?.email || '—'}</td>
                  <td className="py-2 px-4 text-xs text-muted-foreground hidden md:table-cell">{log.restaurant?.name || '—'}</td>
                  <td className="py-2 px-4 text-xs text-foreground font-medium">{actionLabel(log.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
