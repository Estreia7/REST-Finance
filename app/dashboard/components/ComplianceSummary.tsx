'use client';

import { AlertTriangle, PartyPopper } from 'lucide-react';
import { TYPE_LABEL_KEYS } from './compliance-labels';
import { useLanguage } from '@/lib/language-context';
import type { ComplianceSummary as Summary } from '@/lib/compliance';

/**
 * The line at the top of the compliance page.
 *
 * Either it congratulates by name, or it says exactly what is wrong. There is
 * no middle state and no jargon: the point is that an owner glancing at this
 * once a month knows instantly whether anything needs doing.
 */
export default function ComplianceSummary({
  summary,
  ownerName,
  restaurantName,
}: {
  summary: Summary;
  ownerName: string;
  restaurantName: string;
}) {
  const { t } = useLanguage();

  if (summary.allClear) {
    // Addressing them by first name only; the full legal name reads like a letter
    // from the tax office, which is the opposite of the tone here.
    const firstName = ownerName.split(' ')[0];

    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
        <PartyPopper className="mt-0.5 w-5 h-5 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">
            {t('compliance.summary.wellDone')}{firstName ? `, ${firstName}` : ''}
          </span>
          {' — '}
          {restaurantName
            ? <span className="font-medium">{restaurantName}</span>
            : t('compliance.summary.theRestaurantLower')}
          {` ${t('compliance.summary.allUpToDate')}`}
        </p>
      </div>
    );
  }

  // Phrased as separate clauses rather than one total, because "3 documentos"
  // hides whether the problem is paperwork never uploaded or a licence that
  // lapsed last week.
  const parts: string[] = [];
  if (summary.missingTypes.length > 0) {
    const n = summary.missingTypes.length;
    parts.push(`${n} ${n === 1 ? t('compliance.summary.missingOne') : t('compliance.summary.missingMany')}`);
  }
  if (summary.expiredCount > 0) {
    const n = summary.expiredCount;
    parts.push(`${n} ${n === 1 ? t('compliance.summary.expiredOne') : t('compliance.summary.expiredMany')}`);
  }
  if (summary.expiringCount > 0) {
    const n = summary.expiringCount;
    parts.push(`${n} ${t('compliance.summary.expiringSoon')}`);
  }

  const tone =
    summary.expiredCount > 0 || summary.missingTypes.length > 0
      ? { border: 'border-danger/30', bg: 'bg-danger/5', icon: 'text-danger' }
      : { border: 'border-warning/30', bg: 'bg-warning/5', icon: 'text-warning' };

  return (
    <div className={`flex items-start gap-3 rounded-xl border ${tone.border} ${tone.bg} p-4`}>
      <AlertTriangle className={`mt-0.5 w-5 h-5 shrink-0 ${tone.icon}`} aria-hidden="true" />

      <div className="min-w-0 text-sm">
        <p className="font-semibold text-foreground">
          {restaurantName || t('compliance.summary.theRestaurant')}: {parts.join(', ')}.
        </p>

        {summary.missingTypes.length > 0 && (
          <p className="mt-1 text-muted-foreground">
            {t('compliance.summary.notUploaded')}{' '}
            {summary.missingTypes
              .map((type) => (TYPE_LABEL_KEYS[type] ? t(TYPE_LABEL_KEYS[type]) : type))
              .join(', ')}
            .
          </p>
        )}
      </div>
    </div>
  );
}
