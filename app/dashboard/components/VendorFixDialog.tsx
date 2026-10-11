'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import Dialog from './Dialog';
import {
  getVendorFixContext, renameVendor, moveInvoiceToVendor, deleteEmptyVendor,
} from '../vendor-fix-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

/**
 * Corrects who an invoice is from.
 *
 * Asks which of the two mistakes it is, because they are fixed differently:
 * a supplier whose name was read wrong is renamed, and every one of its
 * invoices follows; an invoice filed under the wrong company is moved on its
 * own. Opened on a supplier rather than an invoice, only the first applies.
 */

type Vendor = { id: string; name: string; taxId: string | null };
interface Context {
  invoice: { number: string; date: string | null; total: number; lineCount: number } | null;
  current: (Vendor & { invoices: number }) | null;
  readings: Array<{ name: string; taxId: string | null }>;
  vendors: Vendor[];
}

const NEW = '__new__';

export default function VendorFixDialog({
  invoiceNumber, vendorId, onClose, onDone,
}: {
  invoiceNumber?: string;
  vendorId?: string;
  onClose: () => void;
  /** After any change, so the list behind the dialog reloads. */
  onDone: () => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [ctx, setCtx] = useState<Context | null>(null);
  const [mode, setMode] = useState<'rename' | 'move'>('rename');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [target, setTarget] = useState('');
  const [newName, setNewName] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [conflict, setConflict] = useState<Vendor | null>(null);
  const [orphans, setOrphans] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    getVendorFixContext({ invoiceNumber, vendorId }).then((r) => {
      if (stale) return;
      if ('error' in r) { toast.error(t(r.error ?? 'errors.read')); onClose(); return; }
      setCtx(r.data);
      setName(r.data.current?.name ?? '');
      setTaxId(r.data.current?.taxId ?? '');
      // No supplier at all: there is nothing to rename, only somewhere to put it.
      if (!r.data.current) setMode('move');
    });
    return () => { stale = true; };
    // Loaded once per dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNumber, vendorId]);

  const fail = (key?: string) => toast.error(t(key ?? 'errors.write'));

  const saveRename = async (mergeIntoId?: string) => {
    if (!ctx?.current) return;
    setBusy(true);
    const r = await renameVendor({ vendorId: ctx.current.id, name, taxId, mergeIntoId: mergeIntoId ?? null });
    setBusy(false);
    if ('error' in r) return fail(r.error);
    if (r.data.conflict) { setConflict(r.data.conflict); return; }
    toast.success(r.data.merged ? t('vendorFix.merged') : t('vendorFix.renamed'));
    onDone();
    onClose();
  };

  const saveMove = async () => {
    if (!invoiceNumber) return;
    setBusy(true);
    const r = await moveInvoiceToVendor({
      invoiceNumber,
      toVendorId: target && target !== NEW ? target : null,
      newVendor: target === NEW ? { name: newName, taxId: newTaxId } : null,
    });
    setBusy(false);
    if ('error' in r) return fail(r.error);
    toast.success(t('vendorFix.moved').replace('{vendor}', r.data.vendor.name));
    onDone();
    if (r.data.orphans.length) setOrphans(r.data.orphans);
    else onClose();
  };

  const removeOrphan = async (id: string) => {
    setBusy(true);
    const r = await deleteEmptyVendor(id);
    setBusy(false);
    if ('error' in r) return fail(r.error);
    toast.success(t('vendorFix.deleted'));
    const rest = orphans.filter((o) => o.id !== id);
    setOrphans(rest);
    onDone();
    if (rest.length === 0) onClose();
  };

  const title = t('vendorFix.title');
  if (!ctx) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
        </div>
      </Dialog>
    );
  }

  // After a move left a supplier empty: offer to tidy it away.
  if (orphans.length) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="space-y-3">
          {orphans.map((o) => (
            <div key={o.id} className="rounded-xl bg-muted p-4 space-y-3">
              <p className="text-sm text-foreground [overflow-wrap:anywhere]">
                {t('vendorFix.orphan').replace('{vendor}', o.name)}
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => removeOrphan(o.id)} className="cta-button !py-2 !px-4 !text-sm">
                  {t('vendorFix.deleteVendor')}
                </button>
                <button type="button" onClick={onClose} className="cta-button-secondary !py-2 !px-4 !text-sm">
                  {t('vendorFix.keepVendor')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    );
  }

  const others = ctx.vendors.filter((v) => v.id !== ctx.current?.id);
  const option = (value: 'rename' | 'move', label: string, hint: string) => (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors
        ${mode === value ? 'border-primary bg-primary-subtle' : 'border-border-subtle bg-surface hover:border-border'}`}
    >
      <input
        type="radio"
        name="vendor-fix-mode"
        checked={mode === value}
        onChange={() => { setMode(value); setConflict(null); }}
        className="mt-0.5 accent-primary"
      />
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog title={title} onClose={onClose}>
      <div className="space-y-4">
        {ctx.invoice && (
          <p className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">
            <span className="font-semibold text-foreground">{ctx.invoice.number}</span>
            {ctx.invoice.date && <> · {new Date(`${ctx.invoice.date}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })}</>}
            {' · '}{formatMoney(ctx.invoice.total, { decimals: 2 })}
            {ctx.invoice.lineCount > 0 && <> · {t('accounting.lineCount').replace('{n}', String(ctx.invoice.lineCount))}</>}
          </p>
        )}

        {ctx.current && (
          <div className="rounded-xl bg-muted px-4 py-3">
            <p className="text-[11px] text-muted-foreground">{t('vendorFix.filedUnder')}</p>
            <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{ctx.current.name}</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {ctx.current.taxId ? `NIF ${ctx.current.taxId} · ` : ''}
              {ctx.current.invoices === 1 ? t('vendorFix.invoiceCountOne') : t('vendorFix.invoiceCount').replace('{n}', String(ctx.current.invoices))}
            </p>
          </div>
        )}

        {/* What another reading of this same page said. Often the second scan
            read it right and was refused only as a duplicate. */}
        {ctx.readings.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary-subtle px-4 py-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary-ink" aria-hidden="true" />
              {t('vendorFix.otherReading')}
            </p>
            {ctx.readings.map((r) => (
              <div key={r.name} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-foreground [overflow-wrap:anywhere]">
                  {r.name}{r.taxId ? <span className="text-xs text-muted-foreground"> · NIF {r.taxId}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // Same NIF as the supplier on file: it is the name that is wrong.
                    if (ctx.current && (!r.taxId || r.taxId === ctx.current.taxId)) {
                      setMode('rename'); setName(r.name); if (r.taxId) setTaxId(r.taxId);
                    } else {
                      setMode('move'); setTarget(NEW); setNewName(r.name); setNewTaxId(r.taxId ?? '');
                    }
                    setConflict(null);
                  }}
                  className="text-xs font-semibold text-primary-ink hover:underline"
                >
                  {t('vendorFix.useThis')}
                </button>
              </div>
            ))}
          </div>
        )}

        {ctx.current && invoiceNumber && (
          <div className="space-y-2" role="radiogroup" aria-label={title}>
            {option('rename', t('vendorFix.renameTitle'), ctx.current.invoices === 1 ? t('vendorFix.renameHintOne') : t('vendorFix.renameHint').replace('{n}', String(ctx.current.invoices)))}
            {option('move', t('vendorFix.moveTitle'), t('vendorFix.moveHint'))}
          </div>
        )}

        {mode === 'rename' && ctx.current ? (
          <form onSubmit={(e) => { e.preventDefault(); saveRename(); }} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t('vendorFix.name')}</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setConflict(null); }} maxLength={200} className="input-field" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t('vendorFix.nif')}</span>
              <input value={taxId} onChange={(e) => { setTaxId(e.target.value); setConflict(null); }} inputMode="numeric" maxLength={11} className="input-field tabular-nums" />
            </label>

            {conflict && (
              <div className="rounded-xl bg-warning/10 p-3 space-y-2">
                <p className="flex items-start gap-2 text-xs text-warning font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t('vendorFix.conflict').replace('{vendor}', conflict.name)}
                </p>
                <button type="button" disabled={busy} onClick={() => saveRename(conflict.id)} className="cta-button !py-2 !px-4 !text-sm">
                  {t('vendorFix.mergeBoth')}
                </button>
              </div>
            )}

            {!conflict && (
              <button type="submit" disabled={busy || name.trim().length < 2} className="cta-button w-full justify-center">
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {t('vendorFix.saveRename')}
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); saveMove(); }} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t('vendorFix.moveTo')}</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="input-field">
                <option value="" disabled>{t('vendorFix.choose')}</option>
                {others.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.taxId ? ` · ${v.taxId}` : ''}</option>
                ))}
                <option value={NEW}>{t('vendorFix.newVendor')}</option>
              </select>
            </label>
            {target === NEW && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t('vendorFix.name')}</span>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} className="input-field" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t('vendorFix.nif')}</span>
                  <input value={newTaxId} onChange={(e) => setNewTaxId(e.target.value)} inputMode="numeric" maxLength={11} className="input-field tabular-nums" />
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={busy || !target || (target === NEW && newName.trim().length < 2)}
              className="cta-button w-full justify-center"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('vendorFix.saveMove')}
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
