'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { startOfWeek, addWeeks, addDays, dateKey, parseDateKey, breakLength } from '@/lib/schedule';
import { EMPLOYEE_COLORS } from '@/lib/schedule';

/**
 * The rota's server side.
 *
 * Every action goes through requireOwner, not requireMember. A schedule shows
 * who works when and by implication who is not trusted with what; staff read
 * it as an image their manager sends them, never by opening the app.
 *
 * Restaurant scoping is on every query, including the ones that look up a row
 * by its own id. Checking ownership by id alone would let a guessed uuid from
 * another restaurant through.
 */

const MAX_COPY_WEEKS = 52;
const VALID_COLORS: ReadonlySet<string> = new Set<string>(EMPLOYEE_COLORS.map((c) => c.key));

function fail(error: string) {
  return { success: false as const, error };
}

/** Minutes must be a whole number inside a day. */
function validMinute(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 1440;
}

/**
 * Checks the break on a split shift and normalises it to a pair or nothing.
 *
 * Returns the pair to store, or an error message. Half a break is rejected
 * rather than silently dropped: someone who typed one of the two fields meant
 * to set a break, and storing the shift without it would quietly pay them for
 * the afternoon they are off.
 */
function checkBreak(
  startMin: number,
  endMin: number,
  breakStartMin?: number | null,
  breakEndMin?: number | null,
): { breakStartMin: number | null; breakEndMin: number | null } | { error: string } {
  const hasStart = breakStartMin != null;
  const hasEnd = breakEndMin != null;

  if (!hasStart && !hasEnd) return { breakStartMin: null, breakEndMin: null };
  if (hasStart !== hasEnd) return { error: 'Indique o início e o fim da pausa' };

  if (!validMinute(breakStartMin) || !validMinute(breakEndMin)) {
    return { error: 'Horas da pausa inválidas' };
  }

  // breakLength returns 0 for anything it cannot use — outside the shift,
  // backwards, or empty — which is exactly the set to reject here.
  if (breakLength(startMin, endMin, breakStartMin, breakEndMin) === 0) {
    return { error: 'A pausa tem de ficar dentro do turno' };
  }

  return { breakStartMin, breakEndMin };
}

// ── Reading ────────────────────────────────────────────────────────────────

export async function getWeekSchedule(weekStartKey?: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const monday = weekStartKey ? startOfWeek(parseDateKey(weekStartKey)) : startOfWeek(new Date());
  const sunday = addDays(monday, 6);

  const [employees, shifts, closures, templates] = await Promise.all([
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
    prisma.shiftTemplate.findMany({
      where: { restaurantId: owner.restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { startMin: 'asc' }],
    }),
  ]);

  return {
    success: true as const,
    data: {
      weekStart: dateKey(monday),
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        color: e.color,
        active: e.active,
      })),
      shifts: shifts.map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        date: dateKey(s.date),
        startMin: s.startMin,
        endMin: s.endMin,
        breakStartMin: s.breakStartMin,
        breakEndMin: s.breakEndMin,
        note: s.note,
      })),
      closures: closures.map((c) => ({ date: dateKey(c.date), reason: c.reason })),
      templates: templates.map((t) => ({
        id: t.id,
        label: t.label,
        startMin: t.startMin,
        endMin: t.endMin,
        breakStartMin: t.breakStartMin,
        breakEndMin: t.breakEndMin,
      })),
    },
  };
}

// ── People ─────────────────────────────────────────────────────────────────

