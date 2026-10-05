'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Loader2, ChevronLeft, ChevronRight, Plus, Check, Trash2, AlertTriangle, CalendarDays, Palmtree,
} from 'lucide-react';
import { getLeaveOverview, saveLeave, removeLeave, setEmployeeStartDate } from '../leave-actions';
import {
  leaveBalance, leaveWorkingDays, holidayOn, onLeave, type LeaveBalance, type LeaveRange,
} from '@/lib/leave';
import {
  monthWeekStarts, weekDates, parseDateKey, dateKey, isWeekend, formatMonthTitle, employeeColor,
} from '@/lib/schedule';
import { useLanguage } from '@/lib/language-context';
import Dialog from './Dialog';

/**
 * Holidays for the people on the rota: a month to see who is away, and below
 * it where each person stands for the year.
 *
 * The counting is the law's, done by `lib/leave.ts`: working days, Monday to
 * Friday without public holidays, 22 a year, fewer in the year someone joins,
 * and what is left over usable until 30 April. The panel only ever shows
 * numbers that function produced, so the calendar, the balances and the
 * booking dialog cannot disagree with each other.
 */

interface LeaveEmployee {
  id: string;
  name: string;
  role: string | null;
  color: string;
  startDate: string | null;
}

interface Leave extends LeaveRange {
  id: string;
  employeeId: string;
  note: string | null;
}

interface Overview {
  year: number;
  trackedFromYear: number;
  employees: LeaveEmployee[];
  leaves: Leave[];
}

