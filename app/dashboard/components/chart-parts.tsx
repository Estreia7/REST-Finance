'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * How a chart's tooltip opens: on hover where there is a pointer to hover
 * with, on a tap where there is not.
 *
 * Recharts' hover mode on a phone only shows the tooltip while a finger is
 * dragged across the plot; a plain tap does nothing, so the month's figures
 * were out of reach there. In click mode a tap opens the month under the
 * finger and it stays open, which is what a tap is expected to do.
 */
export function useTooltipTrigger(): 'hover' | 'click' {
  const [trigger, setTrigger] = useState<'hover' | 'click'>('hover');
  useEffect(() => {
    const media = window.matchMedia('(hover: none)');
    const update = () => setTrigger(media.matches ? 'click' : 'hover');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return trigger;
}

/**
 * The year on show, with arrows either side.
 *
 * The arrows stop at the edges of `availableYears`, so stepping back never
 * lands on an empty chart that reads as a bug. With no list given, both
 * directions stay open.
 */
export function YearStepper({
  year, onChange, availableYears = [],
}: {
  year: number;
  onChange: (year: number) => void;
  availableYears?: number[];
}) {
  const { t } = useLanguage();
  const oldest = availableYears.length ? Math.min(...availableYears) : undefined;
  const newest = availableYears.length ? Math.max(...availableYears) : undefined;
  const canGoBack = oldest === undefined || year > oldest;
  const canGoForward = newest === undefined || year < newest;

  const arrow =
    'p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted ' +
    'disabled:opacity-30 disabled:hover:bg-transparent transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" onClick={() => onChange(year - 1)} disabled={!canGoBack} aria-label={t('charts.previousYear')} className={arrow}>
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      <span className="text-sm font-semibold text-foreground tabular-nums w-12 text-center" aria-live="polite">
        {year}
      </span>
      <button type="button" onClick={() => onChange(year + 1)} disabled={!canGoForward} aria-label={t('charts.nextYear')} className={arrow}>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** A chart card's title row: heading and subtitle, and the year on the right. */
export function ChartHeader({
  title, subtitle, year, onYearChange, availableYears,
}: {
  title: string;
  subtitle: string;
  year?: number;
  onYearChange?: (year: number) => void;
  availableYears?: number[];
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h3 className="font-bold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {onYearChange && year !== undefined && (
        <YearStepper year={year} onChange={onYearChange} availableYears={availableYears} />
      )}
    </div>
  );
}

/**
 * The pieces the dashboard's bar charts share, so the two read as one system:
 * the same month labels, the same legend, the same tooltip card, the same bar
 * shape.
 */

/**
 * Month abbreviations, per language.
 *
 * Not `toLocaleDateString`: Portuguese returns "set." with a trailing dot and
 * in lower case, which reads as a typo along an axis, and twelve labels are
 * not worth twenty-four dictionary keys.
 */
const MONTH_SHORT: Record<string, string[]> = {
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "Jan", from a `YYYY-MM` key. The year is in the card's header, once. */
export function monthLabel(month: string, language: string, monthIndex?: number): string {
  const names = MONTH_SHORT[language] ?? MONTH_SHORT.pt;
  const index = typeof monthIndex === 'number' ? monthIndex : Number(month.split('-')[1]) - 1;
  return names[index] ?? month;
}

/**
 * The legend, as a row above the plot rather than Recharts' own below it:
 * read before the bars, with a value beside each name so the colour is never
 * the only thing identifying a series.
 */
export function ChartLegend({
  items,
}: {
  items: Array<{ key: string; color: string; label: string; value?: string }>;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: item.color }} aria-hidden="true" />
          <span className="text-xs text-muted-foreground truncate">{item.label}</span>
          {item.value && (
            <span className="text-xs font-semibold text-foreground tabular-nums">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The tooltip card every chart floats over its bars. */
export function TooltipCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-[11rem] px-3.5 py-3 rounded-xl bg-card border border-border shadow-modal text-xs">
      <div className="font-semibold text-foreground mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** One row of a tooltip: a swatch, a name, a value. Text stays in ink. */
export function TooltipRow({
  color, label, value, strong = false,
}: {
  color?: string; label: string; value: string; strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
        {color && <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: color }} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`tabular-nums text-foreground ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}

/**
 * A bar with a 4px rounded top and a square foot on the baseline.
 *
 * Drawn as a path rather than Recharts' `radius`, which rounds every segment
 * of a stack the same way; here the caller decides which segment is the top.
 */
export function barPath(x: number, y: number, width: number, height: number, roundTop: boolean): string {
  if (height <= 0 || width <= 0) return '';
  const r = roundTop ? Math.min(4, width / 2, height) : 0;
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    r ? `Q${x},${y} ${x + r},${y}` : '',
    `L${x + width - r},${y}`,
    r ? `Q${x + width},${y} ${x + width},${y + r}` : '',
    `L${x + width},${y + height}`,
    'Z',
  ].join(' ');
}
