import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secretMatches } from '@/lib/invoice-email';
import { isMailConfigured, sendMail } from '@/lib/mailer';
import { buildWeeklyReport, lastWeek } from '@/lib/weekly-report';
import { gatherWeeklyReport, hasActivity } from '@/lib/weekly-report-server';

/**
 * Sends last week's report to every owner who switched it on, one email per
 * restaurant they own. Called on Monday mornings by the "Weekly report"
 * GitHub Actions workflow with CRON_SECRET; safe to call twice, because each
 * owner-restaurant-week is recorded once sent.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  if (!isMailConfigured()) return NextResponse.json({ error: 'mail not configured' }, { status: 503 });

  const week = lastWeek(new Date()).from;
  const owners = await prisma.membership.findMany({
    where: { role: 'OWNER', active: true, user: { notificationPrefs: { path: ['weeklyReport'], equals: true } } },
    select: { restaurantId: true, user: { select: { id: true, email: true, language: true } } },
  });

  let sent = 0;
  let skipped = 0;
  for (const m of owners) {
    const key = `report.weekly.${m.user.id}.${m.restaurantId}`;
    const last = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
    if (last?.value === week) { skipped++; continue; }

    const data = await gatherWeeklyReport(m.restaurantId);
    if (!data || !hasActivity(data)) { skipped++; continue; }

    const mail = buildWeeklyReport(data, m.user.language === 'en' ? 'en' : 'pt');
    if (await sendMail({ to: m.user.email, ...mail })) {
      await prisma.appSetting.upsert({ where: { key }, create: { key, value: week }, update: { value: week } });
      sent++;
    }
  }

  return NextResponse.json({ week, owners: owners.length, sent, skipped });
}
