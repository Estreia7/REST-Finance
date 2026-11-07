'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { lineKey, withoutBatch } from '@/lib/invoice-categories';
import {
  PACK_UNITS,
  PACK_UNIT_KEYS,
  fromPrinted,
  isDiscountLine,
  packFromParts,
  takesPack,
  toPack,
  toPackInput,
  type PackInput,
  type PackUnit,
} from '@/lib/line-setup';

/**
 * The lines of an invoice about to be saved, and what each unit really is.
 *
 * "1 un × €26,90" is what the document says; the description says that unit is
 * six boxes of eighteen tortillas. The answer sits under the line it belongs to,
 * folded away until wanted, and the list scrolls on its own so the invoice stays
 * beside it to read from.
 */

export interface ReadingItem {
  product: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  packAmount?: number;
  packUnit?: 'kg' | 'L' | 'un';
}

interface Draft {
  count: string;
  each: string;
  unit: PackUnit;
}

const num = (value: string) => Number(value.replace(',', '.'));

function Line({ item, known, onTeach }: {
  item: ReadingItem;
  /** What the restaurant answered before, or what the reader took from the description. */
  known: PackInput | null;
  onTeach: (pack: PackInput | null) => void;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  /** Null until the owner touches it: looking is not teaching. */
  const [draft, setDraft] = useState<Draft | null>(null);

  const shown = draft ?? { count: '1', each: String(known?.amount ?? 1), unit: known?.unit ?? 'un' };
  const change = (patch: Partial<Draft>) => {
    const next = { ...shown, ...patch };
    setDraft(next);
    onTeach(packFromParts(num(next.count), num(next.each), next.unit));
  };

  const parts = packFromParts(num(shown.count), num(shown.each), shown.unit);
  const pack = parts && toPack(parts);
  const inside = pack && pack !== 'packages'
    ? fromPrinted({ quantity: item.quantity, unit: item.unit ?? null, unitPrice: item.unitPrice, total: item.total }, pack)
    : null;
  const result = inside && t('proof.packResult')
    .replace('{quantity}', String(inside.quantity).replace('.', language === 'pt' ? ',' : '.'))
    .replaceAll('{unit}', inside.unit === 'un' ? t('lineSetup.unitsShort') : inside.unit ?? '')
    .replace('{price}', formatMoney(inside.unitPrice));
  const teachable = takesPack(item.quantity, item.unit) && !isDiscountLine(item.total);
  const field = 'input-field !py-1 !px-2 !text-xs tabular-nums !w-14';

  return (
    <li className="rounded-lg bg-muted p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-foreground [overflow-wrap:anywhere]">{withoutBatch(item.product)}</span>
        {/* The unit price is the figure an ingredient cost is built from. */}
        <span className="text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
          {item.quantity}{item.unit ? ` ${item.unit}` : ''} × €{item.unitPrice.toFixed(2)}
        </span>
        <span className="font-semibold text-foreground tabular-nums shrink-0">€{item.total.toFixed(2)}</span>
      </div>

      {teachable && (
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="mt-1 inline-flex min-h-[28px] items-center gap-1 rounded text-[11px] font-semibold text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          {result ?? t('scanner.packQuestion')}
        </button>
      )}

      {teachable && open && (
        <div className="mt-1 border-t border-border-subtle pt-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[11px] text-muted-foreground">{t('scanner.packEach')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={shown.count}
              onChange={(e) => change({ count: e.target.value })}
              aria-label={`${t('scanner.packCount')}: ${item.product}`}
              className={field}
            />
            <span className="text-[11px] text-muted-foreground">{t('scanner.packOf')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={shown.each}
              onChange={(e) => change({ each: e.target.value })}
              aria-label={`${t('scanner.packSize')}: ${item.product}`}
              className={field}
            />
            <select
              value={shown.unit}
              onChange={(e) => change({ unit: e.target.value as PackUnit })}
              aria-label={`${t('lineSetup.unitLabel')}: ${item.product}`}
              className="input-field !py-1 !px-2 !text-xs !w-auto"
            >
              {PACK_UNITS.map((u) => <option key={u} value={u}>{t(PACK_UNIT_KEYS[u])}</option>)}
            </select>
          </div>
          {result && <p className="mt-1.5 text-[11px] font-medium text-foreground tabular-nums">{result}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">{t('proof.packTaught')}</p>
        </div>
      )}
    </li>
  );
}

export default function ReadingLines({ items, known, onTeach }: {
  items: ReadingItem[];
  known: Record<string, PackInput>;
  onTeach: (index: number, pack: PackInput | null) => void;
}) {
  const read = (item: ReadingItem) => (item.packAmount && item.packUnit
    ? toPackInput({ amount: item.packAmount, unit: item.packUnit })
    : null);

  return (
    <ul className="space-y-2 lg:max-h-[42vh] lg:overflow-y-auto lg:pr-1">
      {items.map((item, i) => (
        <Line
          key={i}
          item={item}
          known={known[lineKey(withoutBatch(item.product))] ?? read(item)}
          onTeach={(pack) => onTeach(i, pack)}
        />
      ))}
    </ul>
  );
}
