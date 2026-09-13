'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  daysUntilExpiry as daysUntil,
  type ComplianceStatus,
  type ComplianceSummary as Summary,
  type RenewalPeriod,
} from '@/lib/compliance';
import { TYPE_LABEL_KEYS, STATUS_STYLE, RENEWAL_LABEL_KEYS } from './compliance-labels';
import ComplianceSummary from './ComplianceSummary';
import { useLanguage } from '@/lib/language-context';
import {
  getComplianceDocs,
  uploadComplianceDoc,
  deleteComplianceDoc,
} from '../compliance-actions';

type Doc = {
  id: string;
  type: string;
  renewalPeriod: RenewalPeriod;
  name: string;
  reference: string | null;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  status: ComplianceStatus;
};

function formatDate(value: Date | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** The part an owner acts on: how long is left, in words. */
function expiryPhrase(doc: Doc, t: (key: string) => string): string | null {
  const days = daysUntil(doc.expiresAt);
  if (days === null) return null;

  // The count sits in the middle of the phrase in both languages, but the rest
  // of the wording differs on either side of it ("expirou há 3 dias" against
  // "expired 3 days ago"), so each phrase is one key holding a {n} slot rather
  // than a chain of fragments that would only read correctly in Portuguese.
  const fill = (key: string, n: number) => t(key).replace('{n}', String(n));

  if (days < 0) {
    const n = Math.abs(days);
    return fill(n === 1 ? 'compliance.expiry.expiredOne' : 'compliance.expiry.expiredMany', n);
  }
  if (days === 0) return t('compliance.expiry.today');
  return fill(
    days === 1 ? 'compliance.expiry.expiresOne' : 'compliance.expiry.expiresMany',
    days,
  );
}

/**
 * The compliance vault: insurance, licences and certificates.
 *
 * A table rather than a list, because the whole value is comparing one column
 * across every row — which of these expires first. The indicator turns amber
 * fifteen days out and red once past, so the state is readable without reading
 * any dates at all.
 */
export default function CompliancePanel() {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [docs, setDocs] = useState<Doc[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [names, setNames] = useState({ owner: '', restaurant: '' });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getComplianceDocs();
    if ('data' in result && result.data) {
      setDocs(result.data.docs as Doc[]);
      setSummary(result.data.summary);
      setNames({ owner: result.data.ownerName, restaurant: result.data.restaurantName });
    } else if ('error' in result) {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      toast.error(t('compliance.toast.pickFile'));
      return;
    }

    setSaving(true);
    const result = await uploadComplianceDoc(formData);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    form.reset();
    setAdding(false);
    toast.success(t('compliance.toast.saved'));
    load();
  };

  const handleDelete = async (doc: Doc) => {
    const question = `${t('compliance.confirmDelete').replace('{n}', doc.name)}\n${t('compliance.confirmDeleteNote')}`;
    if (!confirm(question)) return;

    const result = await deleteComplianceDoc(doc.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(t('compliance.toast.removed'));
    load();
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('compliance.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {summary && (
        <ComplianceSummary
          summary={summary}
          ownerName={names.owner}
          restaurantName={names.restaurant}
        />
      )}

      <div className="card-glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-bold text-foreground">{t('compliance.title')}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('compliance.subtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('compliance.add')}
          </button>
        </div>

        {adding && (
          <form onSubmit={handleSubmit} className="mt-5 rounded-lg border border-border bg-surface p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="doc-type" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.type')}
                </label>
                <select id="doc-type" name="type" required className="input-field" defaultValue="INSURANCE">
                  {Object.entries(TYPE_LABEL_KEYS).map(([value, key]) => (
                    <option key={value} value={value}>{t(key)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="doc-name" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.name')}
                </label>
                <input
                  id="doc-name"
                  name="name"
                  required
                  placeholder={t('compliance.form.namePlaceholder')}
                  className="input-field"
                />
              </div>

              <div>
                <label htmlFor="doc-renewal" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.renewal')}
                </label>
                <select id="doc-renewal" name="renewalPeriod" className="input-field" defaultValue="ANNUAL">
                  {(Object.keys(RENEWAL_LABEL_KEYS) as RenewalPeriod[]).map((value) => (
                    <option key={value} value={value}>{t(RENEWAL_LABEL_KEYS[value])}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="doc-reference" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.reference')}
                </label>
                <input id="doc-reference" name="reference" className="input-field" />
              </div>

              <div>
                <label htmlFor="doc-issued" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.issuedAt')}
                </label>
                <input id="doc-issued" name="issuedAt" type="date" className="input-field" />
              </div>

              <div>
                <label htmlFor="doc-expires" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.expiresAt')}
                </label>
                <input id="doc-expires" name="expiresAt" type="date" className="input-field" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('compliance.form.expiresHint')}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="doc-file" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  {t('compliance.form.file')}
                </label>
                <input
                  id="doc-file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="input-field file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:text-foreground"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="cta-button">
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    {t('compliance.form.saving')}
                  </>
                ) : (
                  t('compliance.form.submit')
                )}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('compliance.form.cancel')}
              </button>
            </div>
          </form>
        )}

        {docs.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
            <FileText className="w-6 h-6 mx-auto text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t('compliance.empty')}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto -mx-6 px-6">
            <table className="min-w-full text-sm border-collapse">
              <caption className="sr-only">
                {t('compliance.tableCaption')}
              </caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="py-2 pr-4 text-left font-medium">{t('compliance.col.document')}</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">{t('compliance.col.status')}</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">{t('compliance.col.type')}</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">{t('compliance.col.renewal')}</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium whitespace-nowrap">
                    {t('compliance.col.expiresAt')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    <span className="sr-only">{t('compliance.col.actions')}</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border-subtle">
                {docs.map((doc) => {
                  const style = STATUS_STYLE[doc.status];
                  const phrase = expiryPhrase(doc, t);

                  return (
                    <tr key={doc.id}>
                      <td className="py-3 pr-4 align-top">
                        <span className="block font-medium text-foreground">{doc.name}</span>
                        {doc.reference && (
                          <span className="block text-xs text-muted-foreground">{doc.reference}</span>
                        )}
                      </td>

                      <td className="py-3 pr-4 align-top">
                        {/* The lamp with its status in words. Colour is the
                            glance; the label is what carries the meaning for
                            anyone who cannot rely on it. The halo is what makes
                            a red one findable while scrolling past twenty rows. */}
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className={`shrink-0 w-2.5 h-2.5 rounded-full ${style.dot} ${style.glow}`}
                            aria-hidden="true"
                          />
                          <span className={`text-xs font-medium ${style.text}`}>{t(style.labelKey)}</span>
                        </span>
                      </td>

                      <td className="py-3 pr-4 align-top text-muted-foreground whitespace-nowrap">
                        {TYPE_LABEL_KEYS[doc.type] ? t(TYPE_LABEL_KEYS[doc.type]) : doc.type}
                      </td>

                      <td className="py-3 pr-4 align-top text-muted-foreground whitespace-nowrap">
                        {RENEWAL_LABEL_KEYS[doc.renewalPeriod]
                          ? t(RENEWAL_LABEL_KEYS[doc.renewalPeriod])
                          : '—'}
                      </td>

                      <td className="py-3 pr-4 align-top whitespace-nowrap">
                        <span className="block figure text-foreground">
                          {formatDate(doc.expiresAt, locale)}
                        </span>
                        {/* Only the countdown: the status column already names
                            the state, and a document with no expiry would
                            otherwise read "Sem validade" twice across. */}
                        {phrase && (
                          <span className={`block text-xs ${style.text}`}>{phrase}</span>
                        )}
                      </td>

                      <td className="py-3 align-top text-right whitespace-nowrap">
                        <a
                          href={`/api/images/${doc.filePath}`}
                          className="inline-flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label={`${t('compliance.download')} ${doc.name}`}
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          className="inline-flex p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-muted"
                          aria-label={`${t('compliance.remove')} ${doc.name}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
