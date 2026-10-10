'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import Dialog from './Dialog';
import ReceiptScanner, { type AttachTarget } from './ReceiptScanner';
import { attachInvoiceNumber } from '../payment-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

/**
 * The invoice for a cost entered before it arrived.
 *
 * Photographing it is the better way: the lines are read and identified like
 * any other invoice, so it prices ingredients and splits by category. Typing
 * only the number is there for the paper that is not worth a scan.
 */
export default function AttachInvoiceDialog({
  target,
  hasVendor,
  onClose,
  onAttached,
}: {
  target: AttachTarget;
  /** Whether the cost already names its supplier; if not, it can be typed. */
  hasVendor: boolean;
  onClose: () => void;
  onAttached: () => void;
}) {
  const { t } = useLanguage();
  const [scanning, setScanning] = useState(false);
  const [number, setNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [saving, setSaving] = useState(false);

  const saveNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!number.trim()) return;
    setSaving(true);
    const result = await attachInvoiceNumber({
      costEntryId: target.costEntryId,
      invoiceNumber: number,
      vendorName: hasVendor ? null : vendorName,
    });
    setSaving(false);
    if ('error' in result) {
      toast.error(t(result.error ?? 'errors.write'));
      return;
    }
    toast.success(t('payments.attached'));
    onAttached();
  };

  return (
    <Dialog title={t('payments.attachTitle')} onClose={onClose} wide={scanning}>
      {scanning ? (
        <ReceiptScanner
          defaultScanType="COST_RECEIPT"
          attachTo={target}
          autoStart
          onSaved={onAttached}
        />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <span className="font-medium text-foreground">{target.description || '—'}</span>
            {' · '}
            <span className="tabular-nums">{formatMoney(target.amount, { decimals: 2 })}</span>
          </p>
          <div>
            <p className="text-xs text-muted-foreground mb-3">{t('payments.attachBody')}</p>
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="cta-button w-full justify-center"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              {t('payments.attachScan')}
            </button>
          </div>

          <form onSubmit={saveNumber} className="space-y-3 border-t border-border-subtle pt-4">
            <p className="text-xs font-medium text-muted-foreground">{t('payments.attachTyped')}</p>
            <label className="block">
              <span className="sr-only">{t('payments.invoiceNumber')}</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={t('payments.invoiceNumber')}
                maxLength={100}
                autoComplete="off"
                className="input-field"
              />
            </label>
            {!hasVendor && (
              <label className="block">
                <span className="sr-only">{t('payments.vendor')}</span>
                <input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder={t('payments.vendorPlaceholder')}
                  maxLength={200}
                  autoComplete="off"
                  className="input-field"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={saving || !number.trim()}
              className="cta-button-secondary w-full justify-center"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('payments.attachSave')}
            </button>
          </form>
        </div>
      )}
    </Dialog>
  );
}
