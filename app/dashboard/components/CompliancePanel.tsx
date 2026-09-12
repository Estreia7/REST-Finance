'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  daysUntilExpiry as daysUntil,
  RENEWAL_LABELS,
  type ComplianceStatus,
  type ComplianceSummary as Summary,
  type RenewalPeriod,
} from '@/lib/compliance';
import { TYPE_LABELS, STATUS_STYLE } from './compliance-labels';
import ComplianceSummary from './ComplianceSummary';
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

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** The part an owner acts on: how long is left, in words. */
function expiryPhrase(doc: Doc): string | null {
  const days = daysUntil(doc.expiresAt);
  if (days === null) return null;

  if (days < 0) {
    const n = Math.abs(days);
    return `expirou há ${n} ${n === 1 ? 'dia' : 'dias'}`;
  }
  if (days === 0) return 'expira hoje';
  return `expira em ${days} ${days === 1 ? 'dia' : 'dias'}`;
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
      toast.error('Escolhe um ficheiro.');
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
    toast.success('Documento guardado.');
    load();
  };

  const handleDelete = async (doc: Doc) => {
    if (!confirm(`Remover "${doc.name}" da lista? O ficheiro mantém-se arquivado.`)) return;

    const result = await deleteComplianceDoc(doc.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Documento removido.');
    load();
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        A carregar documentos...
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
              <h2 className="text-lg font-bold text-foreground">Conformidade</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Seguros, licenças e certificados, com as datas de validade.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Adicionar
          </button>
        </div>

        {adding && (
          <form onSubmit={handleSubmit} className="mt-5 rounded-lg border border-border bg-surface p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="doc-type" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Tipo
                </label>
                <select id="doc-type" name="type" required className="input-field" defaultValue="INSURANCE">
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="doc-name" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Nome
                </label>
                <input
                  id="doc-name"
                  name="name"
                  required
                  placeholder="Seguro de responsabilidade civil"
                  className="input-field"
                />
              </div>

              <div>
                <label htmlFor="doc-renewal" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Renovação
                </label>
                <select id="doc-renewal" name="renewalPeriod" className="input-field" defaultValue="ANNUAL">
                  {(Object.keys(RENEWAL_LABELS) as RenewalPeriod[]).map((value) => (
                    <option key={value} value={value}>{RENEWAL_LABELS[value]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="doc-reference" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Número da apólice ou licença
                </label>
                <input id="doc-reference" name="reference" className="input-field" />
              </div>

              <div>
                <label htmlFor="doc-issued" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Data de emissão
                </label>
                <input id="doc-issued" name="issuedAt" type="date" className="input-field" />
              </div>

              <div>
                <label htmlFor="doc-expires" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Válido até
                </label>
                <input id="doc-expires" name="expiresAt" type="date" className="input-field" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Deixa em branco se não expirar.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="doc-file" className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Ficheiro (PDF ou imagem, até 10 MB)
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
                    A guardar...
                  </>
                ) : (
                  'Guardar documento'
                )}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {docs.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
            <FileText className="w-6 h-6 mx-auto text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              Ainda não há documentos. Começa pelo seguro e pela licença de utilização.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto -mx-6 px-6">
            <table className="min-w-full text-sm border-collapse">
              <caption className="sr-only">
                Documentos de conformidade, ordenados por data de validade
              </caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="py-2 pr-4 text-left font-medium">Documento</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">Estado</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">Tipo</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium">Renovação</th>
                  <th scope="col" className="py-2 pr-4 text-left font-medium whitespace-nowrap">
                    Válido até
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border-subtle">
                {docs.map((doc) => {
                  const style = STATUS_STYLE[doc.status];
                  const phrase = expiryPhrase(doc);

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
                          <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
                        </span>
                      </td>

                      <td className="py-3 pr-4 align-top text-muted-foreground whitespace-nowrap">
                        {TYPE_LABELS[doc.type] ?? doc.type}
                      </td>

                      <td className="py-3 pr-4 align-top text-muted-foreground whitespace-nowrap">
                        {RENEWAL_LABELS[doc.renewalPeriod] ?? '—'}
                      </td>

                      <td className="py-3 pr-4 align-top whitespace-nowrap">
                        <span className="block figure text-foreground">
                          {formatDate(doc.expiresAt)}
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
                          aria-label={`Descarregar ${doc.name}`}
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          className="inline-flex p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-muted"
                          aria-label={`Remover ${doc.name}`}
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
