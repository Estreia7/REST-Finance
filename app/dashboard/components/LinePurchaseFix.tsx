'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { LINE_UNITS, correctedLine, followFigures, type LineUnit } from '@/lib/line-setup';
import { correctLine } from '../line-setup-actions';

/**
 * What one purchase really was, typed by the owner: this much, for this money.
 *
 * Invoices print these figures in every way there is, so the owner may know
 * the price of a kilo or only what the line cost. Either works: the one typed
 * last stands, and the other follows it.
 */

const num = (value: string) => Number(value.replace(',', '.'));

const UNIT_KEYS: Record<LineUnit, string> = {
  kg: 'lineSetup.unitKg', L: 'lineSetup.unitL', un: 'lineSetup.unitUn',
};

function startingUnit(unit: string | null): LineUnit {
  const u = (unit ?? '').trim().toLowerCase();
  if (u === 'kg') return 'kg';
  if (u === 'l') return 'L';
  return 'un';
}

export default function LinePurchaseFix({
  itemId, quantity, unit, total, onCancel, onDone,
}: {
  itemId: string;
  quantity: number;
  unit: string | null;
  total: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const shown = (n: number, decimals: number) =>
    n.toLocaleString(locale, { useGrouping: false, maximumFractionDigits: decimals });

  const [amount, setAmount] = useState(shown(quantity, 3));
  const [lineUnit, setLineUnit] = useState<LineUnit>(startingUnit(unit));
  const [price, setPrice] = useState(shown(quantity > 0 ? total / quantity : 0, 4));
  const [value, setValue] = useState(shown(total, 2));
  const [stands, setStands] = useState<'unitPrice' | 'total'>('unitPrice');
  const [saving, setSaving] = useState(false);

  const follow = (nextAmount: string, nextPrice: string, nextValue: string, nextStands: typeof stands) => {
    const next = followFigures(num(nextAmount), num(nextPrice), num(nextValue), nextStands);
    if (nextStands === 'unitPrice' && Number.isFinite(next.total)) setValue(shown(next.total, 2));
    if (nextStands === 'total' && Number.isFinite(next.unitPrice)) setPrice(shown(next.unitPrice, 4));
  };

  const figures = { quantity: num(amount), unit: lineUnit, unitPrice: num(price), total: num(value) };
  const valid = correctedLine(figures) !== null;

  const save = async () => {
    setSaving(true);
    const result = await correctLine({ itemId, ...figures });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'lineSetup.errors.save'));
      return;
    }
    toast.success(t('lineSetup.fixSaved'));
    onDone();
  };

  const field = 'input-field !py-1.5 !text-sm tabular-nums w-full';
  const perUnit = lineUnit === 'un' ? t('lineSetup.unitOne') : lineUnit;

  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="block text-xs text-muted-foreground mb-1">{t('lineSetup.fixQuantity')}</span>
          <input
            type="text" inputMode="decimal" value={amount} autoFocus
            onChange={(e) => { setAmount(e.target.value); follow(e.target.value, price, value, stands); }}
            className={field}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-xs text-muted-foreground mb-1">{t('lineSetup.unitLabel')}</span>
          <select
            value={lineUnit}
            onChange={(e) => setLineUnit(e.target.value as LineUnit)}
            className={field}
          >
            {LINE_UNITS.map((u) => <option key={u} value={u}>{t(UNIT_KEYS[u])}</option>)}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="block text-xs text-muted-foreground mb-1">
            {t('lineSetup.fixPrice').replace('{unit}', perUnit)}
          </span>
          <input
            type="text" inputMode="decimal" value={price}
            onChange={(e) => { setPrice(e.target.value); setStands('unitPrice'); follow(amount, e.target.value, value, 'unitPrice'); }}
            className={field}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-xs text-muted-foreground mb-1">{t('lineSetup.fixTotal')}</span>
          <input
            type="text" inputMode="decimal" value={value}
            onChange={(e) => { setValue(e.target.value); setStands('total'); follow(amount, price, e.target.value, 'total'); }}
            className={field}
          />
        </label>
      </div>

      <p className={`mt-2 text-[11px] ${valid ? 'text-muted-foreground' : 'text-danger'}`}>
        {t(valid ? 'lineSetup.fixHint' : 'lineSetup.errors.figures')}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !valid}
          className="cta-button !py-2 !px-3 !text-xs disabled:opacity-40"
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            : <Check className="w-3.5 h-3.5" aria-hidden="true" />}
          {t('lineSetup.fixSave')}
        </button>
        <button type="button" onClick={onCancel} className="cta-button-secondary !py-2 !px-3 !text-xs">
          {t('lineSetup.cancel')}
        </button>
      </div>
    </div>
  );
}
