'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import {
  getAuthSettings,
  saveGoogleCredentials,
  clearGoogleCredentials,
  setRegistrationOpen,
} from '../settings-actions';

type Settings = {
  googleClientId: string;
  googleClientSecretPreview: string;
  configured: boolean;
  fromDatabase: boolean;
  updatedAt: Date | null;
  redirectUri: string;
  registrationOpen: boolean;
};

/**
 * Google sign-in configuration.
 *
 * The client secret is stored encrypted and never sent back to the browser;
 * only a masked preview is returned, so an administrator can confirm which
 * credential is in place without it appearing in a response or a screenshot.
 */
export default function AuthSettingsPanel() {
  const { t, language } = useLanguage();
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
      toast.error(translateError(language, result.error));
    }
    setLoading(false);
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await saveGoogleCredentials(clientId, clientSecret);
    setSaving(false);

    if (result.error) {
      toast.error(translateError(language, result.error));
      return;
    }

    toast.success(t('admin.auth.saved'));
    setClientSecret('');
    load();
  };

  const handleClear = async () => {
    if (!confirm(t('admin.auth.clearConfirm'))) return;

    const result = await clearGoogleCredentials();
    if (result.error) {
      toast.error(translateError(language, result.error));
      return;
    }

    toast.success(t('admin.auth.cleared'));
    setClientId('');
    setClientSecret('');
    load();
  };

  const handleToggleRegistration = async () => {
    if (!settings) return;
    const next = !settings.registrationOpen;

    if (next && !confirm(t('admin.auth.registrationOpenConfirm'))) {
      return;
    }

    const result = await setRegistrationOpen(next);
    if (result.error) {
      toast.error(translateError(language, result.error));
      return;
    }
    toast.success(next ? t('admin.auth.registrationOpened') : t('admin.auth.registrationClosed'));
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
        {t('admin.auth.loading')}
      </div>
    );
  }

  return (
    <>
    <div className="card-glass p-6 max-w-2xl mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">{t('admin.auth.registrationTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-[52ch]">
            {t('admin.auth.registrationDescription')}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings?.registrationOpen ?? false}
          onClick={handleToggleRegistration}
          className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${
            settings?.registrationOpen ? 'bg-primary' : 'bg-muted'
          }`}
          aria-label={t('admin.auth.registrationToggle')}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${
              settings?.registrationOpen ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>

    <div className="card-glass p-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            {t('admin.auth.googleTitle')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.auth.googleDescription')}
          </p>
        </div>

        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            settings?.configured
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {settings?.configured ? t('admin.auth.statusActive') : t('admin.auth.statusNotConfigured')}
        </span>
      </div>

      {/* The redirect URI has to match exactly in Google Cloud, so it is
          shown here rather than left for the administrator to assemble. */}
      <div className="mt-5 rounded-lg border border-border bg-surface p-3">
        <div className="text-xs text-muted-foreground mb-1.5">
          {t('admin.auth.redirectLabel')}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-foreground break-all">
            {settings?.redirectUri}
          </code>
          <button
            type="button"
            onClick={copyRedirect}
            className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label={t('admin.auth.copyRedirect')}
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
            {t('admin.auth.clientId')}
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
            {t('admin.auth.clientSecret')}
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
              {t('admin.auth.secretStored')}: {settings.googleClientSecretPreview}.{' '}
              {t('admin.auth.secretKeepBlank')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="cta-button">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                {t('admin.auth.saving')}
              </>
            ) : (
              t('admin.auth.save')
            )}
          </button>

          {settings?.fromDatabase && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-sm text-danger hover:underline"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {t('admin.auth.clear')}
            </button>
          )}
        </div>
      </form>

      {settings?.updatedAt && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('admin.auth.updatedAt')}{' '}
          {new Date(settings.updatedAt).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}
        </p>
      )}
    </div>
    </>
  );
}
