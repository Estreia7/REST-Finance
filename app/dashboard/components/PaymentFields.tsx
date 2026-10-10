'use client';

import { Banknote, CreditCard, Landmark, CalendarClock } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { PAYMENT_METHODS, dueDateFor, type PaymentInput, type PaymentMethodKey } from '@/lib/payments';

/**
 * "Is it paid?", asked wherever a cost or an invoice is entered.
 *
 * Asked rather than assumed: a cost booked as paid that was not is a supplier
 * chasing a debt nobody knew about, and one booked unpaid that was paid is a
 * second payment. No answer is preselected for the same reason.
 */

export interface PaymentDraft {
  /** Null until the owner answers. */
  paid: boolean | null;
  method: PaymentMethodKey | null;
  /** The owner's own due date. Empty follows the supplier's terms. */
  dueDate: string;
}

export const emptyPaymentDraft = (): PaymentDraft => ({ paid: null, method: null, dueDate: '' });

/** The draft as the server takes it, or the key of what is still missing. */
export function paymentFromDraft(draft: PaymentDraft): PaymentInput | { error: string } {
  if (draft.paid === null) return { error: 'payments.answerRequired' };
  if (draft.paid && !draft.method) return { error: 'payments.methodRequired' };
  return {
    paid: draft.paid,
    method: draft.paid ? draft.method : null,
    dueDate: draft.dueDate || null,
  };
}

export const METHOD_ICON: Record<PaymentMethodKey, typeof Banknote> = {
  CASH: Banknote,
  MULTIBANCO: CreditCard,
  TRANSFER: Landmark,
  DIRECT_DEBIT: CalendarClock,
};

export default function PaymentFields({
  value, onChange, dateKey, vendorName, vendorTermsDays, recurring = false, idPrefix = 'pay',
}: {
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  /** The cost's own date, which the due date is counted from. */
  dateKey: string;
  /** The supplier as typed, empty when there is none. */
  vendorName: string;
  /** That supplier's terms when they are on file; null when not set or new. */
  vendorTermsDays: number | null;
  /** A fixed monthly cost: the answer applies to every month. */
  recurring?: boolean;
  idPrefix?: string;
}) {
  const { t, language } = useLanguage();
  const set = (patch: Partial<PaymentDraft>) => onChange({ ...value, ...patch });
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
  const vendor = vendorName.trim();
  const followTerms = validDate
    ? dueDateFor({ dateKey, hasVendor: !!vendor, termsDays: vendorTermsDays })
    : '';
  const dueKey = value.dueDate || followTerms;
  const showDue = value.paid === false || value.method === 'DIRECT_DEBIT';
  const longDate = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const termsHint = !vendor
    ? t('payments.dueHintNoVendor')
    : vendorTermsDays !== null
      ? t('payments.dueHintTerms').replace('{vendor}', vendor).replace('{days}', String(vendorTermsDays))
      : t('payments.dueHintDefault');

  const segment = (active: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none
     focus-visible:ring-2 focus-visible:ring-ring ${active
       ? 'bg-card text-foreground shadow-sm'
       : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <fieldset className="rounded-xl border border-border p-4 space-y-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{t('payments.question')}</legend>

      <div className="flex gap-1 p-1 bg-muted rounded-xl" role="group" aria-label={t('payments.question')}>
        <button
          type="button"
          aria-pressed={value.paid === true}
          onClick={() => set({ paid: true })}
          className={segment(value.paid === true)}
        >
          {t('payments.paid')}
        </button>
        <button
          type="button"
          aria-pressed={value.paid === false}
          onClick={() => set({ paid: false, method: null })}
          className={segment(value.paid === false)}
        >
          {t('payments.unpaid')}
        </button>
      </div>

      {value.paid && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2" id={`${idPrefix}-method`}>
            {t('payments.howPaid')}
          </p>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby={`${idPrefix}-method`}>
            {PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICON[m];
              const active = value.method === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ method: m })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold text-left
                    transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${active
                      ? 'border-primary bg-primary-subtle text-foreground'
                      : 'border-border-subtle bg-surface text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t(`payments.method_${m}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showDue && validDate && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label htmlFor={`${idPrefix}-due`} className="text-xs font-medium text-muted-foreground">
              {t('payments.dueDate')}
            </label>
            {value.dueDate && (
              <button
                type="button"
                onClick={() => set({ dueDate: '' })}
                className="text-xs font-medium text-primary-ink hover:underline"
              >
                {t('payments.dueReset')}
              </button>
            )}
          </div>
          <input
            id={`${idPrefix}-due`}
            type="date"
            value={dueKey}
            onChange={(e) => set({ dueDate: e.target.value === followTerms ? '' : e.target.value })}
            className="input-field"
          />
          {(value.method === 'DIRECT_DEBIT' || !value.dueDate) && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {value.method === 'DIRECT_DEBIT'
                ? t('payments.directDebitHint').replace('{date}', longDate(dueKey))
                : termsHint}
            </p>
          )}
        </div>
      )}

      {recurring && value.paid !== null && (
        <p className="text-[11px] text-muted-foreground">
          {value.paid ? t('payments.recurringPaidHint') : t('payments.recurringUnpaidHint')}
        </p>
      )}
    </fieldset>
  );
}
