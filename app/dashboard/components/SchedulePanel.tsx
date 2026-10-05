'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Loader2, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, X, Check,
  CalendarOff, CalendarCheck, CopyPlus, Copy, Download, Users, Eraser,
} from 'lucide-react';
import {
  getScheduleWeeks, addEmployee, updateEmployee, removeEmployee,
  setShift, clearShift, toggleClosure, copyWeekForward, clearWeek,
  saveTemplate, deleteTemplate,
} from '../schedule-actions';
import {
  startOfWeek, addDays, addWeeks, weekDates, dateKey, parseDateKey, isWeekend,
  monthWeekStarts, formatMonthTitle, formatWeekShort,
  formatRange, formatShiftTimes, hasBreak, formatDuration, formatWeekRange, shiftLength,
  parseTime, formatMinutes, weeklyMinutes,
  WEEKDAYS_PT_SHORT, EMPLOYEE_COLORS, employeeColor,
} from '@/lib/schedule';
import { useLanguage } from '@/lib/language-context';

/**
 * The weekly rota.
 *
 * Owner-only, and built around the two things that actually make a schedule
 * get used rather than abandoned for paper: marking a day closed without
 * touching every cell, and repeating a week that already works. A restaurant
 * runs roughly the same pattern every week; if setting that up costs an hour
 * each Monday, the app loses to a photo of a handwritten sheet.
 */

interface Employee {
  id: string;
  name: string;
  role: string | null;
  color: string;
  active: boolean;
}

interface Shift {
  id: string;
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
  note: string | null;
}

interface ShiftTemplate {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
}

interface WeekData {
  weekStart: string;
  employees: Employee[];
  shifts: Shift[];
  closures: Array<{ date: string; reason: string | null }>;
  templates: ShiftTemplate[];
}

/**
 * Starting points, always on offer.
 *
 * Shown alongside saved shifts rather than only until the first one is saved:
 * having them vanish the moment you save a shift of your own reads as though
 * the app deleted them. They are labelled as suggestions and carry no id, so
 * they cannot be edited or removed — applying one just fills the hours.
 */
/**
 * The seven column headings, in the interface language.
 *
 * `WEEKDAYS_PT_SHORT` is the Portuguese fallback; the translated pair lives in
 * the dictionary so an English owner reads Mon–Sun rather than Seg–Dom.
 */
function weekdayShort(t: (key: string) => string, index: number): string {
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const label = t(`schedule.weekday.${keys[index]}`);
  return label.startsWith('schedule.') ? WEEKDAYS_PT_SHORT[index] : label;
}

/**
 * A colour swatch's name, for the screen reader.
 *
 * `EMPLOYEE_COLORS` carries the Portuguese name; the translated pair lives in
 * the dictionary, and the Portuguese one is the fallback if a key is missing.
 */
function colorName(t: (key: string) => string, key: string, fallback: string): string {
  const label = t(`schedule.color.${key}`);
  return label.startsWith('schedule.') ? fallback : label;
}

const DEFAULT_SHIFTS = [
  { labelKey: 'schedule.suggestionMorning', startMin: 9 * 60, endMin: 17 * 60, breakStartMin: null, breakEndMin: null },
  { labelKey: 'schedule.suggestionAfternoon', startMin: 12 * 60, endMin: 20 * 60, breakStartMin: null, breakEndMin: null },
  { labelKey: 'schedule.suggestionEvening', startMin: 17 * 60, endMin: 24 * 60, breakStartMin: null, breakEndMin: null },
  // The split shift a Portuguese restaurant actually runs: lunch service,
  // the afternoon off, then dinner.
  { labelKey: 'schedule.suggestionSplit', startMin: 12 * 60, endMin: 23 * 60, breakStartMin: 15 * 60, breakEndMin: 19 * 60 },
];

type ScheduleView = 'week' | 'month';

/**
 * Remembered per browser, not per account: it is a question of screen, and
 * the phone never offers the month anyway.
 */
const VIEW_STORAGE_KEY = 'schedule-view';

/** True from `md` up, where a month of grids has room. Null until measured. */
function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

