'use client';

import { AlertTriangle, Camera, FilePlus2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import type { DocumentIssue } from '@/lib/invoice-checks';

/**
 * Why a photograph cannot be trusted, while the paper is still in hand.
 *
 * Nothing has been saved when this shows. A better photograph now costs a few
 * seconds; a wrong invoice found next month costs an evening with a calculator.
 */

/** Each problem in plain words. */
export function IssueList({ issues }: { issues: DocumentIssue[] }) {
  const { t } = useLanguage();
  return (
    <ul className="space-y-1.5">
      {issues.map((issue) => (
        <li key={issue.kind} className="flex items-start gap-2 text-sm text-foreground">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
          <span>
            {t(`scanIssues.${issue.kind}`)
              .replace('{expected}', issue.expected === undefined ? '' : formatMoney(issue.expected))
              .replace('{found}', issue.found === undefined ? '' : formatMoney(issue.found))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ScanIssues({
  issues, picture, onRetake, onAddPage, onContinue,
}: {
  issues: DocumentIssue[];
  /** The page as it was read, or null for a PDF. */
  picture: string | null;
  onRetake: () => void;
  onAddPage: () => void;
  onContinue: () => void;
}) {
  const { t } = useLanguage();
  const pageMissing = issues.some((i) => i.kind === 'missingPages');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-foreground">{t('scanIssues.title')}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('scanIssues.lead')}</p>
      </div>

      {picture && (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL held in memory
        <img src={picture} alt={t('scanIssues.pictureAlt')} className="w-full max-h-[320px] object-contain rounded-xl border border-border bg-black/20" />
      )}

      <IssueList issues={issues} />

      <div className="flex flex-wrap items-center gap-2">
        {pageMissing ? (
          <>
            <button type="button" onClick={onAddPage} className="cta-button !py-2.5 !px-4 !text-sm">
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              {t('scanIssues.addPage')}
            </button>
            <button type="button" onClick={onRetake} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
              <Camera className="w-4 h-4" aria-hidden="true" />
              {t('scanIssues.retake')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onRetake} className="cta-button !py-2.5 !px-4 !text-sm">
              <Camera className="w-4 h-4" aria-hidden="true" />
              {t('scanIssues.retake')}
            </button>
            <button type="button" onClick={onAddPage} className="cta-button-secondary !py-2.5 !px-4 !text-sm">
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              {t('scanIssues.addPage')}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
        >
          {t('scanIssues.continue')}
        </button>
      </div>
    </div>
  );
}
