'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, FileSearch, Loader2, Plus, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import {
  PACK_UNITS,
  ingredientUnitFor,
  isMeasured,
  restateLine,
  toPack,
  type PackUnit,
} from '@/lib/line-setup';
import { saveLineSetup, type LineSetupData, type SetupLine } from '../line-setup-actions';
import CategoryPicker from './CategoryPicker';
import Dialog from './Dialog';
import InvoiceProofEditor from './InvoiceProofEditor';
import IngredientSearch from './IngredientSearch';

/**
 * One wording, explained once: what it is, how it comes, what cost it is.
 *
 * The sum under "how it comes" is the point of the screen. "6 comprados = 24
 * unidades · €0,38 cada" is what lets the owner check the answer before
 * saving it, in the words they would use at the counter.
 */

const UNIT_KEYS: Record<PackUnit, string> = {
  un: 'lineSetup.unitUn', kg: 'lineSetup.unitKg', g: 'lineSetup.unitG', L: 'lineSetup.unitL', ml: 'lineSetup.unitMl',
};

export default function LineSetupCard({
  line, ingredients, categories, onSaved, onLater, laterLabel,
}: {
  line: SetupLine;
  ingredients: LineSetupData['ingredients'];
  categories: LineSetupData['categories'];
  onSaved: () => void;
  onLater?: () => void;
  laterLabel?: string;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const [chosen, setChosen] = useState<string[]>(line.ingredientIds);
  const [newName, setNewName] = useState<string | null>(null);
  const [notIngredient, setNotIngredient] = useState(line.notIngredient);
  const [amount, setAmount] = useState(String(line.pack?.amount ?? 1));
  const [unit, setUnit] = useState<PackUnit>(line.pack?.unit ?? 'un');
  const [categoryId, setCategoryId] = useState<string | null>(line.categoryId);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const runningCost = categories.find((c) => c.id === categoryId)?.type === 'OPEX';
  const skipIngredient = notIngredient || runningCost;
  const measured = isMeasured(line.unit);

  const offered = useMemo(() => {
    const out = new Map(line.suggestions.map((s) => [s.id, s.name]));
    for (const id of chosen) {
      const found = ingredients.find((i) => i.id === id);
      if (found) out.set(found.id, found.name);
    }
    return [...out.entries()].map(([id, name]) => ({ id, name }));
  }, [line.suggestions, chosen, ingredients]);

  const parsed = Number(amount.replace(',', '.'));
  // A line printed by weight is counted already: nothing to multiply.
  const pack = toPack(measured ? { amount: 1, unit: 'un' } : { amount: parsed, unit });

  const sum = useMemo(() => {
    if (!pack || measured || pack === 'packages') return null;
    return restateLine({ quantity: line.quantity, unit: line.unit, total: line.total, packFactor: null }, pack);
  }, [pack, measured, line.quantity, line.unit, line.total]);

  const unitLabel = (u: string) => (u === 'un' ? t('lineSetup.unitsShort') : u);

  const mismatched = !skipIngredient && !measured && chosen.some((id) => {
    const found = ingredients.find((i) => i.id === id);
    return found && found.unit !== ingredientUnitFor(unit);
  });

  const toggle = (id: string) => {
    setNotIngredient(false);
    setChosen((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  };

  const answered = skipIngredient || chosen.length > 0 || !!newName?.trim();

  const save = async () => {
    if (!line.vendorId) return;
    setSaving(true);
    const result = await saveLineSetup({
      vendorId: line.vendorId,
      sourceName: line.sourceName,
      ingredientIds: skipIngredient ? [] : chosen,
      newIngredient: skipIngredient ? null : newName,
      notIngredient: skipIngredient,
      pack: measured ? { amount: 1, unit: 'un' } : { amount: parsed, unit },
      categoryId,
    });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'lineSetup.errors.save'));
      return;
    }
    toast.success(
      t(result.data.lines === 1 ? 'lineSetup.savedOne' : 'lineSetup.savedMany').replace('{count}', String(result.data.lines)),
    );
    onSaved();
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-bold text-foreground break-words">{line.productName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            line.vendorName,
            t(line.lines === 1 ? 'lineSetup.linesOne' : 'lineSetup.linesMany').replace('{count}', String(line.lines)),
            t('lineSetup.spent').replace('{amount}', formatMoney(line.spent)),
          ].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {t('lineSetup.lastBought')
            .replace('{quantity}', `${line.quantity.toLocaleString(locale)}${line.unit ? ` ${line.unit}` : ''}`)
            .replace('{total}', formatMoney(line.total))}
        </p>
        {line.usualPrice !== null && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t('lineSetup.unusualPrice').replace('{amount}', formatMoney(line.usualPrice))}
          </p>
        )}
        {line.invoiceNumber && (
          <button
            type="button"
            onClick={() => setChecking(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
          >
            <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
            {t('lineSetup.checkInvoice')}
          </button>
        )}
      </header>

      {checking && line.invoiceNumber && (
        <Dialog wide onClose={() => setChecking(false)} title={t('lineSetup.checkInvoice')}>
          <InvoiceProofEditor
            invoiceNumber={line.invoiceNumber}
            onDone={() => { setChecking(false); onSaved(); }}
          />
        </Dialog>
      )}

      <section aria-labelledby={`what-${line.key}`}>
        <h3 id={`what-${line.key}`} className="text-sm font-semibold text-foreground">{t('lineSetup.whatIsIt')}</h3>
        {runningCost ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('lineSetup.runningCost')}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {offered.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {offered.map((o) => {
                  const on = chosen.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                        ${on
                          ? 'border-primary bg-primary-subtle text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-primary'}`}
                    >
                      {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}

            {!notIngredient && (
              <IngredientSearch
                candidates={ingredients}
                exclude={chosen}
                label={t('reconcile.searchIngredient')}
                onPick={toggle}
              />
            )}

            {newName !== null && !notIngredient && (
              <label className="block">
                <span className="text-xs text-muted-foreground block mb-1">{t('lineSetup.newIngredientName')}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={80}
                    className="input-field !py-1.5 !text-xs w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setNewName(null)}
                    aria-label={t('lineSetup.cancelNewIngredient')}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {newName === null && !notIngredient && (
                <button
                  type="button"
                  onClick={() => setNewName(line.productName)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('lineSetup.createIngredient')}
                </button>
              )}
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={notIngredient}
                  onChange={(e) => setNotIngredient(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                {t('lineSetup.notIngredient')}
              </label>
            </div>
          </div>
        )}
      </section>

      {!skipIngredient && (
        <section aria-labelledby={`how-${line.key}`}>
          <h3 id={`how-${line.key}`} className="text-sm font-semibold text-foreground">{t('lineSetup.howItComes')}</h3>
          {measured ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('lineSetup.alreadyMeasured')}</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span>{t('lineSetup.eachOneHolds')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={t('lineSetup.amountLabel')}
                  className="input-field !py-1.5 !text-sm !w-24 tabular-nums"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as PackUnit)}
                  aria-label={t('lineSetup.unitLabel')}
                  className="input-field !py-1.5 !text-sm !w-auto"
                >
                  {PACK_UNITS.map((u) => <option key={u} value={u}>{t(UNIT_KEYS[u])}</option>)}
                </select>
              </div>
              {sum && (
                <p className="mt-2 rounded-lg bg-primary-subtle px-3 py-2 text-xs font-medium text-foreground tabular-nums">
                  {t('lineSetup.sum')
                    .replace('{bought}', line.quantity.toLocaleString(locale))
                    .replace('{quantity}', `${sum.quantity.toLocaleString(locale)} ${unitLabel(sum.unit)}`)
                    .replace('{price}', formatMoney(sum.unitPrice))
                    .replace('{unit}', unitLabel(sum.unit))}
                </p>
              )}
              {!pack && <p className="mt-2 text-xs text-danger">{t('lineSetup.errors.pack')}</p>}
              {mismatched && <p className="mt-2 text-xs text-warning">{t('lineSetup.unitMismatch')}</p>}
            </>
          )}
        </section>
      )}

      {categories.length > 0 && (
        <section aria-labelledby={`cat-${line.key}`}>
          <h3 id={`cat-${line.key}`} className="text-sm font-semibold text-foreground mb-2">{t('lineSetup.category')}</h3>
          <CategoryPicker
            categories={categories}
            value={categoryId}
            origin="owner"
            productName={line.productName}
            allowApplyToAll={false}
            onChange={(id) => setCategoryId(id)}
          />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving || !answered || !pack || !line.vendorId}
          className="cta-button !py-2.5 !px-4 !text-sm disabled:opacity-40"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Check className="w-4 h-4" aria-hidden="true" />}
          {t('lineSetup.save')}
        </button>
        {onLater && (
          <button type="button" onClick={onLater} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
            {laterLabel ?? t('lineSetup.later')}
          </button>
        )}
      </div>
    </div>
  );
}
