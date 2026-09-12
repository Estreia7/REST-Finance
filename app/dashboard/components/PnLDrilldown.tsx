'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { getPnLEntries } from '../pnl-actions';
import { formatMoneyExact } from '@/lib/format';

type Entry = {
  id: string;
  date: Date;
  amount: number;
  detail: string;
  tickets: number | null;
  notes: string | null;
};

export type DrillTarget = {
  year: number;
  /** 1-12, or 0 for the whole year. */
  month: number;
  kind: 'revenue' | 'cogs' | 'opex';
  categoryId?: string;
  channel?: 'total' | 'dineIn' | 'takeaway';
  /** What was clicked, so the dialog can name it. */
  label: string;
  expected: number;
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * The entries behind one figure on the statement.
 *
 * Every number here is a sum of things somebody typed, and a wrong month is
 * traced by finding the day it was mistyped. The dialog also re-adds what it
 * lists and flags a mismatch, so a figure that does not reconcile says so
 * rather than being quietly trusted.
 */
export default function PnLDrilldown({
  target,
  onClose,
}: {
  target: DrillTarget | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!target) return;

    setLoading(true);
    setError('');

    getPnLEntries({
      year: target.year,
      month: target.month,
      kind: target.kind,
      categoryId: target.categoryId,
      channel: target.channel,
    }).then((result) => {
      if ('data' in result && result.data) setEntries(result.data.entries as Entry[]);
      else if ('error' in result) setError(result.error);
      setLoading(false);
    });
  }, [target]);

  // Escape closes, and focus moves into the dialog so a keyboard user is not
  // left behind on the page underneath.
  useEffect(() => {
    if (!target) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  const listed = entries.reduce((sum, e) => sum + e.amount, 0);
  // Rounding across many rows can differ by a cent; anything larger means the
  // figure and its entries genuinely disagree.
  const reconciles = Math.abs(listed - target.expected) < 0.05;

  const period = target.month === 0 ? `${target.year}` : `${MONTHS[target.month - 1]} ${target.year}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-modal"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border-subtle">
          <div className="min-w-0">
            <h2 id="drill-title" className="font-semibold text-foreground truncate">
              {target.label}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {period} · {entries.length} lançamento{entries.length === 1 ? '' : 's'}
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-3 p-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              A carregar lançamentos...
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-danger">{error}</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Não há lançamentos neste período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-xs text-muted-foreground border-b border-border-subtle">
                  <th scope="col" className="text-left font-medium px-5 py-2">Data</th>
                  <th scope="col" className="text-left font-medium px-2 py-2">Detalhe</th>
                  <th scope="col" className="text-right font-medium px-5 py-2">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-2.5 align-top whitespace-nowrap figure text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </td>
                    <td className="px-2 py-2.5 align-top text-foreground">
                      <span className="block">{entry.detail || '—'}</span>
                      {entry.tickets !== null && entry.tickets > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {entry.tickets} clientes
                        </span>
                      )}
                      {entry.notes && (
                        <span className="block text-xs text-muted-foreground">{entry.notes}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 align-top text-right figure text-foreground whitespace-nowrap">
                      {formatMoneyExact(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && entries.length > 0 && (
          <div className="border-t border-border p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-foreground">Soma dos lançamentos</span>
              <span className="figure font-semibold text-foreground">
                {formatMoneyExact(listed)}
              </span>
            </div>

            {!reconciles && (
              <p className="mt-2 text-xs text-warning">
                Difere do valor apresentado ({formatMoneyExact(target.expected)}). Pode haver
                lançamentos eliminados neste período.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
