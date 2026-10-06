'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Link2, Plus, AlertTriangle, Check } from 'lucide-react';
import { previewReconciliation, type ReconcilePreview, type LineResolution } from '../reconcile-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import type { InvoiceLine } from '@/lib/invoice-matching';

/**
 * Deciding what an invoice's lines are, before they are saved.
 *
 * Most lines answer themselves: a wording seen before is already linked, and
 * one that matches a kitchen ingredient outright needs no one. What is left
 * is a short list of genuine questions — "the supplier calls this CARNE
 * PICADA NOVILHO; is that your Carne Smash?" — asked once and remembered.
 *
 * Ordered by what each line cost, because the decision about seventy-nine
 * euros of beef matters and the one about a four-euro bottle of washing-up
 * liquid does not. An owner who answers only the first line has still got
 * most of the value.
 */

interface Props {
  vendorName: string;
  lines: InvoiceLine[];
  /** Called with the resolved lines when the owner is done. */
  onResolved: (lines: LineResolution[]) => void;
  busy?: boolean;
}

/**
 * The ingredients offered as checkboxes for one line.
 *
 * The suggestions, plus anything already chosen — so a pick made from the
 * full list does not vanish from view the moment it is selected.
 */
function optionsFor(
  line: ReconcilePreview['lines'][number],
  candidates: Array<{ id: string; name: string; unit: string }>,
): Array<{ id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  if (line.decision.kind === 'ask') {
    for (const s of line.decision.suggestions) out.set(s.id, s);
  }
  if (line.decision.kind === 'linked') {
    for (const i of line.decision.ingredients) out.set(i.id, i);
  }
  return [...out.values()];
}

export default function InvoiceReconcile({ vendorName, lines, onResolved, busy = false }: Props) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<ReconcilePreview | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Per line, the ingredients it feeds.
   *
   * A list, because one purchase can be more than one of the kitchen's
   * ingredients — a case of meat is both the burger mince and the extra
   * portion. An empty list means create a new ingredient; '__skip'
   * means this line is not an ingredient at all.
   */
  const [choices, setChoices] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    previewReconciliation({ vendorName, lines }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!('data' in result) || !result.data) return;

      const data = result.data;
      setPreview(data);
      // Pre-answered where the match was safe, so the owner only sees what
      // genuinely needs them.
      const initial: Record<string, string[]> = {};
      for (const line of data.lines) {
        initial[line.productName] =
          line.decision.kind === 'linked'
            ? line.decision.ingredients.map((i) => i.id)
            : ['__new'];
      }
      setChoices(initial);
    });
    return () => { cancelled = true; };
  }, [vendorName, lines]);

  /**
   * Turns one choice on or off.
   *
   * Skipping is exclusive: a line is either not an ingredient or it is
   * some, and holding both would be a contradiction the owner then has to
   * resolve. Clearing the last ingredient falls back to creating a new
   * one, since dropping the line silently would lose its price history.
   */
  const toggle = useCallback((product: string, id: string) => {
    setChoices((current) => {
      const was = current[product] ?? [];
      if (id === '__skip') {
        return { ...current, [product]: was.includes('__skip') ? ['__new'] : ['__skip'] };
      }
      const without = was.filter((x) => x !== '__skip' && x !== '__new');
      const next = without.includes(id)
        ? without.filter((x) => x !== id)
        : [...without, id];
      return { ...current, [product]: next.length ? next : ['__new'] };
    });
  }, []);

  const resolve = useCallback(() => {
    if (!preview) return;
    onResolved(
      preview.lines.map((line) => {
        const choice = choices[line.productName];
        // The unit price is recovered where the printed one does not multiply
        // out: the total and the quantity are the figures least likely to be
        // misread, so they are what an ingredient cost should come from.
        const unitPrice = line.suspect && line.impliedUnitPrice
          ? line.impliedUnitPrice
          : line.unitPrice;

        return {
          productName: line.productName,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice,
          total: line.total,
          ...(choice.includes('__skip')
            ? { skip: true }
            : choice.filter((c) => c !== '__new').length > 0
              ? { ingredientIds: choice.filter((c) => c !== '__new') }
              : { createAs: line.productName }),
        } satisfies LineResolution;
      }),
    );
  }, [preview, choices, onResolved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (!preview || preview.lines.length === 0) return null;

  const asking = preview.lines.filter((l) => l.decision.kind !== 'linked').length;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{t('reconcile.title')}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {asking === 0
            ? t('reconcile.allKnown')
            : t('reconcile.asking').replace('{n}', String(asking))}
        </p>
      </div>

      <ul className="space-y-2">
        {preview.lines.map((line) => {
          const choice = choices[line.productName] ?? '__new';
          const known = line.decision.kind === 'linked';

          return (
            <li
              key={line.productName}
              className="rounded-xl border border-border-subtle bg-surface p-3"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-sm text-foreground [overflow-wrap:anywhere]">
                  {line.productName}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {line.quantity.toLocaleString('pt-PT')}
                  {line.unit ? ` ${line.unit}` : ''}
                  {' × '}
                  <span className="text-foreground font-semibold">
                    {formatMoney(line.suspect && line.impliedUnitPrice ? line.impliedUnitPrice : line.unitPrice, { decimals: 2 })}
                  </span>
                  {' = '}
                  <span className="text-foreground font-semibold">{formatMoney(line.total)}</span>
                </span>
              </div>

              {/* Said plainly rather than silently corrected: a misread price
                  becomes a wrong cost on every dish using the ingredient. */}
              {line.suspect && line.impliedUnitPrice !== null && (
                <p className="flex items-start gap-1.5 text-[11px] text-warning mb-2">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
                  <span>
                    {t('reconcile.priceFixed')
                      .replace('{printed}', formatMoney(line.unitPrice, { decimals: 2 }))
                      .replace('{implied}', formatMoney(line.impliedUnitPrice, { decimals: 2 }))}
                  </span>
                </p>
              )}

              {/* Checkboxes, not a dropdown: a line can feed more than one
                  ingredient, and a multi-select is a control nobody uses
                  correctly. The suggestions come first because one of them
                  is usually right. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {known && <Check className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />}
                {!known && <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />}

                {optionsFor(line, preview.candidates).map((option) => (
                  <label key={option.id} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={choice.includes(option.id)}
                      onChange={() => toggle(line.productName, option.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className="text-foreground">{option.name}</span>
                  </label>
                ))}

                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={choice.includes('__skip')}
                    onChange={() => toggle(line.productName, '__skip')}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-muted-foreground">{t('reconcile.skipLine')}</span>
                </label>

                {/* Everything else, for the case the suggestions missed. */}
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggle(line.productName, e.target.value); }}
                  aria-label={t('reconcile.linkTo').replace('{product}', line.productName)}
                  className="input-field !py-1 !text-xs w-auto"
                >
                  <option value="">{t('reconcile.allIngredients')}</option>
                  {preview.candidates
                    .filter((c) => !choice.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={resolve}
        disabled={busy}
        className="cta-button !py-2 !px-4 !text-sm w-full"
      >
        {busy
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <Plus className="w-4 h-4" aria-hidden="true" />}
        {t('reconcile.confirm')}
      </button>
    </div>
  );
}
