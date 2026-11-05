'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCircle2, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { checkReading, type TaxTruth } from '@/lib/invoice-checks';
import {
  PACK_UNITS,
  PACK_UNIT_KEYS,
  followFigures,
  fromPrinted,
  takesPack,
  toPack,
  type PackUnit,
} from '@/lib/line-setup';
import ZoomableImage from './ZoomableImage';
import {
  getInvoiceForProof,
  rereadInvoice,
  saveInvoiceProof,
  type InvoiceForProof,
  type ProofLine,
} from '../invoice-proof-actions';

/**
 * An invoice beside its photograph, with what is still missing in plain view.
 *
 * The bar is the point of the screen: it says how far the lines are from the
 * document as each figure is typed, so the owner knows when they are done.
 *
 * The figures are the invoice's own, copied as printed. What each one holds sits
 * under them as a separate answer: it belongs to the product, so it is taught
 * once and the next invoice works it out whatever quantity it brings.
 */

type Row = Omit<ProofLine, 'quantity' | 'unitPrice' | 'total' | 'vatRate' | 'pack' | 'packChanged'> & {
  key: string;
  quantity: string;
  unitPrice: string;
  total: string;
  vatRate: string;
  packAmount: string;
  packUnit: PackUnit;
  /** As it came, to tell an answer from what was already known. */
  packWas: string;
};

const num = (value: string) => Number(value.replace(',', '.'));

const packText = (amount: string, unit: PackUnit) => `${num(amount)} ${unit}`;
const NO_PACK = packText('1', 'un');

function toRow(line: ProofLine, i: number): Row {
  const packAmount = String(line.pack?.amount ?? 1);
  const packUnit = line.pack?.unit ?? 'un';
  return {
    ...line,
    packAmount,
    packUnit,
    packWas: packText(packAmount, packUnit),
    key: line.id ?? `new-${i}-${line.productName}`,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
    total: String(line.total),
    vatRate: line.vatRate === null ? '' : String(line.vatRate),
  };
}

function toLine(row: Row): ProofLine {
  const quantity = num(row.quantity);
  const pack = packText(row.packAmount, row.packUnit);
  const applies = takesPack(quantity, row.unit);
  return {
    id: row.id,
    productName: row.productName,
    unit: row.unit,
    quantity,
    unitPrice: num(row.unitPrice),
    total: num(row.total),
    vatRate: row.vatRate.trim() === '' ? null : num(row.vatRate),
    pack: applies && pack !== NO_PACK ? { amount: num(row.packAmount), unit: row.packUnit } : null,
    packChanged: applies && pack !== row.packWas,
  };
}

