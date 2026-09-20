'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/language-context';

/**
 * The two addresses of the unattended deck, with a button that copies each.
 *
 * Sits at the top of the presentation panel in the admin console. The point is
 * the copy button: the address is meant to travel — into a phone, a message,
 * or a television's address bar — and reading it off a screen to type it again
 * is exactly the friction this removes.
 *
 * The address is built from `window.location.origin` rather than from an
 * environment variable so that what gets copied is always the host actually
 * being used, including a preview deployment or a laptop on the local network.
 */
export default function ShareDeckCard() {
  const { t } = useLanguage();
  const [origin, setOrigin] = useState('');

  // Read after mount: there is no location on the server, and rendering a
  // guess would mean the first paint shows an address that then changes.
  useEffect(() => setOrigin(window.location.origin), []);

  const copy = async (path: string, label: string) => {
    const url = `${origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${t('presentation.tvCopied')} — ${label}`);
    } catch {
      // Denied, or an insecure origin. The address is on screen and
      // selectable, so say that rather than failing silently.
      toast.error(t('presentation.tvCopyFailed'));
    }
  };

  return (
    <section className="card-glass p-5 sm:p-6 space-y-4">
      <div className="space-y-1.5">
        <h2 className="font-semibold text-foreground">{t('presentation.tvShareTitle')}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('presentation.tvShareBody')}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <DeckLink
          path="/pt"
          origin={origin}
          copyLabel={t('presentation.tvCopyPt')}
          openLabel={t('presentation.tvOpen')}
          onCopy={copy}
        />
        <DeckLink
          path="/en"
          origin={origin}
          copyLabel={t('presentation.tvCopyEn')}
          openLabel={t('presentation.tvOpen')}
          onCopy={copy}
        />
      </div>
    </section>
  );
}

function DeckLink({
  path, origin, copyLabel, openLabel, onCopy,
}: {
  path: string;
  origin: string;
  copyLabel: string;
  openLabel: string;
  onCopy: (path: string, label: string) => void;
}) {
  // Before mount there is no origin; the path alone is still the useful half
  // of the address, so it renders rather than flashing an empty box.
  const shown = origin ? `${origin.replace(/^https?:\/\//, '')}${path}` : path;

  return (
    <div className="rounded-lg bg-surface border border-border-subtle p-4 space-y-3">
      <p className="section-label">{copyLabel}</p>

      {/* Selectable, so copying by hand stays possible where the clipboard
          API is refused. Wraps rather than truncating: a half-shown address
          cannot be read out loud. */}
      <p className="font-mono text-sm text-foreground break-all select-text">{shown}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy(path, copyLabel)}
          className="cta-button-secondary text-sm px-3 py-1.5"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15 V5 a2 2 0 0 1 2 -2 h10" />
          </svg>
          {copyLabel}
        </button>

        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary-ink font-medium px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
        >
          {openLabel}
        </a>
      </div>
    </div>
  );
}
