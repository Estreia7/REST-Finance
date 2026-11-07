'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCircle2, FilePlus2, Loader2, Plus, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { checkReading, settleFigures, type TaxTruth } from '@/lib/invoice-checks';
import { INVOICE_UNITS, invoiceUnit,
  PACK_UNITS,
  PACK_UNIT_KEYS,
  followFigures,
  fromPrinted,
  takesPack,
  toPack,
  type PackUnit,
} from '@/lib/line-setup';
import { limitSize, toDataUrl } from '@/lib/scan-image';
import { readQrText } from '@/lib/browser-qr';
import { loadFrameFromFile } from '@/lib/detect-in-file';
import { linesOfReading } from '@/lib/reading-corrections';
import type { CostReceiptResult } from '@/lib/document-scanner';
import ZoomableImage from './ZoomableImage';
import { IssueList } from './ScanIssues';
import {
  adoptDocumentTotal,
  correctReading,
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
  /** Its rate was worked out for the owner, who should look at it. */
  settled?: boolean;
  /** Most lines come as printed, so the question stays out of the way until asked for. */
  packOpen: boolean;
};

const num = (value: string) => Number(value.replace(',', '.'));

/** The rates the invoice's own figures call for, or null when none fit. */
function settledRows(rows: Row[], truth: TaxTruth[], discount: number) {
  const result = settleFigures(rows.map(toLine), truth, discount);
  if (!result) return null;
  return {
    changed: result.changed,
    dropped: result.drop.length > 0,
    vatIncluded: result.vatIncluded,
    discounted: !!result.discounted,
    rows: rows.flatMap((r, i) => {
      if (result.drop.includes(i)) return [];
      const rate = result.rates[i];
      const moved = r.vatRate === '' || num(r.vatRate) !== rate || num(r.total) !== result.totals[i];
      return [{
        ...r,
        vatRate: String(rate),
        total: String(result.totals[i]),
        unitPrice: String(result.unitPrices[i]),
        settled: r.settled || moved,
      }];
    }),
  };
}

/** A reading not saved yet, seen the way a saved invoice is. */
function invoiceOfReading(reading: CostReceiptResult): InvoiceForProof {
  return {
    invoiceNumber: reading.invoiceNumber ?? '',
    vendorName: reading.checks?.knownVendor ?? reading.vendor,
    date: reading.date,
    imagePath: null,
    pagePaths: [],
    issues: [],
    discountTotal: reading.discountTotal ?? 0,
    grandTotal: reading.grandTotal,
    truth: reading.checks?.proof?.truth ?? [],
    lines: linesOfReading(reading.items),
  };
}

const INVOICE_UNIT_KEYS: Record<(typeof INVOICE_UNITS)[number], string> = {
  un: 'lineSetup.unitUn', kg: 'lineSetup.unitKg', L: 'lineSetup.unitL', cx: 'lineSetup.unitCx',
};

const packText = (amount: string, unit: PackUnit) => `${num(amount)} ${unit}`;
const NO_PACK = packText('1', 'un');

