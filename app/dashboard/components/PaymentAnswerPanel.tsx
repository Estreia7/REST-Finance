'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import { answerPayment, getPaymentsToAnswer, type PaymentToAnswer } from '../payment-actions';
import PaymentFields, { emptyPaymentDraft, paymentFromDraft, type PaymentDraft } from './PaymentFields';

/**
 * How invoices saved by themselves were paid, one at a time.
 *
 * A proved invoice goes straight in, so nobody waits beside the scanner to say
 * how it was paid. The question comes here instead, for when there is time.
 */

function Card({ invoice, position, onDone, onLater }: {
  invoice: PaymentToAnswer;
  position: string;
  onDone: () => void;
  onLater?: () => void;
}) {
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft());
  const [saving, setSaving] = useState(false);
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const save = async () => {
    const payment = paymentFromDraft(draft);
    if ('error' in payment) {
      toast.error(t(payment.error));
      return;
    }
    setSaving(true);
    const result = await answerPayment({ id: invoice.id, payment });
    setSaving(false);
    if ('error' in result) {
      toast.error(translateError(language, result.error));
      return;
    }
    onDone();
  };

  return (
    <div className="card-glass p-5 sm:p-6 space-y-4">
      <header>
        <p className="text-xs font-medium text-muted-foreground tabular-nums">{position}</p>
        <h3 className="mt-1 text-base font-bold text-foreground break-words">{invoice.vendorName ?? t('paymentCard.noVendor')}</h3>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {[
            invoice.invoiceNumber,
            new Date(`${invoice.dateKey}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }),
            formatMoney(invoice.amount),
          ].filter(Boolean).join(' · ')}
        </p>
      </header>

      <PaymentFields
        value={draft}
        onChange={setDraft}
        dateKey={invoice.dateKey}
        vendorName={invoice.vendorName ?? ''}
        vendorTermsDays={invoice.termsDays}
        idPrefix={`answer-${invoice.id}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || draft.paid === null}
          className="cta-button !py-2.5 !px-4 !text-sm disabled:opacity-40"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Check className="w-4 h-4" aria-hidden="true" />}
          {t('lineSetup.save')}
        </button>
        {onLater && (
          <button type="button" onClick={onLater} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
            {t('lineSetup.later')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentAnswerPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<PaymentToAnswer[] | null>(null);
  const [index, setIndex] = useState(0);

  const load = useCallback(() => {
    getPaymentsToAnswer().then((result) => setInvoices('error' in result ? [] : result.data));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!invoices || invoices.length === 0) return null;

  const total = invoices.length;
  const current = Math.min(index, total - 1);
  const invoice = invoices[current];

  return (
    <div>
      <Card
        key={invoice.id}
        invoice={invoice}
        position={t('paymentCard.position').replace('{current}', String(current + 1)).replace('{total}', String(total))}
        onDone={() => { load(); onChanged(); }}
        onLater={total > 1 ? () => setIndex((current + 1) % total) : undefined}
      />
    </div>
  );
}