type Booking =
  | { mode: 'new'; employeeId?: string; start?: string }
  | { mode: 'edit'; leave: Leave };

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** 15/03/2026. */
function formatDay(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** "10 – 14 ago." / "28 dez. – 3 jan.": a booking, compactly. */
function formatRange(start: string, end: string, language: 'pt' | 'en'): string {
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const fmt = (key: string) =>
    parseDateKey(key).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (start === end) return fmt(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${Number(start.slice(8))} – ${fmt(end)}` : `${fmt(start)} – ${fmt(end)}`;
}

export default function LeavePanel() {
  const { t, language } = useLanguage();
  const today = dateKey(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [editingStart, setEditingStart] = useState<LeaveEmployee | null>(null);

  const requestId = useRef(0);
  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    getLeaveOverview(month.year).then((r) => {
      if (id !== requestId.current) return;
      if (r.success) setData(r.data);
      else toast.error(t(r.error));
      setLoading(false);
    });
  }, [month.year, t]);

  useEffect(() => { load(); }, [load]);

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const leaves = useMemo(() => data?.leaves ?? [], [data]);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const leavesOf = useCallback(
    (employeeId: string) => leaves.filter((l) => l.employeeId === employeeId),
    [leaves],
  );

  const balanceOf = useCallback(
    (emp: LeaveEmployee, extra: LeaveRange[] = [], excludeId?: string): LeaveBalance =>
      leaveBalance({
        startDate: emp.startDate,
        leaves: [...leavesOf(emp.id).filter((l) => l.id !== excludeId), ...extra],
        year: month.year,
        today,
        trackedFromYear: data?.trackedFromYear,
      }),
    [leavesOf, month.year, today, data?.trackedFromYear],
  );

  const stepMonth = (delta: number) => {
    setSelectedDay(null);
    setMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  };

  const now = new Date();
  const onThisMonth = now.getUTCFullYear() === month.year && now.getUTCMonth() === month.month;
  const weeks = monthWeekStarts(month.year, month.month).map((w) => weekDates(parseDateKey(w)));

  /** Who is away on a date, in the rota's order. */
  const awayOn = (key: string) =>
    employees.filter((e) => onLeave(leavesOf(e.id), key));

  if (loading && !data) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('leave.loading')}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="card-glass p-8 text-center">
        <Palmtree className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
        <h4 className="mt-3 font-semibold text-foreground">{t('leave.emptyTitle')}</h4>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{t('leave.emptyBody')}</p>
      </div>
    );
  }

  const selectedAway = selectedDay ? awayOn(selectedDay) : [];
  const selectedHoliday = selectedDay ? holidayOn(selectedDay) : null;

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      {/* ── The month ───────────────────────────────────────────────────── */}
      <div className="card-glass p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {[-1, 1].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => stepMonth(delta)}
                className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground
                           hover:text-foreground hover:bg-muted transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={delta < 0 ? t('leave.monthPrevious') : t('leave.monthNext')}
              >
                {delta < 0
                  ? <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                  : <ChevronRight className="w-5 h-5" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div className="min-w-[10rem] flex-1">
            <h3 className="font-bold text-foreground truncate">
              {formatMonthTitle(month.year, month.month, language)}
            </h3>
            <p className="text-xs text-muted-foreground">{t('leave.calendarHint')}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedDay(null);
                setMonth({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
              }}
              disabled={onThisMonth}
              className="cta-button-secondary !h-11 !py-0 !px-3.5 !text-xs disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              {t('leave.thisMonth')}
            </button>
            <button
              type="button"
              onClick={() => setBooking({ mode: 'new', start: selectedDay ?? undefined })}
              className="cta-button !h-11 !py-0 !px-4 !text-xs"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('leave.book')}
            </button>
          </div>
        </div>

        {/* A plain grid of days. Each day is one button: on a phone the names
            do not fit, so the people away show as coloured dots and the day
            opens below; on a laptop the names are on the day itself. */}
        <div className="mt-4" role="grid" aria-label={formatMonthTitle(month.year, month.month, language)}>
          <div className="grid grid-cols-7 gap-1 mb-1" role="row">
            {WEEKDAY_KEYS.map((k, i) => (
              <div
                key={k}
                role="columnheader"
                className={`text-center text-[11px] font-semibold py-1 rounded-md ${
                  i >= 5 ? 'bg-weekend text-weekend-foreground' : 'text-muted-foreground'
                }`}
              >
                {t(`schedule.weekday.${k}`)}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((days) => (
              <div key={dateKey(days[0])} className="grid grid-cols-7 gap-1" role="row">
                {days.map((day) => {
                  const key = dateKey(day);
                  const outside = day.getUTCMonth() !== month.month;
                  const holiday = holidayOn(key);
                  const away = awayOn(key);
                  const selected = selectedDay === key;
                  const isToday = key === today;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      aria-selected={selected}
                      onClick={() => setSelectedDay(selected ? null : key)}
                      title={holiday ? t(`leave.holiday.${holiday}`) : undefined}
                      className={`relative min-h-[3.25rem] md:min-h-[5.5rem] rounded-lg p-1 md:p-1.5 text-left align-top
                        flex flex-col gap-1 transition-colors border
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                        ${selected ? 'border-primary' : 'border-transparent'}
                        ${isWeekend(day) ? 'bg-weekend' : 'bg-muted'}
                        ${outside ? 'opacity-45' : ''}
                        hover:border-border`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs tabular-nums font-semibold w-6 h-6 rounded-full flex items-center justify-center
                            ${isToday ? 'bg-primary text-primary-foreground' : holiday ? 'text-warning' : 'text-foreground'}`}
                        >
                          {day.getUTCDate()}
                        </span>
                        {holiday && (
                          <span className="hidden lg:block text-[9px] font-semibold uppercase tracking-wide text-warning truncate">
                            {t('leave.holidayShort')}
                          </span>
                        )}
                      </span>

                      {/* Names on a laptop, up to three, then a count. */}
                      <span className="hidden md:flex flex-col gap-0.5 min-w-0">
                        {away.slice(0, 3).map((emp) => {
                          const c = employeeColor(emp.color);
                          return (
                            <span
                              key={emp.id}
                              className="block truncate rounded px-1 py-px text-[10px] font-semibold"
                              style={{ background: c.bg, color: c.ink }}
                            >
                              {emp.name}
                            </span>
                          );
                        })}
                        {away.length > 3 && (
                          <span className="text-[10px] font-semibold text-muted-foreground">+{away.length - 3}</span>
                        )}
                      </span>

                      {/* Dots on a phone. */}
                      {away.length > 0 && (
                        <span className="flex md:hidden flex-wrap gap-0.5" aria-hidden="true">
                          {away.slice(0, 4).map((emp) => (
                            <span
                              key={emp.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: employeeColor(emp.color).dot }}
                            />
                          ))}
                        </span>
                      )}
                      {away.length > 0 && (
                        <span className="sr-only">
                          {away.length} {t('leave.awayCount')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* The day that was tapped: who is away, and booking from there. */}
        {selectedDay && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {parseDateKey(selectedDay).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
                })}
                {selectedHoliday && (
                  <span className="ml-2 text-xs font-semibold text-warning">
                    {t(`leave.holiday.${selectedHoliday}`)}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setBooking({ mode: 'new', start: selectedDay })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t('leave.bookFromDay')}
              </button>
            </div>

            {selectedAway.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('leave.nobodyAway')}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {selectedAway.map((emp) => {
                  const leave = leavesOf(emp.id).find((l) => l.start <= selectedDay && selectedDay <= l.end)!;
                  const c = employeeColor(emp.color);
                  return (
                    <li key={emp.id}>
                      <button
                        type="button"
                        onClick={() => setBooking({ mode: 'edit', leave })}
                        className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="w-1 h-6 rounded-full shrink-0" style={{ background: c.dot }} aria-hidden="true" />
                        <span className="text-sm font-semibold text-foreground flex-1 truncate">{emp.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatRange(leave.start, leave.end, language)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Where each person stands ────────────────────────────────────── */}
      <div className="card-glass p-4 sm:p-5">
        <h3 className="font-bold text-foreground">
          {t('leave.balancesTitle')} {month.year}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('leave.balancesHint')}</p>

        <ul className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-t border-border-subtle">
          {employees.map((emp) => (
            <EmployeeBalance
              key={emp.id}
              employee={emp}
              balance={balanceOf(emp)}
              leaves={leavesOf(emp.id).filter(
                (l) => l.start <= `${month.year}-12-31` && l.end >= `${month.year}-01-01`,
              )}
              onBook={() => setBooking({ mode: 'new', employeeId: emp.id })}
              onEdit={(leave) => setBooking({ mode: 'edit', leave })}
              onEditStart={() => setEditingStart(emp)}
            />
          ))}
        </ul>
      </div>

      {booking && (
        <LeaveDialog
          booking={booking}
          employees={employees}
          balanceFor={(employeeId, range, excludeId) => {
            const emp = byId.get(employeeId);
            if (!emp) return null;
            // The balance of the year the booking starts in.
            return leaveBalance({
              startDate: emp.startDate,
              leaves: [...leavesOf(emp.id).filter((l) => l.id !== excludeId), range],
              year: Number(range.start.slice(0, 4)),
              today,
              trackedFromYear: data?.trackedFromYear,
            });
          }}
          onClose={() => setBooking(null)}
          onSaved={() => { setBooking(null); load(); }}
        />
      )}

      {editingStart && (
        <StartDateDialog
          employee={editingStart}
          onClose={() => setEditingStart(null)}
          onSaved={() => { setEditingStart(null); load(); }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function EmployeeBalance({
  employee, balance, leaves, onBook, onEdit, onEditStart,
}: {
  employee: LeaveEmployee;
  balance: LeaveBalance;
  leaves: Leave[];
  onBook: () => void;
  onEdit: (leave: Leave) => void;
  onEditStart: () => void;
}) {
  const { t, language } = useLanguage();
  const c = employeeColor(employee.color);
  const today = dateKey(new Date());

  // What can be used this year: this year's days plus what carried over and
  // has not expired. The bar fills with what is booked against it.
  const usable = balance.entitlement + balance.carried - balance.carriedExpired;
  const fill = usable > 0 ? Math.min(100, (balance.booked / usable) * 100) : 0;
  const over = balance.remaining < 0;

  return (
    <li className="px-4 sm:px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex items-center gap-2.5 min-w-[11rem] flex-1">
          <span className="w-1 h-9 rounded-full shrink-0" style={{ background: c.dot }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground truncate">{employee.name}</span>
            {employee.startDate ? (
              <button
                type="button"
                onClick={onEditStart}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('leave.startedOn')} {formatDay(employee.startDate)}
              </button>
            ) : (
              <button
                type="button"
                onClick={onEditStart}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning hover:underline"
              >
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {t('leave.setStartDate')}
              </button>
            )}
          </span>
        </div>

        {/* The four numbers an owner is asked about, in the order they ask. */}
        <dl className="grid grid-cols-4 gap-3 sm:gap-5 text-center">
          <Stat label={t('leave.entitled')} value={balance.entitlement + balance.carried} />
          <Stat label={t('leave.booked')} value={balance.booked} />
          <Stat label={t('leave.taken')} value={balance.taken} />
          <Stat
            label={over ? t('leave.overBooked') : t('leave.remaining')}
            value={Math.abs(balance.remaining)}
            tone={over ? 'text-danger' : 'text-foreground'}
            strong
          />
        </dl>

        <button
          type="button"
          onClick={onBook}
          className="cta-button-secondary !py-2 !px-3 !text-xs self-center"
          aria-label={`${t('leave.book')} — ${employee.name}`}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t('leave.bookShort')}
        </button>
      </div>

      <div
        className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usable}
        aria-valuenow={balance.booked}
        aria-label={`${balance.booked} / ${usable}`}
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${fill}%` }}
        />
      </div>

      {/* The small print that changes the numbers, said where it applies. */}
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        {balance.carried > 0 && (
          <p>
            {t('leave.carriedBefore')} {balance.carried} {t('leave.carriedMiddle')} {balance.year - 1}
            {balance.carriedDeadline && <>, {t('leave.carriedUntil')} {formatDay(balance.carriedDeadline)}</>}
            {balance.carriedExpired > 0 && (
              <span className="text-warning">
                {' '}· {balance.carriedExpired} {t('leave.carriedExpired')}
              </span>
            )}
          </p>
        )}
        {balance.admissionYear && (
          <p>
            {t('leave.admissionYear')}
            {balance.availableFrom && balance.availableFrom > today && (
              <> {t('leave.availableFrom')} {formatDay(balance.availableFrom)}.</>
            )}
          </p>
        )}
        {balance.startDateMissing && <p>{t('leave.assumedFullYear')}</p>}
      </div>

      {leaves.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {leaves.map((l) => {
            const days = leaveWorkingDays(l.start, l.end).length;
            const past = l.end < today;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onEdit(l)}
                className={`rounded-lg border border-border px-2 py-1 text-[11px] tabular-nums transition-colors
                  hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${past ? 'text-muted-foreground' : 'text-foreground'}`}
                title={l.note ?? undefined}
              >
                {formatRange(l.start, l.end, language)}
                <span className="text-muted-foreground"> · {days} {days === 1 ? t('leave.day') : t('leave.days')}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function Stat({
  label, value, tone = 'text-foreground', strong = false,
}: {
  label: string; value: number; tone?: string; strong?: boolean;
}) {
  return (
    <div className="min-w-[3.5rem]">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-lg font-black' : 'text-base font-semibold'} ${tone}`}>{value}</dd>
    </div>
  );
}

/** Booking a holiday, or changing or removing one. */
function LeaveDialog({
  booking, employees, balanceFor, onClose, onSaved,
}: {
  booking: Booking;
  employees: LeaveEmployee[];
  balanceFor: (employeeId: string, range: LeaveRange, excludeId?: string) => LeaveBalance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const editing = booking.mode === 'edit' ? booking.leave : null;
  const [employeeId, setEmployeeId] = useState(
    editing?.employeeId ?? (booking.mode === 'new' ? booking.employeeId : undefined) ?? employees[0]?.id ?? '',
  );
  const presetStart = editing?.start ?? (booking.mode === 'new' ? booking.start : undefined) ?? dateKey(new Date());
  const [start, setStart] = useState(presetStart);
  const [end, setEnd] = useState(editing?.end ?? presetStart);
  const [note, setNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= start;
  const days = valid ? leaveWorkingDays(start, end).length : 0;
  const after = valid && employeeId ? balanceFor(employeeId, { start, end }, editing?.id) : null;
  const tooEarly = after?.availableFrom && start < after.availableFrom;

  const submit = async (replaceShifts: boolean) => {
    if (!valid || !employeeId) return;
    setSaving(true);
    const result = await saveLeave({
      id: editing?.id, employeeId, start, end, note: note.trim() || null, replaceShifts,
    });
    setSaving(false);
    if (result.success) {
      toast.success(t('leave.saved'));
      onSaved();
      return;
    }
    if ('conflict' in result && result.conflict) {
      setConflict(result.shiftCount);
      return;
    }
    toast.error(t(result.error));
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    const result = await removeLeave(editing.id);
    setSaving(false);
    if (result.success) {
      toast.success(t('leave.removed'));
      onSaved();
    } else {
      toast.error(t(result.error));
    }
  };

  // Any change to the dates or the person makes an earlier warning stale.
  const resetWarnings = () => { setConflict(null); setConfirmRemove(false); };

  return (
    <Dialog title={editing ? t('leave.editTitle') : t('leave.newTitle')} onClose={onClose}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('leave.employee')}</span>
        <select
          value={employeeId}
          onChange={(e) => { setEmployeeId(e.target.value); resetWarnings(); }}
          className="input-field !py-2"
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">{t('leave.from')}</span>
          <input
            type="date"
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              setStart(v);
              // Moving the start past the end drags the end along, rather
              // than leaving a backwards range to be fixed by hand.
              if (v && end < v) setEnd(v);
              resetWarnings();
            }}
            className="input-field !py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">{t('leave.to')}</span>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => { setEnd(e.target.value); resetWarnings(); }}
            className="input-field !py-2"
          />
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('leave.note')}</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
          placeholder={t('leave.notePlaceholder')}
          className="input-field !py-2"
        />
      </label>

      {/* What the booking costs, worked out the way the law counts it. */}
      {valid && (
        <div className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground text-sm">{days}</strong>{' '}
            {days === 1 ? t('leave.workingDay') : t('leave.workingDays')}
            {' '}— {t('leave.countRule')}
          </p>
          {after && (
            <p className={after.remaining < 0 ? 'text-danger font-semibold' : ''}>
              {after.remaining < 0
                ? `${t('leave.afterOverBefore')} ${Math.abs(after.remaining)} ${t('leave.afterOverAfter')} ${after.year}.`
                : `${t('leave.afterRemainingBefore')} ${after.remaining} ${t('leave.afterRemainingAfter')} ${after.year}.`}
            </p>
          )}
          {tooEarly && (
            <p className="text-warning">
              {t('leave.tooEarly')} {formatDay(after!.availableFrom!)}.
            </p>
          )}
        </div>
      )}
      {!valid && end < start && (
        <p className="mt-3 text-xs text-danger">{t('leave.endBeforeStart')}</p>
      )}

      {conflict !== null && (
        <div className="mt-3 rounded-xl border border-warning p-3 text-xs text-warning">
          {t('leave.conflictBefore')} {conflict}{' '}
          {conflict === 1 ? t('leave.conflictShift') : t('leave.conflictShifts')} {t('leave.conflictAfter')}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => submit(conflict !== null)}
          disabled={!valid || saving || !employeeId}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          {conflict !== null ? t('leave.saveAndClear') : t('leave.save')}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => (confirmRemove ? remove() : setConfirmRemove(true))}
            disabled={saving}
            className={`cta-button-secondary !py-2.5 !px-3 !text-sm text-danger ${confirmRemove ? '!border-danger' : ''}`}
            aria-label={t('leave.remove')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {confirmRemove && <span>{t('leave.confirmRemove')}</span>}
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** The contract start date, which sets the first year's entitlement. */
function StartDateDialog({
  employee, onClose, onSaved,
}: {
  employee: LeaveEmployee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState(employee.startDate ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    const result = await setEmployeeStartDate(employee.id, next);
    setSaving(false);
    if (result.success) {
      toast.success(t('leave.startDateSaved'));
      onSaved();
    } else {
      toast.error(t(result.error));
    }
  };

  return (
    <Dialog title={employee.name} onClose={onClose}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('leave.startDateLabel')}</span>
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          max={dateKey(new Date(Date.UTC(new Date().getUTCFullYear() + 1, 11, 31)))}
          className="input-field !py-2"
          autoFocus
        />
      </label>
      <p className="mt-2 text-[11px] text-muted-foreground">{t('leave.startDateHint')}</p>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => save(value || null)}
          disabled={saving}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          {t('leave.save')}
        </button>
        {employee.startDate && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm"
          >
            {t('leave.clearStartDate')}
          </button>
        )}
      </div>
    </Dialog>
  );
}
