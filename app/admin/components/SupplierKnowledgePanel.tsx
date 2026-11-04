'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpenCheck, Check, ChevronDown, Lightbulb, Loader2, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import type { SupplierLearning, SuggestionKind } from '@/lib/supplier-knowledge';
import { getSupplierKnowledge, saveSupplierRule, setSupplierRuleActive } from '../knowledge-actions';

/**
 * What the reader has learned per supplier, and what it could learn next.
 *
 * Corrections from every restaurant arrive here as evidence. Nothing reaches
 * the reader until it is approved on this screen, and a rule can be switched
 * off the moment it does harm.
 */

const DOC_TYPES = ['', 'FT', 'FR', 'FS'] as const;

function Supplier({ supplier, onChanged }: { supplier: SupplierLearning; onChanged: () => void }) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('');
  const [busy, setBusy] = useState(false);

  const add = async (text: string, source: SuggestionKind | null) => {
    setBusy(true);
    const result = await saveSupplierRule({
      taxId: supplier.taxId,
      vendorName: supplier.vendorName,
      docType: docType || null,
      note: text,
      source,
    });
    setBusy(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error));
      return;
    }
    toast.success(t('admin.knowledge.saved'));
    setNote('');
    onChanged();
  };

  const toggle = async (id: string, active: boolean) => {
    setBusy(true);
    const result = await setSupplierRuleActive({ id, active });
    setBusy(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error));
      return;
    }
    onChanged();
  };

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-muted/50 px-2
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground truncate">{supplier.vendorName}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {t('admin.knowledge.summary')
              .replace('{nif}', supplier.taxId)
              .replace('{corrections}', String(supplier.corrections))
              .replace('{restaurants}', String(supplier.restaurants))
              .replace('{rules}', String(supplier.rules.filter((r) => r.active).length))}
          </span>
        </span>
        {supplier.suggestions.length > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
            <Lightbulb className="w-3 h-3" aria-hidden="true" />
            {supplier.suggestions.length}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-2 pb-4 space-y-4">
          {supplier.suggestions.map((s) => {
            const text = t(`admin.knowledge.suggest.${s.kind}`);
            return (
              <div key={s.kind} className="rounded-xl bg-primary-subtle p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t('admin.knowledge.seen').replace('{count}', String(s.seen))}
                </p>
                <p className="mt-1 text-sm text-foreground">{text}</p>
                <button
                  type="button"
                  onClick={() => add(text, s.kind)}
                  disabled={busy}
                  className="cta-button mt-2 !py-1.5 !px-3 !text-xs disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('admin.knowledge.approve')}
                </button>
              </div>
            );
          })}

          {supplier.rules.length > 0 && (
            <div>
              <h4 className="section-label mb-1">{t('admin.knowledge.rulesTitle')}</h4>
              <ul className="divide-y divide-border-subtle">
                {supplier.rules.map((rule) => (
                  <li key={rule.id} className="flex items-start justify-between gap-3 py-2">
                    <p className={`min-w-0 text-sm ${rule.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {rule.docType && <span className="mr-1.5 text-xs font-semibold text-muted-foreground">{rule.docType}</span>}
                      {rule.note}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggle(rule.id, !rule.active)}
                      disabled={busy}
                      className="shrink-0 text-xs font-semibold text-primary-ink hover:underline disabled:opacity-40"
                    >
                      {t(rule.active ? 'admin.knowledge.switchOff' : 'admin.knowledge.switchOn')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {supplier.examples.length > 0 && (
            <div>
              <h4 className="section-label mb-1">{t('admin.knowledge.examplesTitle')}</h4>
              <ul className="space-y-1 text-xs">
                {supplier.examples.map((e, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground">{e.productName ?? '—'}</span>
                    {' · '}
                    <span className="line-through decoration-warning/60">{e.readValue ?? '—'}</span>
                    {' → '}
                    <span className="text-foreground tabular-nums">{e.savedValue ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">{t('admin.knowledge.newRule')}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t('admin.knowledge.newRulePlaceholder')}
                className="input-field !text-sm w-full"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
                aria-label={t('admin.knowledge.docType')}
                className="input-field !py-1.5 !text-xs !w-auto"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d} value={d}>{d ? t(`admin.knowledge.doc${d}`) : t('admin.knowledge.docAll')}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => add(note, null)}
                disabled={busy || note.trim().length < 10}
                className="cta-button-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t('admin.knowledge.addRule')}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export default function SupplierKnowledgePanel() {
  const { t, language } = useLanguage();
  const [suppliers, setSuppliers] = useState<SupplierLearning[] | null>(null);

  const load = useCallback(() => {
    getSupplierKnowledge().then((result) => {
      if ('error' in result) {
        toast.error(translateError(language, result.error));
        setSuppliers([]);
      } else {
        setSuppliers(result.data.suppliers);
      }
    });
  }, [language]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card-glass p-5 space-y-3" aria-labelledby="supplier-knowledge">
      <div className="flex items-start gap-2">
        <BookOpenCheck className="w-5 h-5 shrink-0 mt-0.5 text-primary-ink" aria-hidden="true" />
        <div>
          <h3 id="supplier-knowledge" className="font-bold text-foreground">{t('admin.knowledge.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('admin.knowledge.body')}</p>
        </div>
      </div>

      {suppliers === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </div>
      ) : suppliers.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t('admin.knowledge.empty')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {suppliers.map((s) => <Supplier key={s.taxId} supplier={s} onChanged={load} />)}
        </ul>
      )}
    </section>
  );
}
