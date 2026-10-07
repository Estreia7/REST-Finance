'use client';

import { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { Loader2, Link2, Plus, AlertTriangle, Check, Search } from 'lucide-react';
import { matchesSearch } from './ListSearch';
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

type Candidate = ReconcilePreview['candidates'][number];

/**
 * The ingredients offered as checkboxes for one line.
 *
 * What it is linked to or most likely is, then the ingredients that share a
 * word with it, then anything picked from the search — so a pick does not
 * vanish from view the moment it is made.
 */
function optionsFor(
  line: ReconcilePreview['lines'][number],
  candidates: Candidate[],
  chosen: string[],
): Array<{ id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  const { decision } = line;
  if (decision.kind === 'linked') for (const i of decision.ingredients) out.set(i.id, i);
  if (decision.kind === 'ask') for (const s of decision.suggestions) out.set(s.id, s);
  if (decision.kind !== 'new') for (const r of decision.related) out.set(r.id, r);
  for (const id of chosen) {
    const picked = candidates.find((c) => c.id === id);
    if (picked) out.set(picked.id, picked);
  }
  return [...out.values()];
}

/**
 * Finding any other ingredient by typing part of its name.
 *
 * Replaces a dropdown of every ingredient, which at ninety rows meant reading
 * them one by one. The list opens in place rather than floating, so it is
 * never cut off by the scanner sheet it sits in.
 */
function IngredientSearch({
  candidates, exclude, label, onPick,
}: {
  candidates: Candidate[];
  exclude: string[];
  label: string;
  onPick: (id: string) => void;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const starts = (name: string) =>
      name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(q);
    return candidates
      .filter((c) => !exclude.includes(c.id) && matchesSearch(text, c.name))
      // Names that start with what was typed first, then A–Z.
      .sort((a, b) => Number(starts(b.name)) - Number(starts(a.name)) || a.name.localeCompare(b.name, 'pt'))
      .slice(0, 50);
  }, [candidates, exclude, text]);

  const showList = open && (text.trim() !== '' || matches.length > 0);

  useEffect(() => {
    if (!showList) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, showList, listId]);

  const choose = (index: number) => {
    const hit = matches[index];
    if (!hit) return;
    onPick(hit.id);
    // Ready for the next one: a line can feed several ingredients.
    setText('');
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches.length > 0 ? `${listId}-${active}` : undefined}
          aria-label={label}
          placeholder={t('reconcile.searchIngredient')}
          value={text}
          onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              // Never submits the scanner form underneath.
              e.preventDefault();
              if (showList) choose(active);
            } else if (e.key === 'Escape' && showList) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="input-field !py-1.5 !pl-8 !text-xs w-full"
        />
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card py-1"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the input, so the pick lands before blur closes the list.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer text-foreground ${
                i === active ? 'bg-muted' : ''
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{c.unit}</span>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('reconcile.noIngredientMatch')}</li>
          )}
        </ul>
      )}
    </div>
  );
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
          const choice = choices[line.productName] ?? ['__new'];
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

                {optionsFor(line, preview.candidates, choice).map((option) => (
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

              </div>

              {/* Everything else, for the case the suggestions missed. */}
              <div className="mt-2">
                <IngredientSearch
                  candidates={preview.candidates}
                  exclude={choice}
                  label={t('reconcile.linkTo').replace('{product}', line.productName)}
                  onPick={(id) => toggle(line.productName, id)}
                />
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
