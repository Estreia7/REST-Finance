'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Brain, Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { matchesSearch } from './ListSearch';
import Dialog from './Dialog';
import type { CategoryOrigin, CostCategory } from '@/lib/invoice-categories';

/**
 * The cost category of one invoice line, and the way to change it.
 *
 * A chip that says what the line is booked under and how sure the app is:
 * learned (the restaurant's memory knew it), suggested (anything else), or
 * nothing yet. Tapping it opens the list, searchable because a restaurant's
 * categories run past twenty and reading them one by one is the job a search
 * box exists to spare.
 *
 * A dialog rather than a panel in place, so it works the same inside the
 * scanner and inside a table that scrolls sideways, where anything floating
 * would be cut off.
 */

interface Props {
  categories: CostCategory[];
  value: string | null;
  /** How the value was arrived at. 'owner' once the owner has chosen. */
  origin: CategoryOrigin | 'owner';
  /** The line's wording, to say which line the dialog is about. */
  productName: string;
  onChange: (categoryId: string, applyToAll: boolean) => void;
  /** Offers "use this for every line of the invoice". */
  allowApplyToAll?: boolean;
  disabled?: boolean;
}

export default function CategoryPicker({
  categories, value, origin, productName, onChange, allowApplyToAll = false, disabled = false,
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = categories.find((c) => c.id === value) ?? null;

  const suggested = origin === 'similar' || origin === 'vendor' || origin === 'reader';
  const missing = !current;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={t('lineCategory.changeLabel')
          .replace('{product}', productName)
          .replace('{category}', current?.name ?? t('lineCategory.choose'))}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium
                    transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    disabled:opacity-60 ${
          missing
            ? 'bg-warning/10 text-warning hover:bg-warning/15'
            : 'bg-muted text-foreground hover:bg-muted/70'
        }`}
      >
        {missing && <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />}
        {!missing && origin === 'memory' && <Brain className="w-3 h-3 shrink-0 text-success" aria-hidden="true" />}
        {!missing && suggested && <Sparkles className="w-3 h-3 shrink-0 text-primary" aria-hidden="true" />}
        {!missing && origin === 'owner' && <Check className="w-3 h-3 shrink-0 text-success" aria-hidden="true" />}
        <span className="truncate">{current?.name ?? t('lineCategory.choose')}</span>
        {!missing && (origin === 'memory' || suggested) && (
          <span className="shrink-0 font-normal text-muted-foreground">
            · {origin === 'memory' ? t('lineCategory.learned') : t('lineCategory.suggested')}
          </span>
        )}
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <CategoryDialog
          categories={categories}
          value={value}
          productName={productName}
          allowApplyToAll={allowApplyToAll}
          onClose={() => setOpen(false)}
          onPick={(id, all) => {
            setOpen(false);
            onChange(id, all);
          }}
        />
      )}
    </>
  );
}

function CategoryDialog({
  categories, value, productName, allowApplyToAll, onClose, onPick,
}: {
  categories: CostCategory[];
  value: string | null;
  productName: string;
  allowApplyToAll: boolean;
  onClose: () => void;
  onPick: (categoryId: string, applyToAll: boolean) => void;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [applyToAll, setApplyToAll] = useState(false);

  // Food and drink first, then running costs — the order the P&L reads in.
  const matches = useMemo(
    () => [
      ...categories.filter((c) => c.type === 'COGS'),
      ...categories.filter((c) => c.type === 'OPEX'),
    ].filter((c) => matchesSearch(text, c.name)),
    [categories, text],
  );

  // Focused where there is a keyboard to type with. On a phone that would
  // throw the keyboard up over the very list being chosen from.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const choose = (index: number) => {
    const hit = matches[index];
    if (hit) onPick(hit.id, applyToAll);
  };

  return (
    <Dialog title={t('lineCategory.dialogTitle').replace('{product}', productName)} onClose={onClose}>
      <div className="relative mb-2">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches.length > 0 ? `${listId}-${active}` : undefined}
          aria-label={t('lineCategory.search')}
          placeholder={t('lineCategory.search')}
          value={text}
          onChange={(e) => { setText(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(active);
            }
          }}
          className="input-field !py-2 !pl-8 !text-sm w-full"
        />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={t('lineCategory.search')}
        className="max-h-[50dvh] overflow-y-auto overscroll-contain -mx-1"
      >
        {matches.map((c, i) => {
          const firstOfGroup = i === 0 || matches[i - 1].type !== c.type;
          return (
            <li key={c.id} role="presentation">
              {firstOfGroup && (
                <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.type === 'COGS' ? t('lineCategory.groupCogs') : t('lineCategory.groupOpex')}
                </p>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={c.id === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex items-center justify-between gap-3 mx-1 px-2 py-2 rounded-lg text-sm cursor-pointer text-foreground ${
                  i === active ? 'bg-muted' : ''
                }`}
              >
                <span className="truncate">{c.name}</span>
                {c.id === value && <Check className="w-4 h-4 shrink-0 text-success" aria-hidden="true" />}
              </div>
            </li>
          );
        })}
        {matches.length === 0 && (
          <li className="px-2 py-3 text-sm text-muted-foreground">{t('lineCategory.noMatch')}</li>
        )}
      </ul>

      {allowApplyToAll && (
        <label className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-muted-foreground">{t('lineCategory.applyToAll')}</span>
        </label>
      )}
    </Dialog>
  );
}
