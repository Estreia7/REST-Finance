'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  daysUntilExpiry,
  nextExpiryFrom,
  toDateInput,
  type RenewalPeriod,
} from '@/lib/compliance';
import { TYPE_LABEL_KEYS, RENEWAL_LABEL_KEYS } from './compliance-labels';
import { useLanguage } from '@/lib/language-context';
import { expiryPhrase } from './compliance-expiry';

export type DocFormValues = {
  type: string;
  name: string;
  renewalPeriod: RenewalPeriod;
  reference: string;
  issuedAt: string;
  expiresAt: string;
};

/**
 * The fields of a compliance document, for adding one and for editing one.
 *
 * "Válido até" follows the issue date and the renewal on its own: an annual
 * certificate issued today is valid until this day next year, and the owner
 * should not have to count. Typing a date into it by hand stops it following,
 * because a policy that runs to the end of the month is the owner's call, not
 * the arithmetic's.
 */
export default function ComplianceDocForm({
  initial,
  withFile,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<DocFormValues>;
  /** Adding asks for the file; editing keeps the one already on file. */
  withFile: boolean;
  saving: boolean;
  submitLabel: string;
  onSubmit: (values: DocFormValues, file: File | null) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<DocFormValues>({
    type: initial?.type ?? 'INSURANCE',
    name: initial?.name ?? '',
    renewalPeriod: initial?.renewalPeriod ?? 'ANNUAL',
    reference: initial?.reference ?? '',
    issuedAt: initial?.issuedAt ?? '',
    expiresAt: initial?.expiresAt ?? '',
  });
  // An expiry already on file was the owner's; one still empty is ours to fill.
  const [expiryIsManual, setExpiryIsManual] = useState(Boolean(initial?.expiresAt));
  const [file, setFile] = useState<File | null>(null);

  const derive = (issuedAt: string, period: RenewalPeriod) => {
    if (!issuedAt) return '';
    return toDateInput(nextExpiryFrom(new Date(issuedAt), period));
  };

  const set = <K extends keyof DocFormValues>(key: K, value: DocFormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (!expiryIsManual && (key === 'issuedAt' || key === 'renewalPeriod')) {
        next.expiresAt = derive(next.issuedAt, next.renewalPeriod);
      }
      return next;
    });
  };

  const days = values.expiresAt ? daysUntilExpiry(new Date(values.expiresAt)) : null;
  const countdown = days === null ? null : expiryPhrase(days, t);
  const derived = !expiryIsManual && values.expiresAt !== '';

  const label = 'text-xs font-medium text-muted-foreground block mb-1.5';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values, file);
      }}
      className="space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="doc-type" className={label}>{t('compliance.form.type')}</label>
          <select
            id="doc-type"
            required
            className="input-field"
            value={values.type}
            onChange={(e) => set('type', e.target.value)}
          >
            {Object.entries(TYPE_LABEL_KEYS).map(([value, key]) => (
              <option key={value} value={value}>{t(key)}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-name" className={label}>{t('compliance.form.name')}</label>
          <input
            id="doc-name"
            required
            placeholder={t('compliance.form.namePlaceholder')}
            className="input-field"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="doc-renewal" className={label}>{t('compliance.form.renewal')}</label>
          <select
            id="doc-renewal"
            className="input-field"
            value={values.renewalPeriod}
            onChange={(e) => set('renewalPeriod', e.target.value as RenewalPeriod)}
          >
            {(Object.keys(RENEWAL_LABEL_KEYS) as RenewalPeriod[]).map((value) => (
              <option key={value} value={value}>{t(RENEWAL_LABEL_KEYS[value])}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-reference" className={label}>{t('compliance.form.reference')}</label>
          <input
            id="doc-reference"
            className="input-field"
            value={values.reference}
            onChange={(e) => set('reference', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="doc-issued" className={label}>{t('compliance.form.issuedAt')}</label>
          <input
            id="doc-issued"
            type="date"
            className="input-field"
            value={values.issuedAt}
            onChange={(e) => set('issuedAt', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="doc-expires" className={label}>{t('compliance.form.expiresAt')}</label>
          <input
            id="doc-expires"
            type="date"
            className="input-field"
            value={values.expiresAt}
            onChange={(e) => {
              // Cleared by hand, it goes back to following the issue date.
              setExpiryIsManual(e.target.value !== '');
              setValues((prev) => ({
                ...prev,
                expiresAt: e.target.value || derive(prev.issuedAt, prev.renewalPeriod),
              }));
            }}
            aria-describedby="doc-expires-hint"
          />
          <p id="doc-expires-hint" className="mt-1 text-[11px] text-muted-foreground">
            {countdown ? (
              <>
                <span className="font-semibold text-foreground">{countdown}</span>
                {derived && <> · {t('compliance.form.expiresAuto')}</>}
              </>
            ) : (
              t('compliance.form.expiresHint')
            )}
          </p>
        </div>

        {withFile && (
          <div className="sm:col-span-2">
            <label htmlFor="doc-file" className={label}>{t('compliance.form.file')}</label>
            <input
              id="doc-file"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input-field file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:text-foreground"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="cta-button">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {t('compliance.form.saving')}
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('compliance.form.cancel')}
        </button>
      </div>
    </form>
  );
}
