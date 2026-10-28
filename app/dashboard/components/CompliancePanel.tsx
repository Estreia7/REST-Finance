'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Eye, FileText, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  daysUntilExpiry as daysUntil,
  toDateInput,
  type ComplianceStatus,
  type ComplianceSummary as Summary,
  type RenewalPeriod,
} from '@/lib/compliance';
import { TYPE_LABEL_KEYS, STATUS_STYLE, RENEWAL_LABEL_KEYS } from './compliance-labels';
import { expiryPhrase } from './compliance-expiry';
import ComplianceSummary from './ComplianceSummary';
import ComplianceDocForm, { type DocFormValues } from './ComplianceDocForm';
import ComplianceDocPreview from './ComplianceDocPreview';
import Dialog from './Dialog';
import { useLanguage } from '@/lib/language-context';
import {
  getComplianceDocs,
  uploadComplianceDoc,
  updateComplianceDoc,
  deleteComplianceDoc,
} from '../compliance-actions';

type Doc = {
  id: string;
  type: string;
  renewalPeriod: RenewalPeriod;
  name: string;
  reference: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
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

/** A blank form field travels to the server as null, never as "". */
const orNull = (value: string) => value.trim() || null;

function formValuesOf(doc: Doc): DocFormValues {
  return {
    type: doc.type,
    name: doc.name,
    renewalPeriod: doc.renewalPeriod,
    reference: doc.reference ?? '',
    issuedAt: toDateInput(doc.issuedAt),
    expiresAt: toDateInput(doc.expiresAt),
  };
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
  const [previewing, setPreviewing] = useState<Doc | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);

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

  const handleAdd = async (values: DocFormValues, file: File | null) => {
    const formData = new FormData();
    if (file) formData.set('file', file);
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) formData.set(key, value);
    }

    setSaving(true);
    const result = await uploadComplianceDoc(formData);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setAdding(false);
    toast.success(t('compliance.toast.saved'));
    load();
  };

  const handleEdit = async (values: DocFormValues, file: File | null) => {
    if (!editing) return;

    let fileData: FormData | undefined;
    if (file) {
      fileData = new FormData();
      fileData.set('file', file);
    }

    setSaving(true);
    const result = await updateComplianceDoc(editing.id, {
      type: values.type,
      name: values.name,
      renewalPeriod: values.renewalPeriod,
      reference: orNull(values.reference),
      issuedAt: orNull(values.issuedAt),
      expiresAt: orNull(values.expiresAt),
      notes: editing.notes,
    }, fileData);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setEditing(null);
    toast.success(t('compliance.toast.updated'));
    load();
  };

  const openEdit = (doc: Doc) => {
    setAdding(false);
    setEditing(doc);
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
          <div className="mt-5 rounded-lg border border-border bg-surface p-4">
            <ComplianceDocForm
              fileLabel={t('compliance.form.file')}
              saving={saving}
              submitLabel={t('compliance.form.submit')}
              onSubmit={handleAdd}
              onCancel={() => setAdding(false)}
            />
          </div>
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
                  const days = daysUntil(doc.expiresAt);
                  const phrase = days === null ? null : expiryPhrase(days, t);
                  // Renews, yet has no date: the countdown can only start once
                  // the issue date is in, so the gap is named where the date
                  // would be rather than passed off as "no expiry".
                  const needsDate = !doc.expiresAt && doc.renewalPeriod !== 'NONE';

                  return (
                    <tr key={doc.id}>
                      <td className="py-3 pr-4 align-top">
                        {/* Opens the paper when there is one; without, the
                            edit, which is where a file gets attached. */}
                        <button
                          type="button"
                          onClick={() => (doc.filePath ? setPreviewing(doc) : openEdit(doc))}
                          className="block text-left font-medium text-foreground hover:underline underline-offset-2"
                        >
                          {doc.name}
                        </button>
                        {doc.reference && (
                          <span className="block text-xs text-muted-foreground">{doc.reference}</span>
                        )}
                        {!doc.filePath && (
                          <span className="block text-xs text-muted-foreground italic">{t('compliance.noFile')}</span>
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
                          <span className={`text-xs font-medium ${style.text}`}>{t(needsDate ? 'compliance.status.noDate' : style.labelKey)}</span>
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
                          <span className={`block text-xs font-medium ${style.text}`}>{phrase}</span>
                        )}
                        {needsDate && (
                          <button
                            type="button"
                            onClick={() => openEdit(doc)}
                            className="block text-xs font-medium text-primary-ink hover:underline"
                          >
                            {t('compliance.expiry.needsDate')}
                          </button>
                        )}
                      </td>

                      <td className="py-3 align-top text-right whitespace-nowrap">
                        {doc.filePath && (
                          <button
                            type="button"
                            onClick={() => setPreviewing(doc)}
                            className="inline-flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label={`${t('compliance.preview')} ${doc.name}`}
                            title={t('compliance.preview')}
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(doc)}
                          className="inline-flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label={`${t('compliance.edit')} ${doc.name}`}
                          title={t('compliance.edit')}
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
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

      {previewing?.filePath && (
        <ComplianceDocPreview
          doc={{ name: previewing.name, filePath: previewing.filePath, mimeType: previewing.mimeType }}
          onClose={() => setPreviewing(null)}
          onEdit={() => { openEdit(previewing); setPreviewing(null); }}
        />
      )}

      {editing && (
        <Dialog title={t('compliance.editTitle')} onClose={() => setEditing(null)}>
          <ComplianceDocForm
            key={editing.id}
            initial={formValuesOf(editing)}
            fileLabel={t(editing.filePath ? 'compliance.form.fileReplace' : 'compliance.form.fileAttach')}
            saving={saving}
            submitLabel={t('compliance.form.update')}
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
          />
        </Dialog>
      )}
    </div>
  );
}
