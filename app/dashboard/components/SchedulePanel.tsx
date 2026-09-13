'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, X, Check,
  CalendarOff, CalendarCheck, CopyPlus, Copy, Download, Users, Eraser,
} from 'lucide-react';
import {
  getWeekSchedule, addEmployee, updateEmployee, removeEmployee,
  setShift, clearShift, toggleClosure, copyWeekForward, clearWeek,
  saveTemplate, deleteTemplate,
} from '../schedule-actions';
import {
  startOfWeek, addWeeks, weekDates, dateKey, parseDateKey,
  formatRange, formatShiftTimes, hasBreak, formatDuration, formatWeekRange, shiftLength,
  parseTime, formatMinutes, weeklyMinutes,
  WEEKDAYS_PT_SHORT, EMPLOYEE_COLORS, employeeColor,
} from '@/lib/schedule';

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
const DEFAULT_SHIFTS = [
  { label: 'Manhã', startMin: 9 * 60, endMin: 17 * 60, breakStartMin: null, breakEndMin: null },
  { label: 'Tarde', startMin: 12 * 60, endMin: 20 * 60, breakStartMin: null, breakEndMin: null },
  { label: 'Noite', startMin: 17 * 60, endMin: 24 * 60, breakStartMin: null, breakEndMin: null },
  // The split shift a Portuguese restaurant actually runs: lunch service,
  // the afternoon off, then dinner.
  { label: 'Partido', startMin: 12 * 60, endMin: 23 * 60, breakStartMin: 15 * 60, breakEndMin: 19 * 60 },
];