export default function SchedulePanel() {
  const { t, language } = useLanguage();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<ScheduleView>('month');
  const [weekStart, setWeekStart] = useState(() => dateKey(startOfWeek(new Date())));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingCell, setEditingCell] = useState<{ employeeId: string; date: string } | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Employee | null>(null);
  // Which week each action is working on. The month view puts several weeks
  // on screen, so "copying" has to say which one is spinning.
  const [repeatFrom, setRepeatFrom] = useState<string | null>(null);
  const [copyingWeek, setCopyingWeek] = useState<string | null>(null);
  const [downloadingWeek, setDownloadingWeek] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'week' || saved === 'month') setView(saved);
    } catch {
      // Storage blocked: the default view stands.
    }
  }, []);

  // The phone always gets the week. Seven columns already need a day-at-a-time
  // layout there; five weeks of them would be unusable.
  const activeView: ScheduleView | null = isDesktop === null ? null : isDesktop ? view : 'week';

  const weekStarts = useMemo(
    () => (activeView === 'month' ? monthWeekStarts(month.year, month.month) : [weekStart]),
    [activeView, month.year, month.month, weekStart],
  );
  const firstWeek = weekStarts[0];
  const weekCount = weekStarts.length;

  // "7 – 13 de setembro 2026". Named in the confirmations so the owner can see
  // which week actually went to the clipboard before pasting it to the team.
  const weekLabelOf = (wk: string) => formatWeekRange(parseDateKey(wk), language);

  const requestId = useRef(0);
  const load = useCallback(() => {
    if (!activeView) return;
    const id = ++requestId.current;
    setLoading(true);
    getScheduleWeeks(firstWeek, weekCount).then((r) => {
      // Stepping through months quickly can bring answers back out of order;
      // only the latest one may reach the screen.
      if (id !== requestId.current) return;
      if (r.success) setData(r.data as WeekData);
      else toast.error(t(r.error));
      setLoading(false);
    });
  }, [activeView, firstWeek, weekCount, t]);

  useEffect(() => { load(); }, [load]);

  const shifts = useMemo(() => data?.shifts ?? [], [data]);
  const byCell = useMemo(
    () => new Map(shifts.map((s) => [`${s.employeeId}|${s.date}`, s])),
    [shifts],
  );
  const shiftAt = (employeeId: string, date: string) => byCell.get(`${employeeId}|${date}`) ?? null;
  const closedSet = new Map((data?.closures ?? []).map((c) => [c.date, c.reason]));

  /** One week's shifts, for its totals and for whether it has anything to send. */
  const shiftsOfWeek = (wk: string) => {
    const keys = new Set(weekDates(parseDateKey(wk)).map(dateKey));
    return shifts.filter((s) => keys.has(s.date));
  };

  // Saved shifts first, then the suggestions that are not already covered.
  // Previously the suggestions were replaced by the saved list, so saving the
  // first shift of your own made Manhã/Tarde/Noite disappear — which looks
  // exactly like the app having deleted them.
  const savedShifts = data?.templates ?? [];
  const suggestions = DEFAULT_SHIFTS.filter(
    (d) => !savedShifts.some((t) => t.startMin === d.startMin && t.endMin === d.endMin)
  );

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, okMsg?: string) => {
    setBusy(true);
    const result = await fn();
    if (result.success) {
      if (okMsg) toast.success(okMsg);
      load();
    } else {
      toast.error(result.error || t('schedule.saveFailed'));
    }
    setBusy(false);
    return result;
  };

  /**
   * Switches between one week and the whole month, keeping the owner where
   * they were: the month opened is the one the week sits in, and the week
   * opened is this one if the month holds it, otherwise the month's first.
   */
  const chooseView = (next: ScheduleView) => {
    if (next === view) return;
    if (next === 'month') {
      // A week straddling two months belongs to the one holding its Thursday.
      const thursday = addDays(parseDateKey(weekStart), 3);
      setMonth({ year: thursday.getUTCFullYear(), month: thursday.getUTCMonth() });
    } else {
      const thisWeek = dateKey(startOfWeek(new Date()));
      const weeks = monthWeekStarts(month.year, month.month);
      setWeekStart(
        weeks.includes(thisWeek)
          ? thisWeek
          : weeks.find((w) => parseDateKey(w).getUTCMonth() === month.month) ?? weeks[0],
      );
    }
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  };

  const stepMonth = (delta: number) =>
    setMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const toggleDay = (key: string, closed: boolean, promptKey: string) => {
    const reason = closed ? undefined : prompt(t(promptKey)) ?? undefined;
    run(() => toggleClosure(key, reason), closed ? t('schedule.dayReopened') : t('schedule.dayClosed'));
  };

  const clearOneWeek = (wk: string) => {
    if (!confirm(`${t('schedule.confirmClearWeek')}\n${weekLabelOf(wk)}`)) return;
    run(() => clearWeek(wk), t('schedule.weekCleared'));
  };

  /**
   * Saves the week's image, or hands it to the phone's share sheet.
   *
   * Navigating to the URL would take iOS Safari off the page and leave the
   * owner on a bare "horario.jpg" screen with no way back to the schedule, so
   * the page never moves any more.
   *
   * On a phone the file goes to the native share sheet, which puts WhatsApp
   * one tap away — the thing the owner is actually trying to do. That also
   * steps around iOS, where a `download` link pointed at a blob has never been
   * dependable. Elsewhere, and if sharing a file is refused, it falls back to
   * the ordinary download link.
   */
  const downloadImage = async (wk: string) => {
    setDownloadingWeek(wk);
    const label = weekLabelOf(wk);
    try {
      const res = await fetch(`/api/export/schedule?week=${wk}`);
      if (!res.ok) throw new Error('fetch failed');

      const blob = await res.blob();
      const filename = `horario-${wk}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${t('schedule.shareTitle')} ${label}` });
          return;
        } catch (err) {
          // Dismissing the share sheet is a choice, not a failure: say nothing
          // and leave the owner where they were.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          // Anything else falls through to the download below.
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Freed later, not at once: revoking immediately can cancel the download
      // before the browser has finished reading the blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      toast.success(`${t('schedule.downloadedPrefix')} ${label}`);
    } catch {
      toast.error(t('schedule.downloadFailed'));
    } finally {
      setDownloadingWeek(null);
    }
  };

  /**
   * Puts the week's image on the clipboard, ready to paste straight into a
   * WhatsApp conversation.
   *
   * The blob is handed to `ClipboardItem` as a promise rather than awaited
   * first: Safari treats an `await` before `clipboard.write` as leaving the
   * click that started it, and rejects the write. Passing the promise keeps
   * the call inside the gesture. PNG because that is the one image type the
   * clipboard accepts across browsers — the download stays JPEG.
   */
  const copyImage = async (wk: string) => {
    const url = `/api/export/schedule?week=${wk}&format=png`;

    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      toast.error(t('schedule.copyUnsupported'));
      return;
    }

    setCopyingWeek(wk);
    try {
      const blob = fetch(url).then(async (res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.blob();
      });

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast.success(`${t('schedule.copiedPrefix')} ${weekLabelOf(wk)}. ${t('schedule.copiedHint')}`);
    } catch {
      toast.error(t('schedule.copyFailed'));
    } finally {
      setCopyingWeek(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('schedule.loading')}
      </div>
    );
  }

  const employees = data?.employees ?? [];
  const isMonth = activeView === 'month';
  const thisWeekKey = dateKey(startOfWeek(new Date()));
  const now = new Date();
  const onThisPeriod = isMonth
    ? now.getUTCFullYear() === month.year && now.getUTCMonth() === month.month
    : thisWeekKey === weekStart;

  const weekActions = (wk: string) => (
    <WeekActions
      hasShifts={shiftsOfWeek(wk).length > 0}
      busy={busy}
      copying={copyingWeek === wk}
      downloading={downloadingWeek === wk}
      compact={isMonth}
      onRepeat={() => setRepeatFrom(wk)}
      onCopy={() => copyImage(wk)}
      onDownload={() => downloadImage(wk)}
      onClear={() => clearOneWeek(wk)}
    />
  );

  const weekGrid = (wk: string) => {
    const days = weekDates(parseDateKey(wk));
    return (
      <WeekGrid
        days={days}
        employees={employees}
        closedSet={closedSet}
        shiftAt={shiftAt}
        totals={weeklyMinutes(shiftsOfWeek(wk))}
        busy={busy}
        // In the month view, the days of the neighbouring months that complete
        // the first and last weeks are drawn quieter: there to be read, not
        // the subject of this page.
        isOutside={isMonth ? (d) => d.getUTCMonth() !== month.month : undefined}
        onToggleClosure={(key, closed) => toggleDay(key, closed, 'schedule.closureReasonPrompt')}
        onEditCell={(employeeId, date) => setEditingCell({ employeeId, date })}
        onEditPerson={setEditingPerson}
      />
    );
  };

  const navButton =
    'w-11 h-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground ' +
    'hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-4">
      {/* ── Navigation, the view switch, and in the week view its actions ─ */}
      <div className="card-glass p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                isMonth ? stepMonth(-1) : setWeekStart(dateKey(addWeeks(parseDateKey(weekStart), -1)))
              }
              className={navButton}
              aria-label={isMonth ? t('schedule.monthPrevious') : t('schedule.weekPrevious')}
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                isMonth ? stepMonth(1) : setWeekStart(dateKey(addWeeks(parseDateKey(weekStart), 1)))
              }
              className={navButton}
              aria-label={isMonth ? t('schedule.monthNext') : t('schedule.weekNext')}
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground truncate">
              {isMonth ? formatMonthTitle(month.year, month.month, language) : weekLabelOf(weekStart)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {employees.length === 0
                ? t('schedule.hintAddPeople')
                : isMonth
                  ? t('schedule.hintMonth')
                  : t('schedule.hintTapCell')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!onThisPeriod && (
              <button
                type="button"
                onClick={() => {
                  if (isMonth) setMonth({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
                  else setWeekStart(thisWeekKey);
                }}
                className="text-xs font-semibold text-primary-ink hover:underline px-2 py-1"
              >
                {isMonth ? t('schedule.thisMonth') : t('schedule.thisWeek')}
              </button>
            )}

            {/* Desktop only: the phone keeps the week, where it fits. */}
            <div
              role="group"
              aria-label={t('schedule.viewLabel')}
              className="hidden md:inline-flex rounded-xl border border-border bg-muted p-0.5"
            >
              {(['week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => chooseView(v)}
                  aria-pressed={view === v}
                  className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${view === v
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {v === 'week' ? t('schedule.viewWeek') : t('schedule.viewMonth')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!isMonth && <div className="mt-4">{weekActions(weekStart)}</div>}
      </div>

      {employees.length === 0 ? (
        <EmptyState onAdd={() => setShowAddPerson(true)} />
      ) : isMonth ? (
        /* ── Month: the weeks stacked, each sendable on its own ──────────
           The team is sent one week at a time, so each week keeps its own
           copy and download rather than the month going out as one image. */
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {weekStarts.map((wk, i) => (
            <section key={wk} className="card-glass p-4 sm:p-5" aria-label={`${t('schedule.weekNumber')} ${i + 1}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h4 className="flex items-baseline gap-2 min-w-0">
                  <span className="font-bold text-foreground">
                    {t('schedule.weekNumber')} {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatWeekShort(parseDateKey(wk))}
                  </span>
                  {wk === thisWeekKey && (
                    <span className="self-center rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-semibold text-primary-ink">
                      {t('schedule.thisWeek')}
                    </span>
                  )}
                </h4>
                {weekActions(wk)}
              </div>
              {weekGrid(wk)}
            </section>
          ))}

          <button
            type="button"
            onClick={() => setShowAddPerson(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline px-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('schedule.addPerson')}
          </button>
        </div>
      ) : (
        <>
          {/* ── Desktop week ──────────────────────────────────────────────
              Seven columns of times is exactly what a rota is; on a laptop
              there is room for it and nothing is gained by hiding it. */}
          <div className={`card-glass p-4 sm:p-5 hidden md:block transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {weekGrid(weekStart)}

            <button
              type="button"
              onClick={() => setShowAddPerson(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('schedule.addPerson')}
            </button>
          </div>

          {/* ── Phone: a day at a time ────────────────────────────────────
              Seven columns of times do not fit a phone, and the answer that
              works for the annual statement works here: show one day whole
              rather than all seven cropped. */}
          <MobileSchedule
            days={weekDates(parseDateKey(weekStart))}
            employees={employees}
            closedSet={closedSet}
            shiftAt={shiftAt}
            totals={weeklyMinutes(shiftsOfWeek(weekStart))}
            busy={busy}
            onToggleClosure={(key, closed) => toggleDay(key, closed, 'schedule.closureReasonShortPrompt')}
            onEditCell={(employeeId, date) => setEditingCell({ employeeId, date })}
            onAddPerson={() => setShowAddPerson(true)}
          />
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      {editingCell && (
        <ShiftDialog
          employee={employees.find((e) => e.id === editingCell.employeeId)!}
          date={editingCell.date}
          shift={shiftAt(editingCell.employeeId, editingCell.date)}
          savedTemplates={savedShifts}
          suggestions={suggestions}
          onTemplatesChanged={load}
          onClose={() => setEditingCell(null)}
          onSave={async (startMin, endMin, breakStartMin, breakEndMin, note) => {
            await run(
              () => setShift({
                employeeId: editingCell.employeeId,
                date: editingCell.date,
                startMin, endMin, breakStartMin, breakEndMin, note,
              }),
              t('schedule.shiftSaved')
            );
            setEditingCell(null);
          }}
          onClear={async () => {
            await run(() => clearShift(editingCell.employeeId, editingCell.date), t('schedule.shiftRemoved'));
            setEditingCell(null);
          }}
        />
      )}

      {(showAddPerson || editingPerson) && (
        <PersonDialog
          employee={editingPerson}
          onClose={() => { setShowAddPerson(false); setEditingPerson(null); }}
          onSave={async (name, role, color) => {
            if (editingPerson) {
              await run(() => updateEmployee(editingPerson.id, { name, role, color }), t('schedule.personUpdated'));
            } else {
              await run(() => addEmployee({ name, role, color }), t('schedule.personAdded'));
            }
            setShowAddPerson(false);
            setEditingPerson(null);
          }}
          onRemove={
            editingPerson
              ? async () => {
                  if (!confirm(`${t('schedule.confirmRemovePersonPrefix')} ${editingPerson.name}? ${t('schedule.confirmRemovePersonSuffix')}`)) return;
                  await run(() => removeEmployee(editingPerson.id), t('schedule.personRemoved'));
                  setEditingPerson(null);
                }
              : undefined
          }
        />
      )}

      {repeatFrom && (
        <CopyWeeksDialog
          weekLabel={weekLabelOf(repeatFrom)}
          onClose={() => setRepeatFrom(null)}
          onCopy={async (weeks, overwrite) => {
            const result = await copyWeekForward({ fromWeekStart: repeatFrom, weeks, overwrite });
            if (result.success) {
              toast.success(`${t('schedule.weekRepeated')} ${weeks}×`);
              setRepeatFrom(null);
              load();
              return { ok: true as const };
            }
            if ('conflict' in result && result.conflict) return { ok: false as const, conflict: true };
            toast.error(result.error || t('schedule.repeatFailed'));
            return { ok: false as const };
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * A week's own buttons: repeat it, send it, clear it.
 *
 * Shared by the week view and every week of the month view, so copying in the
 * month sends exactly one week — the one whose buttons were pressed.
 */
function WeekActions({
  hasShifts, busy, copying, downloading, compact,
  onRepeat, onCopy, onDownload, onClear,
}: {
  hasShifts: boolean;
  busy: boolean;
  copying: boolean;
  downloading: boolean;
  /** In the month view, "Repetir" rather than "Repetir esta semana". */
  compact: boolean;
  onRepeat: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onClear: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onRepeat}
        disabled={busy || !hasShifts}
        className="cta-button-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
      >
        <CopyPlus className="w-4 h-4" aria-hidden="true" />
        {compact ? t('schedule.repeat') : t('schedule.repeatWeek')}
      </button>

      <button
        type="button"
        onClick={onCopy}
        disabled={busy || copying || !hasShifts}
        className="cta-button !py-2 !px-3 !text-xs disabled:opacity-40"
      >
        {copying
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <Copy className="w-4 h-4" aria-hidden="true" />}
        {t('schedule.copyImage')}
      </button>

      <button
        type="button"
        onClick={onDownload}
        disabled={busy || downloading || !hasShifts}
        className="cta-button-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
      >
        {downloading
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <Download className="w-4 h-4" aria-hidden="true" />}
        {t('schedule.download')}
      </button>

      {hasShifts && (
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="cta-button-secondary !py-2 !px-3 !text-xs text-danger disabled:opacity-40"
        >
          <Eraser className="w-4 h-4" aria-hidden="true" />
          {t('schedule.clear')}
        </button>
      )}
    </div>
  );
}

/** One week as a table: a row per person, a column per day, the total last. */
function WeekGrid({
  days, employees, closedSet, shiftAt, totals, busy, isOutside,
  onToggleClosure, onEditCell, onEditPerson,
}: {
  days: Date[];
  employees: Employee[];
  closedSet: Map<string, string | null>;
  shiftAt: (employeeId: string, date: string) => Shift | null;
  totals: Map<string, number>;
  busy: boolean;
  /** Days belonging to a neighbouring month, drawn quieter in the month view. */
  isOutside?: (day: Date) => boolean;
  onToggleClosure: (dateKey: string, closed: boolean) => void;
  onEditCell: (employeeId: string, date: string) => void;
  onEditPerson: (employee: Employee) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground w-[180px]">
              {t('schedule.person')}
            </th>
            {days.map((day, i) => {
              const key = dateKey(day);
              const closed = closedSet.has(key);
              const weekend = isWeekend(day);
              const outside = isOutside?.(day) ?? false;
              return (
                <th
                  key={key}
                  className={`px-1 py-2 min-w-[110px] ${weekend && !closed ? 'bg-weekend rounded-t-sm' : ''}`}
                >
                  <div className={`flex flex-col items-center gap-1 ${outside ? 'opacity-50' : ''}`}>
                    <span
                      className={`text-xs font-semibold ${
                        closed ? 'text-muted-foreground' : weekend ? 'text-weekend-foreground' : 'text-foreground'
                      }`}
                    >
                      {weekdayShort(t, i)}
                    </span>
                    <span className={`text-[11px] ${weekend && !closed ? 'text-weekend-foreground' : 'text-muted-foreground'}`}>
                      {day.getUTCDate()}/{day.getUTCMonth() + 1}
                    </span>
                    {/* Closing a day is one tap on its header, which
                        is the whole point: no walking every cell. */}
                    <button
                      type="button"
                      onClick={() => onToggleClosure(key, closed)}
                      disabled={busy}
                      className={`mt-0.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md transition-colors
                        ${closed
                          ? 'bg-warning/15 text-warning hover:bg-warning/25'
                          : 'text-muted-foreground hover:bg-muted'}`}
                      title={closed ? t('schedule.reopenDayTitle') : t('schedule.closeDayTitle')}
                    >
                      {closed ? (
                        <><CalendarCheck className="w-3 h-3" aria-hidden="true" /> {t('schedule.closedShort')}</>
                      ) : (
                        <><CalendarOff className="w-3 h-3" aria-hidden="true" /> {t('schedule.closeShort')}</>
                      )}
                    </button>
                  </div>
                </th>
              );
            })}
            <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground w-[70px]">
              {t('schedule.weekTotal')}
            </th>
          </tr>
        </thead>

        <tbody>
          {employees.map((emp, row) => {
            const color = employeeColor(emp.color);
            const lastRow = row === employees.length - 1;
            return (
              <tr key={emp.id} className="border-t border-border-subtle">
                <th scope="row" className="text-left px-2 py-2 font-normal">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-1 h-7 rounded-full shrink-0"
                      style={{ background: color.dot }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground truncate">
                        {emp.name}
                      </span>
                      {emp.role && (
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {emp.role}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditPerson(emp)}
                      className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                      aria-label={`${t('schedule.editPerson')} ${emp.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </th>

                {days.map((day) => {
                  const key = dateKey(day);
                  const closed = closedSet.has(key);
                  const weekend = isWeekend(day);
                  const outside = isOutside?.(day) ?? false;
                  const shift = shiftAt(emp.id, key);
                  // The weekend band runs the full height of its column, so
                  // the last row rounds off where the header began.
                  const tint = closed ? 'bg-muted' : weekend ? `bg-weekend ${lastRow ? 'rounded-b-sm' : ''}` : '';
                  return (
                    <td key={key} className={`px-1 py-1.5 ${tint}`}>
                      <div className={outside ? 'opacity-55 hover:opacity-100 focus-within:opacity-100 transition-opacity' : ''}>
                        <ShiftCell
                          closed={closed}
                          shift={shift}
                          color={color}
                          onClick={() => onEditCell(emp.id, key)}
                        />
                      </div>
                    </td>
                  );
                })}

                <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {totals.get(emp.id) ? formatDuration(totals.get(emp.id)!) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShiftCell({
  closed, shift, color, onClick,
}: {
  closed: boolean;
  shift: Shift | null;
  color: ReturnType<typeof employeeColor>;
  onClick: () => void;
}) {
  const { t } = useLanguage();

  // Named, not blank. An empty cell reads as "not scheduled yet"; the point
  // of closing a day is that it is settled. Outlined rather than filled:
  // every employee colour is a filled tint, so shape — not hue — is what
  // keeps a closure from reading as somebody's shift.
  if (closed) {
    return (
      <div className="h-11 rounded-lg flex items-center justify-center border border-dashed border-border
                      text-[11px] font-semibold text-muted-foreground">
        {t('schedule.dayOff')}
      </div>
    );
  }

  if (!shift) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full h-11 rounded-lg border border-dashed border-border text-muted-foreground/50
                   hover:border-primary hover:text-primary transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('schedule.setShift')}
      >
        <Plus className="w-3.5 h-3.5 mx-auto" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[44px] rounded-lg px-1 py-1.5 text-center transition-opacity hover:opacity-80
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: color.bg, color: color.ink }}
    >
      {/* A split shift is stacked, not squeezed onto one line: the column is
          too narrow for both blocks side by side at a legible size. */}
      {hasBreak(shift.startMin, shift.endMin, shift.breakStartMin, shift.breakEndMin) ? (
        <>
          <span className="block text-[11px] font-semibold tabular-nums leading-tight">
            {formatRange(shift.startMin, shift.breakStartMin!)}
          </span>
          <span className="block text-[11px] font-semibold tabular-nums leading-tight">
            {formatRange(shift.breakEndMin!, shift.endMin)}
          </span>
        </>
      ) : (
        <span className="block text-xs font-semibold tabular-nums">
          {formatRange(shift.startMin, shift.endMin)}
        </span>
      )}
      {shift.note && <span className="block text-[10px] truncate">{shift.note}</span>}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="card-glass p-8 text-center">
      <Users className="w-8 h-8 mx-auto text-muted-foreground/40" aria-hidden="true" />
      <h4 className="mt-3 font-semibold text-foreground">{t('schedule.emptyTitle')}</h4>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
        {t('schedule.emptyBody')}
      </p>
      <button type="button" onClick={onAdd} className="cta-button mt-5 !py-2 !px-4 !text-sm mx-auto">
        <Plus className="w-4 h-4" aria-hidden="true" />
        {t('schedule.addPerson')}
      </button>
    </div>
  );
}

/** The phone view: one day at a time, every person on it. */
function MobileSchedule({
  days, employees, closedSet, shiftAt, totals, busy,
  onToggleClosure, onEditCell, onAddPerson,
}: {
  days: Date[];
  employees: Employee[];
  closedSet: Map<string, string | null>;
  shiftAt: (employeeId: string, date: string) => Shift | null;
  totals: Map<string, number>;
  busy: boolean;
  onToggleClosure: (dateKey: string, closed: boolean) => void;
  onEditCell: (employeeId: string, date: string) => void;
  onAddPerson: () => void;
}) {
  const { t } = useLanguage();
  const todayKey = dateKey(new Date());
  const initial = Math.max(0, days.findIndex((d) => dateKey(d) === todayKey));
  const [dayIndex, setDayIndex] = useState(initial);

  const day = days[Math.min(dayIndex, days.length - 1)];
  const key = dateKey(day);
  const closed = closedSet.has(key);

  return (
    <div className="card-glass p-4 md:hidden">
      {/* The seven days as a strip: tapping one is faster than stepping. */}
      <div className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
        {days.map((d, i) => {
          const k = dateKey(d);
          const isClosed = closedSet.has(k);
          const selected = i === dayIndex;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setDayIndex(i)}
              className={`shrink-0 w-[52px] py-2 rounded-xl text-center transition-colors
                ${selected
                  ? 'bg-primary text-primary-foreground'
                  : isClosed
                    ? 'bg-muted text-muted-foreground'
                    : isWeekend(d)
                      ? 'bg-weekend text-weekend-foreground'
                      : 'bg-muted/50 text-foreground'}`}
              aria-pressed={selected}
            >
              <span className="block text-[11px] font-semibold">{weekdayShort(t, i)}</span>
              <span className="block text-sm font-bold tabular-nums">{d.getUTCDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {closed
            ? `${t('schedule.closedShort')}${closedSet.get(key) ? ` — ${closedSet.get(key)}` : ''}`
            : t('schedule.shiftsToday')}
        </span>
        <button
          type="button"
          onClick={() => onToggleClosure(key, closed)}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors
            ${closed ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}
        >
          {closed ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarOff className="w-3.5 h-3.5" />}
          {closed ? t('schedule.reopen') : t('schedule.closeDay')}
        </button>
      </div>

      {closed ? (
        <p className="mt-4 rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {t('schedule.closedThisDay')}
        </p>
      ) : (
        <div className="mt-2 -mx-4 divide-y divide-border-subtle border-t border-border-subtle">
          {employees.map((emp) => {
            const shift = shiftAt(emp.id, key);
            const color = employeeColor(emp.color);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => onEditCell(emp.id, key)}
                className="w-full min-h-[56px] px-4 py-3 flex items-center gap-3 text-left
                           active:bg-muted transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="w-1 h-8 rounded-full shrink-0" style={{ background: color.dot }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground truncate">{emp.name}</span>
                  {emp.role && <span className="block text-xs text-muted-foreground truncate">{emp.role}</span>}
                </span>
                {shift ? (
                  <span
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums"
                    style={{ background: color.bg, color: color.ink }}
                  >
                    {formatShiftTimes(
                      shift.startMin, shift.endMin, shift.breakStartMin, shift.breakEndMin,
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground/60 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t('schedule.set')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onAddPerson}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          {t('schedule.addPerson')}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {employees.filter((e) => totals.get(e.id)).length} {t('schedule.workingThisWeek')}
        </span>
      </div>
    </div>
  );
}

function ShiftDialog({
  employee, date, shift, savedTemplates, suggestions, onClose, onSave, onClear, onTemplatesChanged,
}: {
  employee: Employee;
  date: string;
  shift: Shift | null;
  /** The restaurant's own, which are the only ones that can be deleted. */
  savedTemplates: ShiftTemplate[];
  /**
   * Starting points. No id, so they cannot be edited or removed, and named by
   * a dictionary key rather than a literal so they read in both languages.
   */
  suggestions: Array<Omit<ShiftTemplate, 'id' | 'label'> & { labelKey: string }>;
  onClose: () => void;
  onSave: (
    startMin: number,
    endMin: number,
    breakStartMin: number | null,
    breakEndMin: number | null,
    note: string | null,
  ) => void;
  onClear: () => void;
  onTemplatesChanged: () => void;
}) {
  const { t, language } = useLanguage();

  // A split shift is entered as the two stretches actually worked, not as a
  // long shift with a hole described separately. The owner thinks "almoço and
  // jantar", not "12:00 to 23:00 minus the afternoon"; asking for the gap made
  // them work the times out backwards. Stored as a break either way, so the
  // grid keeps one cell per day and the weekly total stays a single sum.
  const [start, setStart] = useState(formatMinutes(shift?.startMin ?? 9 * 60));
  const [end, setEnd] = useState(
    formatMinutes(shift?.breakStartMin ?? shift?.endMin ?? 17 * 60),
  );

  const [split, setSplit] = useState(shift?.breakStartMin != null);
  // The second stretch: from the end of the break to the end of the shift.
  const [secondStart, setSecondStart] = useState(formatMinutes(shift?.breakEndMin ?? 19 * 60));
  const [secondEnd, setSecondEnd] = useState(
    formatMinutes(shift?.breakStartMin != null ? shift.endMin : 23 * 60),
  );

  const [note, setNote] = useState(shift?.note ?? '');
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const firstStartMin = parseTime(start);
  const firstEndMin = parseTime(end);
  const secondStartMin = split ? parseTime(secondStart) : null;
  const secondEndMin = split ? parseTime(secondEnd) : null;

  // What gets stored: the shift runs from the start of the first stretch to
  // the end of the last, and the gap between them becomes the break.
  const startMin = firstStartMin;
  const endMin = split ? secondEndMin : firstEndMin;
  const breakStartMin = split ? firstEndMin : null;
  const breakEndMin = split ? secondStartMin : null;

  const valid = startMin !== null && endMin !== null;

  // The two stretches have to be in order and not overlap. A broken pair is
  // reported below rather than silently ignored, because ignoring it would pay
  // someone for an afternoon they are off.
  const breakUsable =
    valid && split && breakStartMin !== null && breakEndMin !== null &&
    hasBreak(startMin!, endMin!, breakStartMin, breakEndMin);

  const breakBroken = split && !breakUsable;

  const length = valid
    ? shiftLength(startMin!, endMin!, breakUsable ? breakStartMin : null, breakUsable ? breakEndMin : null)
    : 0;

  /** The hours a saved shift or a suggestion carries — the label plays no part. */
  type ShiftHours = Omit<ShiftTemplate, 'id' | 'label'>;

  /** Applies a saved shift or a suggestion, break included. */
  const applyTemplate = (tpl: ShiftHours) => {
    setStart(formatMinutes(tpl.startMin));
    if (tpl.breakStartMin != null && tpl.breakEndMin != null) {
      // The stored break is the gap, so it bounds the two worked stretches.
      setSplit(true);
      setEnd(formatMinutes(tpl.breakStartMin));
      setSecondStart(formatMinutes(tpl.breakEndMin));
      setSecondEnd(formatMinutes(tpl.endMin));
    } else {
      setSplit(false);
      setEnd(formatMinutes(tpl.endMin));
    }
  };

  /** Whether a template's hours, break included, match what is in the fields. */
  const matches = (tpl: ShiftHours) =>
    startMin === tpl.startMin &&
    endMin === tpl.endMin &&
    (breakUsable ? breakStartMin : null) === tpl.breakStartMin &&
    (breakUsable ? breakEndMin : null) === tpl.breakEndMin;

  /** True while the fields hold hours no saved shift already covers. */
  const isNewCombination = valid && !breakBroken && !savedTemplates.some(matches);

  const handleSaveTemplate = async () => {
    if (!valid || breakBroken || !newLabel.trim()) return;
    setSavingTemplate(true);
    const result = await saveTemplate({
      label: newLabel.trim(),
      startMin: startMin!,
      endMin: endMin!,
      breakStartMin: breakUsable ? breakStartMin : null,
      breakEndMin: breakUsable ? breakEndMin : null,
    });
    if (result.success) {
      toast.success(t('schedule.templateSaved'));
      setNewLabel('');
      onTemplatesChanged();
    } else {
      toast.error(result.error || t('schedule.saveFailed'));
    }
    setSavingTemplate(false);
  };

  return (
    <Dialog onClose={onClose} title={employee.name}>
      <p className="text-xs text-muted-foreground -mt-2 mb-4">
        {formatWeekRange(parseDateKey(date), language).split('–')[0].trim()} ·{' '}
        {parseDateKey(date).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
          weekday: 'long', timeZone: 'UTC',
        })}
      </p>

      {/* The saved shifts, as one tap. The free fields below stay for the
          days that do not follow the pattern. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {savedTemplates.map((tpl) => (
          <span key={tpl.id} className="relative inline-flex">
            <button
              type="button"
              onClick={() => applyTemplate(tpl)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors
                ${matches(tpl)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-primary hover:text-primary-foreground'}`}
              aria-pressed={matches(tpl)}
            >
              {tpl.label}
              <span className="block text-[10px] font-normal opacity-70">
                {formatShiftTimes(tpl.startMin, tpl.endMin, tpl.breakStartMin, tpl.breakEndMin)}
              </span>
            </button>

            {managing && (
              <button
                type="button"
                onClick={async () => {
                  const result = await deleteTemplate(tpl.id);
                  if (result.success) { toast.success(t('schedule.shiftRemoved')); onTemplatesChanged(); }
                  else toast.error(result.error || t('schedule.removeFailed'));
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white
                           flex items-center justify-center shadow-sm"
                aria-label={`${t('schedule.removeShift')} ${tpl.label}`}
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}

        {savedTemplates.length > 0 && (
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground px-1"
          >
            {managing ? t('schedule.done') : t('schedule.manage')}
          </button>
        )}
      </div>

      {/* Suggestions, kept on offer rather than replaced by the saved list.
          Visibly lighter than the saved shifts above, so it is clear which
          ones belong to the restaurant and which are just starting points. */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('schedule.suggestions')}
          </span>
          {suggestions.map((tpl) => (
            <button
              key={tpl.labelKey}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border border-dashed transition-colors
                ${matches(tpl)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary'}`}
              aria-pressed={matches(tpl)}
            >
              {t(tpl.labelKey)}
              <span className="block text-[10px] font-normal opacity-70">
                {formatShiftTimes(tpl.startMin, tpl.endMin, tpl.breakStartMin, tpl.breakEndMin)}
              </span>
            </button>
          ))}
        </div>
      )}

      {savedTemplates.length === 0 && (
        <p className="text-[11px] text-muted-foreground mb-4">
          {t('schedule.noTemplatesHint')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {split && (
          <p className="col-span-2 text-[11px] text-muted-foreground -mb-1">
            {t('schedule.firstStretch')}
          </p>
        )}
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.startTime')}</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input-field !py-2" />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.endTime')}</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input-field !py-2" />
        </label>
      </div>

      {/* The split shift, entered as the second stretch actually worked. The
          gap between the two is what gets stored as the break. */}
      <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => setSplit(e.target.checked)}
          className="w-4 h-4 rounded accent-[hsl(var(--primary))]"
        />
        <span className="text-xs font-medium text-foreground">
          {t('schedule.splitShift')}
          <span className="text-muted-foreground font-normal"> — {t('schedule.splitShiftHint')}</span>
        </span>
      </label>

      {split && (
        <div className="grid grid-cols-2 gap-3 mt-2 rounded-xl bg-muted/60 p-3">
          <p className="col-span-2 text-[11px] text-muted-foreground -mb-1">
            {t('schedule.secondStretch')}
          </p>
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.startTime')}</span>
            <input
              type="time"
              value={secondStart}
              onChange={(e) => setSecondStart(e.target.value)}
              className="input-field !py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.endTime')}</span>
            <input
              type="time"
              value={secondEnd}
              onChange={(e) => setSecondEnd(e.target.value)}
              className="input-field !py-2"
            />
          </label>

          {breakBroken && (
            <p className="col-span-2 text-[11px] text-danger">
              {t('schedule.splitOrderError')}
            </p>
          )}
        </div>
      )}

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.noteLabel')}</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={40}
          placeholder={t('schedule.notePlaceholder')}
          className="input-field !py-2"
        />
      </label>

      {valid && !breakBroken && (
        <p className="mt-3 text-xs text-muted-foreground">
          {breakUsable && (
            <>
              {t('schedule.hoursLabel')}:{' '}
              <strong className="text-foreground">
                {formatShiftTimes(startMin!, endMin!, breakStartMin, breakEndMin)}
              </strong>
              {' · '}
            </>
          )}
          {t('schedule.durationLabel')}: <strong className="text-foreground">{formatDuration(length)}</strong>
          {breakUsable && ` (${t('schedule.breakExcluded')})`}
          {endMin! <= startMin! && ` · ${t('schedule.endsNextDay')}`}
        </p>
      )}

      {/* Offered only for hours no saved template already covers: a restaurant
          that keeps typing 09:00–17:00 should be asked to name it once, and
          never asked again afterwards. */}
      {isNewCombination && savedTemplates.length < 12 && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3">
          <label className="block">
            <span className="text-[11px] text-muted-foreground block mb-1.5">
              {t('schedule.saveTemplatePrefix')}{' '}
              {formatShiftTimes(startMin!, endMin!, breakUsable ? breakStartMin : null, breakUsable ? breakEndMin : null)}{' '}
              {t('schedule.saveTemplateSuffix')}
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={20}
                placeholder={t('schedule.templateNamePlaceholder')}
                className="input-field !py-1.5 !text-sm flex-1"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={!newLabel.trim() || savingTemplate}
                className="cta-button-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40 shrink-0"
              >
                {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {t('schedule.save')}
              </button>
            </div>
          </label>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() =>
            valid && !breakBroken &&
            onSave(
              startMin!, endMin!,
              breakUsable ? breakStartMin : null,
              breakUsable ? breakEndMin : null,
              note.trim() || null,
            )
          }
          disabled={!valid || breakBroken}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {t('schedule.save')}
        </button>
        {shift && (
          <button
            type="button"
            onClick={onClear}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label={t('schedule.removeShift')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function PersonDialog({
  employee, onClose, onSave, onRemove,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSave: (name: string, role: string, color: string) => void;
  onRemove?: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState(employee?.role ?? '');
  const [color, setColor] = useState(employee?.color ?? 'slate');

  return (
    <Dialog onClose={onClose} title={employee ? t('schedule.editPersonTitle') : t('schedule.newPersonTitle')}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.nameLabel')}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          placeholder={t('schedule.namePlaceholder')}
          className="input-field !py-2"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.roleLabel')}</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={40}
          placeholder={t('schedule.rolePlaceholder')}
          className="input-field !py-2"
        />
      </label>

      <div className="mt-4">
        <span className="text-xs text-muted-foreground block mb-2">{t('schedule.colorLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setColor(c.key)}
              className={`w-9 h-9 rounded-xl border-2 transition-all
                ${color === c.key ? 'border-foreground scale-110' : 'border-transparent'}`}
              style={{ background: c.bg }}
              aria-label={colorName(t, c.key, c.label)}
              aria-pressed={color === c.key}
            >
              <span className="block w-3 h-3 rounded-full mx-auto" style={{ background: c.dot }} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => name.trim() && onSave(name.trim(), role.trim(), color)}
          disabled={!name.trim()}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {t('schedule.save')}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label={t('schedule.removePerson')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function CopyWeeksDialog({
  weekLabel, onClose, onCopy,
}: {
  weekLabel: string;
  onClose: () => void;
  onCopy: (weeks: number, overwrite: boolean) => Promise<{ ok: boolean; conflict?: boolean }>;
}) {
  const { t } = useLanguage();
  const [weeks, setWeeks] = useState(4);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (overwrite: boolean) => {
    setSaving(true);
    const result = await onCopy(weeks, overwrite);
    if (!result.ok && result.conflict) setConflict(true);
    setSaving(false);
  };

  return (
    <Dialog onClose={onClose} title={t('schedule.repeatWeek')}>
      <p className="text-sm text-muted-foreground -mt-2">
        {t('schedule.repeatBodyPrefix')} <strong className="text-foreground">{weekLabel}</strong>{' '}
        {t('schedule.repeatBodySuffix')}
      </p>

      <label className="block mt-4">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('schedule.howManyWeeks')}</span>
        <input
          type="number"
          min={1}
          max={52}
          value={weeks}
          onChange={(e) => { setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1))); setConflict(false); }}
          className="input-field !py-2 w-28"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[2, 4, 8, 12].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setWeeks(n); setConflict(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${weeks === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {n} {t('schedule.weeksUnit')}
          </button>
        ))}
      </div>

      {conflict && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {t('schedule.repeatConflict')}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => submit(conflict)}
          disabled={saving}
          className={`cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40 ${conflict ? '!bg-warning' : ''}`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CopyPlus className="w-4 h-4" />}
          {conflict ? t('schedule.replaceAnyway') : `${t('schedule.repeat')} ${weeks}×`}
        </button>
      </div>
    </Dialog>
  );
}

/** A plain centred dialog. Escape and the backdrop both close it. */
function Dialog({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
                   p-5 shadow-modal max-h-[90dvh] overflow-y-auto overscroll-contain
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t('schedule.close')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
