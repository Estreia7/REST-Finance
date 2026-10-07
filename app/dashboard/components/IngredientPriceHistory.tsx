'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2, Receipt, TrendingUp, TrendingDown } from 'lucide-react';
import { getIngredientPriceHistory } from '../accounting-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

/**
 * What this ingredient has cost, invoice by invoice.
 *
 * A current price with no history behind it is a number the owner has to
 * take on trust. The same number with four dates under it answers the
 * question they actually have — is this going up, and since when.
 *
 * Collapsed by default. Someone opening an ingredient usually came to change
 * its waste percentage, not to audit it; the history is there when it is
 * wanted and out of the way when it is not.
 *
 * Each row names the invoice it came from, so the figure can be checked
 * against the paperwork rather than believed.
 */

interface Entry {
  id: string;
  productName: string;
  unitPrice: number;
  unit: string | null;
  quantity: number;
  date: string | null;
  invoiceNumber: string | null;
  vendorName: string | null;
}

export default function IngredientPriceHistory({
  ingredientId,
  unit,
  onOpenInvoice,
}: {
  ingredientId: string;
  /** The ingredient's own purchase unit, for rows whose invoice omitted one. */
  unit: string;
  /** Opens the paperwork a figure came from. */
  onOpenInvoice?: (invoiceNumber: string) => void;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const load = useCallback(() => {
    getIngredientPriceHistory(ingredientId).then((result) => {
      setEntries('data' in result && result.data ? result.data.entries : []);
    });
  }, [ingredientId]);

  // Fetched when opened, not before: a dialog that loads a history nobody
  // asked for is a query per ingredient edited.
  useEffect(() => {
    if (open && entries === null) load();
  }, [open, entries, load]);

  return (
    <div className="border-t border-border-subtle pt-3 mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 py-1 text-left
                   text-xs font-semibold text-muted-foreground hover:text-foreground
                   transition-colors focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-ring rounded"
      >
        <span>{t('menuCalc.priceHistory')}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-2">
          {entries === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              {t('menuCalc.priceHistoryEmpty')}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {entries.map((entry, i) => {
                // Against the entry before it in time, which is the one
                // below in a list ordered newest first.
                const previous = entries[i + 1];
                const change = previous && previous.unitPrice > 0
                  ? ((entry.unitPrice - previous.unitPrice) / previous.unitPrice) * 100
                  : null;

                const openable = Boolean(entry.invoiceNumber && onOpenInvoice);
                const Row = openable ? 'button' : 'div';

                return (
                  <li key={entry.id}>
                    <Row
                      {...(openable
                        ? {
                            type: 'button' as const,
                            onClick: () => onOpenInvoice!(entry.invoiceNumber!),
                          }
                        : {})}
                      className={`w-full flex items-center justify-between gap-3 py-2 text-left ${
                        openable
                          ? 'hover:bg-muted/50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                          : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-foreground tabular-nums">
                          {entry.date
                            ? new Date(entry.date).toLocaleDateString(locale)
                            : '—'}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {entry.vendorName ?? '—'}
                          {entry.invoiceNumber && (
                            <>
                              {' · '}
                              <Receipt className="w-3 h-3 inline -mt-0.5" aria-hidden="true" />
                              {' '}{entry.invoiceNumber}
                            </>
                          )}
                        </span>
                      </span>

                      <span className="flex items-baseline gap-2 shrink-0">
                        {/* Against the purchase before it, which is the thing
                            an owner wants to know and never has to hand. */}
                        {change !== null && Math.abs(change) >= 0.5 && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                              change > 0 ? 'text-danger' : 'text-success'
                            }`}
                          >
                            {change > 0
                              ? <TrendingUp className="w-3 h-3" aria-hidden="true" />
                              : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                            {Math.abs(change).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {formatMoney(entry.unitPrice, { decimals: 2 })}
                          <span className="text-muted-foreground">/{entry.unit || unit}</span>
                        </span>
                      </span>
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