export async function addEmployee(input: { name: string; role?: string; color?: string }) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const name = input.name?.trim();
  if (!name) return fail('O nome é obrigatório');
  if (name.length > 60) return fail('O nome é demasiado longo');

  const color = input.color && VALID_COLORS.has(input.color) ? input.color : 'slate';

  const last = await prisma.scheduleEmployee.findFirst({
    where: { restaurantId: owner.restaurantId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const employee = await prisma.scheduleEmployee.create({
    data: {
      restaurantId: owner.restaurantId,
      name,
      role: input.role?.trim() || null,
      color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  return { success: true as const, data: { id: employee.id } };
}

export async function updateEmployee(
  id: string,
  input: { name?: string; role?: string | null; color?: string; active?: boolean }
) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const existing = await prisma.scheduleEmployee.findFirst({
    where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return fail('Colaborador não encontrado');

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail('O nome é obrigatório');
    if (name.length > 60) return fail('O nome é demasiado longo');
    data.name = name;
  }
  if (input.role !== undefined) data.role = input.role?.trim() || null;
  if (input.color !== undefined && VALID_COLORS.has(input.color)) data.color = input.color;
  if (input.active !== undefined) data.active = input.active;

  await prisma.scheduleEmployee.update({ where: { id }, data });
  return { success: true as const };
}

/**
 * Removes someone from the team.
 *
 * Soft delete: their past shifts stay, because a schedule that rewrites
 * history when a person leaves is not a record of who worked when. They stop
 * appearing on the grid; last month still shows what it showed.
 */
export async function removeEmployee(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const existing = await prisma.scheduleEmployee.findFirst({
    where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return fail('Colaborador não encontrado');

  const today = startOfWeek(new Date());

  await prisma.$transaction([
    // Future shifts go: keeping someone rostered after they leave would send
    // the team an image naming a person who is not coming.
    prisma.shift.deleteMany({
      where: { employeeId: id, restaurantId: owner.restaurantId, date: { gte: today } },
    }),
    prisma.scheduleEmployee.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    }),
  ]);

  return { success: true as const };
}

export async function reorderEmployees(orderedIds: string[]) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const owned = await prisma.scheduleEmployee.findMany({
    where: { restaurantId: owner.restaurantId, deletedAt: null, id: { in: orderedIds } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) return fail('Lista inválida');

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.scheduleEmployee.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return { success: true as const };
}

// ── Shifts ─────────────────────────────────────────────────────────────────

export async function setShift(input: {
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
  note?: string | null;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  if (!validMinute(input.startMin) || !validMinute(input.endMin)) {
    return fail('Horas inválidas');
  }

  const pause = checkBreak(
    input.startMin, input.endMin, input.breakStartMin, input.breakEndMin,
  );
  if ('error' in pause) return fail(pause.error);

  const employee = await prisma.scheduleEmployee.findFirst({
    where: { id: input.employeeId, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return fail('Colaborador não encontrado');

  const date = parseDateKey(input.date);
  if (Number.isNaN(date.getTime())) return fail('Data inválida');

  await prisma.shift.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date } },
    create: {
      restaurantId: owner.restaurantId,
      employeeId: input.employeeId,
      date,
      startMin: input.startMin,
      endMin: input.endMin,
      breakStartMin: pause.breakStartMin,
      breakEndMin: pause.breakEndMin,
      note: input.note?.trim() || null,
    },
    update: {
      startMin: input.startMin,
      endMin: input.endMin,
      // Written on every update, so clearing the break on an existing shift
      // actually clears it rather than leaving the old pair in place.
      breakStartMin: pause.breakStartMin,
      breakEndMin: pause.breakEndMin,
      note: input.note?.trim() || null,
    },
  });

  return { success: true as const };
}

export async function clearShift(employeeId: string, date: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  await prisma.shift.deleteMany({
    where: { employeeId, restaurantId: owner.restaurantId, date: parseDateKey(date) },
  });

  return { success: true as const };
}

// ── Closed days ────────────────────────────────────────────────────────────

/**
 * Marks a day closed, or reopens it.
 *
 * Closing clears that day's shifts: a closed day with people still rostered
 * on it is a contradiction the exported image would show to the whole team.
 */
export async function toggleClosure(date: string, reason?: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const day = parseDateKey(date);
  if (Number.isNaN(day.getTime())) return fail('Data inválida');

  const existing = await prisma.scheduleClosure.findFirst({
    where: { restaurantId: owner.restaurantId, date: day },
    select: { id: true },
  });

  if (existing) {
    await prisma.scheduleClosure.delete({ where: { id: existing.id } });
    return { success: true as const, data: { closed: false } };
  }

  await prisma.$transaction([
    prisma.scheduleClosure.create({
      data: {
        restaurantId: owner.restaurantId,
        date: day,
        reason: reason?.trim() || null,
      },
    }),
    prisma.shift.deleteMany({ where: { restaurantId: owner.restaurantId, date: day } }),
  ]);

  return { success: true as const, data: { closed: true } };
}

// ── Copying a week forward ─────────────────────────────────────────────────

/**
 * Repeats a week over the following `weeks` weeks.
 *
 * The whole point of the feature: most restaurants work the same pattern week
 * after week, and retyping it every Monday is the reason schedules end up on
 * paper instead. Closed days travel with the shifts, since a restaurant that
 * shuts on Mondays shuts on every Monday.
 *
 * `overwrite` decides what happens where a target week already has shifts.
 * Off by default: silently discarding a week someone spent time arranging is
 * the kind of destruction an undo button cannot fix here.
 */
export async function copyWeekForward(input: {
  fromWeekStart: string;
  weeks: number;
  overwrite?: boolean;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const weeks = Math.floor(input.weeks);
  if (!Number.isFinite(weeks) || weeks < 1) return fail('Indica quantas semanas copiar');
  if (weeks > MAX_COPY_WEEKS) return fail(`No máximo ${MAX_COPY_WEEKS} semanas de cada vez`);

  const source = startOfWeek(parseDateKey(input.fromWeekStart));
  if (Number.isNaN(source.getTime())) return fail('Semana inválida');

  const sourceEnd = addDays(source, 6);

  const [shifts, closures] = await Promise.all([
    prisma.shift.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: source, lte: sourceEnd } },
    }),
    prisma.scheduleClosure.findMany({
      where: { restaurantId: owner.restaurantId, date: { gte: source, lte: sourceEnd } },
    }),
  ]);

  if (shifts.length === 0 && closures.length === 0) {
    return fail('Esta semana está vazia — não há nada para copiar');
  }

  // Someone removed mid-week must not reappear in every future week.
  const liveEmployees = await prisma.scheduleEmployee.findMany({
    where: { restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  const live = new Set(liveEmployees.map((e) => e.id));
  const copyable = shifts.filter((s) => live.has(s.employeeId));

  const targetStarts = Array.from({ length: weeks }, (_, i) => addWeeks(source, i + 1));
  const firstTarget = targetStarts[0];
  const lastTargetEnd = addDays(targetStarts[targetStarts.length - 1], 6);

  if (!input.overwrite) {
    const clash = await prisma.shift.findFirst({
      where: {
        restaurantId: owner.restaurantId,
        date: { gte: firstTarget, lte: lastTargetEnd },
      },
      select: { date: true },
    });
    if (clash) {
      return {
        success: false as const,
        error: 'Já existem turnos nessas semanas',
        // The UI offers to overwrite rather than failing outright.
        conflict: true as const,
      };
    }
  }

  const shiftRows = targetStarts.flatMap((target) => {
    const weekOffset = Math.round((target.getTime() - source.getTime()) / 86_400_000);
    return copyable.map((s) => ({
      restaurantId: owner.restaurantId,
      employeeId: s.employeeId,
      date: addDays(s.date, weekOffset),
      startMin: s.startMin,
      endMin: s.endMin,
      breakStartMin: s.breakStartMin,
      breakEndMin: s.breakEndMin,
      note: s.note,
    }));
  });

  const closureRows = targetStarts.flatMap((target) => {
    const weekOffset = Math.round((target.getTime() - source.getTime()) / 86_400_000);
    return closures.map((c) => ({
      restaurantId: owner.restaurantId,
      date: addDays(c.date, weekOffset),
      reason: c.reason,
    }));
  });

  await prisma.$transaction([
    prisma.shift.deleteMany({
      where: { restaurantId: owner.restaurantId, date: { gte: firstTarget, lte: lastTargetEnd } },
    }),
    prisma.scheduleClosure.deleteMany({
      where: { restaurantId: owner.restaurantId, date: { gte: firstTarget, lte: lastTargetEnd } },
    }),
    prisma.shift.createMany({ data: shiftRows }),
    prisma.scheduleClosure.createMany({ data: closureRows }),
  ]);

  return {
    success: true as const,
    data: { weeks, shifts: shiftRows.length },
  };
}

/** Empties a week, for starting it over. */
export async function clearWeek(weekStartKey: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const monday = startOfWeek(parseDateKey(weekStartKey));
  const sunday = addDays(monday, 6);

  await prisma.$transaction([
    prisma.shift.deleteMany({
      where: { restaurantId: owner.restaurantId, date: { gte: monday, lte: sunday } },
    }),
    prisma.scheduleClosure.deleteMany({
      where: { restaurantId: owner.restaurantId, date: { gte: monday, lte: sunday } },
    }),
  ]);

  return { success: true as const };
}

// ── Shift templates ────────────────────────────────────────────────────────

export async function saveTemplate(input: {
  label: string;
  startMin: number;
  endMin: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const label = input.label?.trim();
  if (!label) return fail('O nome do turno é obrigatório');
  if (!validMinute(input.startMin) || !validMinute(input.endMin)) return fail('Horas inválidas');

  const pause = checkBreak(
    input.startMin, input.endMin, input.breakStartMin, input.breakEndMin,
  );
  if ('error' in pause) return fail(pause.error);

  const count = await prisma.shiftTemplate.count({ where: { restaurantId: owner.restaurantId } });
  if (count >= 12) return fail('Máximo de 12 turnos guardados');

  await prisma.shiftTemplate.create({
    data: {
      restaurantId: owner.restaurantId,
      label,
      startMin: input.startMin,
      endMin: input.endMin,
      breakStartMin: pause.breakStartMin,
      breakEndMin: pause.breakEndMin,
      sortOrder: count,
    },
  });

  return { success: true as const };
}

export async function deleteTemplate(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  await prisma.shiftTemplate.deleteMany({ where: { id, restaurantId: owner.restaurantId } });
  return { success: true as const };
}
