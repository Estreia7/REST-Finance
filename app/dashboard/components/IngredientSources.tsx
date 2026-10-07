'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Link2, Check, Search, X } from 'lucide-react';
import {
  getInvoiceSources,
  linkInvoiceSource,
  unlinkInvoiceSource,
} from '../accounting-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoneyExact } from '@/lib/format';

/**
 * Which lines on a supplier's invoice are this ingredient.
 *
 * The automatic match works on the name, and a kitchen's word for a thing is
 * rarely the supplier's: the owner writes "Piano Carne" and the invoice says
 * "Carne Picada Novilho". Those never meet on their own, so the ingredient
 * waits forever for a price that is already in the system — which is exactly
 * what the owner found.
 *
 * So the names are listed, and he says which are his. Linking prices the
 * ingredient immediately from the newest invoice carrying that wording,
 * because the point of saying so is to see the price appear.
 *
 * Several wordings can feed one ingredient — two suppliers, or the same
 * supplier changing how it prints — and one wording can feed several
 * ingredients, since minced beef is both the Carne Smash and the Extra Carne.
 */

interface Source {
  productName: string;
  vendorId: string | null;
  vendorName: string | null;
  unitPrice: number;
  unit: string | null;
  date: string | null;
  linkedTo: string[];
}

export default function IngredientSources({
  ingredientId,
  ingredientName,
  onChanged,
}: {
  ingredientId: string;
  ingredientName: string;
  /** Called after a link changes, so the price on screen can catch up. */
  onChanged?: () => void;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const load = useCallback(() => {
    getInvoiceSources(deferredSearch || undefined).then((result) => {
      setSources('data' in result && result.data ? result.data.sources : []);
    });
  }, [deferredSearch]);

  // Fetched when opened, not before: a dialog that loads every invoice name
  // nobody asked for is a query per ingredient edited.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const linkedHere = (source: Source) => source.linkedTo.includes(ingredientName);

  const toggle = async (source: Source) => {
    const on = linkedHere(source);
    setBusy(source.productName);

    if (on) {
      const result = await unlinkInvoiceSource({
        sourceName: source.productName,
        ingredientId,
      });
      setBusy(null);
      if ('error' in result && result.error) {
        toast.error(t(result.error));
        return;
      }
      toast.success(t('menuCalc.sourceUnlinked'));
      load();
      onChanged?.();
      return;
    }

    const result = await linkInvoiceSource({
      sourceName: source.productName,
      ingredientId,
      vendorId: source.vendorId,
    });
    setBusy(null);

    if ('error' in result && result.error) {
      toast.error(t(result.error));
      return;
    }

    // Says the price moved, because that is the reason for doing this and it
    // lands somewhere else on the screen.
    const priced = 'data' in result ? result.data?.priced : null;
    toast.success(
      priced != null
        ? t('menuCalc.sourceLinkedPriced').replace('{price}', formatMoneyExact(priced))
        : t('menuCalc.sourceLinked'),
    );

    load();
    onChanged?.();
  };

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
        <span className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
          {t('menuCalc.sourcesTitle')}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground mb-2">
            {t('menuCalc.sourcesHint')}
          </p>

          <div className="relative mb-2">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('menuCalc.sourcesSearch')}
              aria-label={t('menuCalc.sourcesSearch')}
              className="input-field !pl-8 !pr-8 !py-1.5 !text-xs w-full"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('common.clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded
                           text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {sources === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
            </div>
          ) : sources.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              {search ? t('menuCalc.sourcesNoMatches') : t('menuCalc.sourcesEmpty')}
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-border-subtle">
              {sources.map((source) => {
                const on = linkedHere(source);
                // Linked to something else: worth saying, because picking it
                // too is usually right rather than a mistake.
                const others = source.linkedTo.filter((n) => n !== ingredientName);
                return (
                  <li key={`${source.productName}-${source.vendorId ?? ''}`}>
                    <button
                      type="button"
                      onClick={() => toggle(source)}
                      disabled={busy !== null}
                      aria-pressed={on}
                      className={`w-full flex items-center gap-2.5 py-2 text-left -mx-2 px-2 rounded-lg
                                  transition-colors disabled:opacity-60
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset
                                  focus-visible:ring-ring ${on ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    >
                      <span
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          on ? 'bg-primary border-primary' : 'border-border'
                        }`}
                        aria-hidden="true"
                      >
                        {busy === source.productName ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : on ? (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        ) : null}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-foreground [overflow-wrap:anywhere]">
                          {source.productName}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {source.vendorName ?? '—'}
                          {source.date && ` · ${new Date(source.date).toLocaleDateString(locale)}`}
                          {others.length > 0 && ` · ${t('menuCalc.sourceAlsoOn')} ${others.join(', ')}`}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs font-semibold text-foreground tabular-nums">
                        {formatMoneyExact(source.unitPrice)}
                        <span className="text-muted-foreground">/{source.unit || 'un'}</span>
                      </span>
                    </button>
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
