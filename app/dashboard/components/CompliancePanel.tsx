'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, Download, FileText, Loader2,
  Plus, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { daysUntilExpiry as daysUntil } from '@/lib/compliance';
import {
  getComplianceDocs,
  uploadComplianceDoc,
  deleteComplianceDoc,
} from '../compliance-actions';

type Status = 'valid' | 'expiring' | 'expired' | 'no_expiry';

type Doc = {
  id: string;
  type: string;
  name: string;
  reference: string | null;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  status: Status;
};

const TYPE_LABELS: Record<string, string> = {
  INSURANCE: 'Seguro',
  HACCP: 'HACCP',
  FIRE_SAFETY: 'Segurança contra incêndios',
  ASAE_LICENCE: 'Licença / ASAE',
  HYGIENE_CERT: 'Higiene alimentar',
  WASTE_CONTRACT: 'Recolha de resíduos',
  PEST_CONTROL: 'Controlo de pragas',
  OTHER: 'Outro',
};

const STATUS_STYLE: Record<Status, { chip: string; label: string }> = {
  expired: { chip: 'bg-danger/10 text-danger', label: 'Expirado' },
  expiring: { chip: 'bg-warning/10 text-warning', label: 'A expirar' },
  valid: { chip: 'bg-success/10 text-success', label: 'Válido' },
  no_expiry: { chip: 'bg-muted text-muted-foreground', label: 'Sem validade' },
};

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}



/**
 * Insurance policies, licences and certificates, with their expiry dates.
 *
 * Sorted by expiry so whatever needs renewing is at the top. The list is the
 * filing cabinet; the value is the warning before a licence lapses.
 */
export default function CompliancePanel() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getComplianceDocs();
    if ('data' in result && result.data) setDocs(result.data as Doc[]);
    else if ('error' in result) toast.error(result.error);
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

  const needsAttention = docs.filter((d) => d.status === 'expired' || d.status === 'expiring');

  return (
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

      {needsAttention.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
          <div className="text-sm">
            <span className="font-medium text-foreground">
              {needsAttention.length} documento{needsAttention.length > 1 ? 's' : ''} a precisar de atenção.
            </span>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {needsAttention.slice(0, 3).map((d) => {
                const days = daysUntil(d.expiresAt);
                return (
                  <li key={d.id}>
                    {d.name}{' '}
                    {d.status === 'expired'
                      ? `expirou há ${Math.abs(days ?? 0)} dias`
                      : `expira em ${days} dias`}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

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
              <label htmlFor="doc-reference" className="text-xs font-medium text-muted-foreground block mb-1.5">
                Número da apólice ou licença
              </label>
              <input id="doc-reference" name="reference" className="input-field" />
            </div>

            <div>
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
        <ul className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
          {docs.map((doc) => {
            const style = STATUS_STYLE[doc.status];
            const days = daysUntil(doc.expiresAt);

            return (
              <li key={doc.id} className="flex items-center gap-3 py-3">
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{doc.name}</span>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.chip}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[doc.type] ?? doc.type}</span>
                    {doc.reference && <span className="truncate">· {doc.reference}</span>}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                  <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="figure">{formatDate(doc.expiresAt)}</span>
                  {days !== null && days >= 0 && days <= 60 && (
                    <span className="figure text-warning">({days}d)</span>
                  )}
                </div>

                <a
                  href={`/api/images/${doc.filePath}`}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label={`Descarregar ${doc.name}`}
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                </a>

                <button
                  type="button"
                  onClick={() => handleDelete(doc)}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-muted"
                  aria-label={`Remover ${doc.name}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