export default function InvoiceProofEditor({
  invoiceNumber, onDone, onLater,
}: {
  invoiceNumber: string;
  onDone: () => void;
  onLater?: () => void;
}) {
  const { t, language } = useLanguage();
  const [invoice, setInvoice] = useState<InvoiceForProof | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [truth, setTruth] = useState<TaxTruth[]>([]);
  const [saving, setSaving] = useState(false);
  const [rereading, setRereading] = useState(false);

  // Read through a ref: a parent's new function must not reload the invoice
  // and throw away what is being typed.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let stale = false;
    setInvoice(null);
    getInvoiceForProof(invoiceNumber).then((result) => {
      if (stale) return;
      if ('error' in result) {
        toast.error(translateError(language, result.error ?? 'proof.errors.save'));
        done.current();
        return;
      }
      setInvoice(result.data);
      setTruth(result.data.truth);
      setRows(result.data.lines.map(toRow));
    });
    return () => { stale = true; };
  }, [invoiceNumber, language]);

  const proof = useMemo(
    () => checkReading({ items: rows.map(toLine), grandTotal: invoice?.grandTotal ?? 0, vatSummary: truth }, null),
    [rows, truth, invoice?.grandTotal],
  );
  const adrift = useMemo(
    () => new Set(proof.problems.flatMap((p) => (p.kind === 'line' || p.kind === 'lineVat' ? [p.index] : []))),
    [proof],
  );

  const change = useCallback((key: string, field: keyof Row, value: string) => {
    setRows((was) => was.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, [field]: value };
      if (field !== 'quantity' && field !== 'unitPrice') return next;
      // A new quantity or price changes the line's value: 0,905 kg at 3,69 is 3,34.
      const { total } = followFigures(num(next.quantity), num(next.unitPrice), num(next.total), 'unitPrice');
      return Number.isFinite(total) ? { ...next, total: String(total) } : next;
    }));
  }, []);

  const reread = async () => {
    setRereading(true);
    const result = await rereadInvoice(invoiceNumber);
    setRereading(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'proof.errors.reread'));
      return;
    }
    setRows(result.data.lines.map(toRow));
    if (result.data.truth.length) setTruth(result.data.truth);
    toast.info(t('proof.rereadDone'));
  };

  const save = async (accept: boolean) => {
    setSaving(true);
    const result = await saveInvoiceProof({ invoiceNumber, lines: rows.map(toLine), truth, accept });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'proof.errors.save'));
      return;
    }
    toast.success(t('proof.saved'));
    onDone();
  };

  if (!invoice) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }

  const ok = proof.status !== 'failed';
  const canCheck = truth.length > 0;
  const band = proof.problems.find((p) => p.kind === 'band');
  const noRate = proof.problems.some((p) => p.kind === 'noRate');
  const offBy = Math.abs(proof.gap) > 0.05;

  // Says what is really wrong: a VAT rate off by a line is not a bad multiplication.
  const adriftMessage = () => {
    if (offBy) {
      return t(proof.gap > 0 ? 'proof.short' : 'proof.over').replace('{amount}', formatMoney(Math.abs(proof.gap)));
    }
    if (adrift.size === 0 && band?.kind === 'band') {
      return t('proof.bandOff')
        .replace('{rate}', String(band.rate))
        .replace('{found}', formatMoney(band.found))
        .replace('{expected}', formatMoney(band.expected));
    }
    return t(adrift.size === 0 && noRate ? 'proof.noRate' : 'proof.linesOff');
  };
  const field = 'input-field !py-1.5 !px-2 !text-xs tabular-nums w-full';

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0">
        {invoice.imagePath && !invoice.imagePath.endsWith('.pdf') ? (
          <ZoomableImage
            src={`/api/images/${invoice.imagePath}`}
            alt={t('proof.imageAlt').replace('{number}', invoice.invoiceNumber)}
            className="w-full rounded-xl border border-border-subtle lg:max-h-[75vh] lg:object-contain"
          />
        ) : invoice.imagePath ? (
          <a href={`/api/images/${invoice.imagePath}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary-ink underline">
            {t('proof.openPdf')}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{t('proof.noImage')}</p>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <header>
          <h2 className="text-base font-bold text-foreground">{invoice.vendorName ?? invoice.invoiceNumber}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {invoice.invoiceNumber}{invoice.date ? ` · ${invoice.date}` : ''} · {t('proof.total').replace('{amount}', formatMoney(invoice.grandTotal))}
          </p>
        </header>

        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
            !canCheck ? 'bg-muted text-muted-foreground' : ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
        >
          {ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />}
          <span>
            {!canCheck
              ? t('proof.noFigures')
              : ok
                ? t('proof.adds')
                : adriftMessage()}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{t('proof.asPrinted')}</p>

        <ul className="space-y-2">
          {rows.map((row, i) => {
            const line = toLine(row);
            const pack = toPack({ amount: num(row.packAmount), unit: row.packUnit });
            const inside = line.pack && pack ? fromPrinted(line, pack) : null;
            return (
            <li
              key={row.key}
              className={`rounded-xl border p-3 ${adrift.has(i) ? 'border-warning' : 'border-border-subtle'}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.productName}
                  onChange={(e) => change(row.key, 'productName', e.target.value)}
                  aria-label={t('proof.product')}
                  className="input-field !py-1.5 !px-2 !text-xs font-semibold w-full"
                />
                <button
                  type="button"
                  onClick={() => setRows((was) => was.filter((r) => r.key !== row.key))}
                  aria-label={`${t('proof.removeLine')}: ${row.productName}`}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-muted transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {([
                  ['quantity', 'proof.quantityPrinted'],
                  ['unit', 'proof.unit'],
                  ['unitPrice', 'proof.unitPrice'],
                  ['total', 'proof.net'],
                  ['vatRate', 'proof.vat'],
                ] as const).map(([name, label]) => (
                  <label key={name} className="block min-w-0">
                    <span className="block text-[10px] text-muted-foreground mb-0.5 truncate">{t(label)}</span>
                    <input
                      type="text"
                      inputMode={name === 'unit' ? 'text' : 'decimal'}
                      value={row[name] ?? ''}
                      onChange={(e) => change(row.key, name, e.target.value)}
                      className={field}
                    />
                  </label>
                ))}
              </div>

              {takesPack(line.quantity, row.unit) && (
                <div className="mt-2 border-t border-border-subtle pt-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] text-muted-foreground">{t('proof.packEach')}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.packAmount}
                      onChange={(e) => change(row.key, 'packAmount', e.target.value)}
                      aria-label={`${t('proof.packEach')}: ${row.productName}`}
                      className="input-field !py-1 !px-2 !text-xs tabular-nums !w-16"
                    />
                    <select
                      value={row.packUnit}
                      onChange={(e) => change(row.key, 'packUnit', e.target.value)}
                      aria-label={`${t('lineSetup.unitLabel')}: ${row.productName}`}
                      className="input-field !py-1 !px-2 !text-xs !w-auto"
                    >
                      {PACK_UNITS.map((u) => <option key={u} value={u}>{t(PACK_UNIT_KEYS[u])}</option>)}
                    </select>
                    {inside && (
                      <span className="text-[11px] font-medium text-foreground tabular-nums">
                        {t('proof.packResult')
                          .replace('{quantity}', String(inside.quantity).replace('.', language === 'pt' ? ',' : '.'))
                          .replaceAll('{unit}', inside.unit === 'un' ? t('lineSetup.unitsShort') : inside.unit ?? '')
                          .replace('{price}', formatMoney(inside.unitPrice))}
                      </span>
                    )}
                  </div>
                  {line.packChanged && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{t('proof.packTaught')}</p>
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => setRows((was) => [...was, toRow({
            productName: '', quantity: 1, unit: 'un', unitPrice: 0, total: 0, vatRate: null, pack: null,
          }, was.length)])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          {t('proof.addLine')}
        </button>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving || !ok}
            className="cta-button !py-2.5 !px-4 !text-sm disabled:opacity-40"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <Check className="w-4 h-4" aria-hidden="true" />}
            {t('proof.confirm')}
          </button>
          {invoice.imagePath && (
            <button
              type="button"
              onClick={reread}
              disabled={rereading}
              className="cta-button-secondary !py-2.5 !px-4 !text-sm disabled:opacity-40"
            >
              {rereading
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
              {t('proof.reread')}
            </button>
          )}
          {onLater && (
            <button type="button" onClick={onLater} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
              {t('lineSetup.later')}
            </button>
          )}
          {!ok && (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
            >
              {t('proof.acceptAnyway')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
