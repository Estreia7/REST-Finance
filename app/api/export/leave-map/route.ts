import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { getServerLanguage } from '@/lib/server-language';
import { getTranslation } from '@/lib/translations';
import { dateKey } from '@/lib/schedule';
import { logoDataUri } from '@/lib/logo-data-uri';
import { buildLeaveMapPages, LEAVE_MAP_COPY_KEYS, type LeaveMapCopy } from '@/lib/leave-map';
import { leaveMapPdf, rasterisePage, PREVIEW_SCALE } from '@/lib/leave-map-render';

/**
 * The year's holiday map, as the A4 sheet the law asks to be posted.
 *
 * Owner-only, like the holidays themselves.
 *
 *   - default: the PDF, every page, for printing.
 *   - `?format=png&page=N`: one page as an image, for the preview. The page
 *     count comes back in `X-Page-Count` so the preview knows what else to ask
 *     for. An image rather than the PDF in a frame because a phone's browser
 *     either shows a PDF's first page only or refuses to show it at all.
 *
 * Both are rasterised from the same SVG (`lib/leave-map-render.ts`), so the
 * preview cannot disagree with the print.
 *
 * Errors are dictionary keys: the panel translates them.
 */

export const dynamic = 'force-dynamic';

/** Today in Lisbon, `YYYY-MM-DD`: the date the map says it was drawn up. */
function todayInLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (isAuthError(owner)) {
    return NextResponse.json({ error: owner.error }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const year = Number(params.get('year') ?? new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'leave.invalidYear' }, { status: 400 });
  }
  const wantsPng = params.get('format') === 'png';

  const [restaurant, employees, leaves] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { name: true, logoPath: true, taxId: true },
    }),
    prisma.scheduleEmployee.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, role: true, color: true },
    }),
    prisma.employeeLeave.findMany({
      where: {
        restaurantId: owner.restaurantId,
        startDate: { lte: new Date(Date.UTC(year, 11, 31)) },
        endDate: { gte: new Date(Date.UTC(year, 0, 1)) },
        employee: { deletedAt: null },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  if (employees.length === 0) {
    return NextResponse.json({ error: 'leave.map.noEmployees' }, { status: 404 });
  }

  const language = await getServerLanguage();
  const copy = Object.fromEntries(
    LEAVE_MAP_COPY_KEYS.map((k) => [k, getTranslation(language, `leave.map.sheet.${k}`)]),
  ) as unknown as LeaveMapCopy;

  try {
    const { pages, width, height } = buildLeaveMapPages({
      restaurantName: restaurant?.name ?? '',
      taxId: restaurant?.taxId ?? null,
      logo: await logoDataUri(restaurant?.logoPath, 256),
      year,
      employees,
      leaves: leaves.map((l) => ({
        employeeId: l.employeeId,
        start: dateKey(l.startDate),
        end: dateKey(l.endDate),
      })),
      madeOn: todayInLisbon(),
      language,
      copy,
    });

    if (wantsPng) {
      const page = Math.min(Math.max(1, Number(params.get('page')) || 1), pages.length);
      const png = await rasterisePage(pages[page - 1], width, height, PREVIEW_SCALE);
      return new NextResponse(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'inline',
          'X-Page-Count': String(pages.length),
          'Cache-Control': 'no-store',
        },
      });
    }

    const pdf = await leaveMapPdf(pages, { width, height }, {
      title: `${copy.title} ${year}`,
      author: restaurant?.name ?? undefined,
    });

    await prisma.exportLog.create({
      data: { restaurantId: owner.restaurantId, userId: owner.userId, type: 'PDF', resource: `leave-map-${year}` },
    });

    const filename = `${getTranslation(language, 'leave.map.sheet.filename')}-${year}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Leave map generation error:', err);
    return NextResponse.json({ error: 'leave.map.failed' }, { status: 500 });
  }
}
