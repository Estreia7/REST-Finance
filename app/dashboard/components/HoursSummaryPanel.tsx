'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sigma } from 'lucide-react';
import { getHoursSummary, getScheduleWeeks } from '../schedule-actions';
import {
  dateKey, parseDateKey, weekDates, monthWeekStarts, isWeekend, shiftLength, hasBreak,
  formatDuration, formatMonthTitle, formatRange, formatWeekShort, employeeColor, DAY_OFF_COLOR,
} from '@/lib/schedule';
import { useLanguage } from '@/lib/language-context';
import { MONTH_KEYS } from './pnl-shared';
import Dialog from './Dialog';

/**
 * What the rota adds up to: a row per person, a column per month.
 *
 * Every figure opens the shifts behind it, because the question after "why is
 * this month 180 hours?" is always which weeks did that. The figures are the
 * rota's planned hours; what was actually clocked lives in Equipa › Ponto.
 */

interface Person {
  id: string;
  name: string;
  role: string | null;
  color: string;
  left: boolean;
  months: number[];
}

const hours = (minutes: number) => (minutes > 0 ? formatDuration(minutes) : '—');
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export default function HoursSummaryPanel() {
  const { t, language } = useLanguage();
  const today = new Date();
  const thisYear = today.getUTCFullYear();
  const thisMonth = today.getUTCMonth();

  const [year, setYear] = useState(thisYear);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ person: Person; month: number } | null>(null);

  useEffect(() => {
    // Stepping through years quickly can bring answers back out of order.
    let current = true;
    setLoading(true);
    getHoursSummary(year)
      .then((r) => {
        if (!current) return;
        setFailed(!r.success);
        if (r.success) setPeople(r.data.people);
      })
      .catch(() => { if (current) setFailed(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [year]);

  // On a phone the year does not fit: open on this month, not on January.
  const scroller = useRef<HTMLDivElement>(null);
  const currentHead = useRef<HTMLTableCellElement>(null);
  const firstHead = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    if (!scroller.current || !currentHead.current || !firstHead.current) return;
    scroller.current.scrollLeft = currentHead.current.offsetLeft - firstHead.current.offsetWidth;
  }, [people, year]);

  const monthTotals = useMemo(
    () => MONTH_KEYS.map((_, i) => sum((people ?? []).map((p) => p.months[i]))),
    [people],
  );
  const yearTotal = sum(monthTotals);

  const navButton =
    'w-11 h-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground ' +
    'hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const isCurrent = (i: number) => year === thisYear && i === thisMonth;
  const pinnedTotal = 'md:sticky md:right-0 z-10 bg-card border-l border-border-subtle';

  return (
    <div className="card-glass p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYear(year - 1)} className={navButton} aria-label={t('schedule.hours.yearPrevious')}>
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setYear(year + 1)} className={navButton} aria-label={t('schedule.hours.yearNext')}>
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-w-[12rem] flex-1">
          <h3 className="font-bold text-foreground">
            {t('schedule.hours.title')} <span className="whitespace-nowrap">· {year}</span>
          </h3>
          <p className="text-xs text-muted-foreground">{t('schedule.hours.hint')}</p>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="mt-4 rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {t('schedule.hours.loadFailed')}
        </p>
      ) : !people ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </div>
      ) : yearTotal === 0 ? (
        <div className={`mt-4 py-8 text-center transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <Sigma className="w-8 h-8 mx-auto text-muted-foreground/40" aria-hidden="true" />
          <h4 className="mt-3 font-semibold text-foreground">
            {t('schedule.hours.emptyTitle').replace('{year}', String(year))}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{t('schedule.hours.emptyBody')}</p>
        </div>
      ) : (
        <div
          ref={scroller}
          aria-busy={loading}
          className={`relative mt-4 overflow-x-auto -mx-4 sm:-mx-5 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <table className="min-w-full w-max text-sm border-collapse">
            <caption className="sr-only">{t('schedule.hours.title')} · {year}</caption>
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th ref={firstHead} scope="col" className="sticky left-0 z-10 bg-card text-left px-4 sm:px-5 py-2 font-medium">
                  {t('schedule.person')}
                </th>
                {MONTH_KEYS.map((m, i) => (
                  <th
                    key={m}
                    ref={isCurrent(i) ? currentHead : undefined}
                    scope="col"
                    aria-current={isCurrent(i) ? 'date' : undefined}
                    className={`px-1 py-2 min-w-[4.25rem] text-right font-medium ${isCurrent(i) ? 'text-primary-ink font-semibold' : ''}`}
                  >
                    <span className="px-2">{t(`annualPnl.monthAbbr.${m}`)}</span>
                  </th>
                ))}
                <th scope="col" className={`${pinnedTotal} px-4 sm:px-5 py-2 text-right font-medium`}>
                  {t('common.total')}
                </th>
              </tr>
            </thead>

            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="border-b border-border-subtle">
                  <th scope="row" className="sticky left-0 z-10 bg-card text-left px-4 sm:px-5 py-1.5 font-normal">
                    <div className="flex items-center gap-2 w-[7.5rem] sm:w-44">
                      <span
                        className="w-1 h-7 rounded-full shrink-0"
                        style={{ background: employeeColor(person.color).dot }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground truncate">{person.name}</span>
                        {(person.left || person.role) && (
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {person.left ? t('schedule.hours.left') : person.role}
                          </span>
                        )}
                      </span>
                    </div>
                  </th>

                  {person.months.map((minutes, i) => (
                    <td key={MONTH_KEYS[i]} className="px-1 py-1 text-right">
                      {minutes > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpen({ person, month: i })}
                          aria-label={t('schedule.hours.openMonth')
                            .replace('{person}', person.name)
                            .replace('{month}', formatMonthTitle(year, i, language))
                            .replace('{hours}', formatDuration(minutes))}
                          className="w-full min-h-[44px] rounded-lg px-2 text-right font-semibold tabular-nums text-foreground
                                     underline decoration-border underline-offset-4 transition-colors
                                     hover:bg-primary-subtle hover:text-primary-ink hover:decoration-primary
                                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {formatDuration(minutes)}
                        </button>
                      ) : (
                        <span className="px-2 text-muted-foreground/50">—</span>
                      )}
                    </td>
                  ))}

                  <td className={`${pinnedTotal} px-4 sm:px-5 py-1 text-right font-bold tabular-nums text-foreground`}>
                    {hours(sum(person.months))}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="text-muted-foreground">
                <th scope="row" className="sticky left-0 z-10 bg-card text-left px-4 sm:px-5 py-2.5 text-xs font-semibold">
                  {t('schedule.hours.team')}
                </th>
                {monthTotals.map((minutes, i) => (
                  <td key={MONTH_KEYS[i]} className="px-1 py-2.5 text-right text-xs font-semibold tabular-nums">
                    <span className="px-2">{hours(minutes)}</span>
                  </td>
                ))}
                <td className={`${pinnedTotal} px-4 sm:px-5 py-2.5 text-right font-bold tabular-nums text-foreground`}>
                  {hours(yearTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {open && (
        <PersonMonthDialog person={open.person} year={year} month={open.month} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

type Rota = Extract<Awaited<ReturnType<typeof getScheduleWeeks>>, { success: true }>['data'];
type RotaShift = Rota['shifts'][number];

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** What one person's day holds, as the rota draws it. */
type Day =
  | { kind: 'shift'; shift: RotaShift }
  | { kind: 'off' | 'leave' | 'closed' | 'empty' };

/**
 * One person's month, week by week: the shifts behind a figure in the summary.
 *
 * Read fresh through the rota's own read, so what opens is what the rota says.
 * Weeks are whole, as a wall calendar draws them, but only the month's own days
 * count: the week totals here add up to the figure that was tapped, which is
 * why a straddling week can read less than the same week on the rota.
 */
function PersonMonthDialog({
  person, year, month, onClose,
}: {
  person: Person;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const weeks = useMemo(() => monthWeekStarts(year, month), [year, month]);
  const [rota, setRota] = useState<Rota | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    getScheduleWeeks(weeks[0], weeks.length)
      .then((r) => {
        if (!current) return;
        if (r.success) setRota(r.data);
        else setFailed(true);
      })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [weeks]);

  const dayOf = useMemo(() => {
    const shifts = new Map((rota?.shifts ?? []).filter((s) => s.employeeId === person.id).map((s) => [s.date, s]));
    const off = new Set((rota?.daysOff ?? []).filter((d) => d.employeeId === person.id).map((d) => d.date));
    const closed = new Set((rota?.closures ?? []).map((c) => c.date));
    const leaves = (rota?.leaves ?? []).filter((l) => l.employeeId === person.id);
    return (key: string): Day => {
      // The shift first: whatever is counted in the hours must be on screen.
      const shift = shifts.get(key);
      if (shift) return { kind: 'shift', shift };
      if (closed.has(key)) return { kind: 'closed' };
      if (leaves.some((l) => l.start <= key && key <= l.end)) return { kind: 'leave' };
      return { kind: off.has(key) ? 'off' : 'empty' };
    };
  }, [rota, person.id]);

  const inMonth = (d: Date) => d.getUTCFullYear() === year && d.getUTCMonth() === month;
  const minutesOf = (days: Date[]) =>
    sum(days.filter(inMonth).map((d) => {
      const day = dayOf(dateKey(d));
      return day.kind === 'shift'
        ? shiftLength(day.shift.startMin, day.shift.endMin, day.shift.breakStartMin, day.shift.breakEndMin)
        : 0;
    }));

  const rows = weeks.map((wk, i) => {
    const days = weekDates(parseDateKey(wk));
    return { wk, days, label: `${t('schedule.weekNumber')} ${i + 1}`, range: formatWeekShort(parseDateKey(wk)), minutes: minutesOf(days) };
  });
  const total = sum(rows.map((r) => r.minutes));
  const color = employeeColor(person.color);

  return (
    <Dialog title={`${person.name} · ${formatMonthTitle(year, month, language)}`} onClose={onClose} wide>
      {failed ? (
        <p role="alert" className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {t('schedule.hours.loadFailed')}
        </p>
      ) : !rota ? (
        <div className="py-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('schedule.loading')}
        </div>
      ) : (
        <>
          {/* ── Desktop: the weeks stacked, a column per weekday ───────────── */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm border-collapse">
              <caption className="sr-only">{person.name} · {formatMonthTitle(year, month, language)}</caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="w-24 text-left px-2 py-2 font-medium">{t('schedule.weekNumber')}</th>
                  {WEEKDAY_KEYS.map((k) => (
                    <th key={k} scope="col" className="px-1 py-2 text-center font-medium">{t(`schedule.weekday.${k}`)}</th>
                  ))}
                  <th scope="col" className="w-20 text-right px-2 py-2 font-medium">{t('schedule.hours.weekHours')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.wk} className="border-b border-border-subtle">
                    <th scope="row" className="text-left px-2 py-1.5 font-normal align-top">
                      <span className="block text-xs font-semibold text-foreground">{row.label}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">{row.range}</span>
                    </th>
                    {row.days.map((d) => (
                      <td key={dateKey(d)} className={`px-1 py-1.5 align-top ${isWeekend(d) ? 'bg-weekend' : ''}`}>
                        <div className={inMonth(d) ? '' : 'opacity-55'}>
                          <span className="block text-center text-[11px] text-muted-foreground tabular-nums mb-1">
                            {d.getUTCDate()}/{d.getUTCMonth() + 1}
                          </span>
                          <DayCell day={dayOf(dateKey(d))} color={color} />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right align-middle font-semibold tabular-nums text-foreground">
                      {hours(row.minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={8} className="px-2 pt-3 text-right text-sm font-semibold text-foreground">
                    {t('schedule.hours.monthTotal')}
                  </th>
                  <td className="px-2 pt-3 text-right font-bold tabular-nums text-foreground">{hours(total)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">{t('schedule.hours.outsideHint')}</p>
          </div>

          {/* ── Phone: seven columns of times do not fit, so a day per line,
              and only the month's own days: nothing to explain away. ──────── */}
          <div className="md:hidden space-y-4">
            {rows.map((row) => (
              <section key={row.wk} aria-label={`${row.label} ${row.range}`}>
                <div className="flex items-baseline justify-between gap-3 pb-1 border-b border-border">
                  <h5 className="text-xs font-semibold text-foreground">
                    {row.label} <span className="font-normal text-muted-foreground tabular-nums">{row.range}</span>
                  </h5>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{hours(row.minutes)}</span>
                </div>
                <ul className="divide-y divide-border-subtle">
                  {row.days.filter(inMonth).map((d) => (
                    <li key={dateKey(d)} className="flex items-center gap-3 py-1.5">
                      <span className={`w-14 shrink-0 text-xs tabular-nums ${isWeekend(d) ? 'text-weekend-foreground font-semibold' : 'text-muted-foreground'}`}>
                        {t(`schedule.weekday.${WEEKDAY_KEYS[(d.getUTCDay() + 6) % 7]}`)} {d.getUTCDate()}
                      </span>
                      <div className="flex-1 min-w-0"><DayCell day={dayOf(dateKey(d))} color={color} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="flex items-baseline justify-between gap-3 pt-1 text-sm font-semibold text-foreground">
              {t('schedule.hours.monthTotal')}
              <span className="font-bold tabular-nums">{hours(total)}</span>
            </p>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** A day as the rota paints it, to read and not to change. */
function DayCell({ day, color }: { day: Day; color: ReturnType<typeof employeeColor> }) {
  const { t } = useLanguage();
  // Side by side on a phone, where a day has the whole line; stacked in a column.
  const box = 'min-h-[36px] rounded-lg px-1 py-1 flex flex-wrap md:flex-col items-center justify-center gap-x-2 text-center text-[11px] font-semibold';

  if (day.kind === 'shift') {
    const { startMin, endMin, breakStartMin, breakEndMin, note } = day.shift;
    return (
      <div className={`${box} tabular-nums leading-tight`} style={{ background: color.bg, color: color.ink }}>
        {hasBreak(startMin, endMin, breakStartMin, breakEndMin) ? (
          <>
            <span>{formatRange(startMin, breakStartMin!)}</span>
            <span>{formatRange(breakEndMin!, endMin)}</span>
          </>
        ) : (
          <span>{formatRange(startMin, endMin)}</span>
        )}
        {note && <span className="max-w-full text-[10px] font-normal truncate">{note}</span>}
      </div>
    );
  }
  if (day.kind === 'off') {
    return <div className={box} style={{ background: DAY_OFF_COLOR.bg, color: DAY_OFF_COLOR.ink }}>{t('schedule.dayOff')}</div>;
  }
  if (day.kind === 'leave') return <div className={`${box} bg-muted text-muted-foreground`}>{t('schedule.onLeave')}</div>;
  if (day.kind === 'closed') {
    return <div className={`${box} border border-dashed border-border text-muted-foreground`}>{t('schedule.closedShort')}</div>;
  }
  return <div className={`${box} text-muted-foreground/50`} aria-hidden="true">—</div>;
}
