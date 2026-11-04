'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { matchesSearch } from './ListSearch';
import { useLanguage } from '@/lib/language-context';

type Candidate = { id: string; name: string; unit: string };

/**
 * Finding any other ingredient by typing part of its name.
 *
 * Replaces a dropdown of every ingredient, which at ninety rows meant reading
 * them one by one. The list opens in place rather than floating, so it is
 * never cut off by the scanner sheet it sits in.
 */
export default function IngredientSearch({
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
