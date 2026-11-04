import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { logoDataUri } from '@/lib/logo-data-uri';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { buildScheduleSvg } from '@/lib/schedule-image';
import {
  startOfWeek,
  addDays,
  dateKey,
  parseDateKey,
  weekDates,
  weeksAhead,
  weeksWithShifts,
} from '@/lib/schedule';

/**
 * The rota as an image, for sending to the team on WhatsApp.
 *
 * Owner-only, like every other schedule route: the image names who works when
 * and it is the owner's decision who receives it.
 *
 * Rendered at 2x and rasterised by sharp. WhatsApp recompresses whatever it is
 * given, so the source is drawn generously and handed over at a quality that
 * survives one more pass — an image that is already marginal comes out of
 * their pipeline unreadable.
 *
 * Two formats, because the two ways out of here have different constraints:
 *   - `?format=png` is for copying to the clipboard. The async clipboard API
 *     takes PNG and nothing else in practice, and it is served inline so the
 *     browser hands back a blob instead of starting a download.
 *   - the default JPEG is for the download button, where the smaller file is
 *     what gets attached in WhatsApp.
 *
 * `?week=YYYY-MM-DD` draws one week. `?weeks=4` stacks this week and the ones
 * after it into one image, leaving out any with nothing marked.
 */

export const dynamic = 'force-dynamic';

const SCALE = 2;
const BACKGROUND = '#fbfaf8';
const MAX_WEEKS = 6;

function rasterise({ svg, width, height }: { svg: string; width: number; height: number }) {
  return sharp(Buffer.from(svg), { density: 72 * SCALE })
    .resize(width * SCALE, height * SCALE, { fit: 'fill' })
    // A flat background, not transparency: JPEG has no alpha, and letting
    // it default turns unpainted pixels black. PNG is flattened to match, so
    // the copy and the download look identical.
    .flatten({ background: BACKGROUND });
}

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (isAuthError(owner)) {
    return NextResponse.json({ error: owner.error }, { status: 403 });
  }

  const weekParam = request.nextUrl.searchParams.get('week');
  const weeksParam = request.nextUrl.searchParams.get('weeks');
  const wantsPng = request.nextUrl.searchParams.get('format') === 'png';

  let weeks: string[];
  if (weeksParam !== null) {
    const count = Number(weeksParam);
    if (!Number.isInteger(count) || count < 1 || count > MAX_WEEKS) {
      return NextResponse.json({ error: 'Semanas inválidas' }, { status: 400 });
    }
    weeks = weeksAhead(new Date(), count);
  } else {
    const monday = weekParam ? startOfWeek(parseDateKey(weekParam)) : startOfWeek(new Date());
    if (Number.isNaN(monday.getTime())) {
      return NextResponse.json({ error: 'Semana inválida' }, { status: 400 });
    }
    weeks = [dateKey(monday)];
  }

  const from = parseDateKey(weeks[0]);
  const to = addDays(parseDateKey(weeks[weeks.length - 1]), 6);

  const firstWeek = weeks[0];

  const [restaurant, employees, shifts, closures, leaves, daysOff] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { name: true, logoPath: true },
    }),
    prisma.scheduleEmployee.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.shift.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: from, lte: to } },
    }),
    prisma.scheduleClosure.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: from, lte: to } },
    }),
    prisma.employeeLeave.findMany({
      where: { restaurantId: owner.restaurantId, startDate: { lte: to }, endDate: { gte: from } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    prisma.scheduleDayOff.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: from, lte: to } },
      select: { employeeId: true, date: true },
    }),
  ]);

  const allShifts = shifts.map((s) => ({
    employeeId: s.employeeId,
    date: dateKey(s.date),
    startMin: s.startMin,
    endMin: s.endMin,
    breakStartMin: s.breakStartMin,
    breakEndMin: s.breakEndMin,
    note: s.note,
  }));
  const allClosures = closures.map((c) => ({ date: dateKey(c.date), reason: c.reason }));
  const allLeaves = leaves.map((l) => ({
    employeeId: l.employeeId,
    start: dateKey(l.startDate),
    end: dateKey(l.endDate),
  }));

  const allDaysOff = daysOff.map((d) => ({ employeeId: d.employeeId, date: dateKey(d.date) }));

  if (weeksParam !== null) {
    weeks = weeksWithShifts(weeks, [...allShifts, ...allDaysOff].map((s) => s.date));
    if (weeks.length === 0) {
      return NextResponse.json({ error: 'Sem turnos' }, { status: 404 });
    }
  }

  const restaurantName = restaurant?.name ?? 'Restaurante';
  const logo = await logoDataUri(restaurant?.logoPath);

  const pages = weeks.map((weekStart) => {
    const days = new Set(weekDates(parseDateKey(weekStart)).map(dateKey));
    return buildScheduleSvg({
      restaurantName,
      logo,
      weekStart,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        color: e.color,
      })),
      shifts: allShifts.filter((s) => days.has(s.date)),
      closures: allClosures.filter((c) => days.has(c.date)),
      leaves: allLeaves,
      daysOff: allDaysOff.filter((d) => days.has(d.date)),
    });
  });

  try {
    let raster = rasterise(pages[0]);

    if (pages.length > 1) {
      const layers = await Promise.all(pages.map((page) => rasterise(page).png().toBuffer()));
      let top = 0;
      const stacked = layers.map((input, i) => {
        const layer = { input, left: 0, top };
        top += pages[i].height * SCALE;
        return layer;
      });
      raster = sharp({
        create: { width: pages[0].width * SCALE, height: top, channels: 3, background: BACKGROUND },
      }).composite(stacked);
    }

    const image = wantsPng
      ? await raster.png({ compressionLevel: 9 }).toBuffer()
      : await raster.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();

    return new NextResponse(new Uint8Array(image), {
      headers: {
        'Content-Type': wantsPng ? 'image/png' : 'image/jpeg',
        // Inline for the clipboard copy, which reads the body as a blob; the
        // download keeps `attachment` so the browser saves it with a name.
        'Content-Disposition': wantsPng
          ? 'inline'
          : `attachment; filename="horario-${firstWeek}${weeksParam ? `-${weeksParam}-semanas` : ''}.jpg"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível gerar a imagem' }, { status: 500 });
  }
}
