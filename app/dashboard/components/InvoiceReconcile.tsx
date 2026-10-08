'use client';

import { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { Loader2, Link2, Plus, AlertTriangle, Check, Search, Brain } from 'lucide-react';
import { matchesSearch } from './ListSearch';
import {
  previewReconciliation,
  type ReconcilePreview,
  type LineResolution,
  type ScannedLine,
} from '../reconcile-actions';
import CategoryPicker from './CategoryPicker';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

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
  /** The supplier NIF, which finds what was remembered about it. */
  vendorTaxId?: string | null;
  /** The lines as read, each with the reader's guess at its category. */
  lines: ScannedLine[];
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

export default function InvoiceReconcile({ vendorName, vendorTaxId = null, lines, onResolved, busy = false }: Props) {
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
  /**
   * Per line, whether its quantity means packages or the weight they hold —
   * only once the owner has said. Until then the line follows its default:
   * the weight where the size settled itself (the owner answered before, or
   * the reader and the label agree), otherwise whichever reading the
   * ingredient it feeds is measured in.
   */
  const [packChoices, setPackChoices] = useState<Record<string, 'packages' | 'weight'>>({});
  const packDefault = (line: ReconcilePreview['lines'][number]): 'packages' | 'weight' =>
    !line.packChoice ? 'packages' : line.packChoice.settled ? 'weight' : line.packChoice.suggested;
  const packChoiceOf = (line: ReconcilePreview['lines'][number]) =>
    packChoices[line.productName] ?? packDefault(line);
  /**
   * Per line, its cost category and whether the owner chose it.
   *
   * Starts as the preview's guess. Saving a guess as it stands is an answer
   * too, and is remembered; `owner` only records that it was changed, so the
   * app can tell what it is getting right by itself.
   */
  const [categoryChoices, setCategoryChoices] = useState<Record<string, { id: string | null; owner: boolean }>>({});

  useEffect(() => {
    let cancelled = false;
    previewReconciliation({ vendorName, vendorTaxId, lines }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!('data' in result) || !result.data) return;

      const data = result.data;
      setPreview(data);
      // Pre-answered where the match was safe, so the owner only sees what
      // genuinely needs them.
      const initial: Record<string, string[]> = {};
      const categories: Record<string, { id: string | null; owner: boolean }> = {};
      for (const line of data.lines) {
        initial[line.productName] =
          line.decision.kind === 'linked'
            ? line.decision.ingredients.map((i) => i.id)
            // Said before that this is not an ingredient: not asked again.
            : line.notIngredient ? ['__skip'] : ['__new'];
        categories[line.productName] = { id: line.category.id, owner: false };
      }
      setChoices(initial);
      setCategoryChoices(categories);
    });
    return () => { cancelled = true; };
  }, [vendorName, vendorTaxId, lines]);

  /** A running cost — cleaning, gas — is never a kitchen ingredient. */
  const isRunningCost = useCallback(
    (product: string) => {
      const id = categoryChoices[product]?.id;
      return !!id && preview?.categories.find((c) => c.id === id)?.type === 'OPEX';
    },
    [categoryChoices, preview],
  );

  const setCategory = useCallback((product: string, id: string, applyToAll: boolean) => {
    const typeOf = (categoryId: string | null) =>
      preview?.categories.find((c) => c.id === categoryId)?.type;
    const affected = applyToAll ? Object.keys(categoryChoices) : [product];

    // Brought back from a running cost into food, a line skipped only for
    // being a running cost is asked about the kitchen again: the flour filed
    // as cleaning was always an ingredient.
    if (typeOf(id) === 'COGS') {
      setChoices((current) => {
        const next = { ...current };
        for (const key of affected) {
          if (typeOf(categoryChoices[key]?.id ?? null) !== 'OPEX') continue;
          if (!(current[key] ?? []).includes('__skip')) continue;
          const line = preview?.lines.find((l) => l.productName === key);
          next[key] = line?.decision.kind === 'linked'
            ? line.decision.ingredients.map((i) => i.id)
            : ['__new'];
        }
        return next;
      });
    }

    setCategoryChoices((current) => {
      const next = { ...current };
      for (const key of affected) next[key] = { id, owner: true };
      return next;
    });
  }, [categoryChoices, preview]);

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
        // The owner's answer wins over the printed figures.
        const pack = line.packChoice;
        const useWeight = !!pack && packChoiceOf(line) === 'weight';
        const measured = useWeight ? pack!.asWeight : line;

        // Counted by weight, the price per kilo is already worked out from
        // the total; the package price would be a bag's price per kilo.
        const unitPrice = useWeight
          ? measured.unitPrice
          : line.suspect && line.impliedUnitPrice ? line.impliedUnitPrice : measured.unitPrice;

        // Remembered only once it is an answer: the owner picked a reading,
        // or the size settled itself and was left alone. A question left on
        // its default is not an answer, and remembering it would stop the
        // question ever being asked again. Who decided is kept with it.
        const answered = packChoices[line.productName] !== undefined;
        const packAnswer: Pick<LineResolution, 'pack' | 'packDecidedBy'> = pack && (answered || pack.settled)
          ? {
              pack: useWeight ? { amount: pack.packAmount, unit: pack.packUnit } : 'packages',
              packDecidedBy: answered ? 'owner' : pack.origin === 'memory' ? 'memory' : 'check',
            }
          : {};

        const category = categoryChoices[line.productName] ?? { id: null, owner: false };
        const categorySource: LineResolution['categorySource'] = !category.id
          ? undefined
          : category.owner ? 'OWNER'
          : line.category.origin === 'memory' ? 'MEMORY' : 'SUGGESTED';

        return {
          productName: line.productName,
          quantity: measured.quantity,
          unit: measured.unit,
          unitPrice,
          total: line.total,
          categoryId: category.id,
          categorySource,
          ...packAnswer,
          ...(choice.includes('__skip') || isRunningCost(line.productName)
            ? { skip: true }
            : choice.filter((c) => c !== '__new').length > 0
              ? { ingredientIds: choice.filter((c) => c !== '__new') }
              : { createAs: line.productName }),
        } satisfies LineResolution;
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packChoiceOf reads packChoices, listed
  }, [preview, choices, packChoices, categoryChoices, isRunningCost, onResolved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (!preview || preview.lines.length === 0) return null;

  // What still wants an answer: a line with no category, or an ingredient
  // line nobody has identified. Running costs and lines known not to be
  // ingredients have nothing to ask about the kitchen.
  const asking = preview.lines.filter((l) => {
    if (!categoryChoices[l.productName]?.id) return true;
    if (isRunningCost(l.productName)) return false;
    return l.decision.kind !== 'linked' && !l.notIngredient;
  }).length;
  const known = preview.lines.filter((l) => l.category.origin === 'memory').length;

  // Where the money is going, by category, as the owner sets it.
  const byCategory = new Map<string | null, number>();
  for (const line of preview.lines) {
    const id = categoryChoices[line.productName]?.id ?? null;
    byCategory.set(id, (byCategory.get(id) ?? 0) + line.total);
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{t('reconcile.title')}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {asking === 0
            ? t('reconcile.allKnown')
            : t('reconcile.asking').replace('{n}', String(asking))}
        </p>
        {/* How much the restaurant's memory already knew. The number that
            should climb, invoice by invoice, until nothing is asked. */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
          <Brain className={`w-3 h-3 shrink-0 ${known > 0 ? 'text-success' : ''}`} aria-hidden="true" />
          {known > 0
            ? t('reconcile.knownLines')
                .replace('{known}', String(known))
                .replace('{total}', String(preview.lines.length))
            : t('reconcile.firstTime')}
        </p>
      </div>

      <ul aria-label={t('reconcile.byCategory')} className="flex flex-wrap gap-1.5">
        {[...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, total]) => (
            <li
              key={id ?? 'none'}
              className={`rounded-lg px-2 py-1 text-[11px] tabular-nums ${
                id ? 'bg-muted text-foreground' : 'bg-warning/10 text-warning'
              }`}
            >
              {id
                ? preview.categories.find((c) => c.id === id)?.name ?? t('reconcile.noCategory')
                : t('reconcile.noCategory')}
              {' '}
              <span className="font-semibold">{formatMoney(total)}</span>
            </li>
          ))}
      </ul>

      <ul className="space-y-2">
        {preview.lines.map((line) => {
          const choice = choices[line.productName] ?? ['__new'];
          const known = line.decision.kind === 'linked';
          const category = categoryChoices[line.productName] ?? { id: null, owner: false };
          const runningCost = isRunningCost(line.productName);

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

              <div className="mb-2">
                <CategoryPicker
                  categories={preview.categories}
                  value={category.id}
                  origin={category.owner ? 'owner' : line.category.origin}
                  productName={line.productName}
                  allowApplyToAll={preview.lines.length > 1}
                  onChange={(id, all) => setCategory(line.productName, id, all)}
                />
              </div>

              {/* Two readings, both arithmetically sound, and only the
                  owner knows which. Asked rather than guessed, because
                  guessing wrong puts a wrong cost per kilo on every dish
                  that uses it. */}
              {line.packChoice && line.packChoice.settled && (() => {
                const pack = line.packChoice;
                const byWeight = packChoiceOf(line) === 'weight';
                const size = `${pack.packAmount.toLocaleString('pt-PT')} ${pack.packUnit}`;
                const shown = byWeight ? pack.asWeight : line;
                return (
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-success/10 px-2.5 py-2 text-[11px]">
                    <Brain className="w-3 h-3 shrink-0 text-success" aria-hidden="true" />
                    <span className="text-foreground">
                      {byWeight
                        ? t(pack.origin === 'memory' ? 'reconcile.packFromMemory' : 'reconcile.packFromLabel')
                            .replace('{size}', size)
                            .replace('{unit}', pack.packUnit)
                        : t('reconcile.packCountedAsPackages')}
                      {' '}
                      <span className="font-semibold tabular-nums">
                        {shown.quantity.toLocaleString('pt-PT')} {shown.unit} × {formatMoney(shown.unitPrice, { decimals: 2 })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPackChoices((c) => ({ ...c, [line.productName]: byWeight ? 'packages' : 'weight' }))
                      }
                      className="ml-auto text-primary-ink underline underline-offset-2 hover:no-underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {byWeight
                        ? t('reconcile.packCountPackages')
                        : t('reconcile.packCountWeight').replace('{unit}', pack.packUnit)}
                    </button>
                  </div>
                );
              })()}

              {line.packChoice && !line.packChoice.settled && (
                <div className="mb-2 rounded-lg bg-muted/60 p-2.5">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {t('reconcile.packQuestion')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['packages', 'weight'] as const).map((choice) => {
                      const picked = packChoiceOf(line) === choice;
                      const shown =
                        choice === 'weight' ? line.packChoice!.asWeight : line;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() =>
                            setPackChoices((c) => ({ ...c, [line.productName]: choice }))
                          }
                          aria-pressed={picked}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] tabular-nums transition-colors
                                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            picked
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'bg-card text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {shown.quantity.toLocaleString('pt-PT')} {shown.unit}
                          {' × '}
                          {formatMoney(shown.unitPrice, { decimals: 2 })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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

              {/* A running cost has nothing to ask about the kitchen. */}
              {runningCost ? (
                <p className="text-[11px] text-muted-foreground">{t('reconcile.runningCost')}</p>
              ) : (<>
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
              </>)}
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
