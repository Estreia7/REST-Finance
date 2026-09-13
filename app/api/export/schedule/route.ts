import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { buildScheduleSvg } from '@/lib/schedule-image';
import { startOfWeek, addDays, dateKey, parseDateKey } from '@/lib/schedule';

/**
 * The week's rota as an image, for sending to the team on WhatsApp.
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
 */

export const dynamic = 'force-dynamic';

const SCALE = 2;

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (isAuthError(owner)) {
    return NextResponse.json({ error: owner.error }, { status: 403 });
  }

  const weekParam = request.nextUrl.searchParams.get('week');
  const wantsPng = request.nextUrl.searchParams.get('format') === 'png';
  const monday = weekParam ? startOfWeek(parseDateKey(weekParam)) : startOfWeek(new Date());

  if (Number.isNaN(monday.getTime())) {
    return NextResponse.json({ error: 'Semana inválida' }, { status: 400 });
  }

  const sunday = addDays(monday, 6);

  const [restaurant, employees, shifts, closures] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { name: true },
    }),
    prisma.scheduleEmployee.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.shift.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: monday, lte: sunday } },
    }),
    prisma.scheduleClosure.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: monday, lte: sunday } },
    }),
  ]);

  const { svg, width, height } = buildScheduleSvg({
    restaurantName: restaurant?.name ?? 'Restaurante',
    weekStart: dateKey(monday),
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      color: e.color,
    })),
    shifts: shifts.map((s) => ({
      employeeId: s.employeeId,
      date: dateKey(s.date),
      startMin: s.startMin,
      endMin: s.endMin,
      breakStartMin: s.breakStartMin,
      breakEndMin: s.breakEndMin,
      note: s.note,
    })),
    closures: closures.map((c) => ({ date: dateKey(c.date), reason: c.reason })),
  });

  try {
    const raster = sharp(Buffer.from(svg), { density: 72 * SCALE })
      .resize(width * SCALE, height * SCALE, { fit: 'fill' })
      // A flat background, not transparency: JPEG has no alpha, and letting
      // it default turns unpainted pixels black. PNG is flattened to match, so
      // the copy and the download look identical.
      .flatten({ background: '#fbfaf8' });

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
          : `attachment; filename="horario-${dateKey(monday)}.jpg"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível gerar a imagem' }, { status: 500 });
  }
}
