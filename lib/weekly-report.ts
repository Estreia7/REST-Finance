import { getTranslation, type Language } from '@/lib/translations';
import { escapeHtml } from '@/lib/mailer';

/**
 * The weekly email: last week's numbers, written for the owner's phone.
 *
 * Pure: the figures come in (gathered by lib/weekly-report-server.ts through
 * the same tools the assistant uses, so the email and the assistant can never
 * disagree) and the subject, text and HTML go out.
 */

export interface PeriodFigures {
  revenue: number;
  costs: number;
  result: number;
  marginPct: number | null;
  foodCostPct: number | null;
}

export interface WeeklyReportData {
  restaurant: string;
  from: string;
  to: string;
  week: PeriodFigures;
  previous: PeriodFigures;
  topCategories: Array<{ category: string; total: number }>;
  priceRises: Array<{ product: string; supplier: string | null; before: number; now: number; changePct: number }>;
  unpaid: number;
  overdue: number;
  urgent: number;
  appUrl: string;
}

/** The Monday-to-Sunday week before the given day, as YYYY-MM-DD keys. */
export function lastWeek(today: Date): { from: string; to: string; prevFrom: string; prevTo: string } {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const thisMonday = new Date(d.getTime() - sinceMonday * 86_400_000);
  const day = (offset: number) => new Date(thisMonday.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(-7), to: day(-1), prevFrom: day(-14), prevTo: day(-8) };
}

function money(n: number, lang: Language): string {
  return new Intl.NumberFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(n);
}

function change(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;
}

export function buildWeeklyReport(d: WeeklyReportData, lang: Language): { subject: string; text: string; html: string } {
  const t = (k: string) => getTranslation(lang, `emails.weekly.${k}`);
  const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const date = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const period = `${date(d.from)} – ${date(d.to)}`;

  const revChange = change(d.week.revenue, d.previous.revenue);
  const lines: Array<[string, string]> = [
    [t('revenue'), `${money(d.week.revenue, lang)}${revChange !== null ? ` (${revChange > 0 ? '+' : ''}${revChange}% ${t('vsPrevious')})` : ''}`],
    [t('costs'), money(d.week.costs, lang)],
    [t('result'), `${money(d.week.result, lang)}${d.week.marginPct !== null ? ` · ${d.week.marginPct}%` : ''}`],
  ];
  if (d.week.foodCostPct !== null) lines.push([t('foodCost'), `${d.week.foodCostPct}%`]);

  const sections: Array<{ title: string; rows: string[] }> = [];
  if (d.topCategories.length > 0) {
    sections.push({ title: t('topCategories'), rows: d.topCategories.slice(0, 3).map((c) => `${c.category}: ${money(c.total, lang)}`) });
  }
  if (d.priceRises.length > 0) {
    sections.push({
      title: t('priceRises'),
      rows: d.priceRises.slice(0, 3).map((p) => `${p.product}${p.supplier ? ` (${p.supplier})` : ''}: ${money(p.before, lang)} → ${money(p.now, lang)} (+${p.changePct}%)`),
    });
  }
  const owed = [`${t('unpaid')}: ${money(d.unpaid, lang)}`];
  if (d.overdue > 0) owed.push(`${t('overdue')}: ${money(d.overdue, lang)}`);
  sections.push({ title: t('payables'), rows: owed });

  const urgent = d.urgent > 0 ? fill(t(d.urgent === 1 ? 'urgentOne' : 'urgentOther'), { count: String(d.urgent) }) : null;
  const subject = fill(t('subject'), { restaurant: d.restaurant, period });

  const text = [
    `${d.restaurant} · ${period}`,
    '',
    ...lines.map(([k, v]) => `${k}: ${v}`),
    ...sections.flatMap((s) => ['', s.title, ...s.rows.map((r) => `- ${r}`)]),
    ...(urgent ? ['', urgent] : []),
    '',
    `${t('open')}: ${d.appUrl}/dashboard`,
    '',
    fill(t('footer'), { url: `${d.appUrl}/dashboard?tab=settings` }),
  ].join('\n');

  const e = escapeHtml;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2430">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 4px;font-size:12px;color:#6b7280">${e(period)}</p>
<h1 style="margin:0 0 20px;font-size:20px">${e(d.restaurant)}</h1>
<table role="presentation" style="width:100%;background:#fff;border:1px solid #e7e2da;border-radius:12px;border-collapse:separate;padding:8px 16px">
${lines.map(([k, v]) => `<tr><td style="padding:8px 0;font-size:14px;color:#6b7280">${e(k)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right">${e(v)}</td></tr>`).join('')}
</table>
${sections.map((s) => `<h2 style="margin:24px 0 8px;font-size:14px">${e(s.title)}</h2><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${s.rows.map((r) => `<li>${e(r)}</li>`).join('')}</ul>`).join('')}
${urgent ? `<p style="margin:24px 0 0;padding:12px 14px;background:#fdecec;border-radius:10px;font-size:14px;font-weight:600;color:#b42318">${e(urgent)}</p>` : ''}
<p style="margin:28px 0"><a href="${e(d.appUrl)}/dashboard" style="display:inline-block;background:#e8a317;color:#1b2430;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${e(t('open'))}</a></p>
<p style="font-size:12px;color:#6b7280">${e(fill(t('footer'), { url: `${d.appUrl}/dashboard?tab=settings` }))}</p>
</div></body></html>`;

  return { subject, text, html };
}
