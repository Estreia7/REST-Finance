'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  getAuthSettings,
  saveGoogleCredentials,
  clearGoogleCredentials,
} from '../settings-actions';

type Settings = {
  googleClientId: string;
  googleClientSecretPreview: string;
  configured: boolean;
  fromDatabase: boolean;
  updatedAt: Date | null;
  redirectUri: string;
};

/**
 * Google sign-in configuration.
 *
 * The client secret is stored encrypted and never sent back to the browser;
 * only a masked preview is returned, so an administrator can confirm which
 * credential is in place without it appearing in a response or a screenshot.
 */
export default function AuthSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const result = await getAuthSettings();
    if ('data' in result && result.data) {
      setSettings(result.data);
      setClientId(result.data.googleClientId);
    } else if ('error' in result) {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await saveGoogleCredentials(clientId, clientSecret);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Credenciais guardadas. O início de sessão com Google está ativo.');
    setClientSecret('');
    load();
  };

  const handleClear = async () => {
    if (!confirm('Remover as credenciais do Google? O botão deixa de funcionar.')) return;

    const result = await clearGoogleCredentials();
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Credenciais removidas.');
    setClientId('');
    setClientSecret('');
    load();
  };

  const copyRedirect = async () => {
    if (!settings) return;
    await navigator.clipboard.writeText(settings.redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        A carregar definições...
      </div>
    );
  }

  return (
    <div className="card-glass p-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            Início de sessão com Google
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Guardado encriptado na base de dados. Nunca aparece em texto simples.
          </p>
        </div>

        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            settings?.configured
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {settings?.configured ? 'Ativo' : 'Não configurado'}
        </span>
      </div>

      {/* The redirect URI has to match exactly in Google Cloud, so it is
          shown here rather than left for the administrator to assemble. */}
      <div className="mt-5 rounded-lg border border-border bg-surface p-3">
        <div className="text-xs text-muted-foreground mb-1.5">
          URI de redirecionamento autorizado (cola no Google Cloud)
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-foreground break-all">
            {settings?.redirectUri}
          </code>
          <button
            type="button"
            onClick={copyRedirect}
            className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Copiar URI de redirecionamento"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div>
          <label htmlFor="google-client-id" className="block text-sm font-medium text-foreground mb-1.5">
            Client ID
          </label>
          <input
            id="google-client-id"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
            className="input-field w-full"
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="google-client-secret" className="block text-sm font-medium text-foreground mb-1.5">
            Client Secret
          </label>
          <input
            id="google-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              settings?.googleClientSecretPreview || 'GOCSPX-...'
            }
            className="input-field w-full"
            autoComplete="off"
          />
          {settings?.googleClientSecretPreview && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Guardado: {settings.googleClientSecretPreview}. Deixa em branco para manter.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="cta-button">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                A guardar...
              </>
            ) : (
              'Guardar'
            )}
          </button>

          {settings?.fromDatabase && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-sm text-danger hover:underline"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Remover
            </button>
          )}
        </div>
      </form>

      {settings?.updatedAt && (
        <p className="mt-4 text-xs text-muted-foreground">
          Atualizado em {new Date(settings.updatedAt).toLocaleString('pt-PT')}
        </p>
      )}
    </div>
  );
}
