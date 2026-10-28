'use client';

import { Download, Pencil } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import Dialog from './Dialog';

/**
 * The document itself, on screen, without downloading it first.
 *
 * Most of the time an owner opens a licence to read one line off it (the
 * policy number, the insurer's phone, the date) and a download for that is a
 * file left behind in their Downloads folder every time.
 */
export default function ComplianceDocPreview({
  doc,
  onClose,
  onEdit,
}: {
  doc: { name: string; filePath: string; mimeType: string | null };
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useLanguage();
  const src = `/api/images/${doc.filePath}`;
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <Dialog title={doc.name} onClose={onClose} wide>
      {isPdf ? (
        <iframe
          src={`${src}?inline=1`}
          title={doc.name}
          className="w-full h-[70dvh] rounded-lg border border-border-subtle bg-muted"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- served by
        // an authenticated route, which next/image cannot fetch.
        <img
          src={src}
          alt={doc.name}
          className="w-full max-h-[70dvh] object-contain rounded-lg border border-border-subtle bg-muted"
        />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
          {t('compliance.edit')}
        </button>
        <a
          href={src}
          download
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {t('compliance.download')}
        </a>
      </div>
    </Dialog>
  );
}
