'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { MUNICIPALITIES, type Municipality } from '@/lib/municipalities';
import { useLanguage } from '@/lib/language-context';

/**
 * Pick one of Portugal's 308 municipalities by typing, not by scrolling a
 * select. Accent-blind, so "pedrogao" finds Pedrógão Grande, and it matches
 * the district too, so "faro" also lists the Algarve's councils.
 */

function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const INDEXED = MUNICIPALITIES.map((m) => ({ m, name: searchKey(m.name), district: searchKey(m.district) }));

export default function MunicipalityPicker({
  value, onChange, id,
}: {
  /** A council code, or null when none is chosen. */
  value: string | null;
  onChange: (code: string | null) => void;
  id?: string;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = value ? MUNICIPALITIES.find((m) => m.code === value) ?? null : null;
  const label = (m: Municipality) => `${m.name} · ${m.district}`;

  const [text, setText] = useState(selected ? label(selected) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // While the text is the selection's own label, the list shows everything.
  const typing = !selected || text !== label(selected);

  useEffect(() => { setText(selected ? label(selected) : ''); }, [selected]);

  const matches = useMemo(() => {
    const q = typing ? searchKey(text) : '';
    if (q === '') return MUNICIPALITIES.slice(0, 50);
    const byName = INDEXED.filter((x) => x.name.includes(q));
    const byDistrict = INDEXED.filter((x) => !x.name.includes(q) && x.district.includes(q));
    return [
      ...byName.filter((x) => x.name.startsWith(q)),
      ...byName.filter((x) => !x.name.startsWith(q)),
      ...byDistrict,
    ].slice(0, 50).map((x) => x.m);
  }, [text, typing]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  const choose = (m: Municipality) => {
    onChange(m.code);
    setText(label(m));
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length > 0 ? `${listId}-${active}` : undefined}
        placeholder={t('settings.municipalitySearch')}
        autoComplete="off"
        value={text}
        onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
        onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
        onBlur={() => {
          setOpen(false);
          // Leaving half a word behind would look like a choice that was not made.
          setText(selected ? label(selected) : '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="input-field pl-9 pr-9"
      />
      {selected && (
        <button
          type="button"
          onClick={() => { onChange(null); setText(''); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
          aria-label={t('settings.municipalityClear')}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto overscroll-contain
                     rounded-xl border border-border bg-card shadow-lg py-1"
        >
          {matches.map((m, i) => (
            <li
              key={m.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={m.code === value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(m)}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer ${
                i === active ? 'bg-muted' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MapPin
                  className={`w-3.5 h-3.5 shrink-0 ${m.code === value ? 'text-primary' : 'text-muted-foreground/50'}`}
                  aria-hidden="true"
                />
                <span className={`truncate ${m.code === value ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                  {m.name}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{m.district}</span>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('settings.municipalityNoMatch')}</li>
          )}
        </ul>
      )}
    </div>
  );
}
