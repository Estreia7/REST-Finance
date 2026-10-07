'use client';

import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * The search box above a long list.
 *
 * A restaurant's ingredient list runs to ninety-odd rows and its product list
 * to two hundred; finding "BACON" in either by scrolling is a worse version
 * of a job the browser does in one keystroke. So anywhere a list can grow
 * past a screenful gets one of these, and they all behave the same way.
 *
 * Shared rather than repeated: five copies of a search box drift into five
 * slightly different ones, and the fourth stops clearing when the others do.
 *
 * Hidden below a threshold. A search box over six ingredients is furniture
 * that pushes the six rows down the page.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** What is being searched, e.g. "ingrediente ou fornecedor". */
  placeholder: string;
  /** How many rows there are. Below `showFrom` the box does not appear. */
  count: number;
  /** The list length at which searching starts being worth the space. */
  showFrom?: number;
  /** Rows matching the current term, for saying so. Omit to say nothing. */
  matches?: number;
}

/**
 * Short enough that everything fits on a screen, long enough that a dozen
 * categories do not sprout a control nobody needs.
 */
const DEFAULT_THRESHOLD = 12;

export default function ListSearch({
  value, onChange, placeholder, count, showFrom = DEFAULT_THRESHOLD, matches,
}: Props) {
  const { t } = useLanguage();
  const id = useId();

  if (count < showFrom) return null;

  const searching = value.trim().length > 0;

  return (
    <div className="mb-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          // `pr-9` leaves room for the clear button; without it the typed
          // text runs under it on a narrow phone.
          className="input-field !pl-9 !pr-9 !py-2 !text-sm w-full"
        />
        {searching && (
          // Safari puts its own clear button on a search input and Firefox
          // does not, so one is drawn here and the native one suppressed in
          // globals.css. A control that appears on one phone and not another
          // is worse than either.
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('common.clear')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Only while searching, and only when there is something to say: a
          count under an unfiltered list is noise. */}
      {searching && matches !== undefined && (
        <p className="mt-1.5 text-xs text-muted-foreground" role="status">
          {matches === 0
            ? t('common.searchNoMatches')
            : t('common.searchMatches')
                .replace('{matches}', String(matches))
                .replace('{total}', String(count))}
        </p>
      )}
    </div>
  );
}

/**
 * Whether a row matches what was typed.
 *
 * Accents and case are ignored, because an owner types "pao" for "PÃO" and
 * should not have to know which. Every term must appear somewhere in the
 * row's fields, in any order, so "bacon ext" finds "EXTRA BACON" — which is
 * how people search when they half-remember a name.
 */
export function matchesSearch(term: string, ...fields: Array<string | null | undefined>): boolean {
  const needle = normalise(term);
  if (!needle) return true;

  const haystack = fields.filter(Boolean).map((f) => normalise(f as string)).join(' ');
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