export default function SchedulePanel() {
  const [weekStart, setWeekStart] = useState(() => dateKey(startOfWeek(new Date())));
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingCell, setEditingCell] = useState<{ employeeId: string; date: string } | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Employee | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // "7 – 13 de setembro 2026". Named in the confirmations so the owner can see
  // which week actually went to the clipboard before pasting it to the team.
  const weekLabel = formatWeekRange(parseDateKey(weekStart), 'pt');

  const load = useCallback(() => {
    setLoading(true);
    getWeekSchedule(weekStart).then((r) => {
      if (r.success) setData(r.data as WeekData);
      else toast.error(r.error);
      setLoading(false);
    });
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const days = weekDates(parseDateKey(weekStart));
  const closedSet = new Map((data?.closures ?? []).map((c) => [c.date, c.reason]));
  const shiftAt = (employeeId: string, date: string) =>
    data?.shifts.find((s) => s.employeeId === employeeId && s.date === date) ?? null;
  const totals = weeklyMinutes(data?.shifts ?? []);
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
      toast.error(result.error || 'Não foi possível guardar');
    }
    setBusy(false);
    return result;
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
  const downloadImage = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/schedule?week=${weekStart}`);
      if (!res.ok) throw new Error('fetch failed');

      const blob = await res.blob();
      const filename = `horario-${weekStart}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Horário ${weekLabel}` });
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

      toast.success(`Horário de ${weekLabel} descarregado.`);
    } catch {
      toast.error('Não foi possível descarregar a imagem.');
    } finally {
      setDownloading(false);
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
  const copyImage = async () => {
    const url = `/api/export/schedule?week=${weekStart}&format=png`;

    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      toast.error('O seu navegador não deixa copiar imagens. Use "Descarregar".');
      return;
    }

    setCopying(true);
    try {
      const blob = fetch(url).then(async (res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.blob();
      });

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast.success(`Horário de ${weekLabel} copiado. Cole na conversa do WhatsApp.`);
    } catch {
      toast.error('Não foi possível copiar. Use "Descarregar".');
    } finally {
      setCopying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        A carregar horário...
      </div>
    );
  }

  const employees = data?.employees ?? [];

  return (
    <div className="space-y-4">
      {/* ── Week navigation and the week's own actions ───────────────────── */}
      <div className="card-glass p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekStart(dateKey(addWeeks(parseDateKey(weekStart), -1)))}
              className="w-11 h-11 rounded-xl border border-border flex items-center justify-center
                         text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(dateKey(addWeeks(parseDateKey(weekStart), 1)))}
              className="w-11 h-11 rounded-xl border border-border flex items-center justify-center
                         text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Semana seguinte"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground truncate">
              {weekLabel}
            </h3>
            <p className="text-xs text-muted-foreground">
              {employees.length === 0
                ? 'Comece por adicionar quem trabalha consigo.'
                : 'Toque numa célula para marcar o turno.'}
            </p>
          </div>

          {dateKey(startOfWeek(new Date())) !== weekStart && (
            <button
              type="button"
              onClick={() => setWeekStart(dateKey(startOfWeek(new Date())))}
              className="text-xs font-semibold text-primary hover:underline px-2 py-1"
            >
              Esta semana
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCopyOpen(true)}
            disabled={busy || (data?.shifts.length ?? 0) === 0}
            className="cta-button-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
          >
            <CopyPlus className="w-4 h-4" aria-hidden="true" />
            Repetir esta semana
          </button>

          <button
            type="button"
            onClick={copyImage}
            disabled={busy || copying || (data?.shifts.length ?? 0) === 0}
            className="cta-button !py-2 !px-3 !text-xs disabled:opacity-40"
          >
            {copying
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <Copy className="w-4 h-4" aria-hidden="true" />}
            Copiar imagem
          </button>

          <button
            type="button"
            onClick={downloadImage}
            disabled={busy || downloading || (data?.shifts.length ?? 0) === 0}
            className="cta-button-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
          >
            {downloading
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <Download className="w-4 h-4" aria-hidden="true" />}
            Descarregar
          </button>

          {(data?.shifts.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirm('Apagar todos os turnos desta semana?')) return;
                run(() => clearWeek(weekStart), 'Semana limpa');
              }}
              disabled={busy}
              className="cta-button-secondary !py-2 !px-3 !text-xs text-danger disabled:opacity-40"
            >
              <Eraser className="w-4 h-4" aria-hidden="true" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {employees.length === 0 ? (
        <EmptyState onAdd={() => setShowAddPerson(true)} />
      ) : (
        <>
          {/* ── Desktop grid ──────────────────────────────────────────────
              Seven columns of times is exactly what a rota is; on a laptop
              there is room for it and nothing is gained by hiding it. */}
          <div className="card-glass p-4 sm:p-5 hidden md:block">
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground w-[180px]">
                      Colaborador
                    </th>
                    {days.map((day, i) => {
                      const key = dateKey(day);
                      const closed = closedSet.has(key);
                      return (
                        <th key={key} className="px-1 py-2 min-w-[110px]">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-semibold ${closed ? 'text-muted-foreground' : 'text-foreground'}`}>
                              {WEEKDAYS_PT_SHORT[i]}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {day.getUTCDate()}/{day.getUTCMonth() + 1}
                            </span>
                            {/* Closing a day is one tap on its header, which
                                is the whole point: no walking every cell. */}
                            <button
                              type="button"
                              onClick={() => {
                                const reason = closed
                                  ? undefined
                                  : prompt('Motivo (opcional): feriado, férias...') ?? undefined;
                                run(
                                  () => toggleClosure(key, reason),
                                  closed ? 'Dia reaberto' : 'Dia fechado'
                                );
                              }}
                              disabled={busy}
                              className={`mt-0.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md transition-colors
                                ${closed
                                  ? 'bg-warning/15 text-warning hover:bg-warning/25'
                                  : 'text-muted-foreground hover:bg-muted'}`}
                              title={closed ? 'Reabrir este dia' : 'Marcar como fechado'}
                            >
                              {closed ? (
                                <><CalendarCheck className="w-3 h-3" aria-hidden="true" /> Fechado</>
                              ) : (
                                <><CalendarOff className="w-3 h-3" aria-hidden="true" /> Fechar</>
                              )}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground w-[70px]">
                      Semana
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((emp) => {
                    const color = employeeColor(emp.color);
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
                              onClick={() => setEditingPerson(emp)}
                              className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                              aria-label={`Editar ${emp.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </th>

                        {days.map((day) => {
                          const key = dateKey(day);
                          const closed = closedSet.has(key);
                          const shift = shiftAt(emp.id, key);
                          return (
                            <td key={key} className={`px-1 py-1.5 ${closed ? 'bg-muted/40' : ''}`}>
                              <ShiftCell
                                closed={closed}
                                shift={shift}
                                color={color}
                                onClick={() => setEditingCell({ employeeId: emp.id, date: key })}
                              />
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

            <button
              type="button"
              onClick={() => setShowAddPerson(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Adicionar colaborador
            </button>
          </div>

          {/* ── Phone: a day at a time ────────────────────────────────────
              Seven columns of times do not fit a phone, and the answer that
              works for the annual statement works here: show one day whole
              rather than all seven cropped. */}
          <MobileSchedule
            days={days}
            employees={employees}
            closedSet={closedSet}
            shiftAt={shiftAt}
            totals={totals}
            busy={busy}
            onToggleClosure={(key, closed) => {
              const reason = closed ? undefined : prompt('Motivo (opcional):') ?? undefined;
              run(() => toggleClosure(key, reason), closed ? 'Dia reaberto' : 'Dia fechado');
            }}
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
              'Turno guardado'
            );
            setEditingCell(null);
          }}
          onClear={async () => {
            await run(() => clearShift(editingCell.employeeId, editingCell.date), 'Turno removido');
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
              await run(() => updateEmployee(editingPerson.id, { name, role, color }), 'Colaborador atualizado');
            } else {
              await run(() => addEmployee({ name, role, color }), 'Colaborador adicionado');
            }
            setShowAddPerson(false);
            setEditingPerson(null);
          }}
          onRemove={
            editingPerson
              ? async () => {
                  if (!confirm(`Remover ${editingPerson.name}? Os turnos passados ficam no histórico.`)) return;
                  await run(() => removeEmployee(editingPerson.id), 'Colaborador removido');
                  setEditingPerson(null);
                }
              : undefined
          }
        />
      )}

      {copyOpen && (
        <CopyWeeksDialog
          weekLabel={formatWeekRange(parseDateKey(weekStart), 'pt')}
          onClose={() => setCopyOpen(false)}
          onCopy={async (weeks, overwrite) => {
            const result = await copyWeekForward({ fromWeekStart: weekStart, weeks, overwrite });
            if (result.success) {
              toast.success(`Semana repetida ${weeks}×`);
              setCopyOpen(false);
              load();
              return { ok: true as const };
            }
            if ('conflict' in result && result.conflict) return { ok: false as const, conflict: true };
            toast.error(result.error || 'Não foi possível copiar');
            return { ok: false as const };
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function ShiftCell({
  closed, shift, color, onClick,
}: {
  closed: boolean;
  shift: Shift | null;
  color: ReturnType<typeof employeeColor>;
  onClick: () => void;
}) {
  if (closed) {
    return <div className="h-11 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground">—</div>;
  }

  if (!shift) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full h-11 rounded-lg border border-dashed border-border text-muted-foreground/50
                   hover:border-primary hover:text-primary transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Marcar turno"
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
  return (
    <div className="card-glass p-8 text-center">
      <Users className="w-8 h-8 mx-auto text-muted-foreground/40" aria-hidden="true" />
      <h4 className="mt-3 font-semibold text-foreground">Ainda não há colaboradores</h4>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
        Adicione quem trabalha consigo. Não precisam de conta nem email — são
        apenas nomes para o horário.
      </p>
      <button type="button" onClick={onAdd} className="cta-button mt-5 !py-2 !px-4 !text-sm mx-auto">
        <Plus className="w-4 h-4" aria-hidden="true" />
        Adicionar colaborador
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
                ${selected ? 'bg-primary text-primary-foreground' : isClosed ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-foreground'}`}
              aria-pressed={selected}
            >
              <span className="block text-[11px] font-semibold">{WEEKDAYS_PT_SHORT[i]}</span>
              <span className="block text-sm font-bold tabular-nums">{d.getUTCDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {closed ? `Fechado${closedSet.get(key) ? ` — ${closedSet.get(key)}` : ''}` : 'Turnos do dia'}
        </span>
        <button
          type="button"
          onClick={() => onToggleClosure(key, closed)}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors
            ${closed ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}
        >
          {closed ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarOff className="w-3.5 h-3.5" />}
          {closed ? 'Reabrir' : 'Fechar dia'}
        </button>
      </div>

      {closed ? (
        <p className="mt-4 rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          O restaurante está fechado neste dia.
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
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Marcar
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
          Adicionar colaborador
        </button>
        <span className="text-[11px] text-muted-foreground">
          {employees.filter((e) => totals.get(e.id)).length} a trabalhar esta semana
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
  /** Starting points. No id, so they cannot be edited or removed. */
  suggestions: Array<Omit<ShiftTemplate, 'id'>>;
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
  const [start, setStart] = useState(formatMinutes(shift?.startMin ?? 9 * 60));
  const [end, setEnd] = useState(formatMinutes(shift?.endMin ?? 17 * 60));

  // A shift either has a break or it does not; the two fields only exist once
  // the owner says there is one, so an empty pair cannot be saved by accident.
  const [split, setSplit] = useState(shift?.breakStartMin != null);
  const [breakStart, setBreakStart] = useState(formatMinutes(shift?.breakStartMin ?? 15 * 60));
  const [breakEnd, setBreakEnd] = useState(formatMinutes(shift?.breakEndMin ?? 19 * 60));

  const [note, setNote] = useState(shift?.note ?? '');
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const valid = startMin !== null && endMin !== null;

  const breakStartMin = split ? parseTime(breakStart) : null;
  const breakEndMin = split ? parseTime(breakEnd) : null;

  // The break is only usable if it parses and sits inside the shift. An
  // unusable one is reported below rather than silently ignored, because
  // silently ignoring it would pay someone for an afternoon they are off.
  const breakUsable =
    valid && split && breakStartMin !== null && breakEndMin !== null &&
    hasBreak(startMin!, endMin!, breakStartMin, breakEndMin);

  const breakBroken = split && !breakUsable;

  const length = valid
    ? shiftLength(startMin!, endMin!, breakUsable ? breakStartMin : null, breakUsable ? breakEndMin : null)
    : 0;

  /** Applies a saved shift or a suggestion, break included. */
  const applyTemplate = (t: Omit<ShiftTemplate, 'id'>) => {
    setStart(formatMinutes(t.startMin));
    setEnd(formatMinutes(t.endMin));
    if (t.breakStartMin != null && t.breakEndMin != null) {
      setSplit(true);
      setBreakStart(formatMinutes(t.breakStartMin));
      setBreakEnd(formatMinutes(t.breakEndMin));
    } else {
      setSplit(false);
    }
  };

  /** Whether a template's hours, break included, match what is in the fields. */
  const matches = (t: Omit<ShiftTemplate, 'id'>) =>
    startMin === t.startMin &&
    endMin === t.endMin &&
    (breakUsable ? breakStartMin : null) === t.breakStartMin &&
    (breakUsable ? breakEndMin : null) === t.breakEndMin;

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
      toast.success('Turno guardado para reutilizar');
      setNewLabel('');
      onTemplatesChanged();
    } else {
      toast.error(result.error || 'Não foi possível guardar');
    }
    setSavingTemplate(false);
  };

  return (
    <Dialog onClose={onClose} title={employee.name}>
      <p className="text-xs text-muted-foreground -mt-2 mb-4">
        {formatWeekRange(parseDateKey(date), 'pt').split('–')[0].trim()} ·{' '}
        {parseDateKey(date).toLocaleDateString('pt-PT', { weekday: 'long', timeZone: 'UTC' })}
      </p>

      {/* The saved shifts, as one tap. The free fields below stay for the
          days that do not follow the pattern. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {savedTemplates.map((t) => (
          <span key={t.id} className="relative inline-flex">
            <button
              type="button"
              onClick={() => applyTemplate(t)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors
                ${matches(t)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-primary hover:text-primary-foreground'}`}
              aria-pressed={matches(t)}
            >
              {t.label}
              <span className="block text-[10px] font-normal opacity-70">
                {formatShiftTimes(t.startMin, t.endMin, t.breakStartMin, t.breakEndMin)}
              </span>
            </button>

            {managing && (
              <button
                type="button"
                onClick={async () => {
                  const result = await deleteTemplate(t.id);
                  if (result.success) { toast.success('Turno removido'); onTemplatesChanged(); }
                  else toast.error(result.error || 'Não foi possível remover');
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white
                           flex items-center justify-center shadow-sm"
                aria-label={`Remover turno ${t.label}`}
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
            {managing ? 'Concluído' : 'Gerir'}
          </button>
        )}
      </div>

      {/* Suggestions, kept on offer rather than replaced by the saved list.
          Visibly lighter than the saved shifts above, so it is clear which
          ones belong to the restaurant and which are just starting points. */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sugestões
          </span>
          {suggestions.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => applyTemplate(t)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border border-dashed transition-colors
                ${matches(t)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary'}`}
              aria-pressed={matches(t)}
            >
              {t.label}
              <span className="block text-[10px] font-normal opacity-70">
                {formatShiftTimes(t.startMin, t.endMin, t.breakStartMin, t.breakEndMin)}
              </span>
            </button>
          ))}
        </div>
      )}

      {savedTemplates.length === 0 && (
        <p className="text-[11px] text-muted-foreground mb-4">
          Aplique uma sugestão ou defina as horas abaixo. Pode guardar os seus próprios turnos para os ter sempre à mão.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">Entrada</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input-field !py-2" />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">Saída</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input-field !py-2" />
        </label>
      </div>

      {/* The split shift: lunch, the afternoon off, dinner. One shift with a
          hole rather than two, so the grid stays one cell per day and the
          weekly total stays a single sum. */}
      <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => setSplit(e.target.checked)}
          className="w-4 h-4 rounded accent-[hsl(var(--primary))]"
        />
        <span className="text-xs font-medium text-foreground">
          Turno partido
          <span className="text-muted-foreground font-normal"> — com pausa ao meio</span>
        </span>
      </label>

      {split && (
        <div className="grid grid-cols-2 gap-3 mt-2 rounded-xl bg-muted/60 p-3">
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Início da pausa</span>
            <input
              type="time"
              value={breakStart}
              onChange={(e) => setBreakStart(e.target.value)}
              className="input-field !py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Fim da pausa</span>
            <input
              type="time"
              value={breakEnd}
              onChange={(e) => setBreakEnd(e.target.value)}
              className="input-field !py-2"
            />
          </label>

          {breakBroken && (
            <p className="col-span-2 text-[11px] text-danger">
              A pausa tem de ficar dentro do turno e terminar depois de começar.
            </p>
          )}
        </div>
      )}

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Nota (opcional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={40}
          placeholder="ex: fecho, só até às 15h"
          className="input-field !py-2"
        />
      </label>

      {valid && !breakBroken && (
        <p className="mt-3 text-xs text-muted-foreground">
          {breakUsable && (
            <>
              Horário:{' '}
              <strong className="text-foreground">
                {formatShiftTimes(startMin!, endMin!, breakStartMin, breakEndMin)}
              </strong>
              {' · '}
            </>
          )}
          Duração: <strong className="text-foreground">{formatDuration(length)}</strong>
          {breakUsable && ' (sem a pausa)'}
          {endMin! <= startMin! && ' · termina no dia seguinte'}
        </p>
      )}

      {/* Offered only for hours no saved template already covers: a restaurant
          that keeps typing 09:00–17:00 should be asked to name it once, and
          never asked again afterwards. */}
      {isNewCombination && savedTemplates.length < 12 && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3">
          <label className="block">
            <span className="text-[11px] text-muted-foreground block mb-1.5">
              Guardar {formatShiftTimes(startMin!, endMin!, breakUsable ? breakStartMin : null, breakUsable ? breakEndMin : null)} como turno reutilizável
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={20}
                placeholder="ex: Almoço, Fecho"
                className="input-field !py-1.5 !text-sm flex-1"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={!newLabel.trim() || savingTemplate}
                className="cta-button-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40 shrink-0"
              >
                {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Guardar
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
          Guardar
        </button>
        {shift && (
          <button
            type="button"
            onClick={onClear}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label="Remover turno"
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
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState(employee?.role ?? '');
  const [color, setColor] = useState(employee?.color ?? 'slate');

  return (
    <Dialog onClose={onClose} title={employee ? 'Editar colaborador' : 'Novo colaborador'}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">Nome</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          placeholder="ex: Ana Silva"
          className="input-field !py-2"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Função (opcional)</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={40}
          placeholder="ex: Cozinha, Sala, Balcão"
          className="input-field !py-2"
        />
      </label>

      <div className="mt-4">
        <span className="text-xs text-muted-foreground block mb-2">Cor no horário</span>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setColor(c.key)}
              className={`w-9 h-9 rounded-xl border-2 transition-all
                ${color === c.key ? 'border-foreground scale-110' : 'border-transparent'}`}
              style={{ background: c.bg }}
              aria-label={c.label}
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
          Guardar
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label="Remover colaborador"
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
    <Dialog onClose={onClose} title="Repetir esta semana">
      <p className="text-sm text-muted-foreground -mt-2">
        Copia os turnos e os dias fechados de <strong className="text-foreground">{weekLabel}</strong> para
        as semanas seguintes.
      </p>

      <label className="block mt-4">
        <span className="text-xs text-muted-foreground block mb-1.5">Quantas semanas?</span>
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
            {n} semanas
          </button>
        ))}
      </div>

      {conflict && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          Já existem turnos marcados nessas semanas. Continuar substitui-os.
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
          {conflict ? 'Substituir na mesma' : `Repetir ${weeks}×`}
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
            aria-label="Fechar"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