function toRow(line: ProofLine, i: number): Row {
  const packAmount = String(line.pack?.amount ?? 1);
  const packUnit = line.pack?.unit ?? 'un';
  return {
    ...line,
    unit: invoiceUnit(line.unit),
    packAmount,
    packUnit,
    packWas: packText(packAmount, packUnit),
    packOpen: packText(packAmount, packUnit) !== NO_PACK,
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

/** Checking a reading before it is saved, instead of an invoice already in the books. */
export interface ProofDraft {
  scanId: string;
  reading: CostReceiptResult;
  /** The pages, when nothing beside this editor is showing them. */
  pictures: string[];
  onCorrected: (reading: CostReceiptResult) => void;
  onCancel: () => void;
}

export default function InvoiceProofEditor({
  invoiceNumber = '', draft, onDone, onLater,
}: {
  invoiceNumber?: string;
  draft?: ProofDraft;
  onDone?: () => void;
  onLater?: () => void;
}) {
  const { t, language } = useLanguage();
  const [invoice, setInvoice] = useState<InvoiceForProof | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [truth, setTruth] = useState<TaxTruth[]>([]);
  const [saving, setSaving] = useState(false);
  const [rereading, setRereading] = useState(false);
  /** A draft takes the document's total when it is saved, not before. */
  const [adoptedTotal, setAdoptedTotal] = useState(false);

  const tell = (result: { changed: number; dropped: boolean; vatIncluded: boolean; discounted: boolean }) => {
    if (result.vatIncluded) toast.info(t('proof.vatIncluded'));
    else if (result.discounted) toast.info(t('proof.discountShared'));
    else if (result.changed > 0) toast.info(t('proof.settled').replace('{count}', String(result.changed)));
    if (result.dropped) toast.info(t('proof.discountDropped'));
  };

  /** Rows as they should open: nobody corrects by hand what the figures settle. */
  const openSettled = (loaded: Row[], figures: TaxTruth[], discount: number) => {
    const lines = loaded.map(toLine);
    const check = checkReading({ items: lines, grandTotal: 0, vatSummary: figures }, null);
    const onlyRates = check.problems.some((p) => p.kind === 'band' || p.kind === 'noRate')
      && !check.problems.some((p) => p.kind === 'line');
    const result = onlyRates ? settledRows(loaded, figures, discount) : null;
    if (!result) return loaded;
    tell(result);
    return result.rows;
  };

  // Read through a ref: a parent's new function must not reload the invoice
  // and throw away what is being typed.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (draft) {
      const opened = invoiceOfReading(draft.reading);
      setInvoice(opened);
      setTruth(opened.truth);
      setRows(openSettled(opened.lines.map(toRow), opened.truth, opened.discountTotal));
      return;
    }
    let stale = false;
    setInvoice(null);
    getInvoiceForProof(invoiceNumber).then((result) => {
      if (stale) return;
      if ('error' in result) {
        toast.error(translateError(language, result.error ?? 'proof.errors.save'));
        done.current?.();
        return;
      }
      setInvoice(result.data);
      setTruth(result.data.truth);
      setRows(openSettled(result.data.lines.map(toRow), result.data.truth, result.data.discountTotal));
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNumber, draft?.scanId, language]);

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

  /** Works the rates out again, after a value has been corrected by hand. */
  const settle = () => {
    const result = settledRows(rows, truth, invoice?.discountTotal ?? 0);
    if (!result) {
      toast.error(t('proof.settleFailed'));
      return;
    }
    setRows(result.rows);
    tell(result);
  };

  const reread = async (qrText?: string | null) => {
    setRereading(true);
    const result = await rereadInvoice(invoiceNumber, qrText);
    setRereading(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'proof.errors.reread'));
      return;
    }
    const figures = result.data.truth.length ? result.data.truth : truth;
    setRows(openSettled(result.data.lines.map(toRow), figures, result.data.discountTotal));
    if (result.data.truth.length) setTruth(result.data.truth);
    setInvoice((was) => was && { ...was, issues: result.data.issues, discountTotal: result.data.discountTotal });
    toast.info(t('proof.rereadDone'));
  };

  /** Another page of this invoice: kept, then everything is read again. */
  const addPage = async (file: File) => {
    setRereading(true);
    try {
      const { frame } = await loadFrameFromFile(file);
      const qrText = await readQrText(frame);
      const dataUrl = toDataUrl(limitSize(frame));
      const response = await fetch('/api/invoices/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber, imageBase64: dataUrl.split(',')[1] }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(translateError(language, body.error ?? 'proof.errors.save'));
        setRereading(false);
        return;
      }
      setInvoice((was) => was && { ...was, pagePaths: [...was.pagePaths, body.path] });
      await reread(qrText);
    } catch {
      toast.error(t('proof.errors.save'));
      setRereading(false);
    }
  };

  /** Takes the document's own total, on the owner's word. */
  const adoptTotal = async () => {
    if (draft) {
      setAdoptedTotal(true);
      setInvoice((was) => was && { ...was, grandTotal: documentTotal });
      return;
    }
    setSaving(true);
    const result = await adoptDocumentTotal({ invoiceNumber, truth });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'proof.errors.save'));
      return;
    }
    setInvoice((was) => was && { ...was, grandTotal: result.data.total });
    toast.success(t('proof.totalAdopted'));
  };

  const save = async (accept: boolean) => {
    setSaving(true);
    if (draft) {
      const result = await correctReading({ scanId: draft.scanId, lines: rows.map(toLine), adoptTotal: adoptedTotal, accept });
      setSaving(false);
      if ('error' in result) toast.error(translateError(language, result.error ?? 'proof.errors.save'));
      else draft.onCorrected(result.data);
      return;
    }
    const result = await saveInvoiceProof({ invoiceNumber, lines: rows.map(toLine), truth, accept });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error ?? 'proof.errors.save'));
      return;
    }
    toast.success(t('proof.saved'));
    onDone?.();
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
  const rates = [...new Set([...truth.map((b) => b.rate), 6, 13, 23, 0])];
  const bands = truth.map((b) => ({
    ...b,
    found: rows.map(toLine).filter((l) => l.vatRate === b.rate).reduce((sum, l) => sum + l.total, 0),
  }));
  const documentTotal = Math.round(truth.reduce((sum, b) => sum + b.base + b.tax, 0) * 100) / 100;
  const allBands = bands.reduce(
    (sum, b) => ({ base: sum.base + b.base, tax: sum.tax + b.tax, found: sum.found + b.found }),
    { base: 0, tax: 0, found: 0 },
  );

  // Says what is really wrong: a VAT rate off by a line is not a bad multiplication.
  const adriftMessage = () => {
    const total = proof.problems.find((p) => p.kind === 'total');
    if (total?.kind === 'total' && proof.problems.length === 1) {
      return t('proof.totalOff')
        .replace('{found}', formatMoney(total.found))
        .replace('{expected}', formatMoney(total.expected));
    }
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
    <div className={draft ? 'space-y-5' : 'grid gap-5 lg:grid-cols-2'}>
      {draft && draft.pictures.map((src) => (
        <ZoomableImage key={src} src={src} alt={t('scanIssues.pictureAlt')} className="w-full max-h-[50vh] object-contain rounded-xl border border-border-subtle" />
      ))}
      {!draft && <div className="min-w-0">
        {invoice.imagePath && !invoice.imagePath.endsWith('.pdf') ? (
          <div className="space-y-3">
            {[invoice.imagePath, ...invoice.pagePaths].map((path) => (
              <ZoomableImage
                key={path}
                src={`/api/images/${path}`}
                alt={t('proof.imageAlt').replace('{number}', invoice.invoiceNumber)}
                className="w-full rounded-xl border border-border-subtle lg:max-h-[75vh] lg:object-contain"
              />
            ))}
          </div>
        ) : invoice.imagePath ? (
          <a href={`/api/images/${invoice.imagePath}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary-ink underline">
            {t('proof.openPdf')}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{t('proof.noImage')}</p>
        )}
      </div>}

      <div className="min-w-0 space-y-3">
        {!draft && <header>
          <h2 className="text-base font-bold text-foreground">{invoice.vendorName ?? invoice.invoiceNumber}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {invoice.invoiceNumber}{invoice.date ? ` · ${invoice.date}` : ''} · {t('proof.total').replace('{amount}', formatMoney(invoice.grandTotal))}
          </p>
        </header>}

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

        {invoice.issues.length > 0 && (
          <div className="rounded-lg bg-warning/10 px-3 py-2">
            <IssueList issues={invoice.issues} />
          </div>
        )}

        {canCheck && Math.abs(documentTotal - invoice.grandTotal) > 0.01 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-foreground">
            <span>
              {t('proof.totalDiffers')
                .replace('{document}', formatMoney(documentTotal))
                .replace('{saved}', formatMoney(invoice.grandTotal))}
            </span>
            <button type="button" onClick={adoptTotal} disabled={saving} className="cta-button !py-1.5 !px-3 !text-xs disabled:opacity-40">
              {t('proof.adoptTotal').replace('{amount}', formatMoney(documentTotal))}
            </button>
          </div>
        )}

        {canCheck && (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-border-subtle">
              <table className="w-full text-xs tabular-nums">
                <caption className="sr-only">{t('proof.tableCaption')}</caption>
                <thead>
                  <tr className="text-[11px] text-muted-foreground">
                    <th scope="col" className="px-3 py-1.5 text-left font-medium">{t('proof.tableRate')}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('proof.net')}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('proof.tableTax')}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('proof.tableGross')}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('proof.tableLines')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => {
                    const right = Math.abs(b.found - b.base) < 0.05;
                    return (
                      <tr key={b.rate} className="border-t border-border-subtle">
                        <th scope="row" className="px-3 py-1.5 text-left font-semibold text-foreground">{b.rate}%</th>
                        <td className="px-3 py-1.5 text-right text-foreground">{formatMoney(b.base)}</td>
                        <td className="px-3 py-1.5 text-right text-foreground">{formatMoney(b.tax)}</td>
                        <td className="px-3 py-1.5 text-right text-foreground">{formatMoney(b.base + b.tax)}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${right ? 'text-success' : 'text-warning'}`}>
                          {right && <Check className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />}
                          {formatMoney(b.found)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border-subtle font-semibold text-foreground">
                    <th scope="row" className="px-3 py-1.5 text-left">{t('proof.tableTotal')}</th>
                    <td className="px-3 py-1.5 text-right">{formatMoney(allBands.base)}</td>
                    <td className="px-3 py-1.5 text-right">{formatMoney(allBands.tax)}</td>
                    <td className="px-3 py-1.5 text-right">{formatMoney(allBands.base + allBands.tax)}</td>
                    <td className="px-3 py-1.5 text-right">{formatMoney(allBands.found)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(band || noRate) && (
              <button
                type="button"
                onClick={settle}
                className="cta-button !py-1.5 !px-3 !text-xs"
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                {t('proof.settle')}
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t('proof.asPrinted')}</p>

        <ul className="space-y-2">
          {rows.map((row, i) => {
            const line = toLine(row);
            const pack = toPack({ amount: num(row.packAmount), unit: row.packUnit });
            const inside = line.pack && pack ? fromPrinted(line, pack) : null;
            return (
            <li
              key={row.key}
              className={`rounded-xl border p-3 ${adrift.has(i) ? 'border-warning' : row.settled ? 'border-primary' : 'border-border-subtle'}`}
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
                    {name === 'unit' ? (
                      <select
                        value={row.unit ?? ''}
                        onChange={(e) => change(row.key, 'unit', e.target.value)}
                        className={field}
                      >
                        {!row.unit && <option value="">—</option>}
                        {INVOICE_UNITS.map((u) => <option key={u} value={u}>{t(INVOICE_UNIT_KEYS[u])}</option>)}
                        {/* Printed in a way the list does not know: kept, not lost. */}
                        {row.unit && !INVOICE_UNITS.some((u) => u === row.unit) && (
                          <option value={row.unit}>{row.unit}</option>
                        )}
                      </select>
                    ) : name === 'vatRate' ? (
                      <select
                        value={row.vatRate}
                        onChange={(e) => change(row.key, 'vatRate', e.target.value)}
                        className={field}
                      >
                        {row.vatRate === '' && <option value="">—</option>}
                        {rates.map((rate) => <option key={rate} value={String(rate)}>{rate}%</option>)}
                        {row.vatRate !== '' && !rates.includes(num(row.vatRate)) && (
                          <option value={row.vatRate}>{row.vatRate}%</option>
                        )}
                      </select>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row[name] ?? ''}
                        onChange={(e) => change(row.key, name, e.target.value)}
                        className={field}
                      />
                    )}
                  </label>
                ))}
              </div>

              {takesPack(line.quantity, row.unit) && !row.packOpen && (
                <button
                  type="button"
                  onClick={() => setRows((was) => was.map((r) => (r.key === row.key ? { ...r, packOpen: true } : r)))}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary-ink"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  {t('proof.packAdd')}
                </button>
              )}

              {takesPack(line.quantity, row.unit) && row.packOpen && (
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
                    <button
                      type="button"
                      onClick={() => setRows((was) => was.map((r) => (
                        r.key === row.key ? { ...r, packAmount: '1', packUnit: 'un', packOpen: false } : r
                      )))}
                      aria-label={`${t('proof.packRemove')}: ${row.productName}`}
                      className="ml-auto shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
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
            {draft ? t('scanIssues.fixDone') : t('proof.confirm')}
          </button>
          {draft && (
            <button type="button" onClick={draft.onCancel} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
              {t('common.back')}
            </button>
          )}
          {invoice.imagePath && (
            <button
              type="button"
              onClick={() => reread()}
              disabled={rereading}
              className="cta-button-secondary !py-2.5 !px-4 !text-sm disabled:opacity-40"
            >
              {rereading
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
              {t('proof.reread')}
            </button>
          )}
          {invoice.imagePath && !invoice.imagePath.endsWith('.pdf') && (
            <label className={`cta-button-secondary !py-2.5 !px-4 !text-sm cursor-pointer ${rereading ? 'opacity-40 pointer-events-none' : ''}`}>
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              {t('scanIssues.addPage')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void addPage(file);
                }}
              />
            </label>
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
