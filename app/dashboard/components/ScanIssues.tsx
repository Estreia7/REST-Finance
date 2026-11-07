'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Camera, FilePlus2, FileSearch } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { issueFocus, type DocumentIssue } from '@/lib/invoice-checks';

/**
 * Why a reading cannot be trusted, and the one thing that settles it.
 *
 * Nothing has been saved when this shows. The way out depends on what is wrong:
 * another photograph of a good picture solves nothing, and a page is only asked
 * for when one is missing.
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
  issues, invoice, picture, onRetake, onAddPage, onFix,
}: {
  issues: DocumentIssue[];
  /** Which invoice this is, to say what to photograph. */
  invoice: { number?: string | null; vendor?: string | null };
  /** The page as it was read, or null for a PDF. */
  picture: string | null;
  onRetake: () => void;
  onAddPage: () => void;
  onFix: () => void;
}) {
  const { t } = useLanguage();
  const focus = issueFocus(issues);

  // This usually appears just after the phone's own camera closes, which can leave
  // an installed iPhone app with its fixed bars out of place until something
  // scrolls. Going to the top shows the reason and makes the phone measure again.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, []);

  const named = invoice.vendor
    ? t(invoice.number ? 'scanIssues.retakeNumbered' : 'scanIssues.retakeOf')
        .replace('{number}', invoice.number ?? '')
        .replace('{vendor}', invoice.vendor)
    : t('scanIssues.retake');

  const fix = (primary: boolean) => (
    <button type="button" onClick={onFix} className={`${primary ? 'cta-button' : 'cta-button-secondary'} !py-2.5 !px-4 !text-sm`}>
      <FileSearch className="w-4 h-4 shrink-0" aria-hidden="true" />
      {t('scanIssues.fix')}
    </button>
  );

  return (
    <div ref={top} className="space-y-4 scroll-mt-20">
      <div>
        <h3 className="text-base font-bold text-foreground">{t(`scanIssues.${focus}Title`)}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(`scanIssues.${focus}Lead`)}</p>
      </div>

      <IssueList issues={issues} />

      <div className="flex flex-wrap items-center gap-2">
        {focus === 'figures' && fix(true)}
        {focus === 'pages' && (
          <button type="button" onClick={onAddPage} className="cta-button !py-2.5 !px-4 !text-sm">
            <FilePlus2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t('scanIssues.addPage')}
          </button>
        )}
        {focus !== 'pages' && (
          <button
            type="button"
            onClick={onRetake}
            className={`${focus === 'photo' ? 'cta-button' : 'cta-button-secondary'} !py-2.5 !px-4 !text-sm`}
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            {focus === 'photo' ? named : t('scanIssues.retake')}
          </button>
        )}
        {focus !== 'figures' && fix(false)}
      </div>

      {/* Below the answer: on a phone the reason must not sit under the navigation. */}
      {picture && (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL held in memory
        <img src={picture} alt={t('scanIssues.pictureAlt')} className="w-full max-h-[320px] object-contain rounded-xl border border-border bg-black/20" />
      )}
    </div>
  );
}
