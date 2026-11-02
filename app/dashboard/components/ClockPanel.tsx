'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ChevronDown, Clock, KeyRound, Loader2, MonitorSmartphone, Pencil, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { employeeColor, formatDuration, formatMinutes, parseTime } from '@/lib/schedule';
import { lisbonParts, entryMinutes } from '@/lib/time-clock';
import { getClockMonth, setEmployeePin, saveTimeEntry, openKiosk } from '../clock-actions';
import Dialog from './Dialog';

type Person = {
  id: string; name: string; role: string | null; color: string; hasPin: boolean;
  scheduledMin: number; workedMin: number; diffMin: number; inSince: string | null; missingOut: number;
};
type Entry = { id: string; employeeId: string; clockIn: string; clockOut: string | null; manual: boolean };
type Editing = { person: Person; entry: Entry | null };

function currentMonth(): string {
  return lisbonParts(new Date()).dateKey.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const signed = (min: number) => (min === 0 ? '0h' : `${min > 0 ? '+' : '−'}${formatDuration(Math.abs(min))}`);

/**
 * Equipa › Ponto. The month's hours worked against the rota, per person, and
 * the kiosk the team clocks in on. Open entries count for nothing until they
 * are closed, so an owner never pays hours the app guessed.
 */
export default function ClockPanel() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<{ people: Person[]; entries: Entry[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pinShown, setPinShown] = useState<{ name: string; pin: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [openingKiosk, setOpeningKiosk] = useState(false);

  const load = useCallback(async () => {
    const r = await getClockMonth(month);
    if (!r.success) return toast.error(translateError(language, r.error));
    setData(r.data);
  }, [month, language]);

  useEffect(() => { setData(null); void load(); }, [load]);

  const newPin = async (p: Person) => {
    const r = await setEmployeePin(p.id);
    if (!r.success) return toast.error(translateError(language, r.error));
    setPinShown({ name: p.name, pin: r.data.pin });
    void load();
  };

  const startKiosk = async () => {
    setOpeningKiosk(true);
    const r = await openKiosk();
    if (!r.success) { setOpeningKiosk(false); return toast.error(translateError(language, r.error)); }
    router.push('/kiosk');
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' });
  const monthTitle = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const withoutPin = data?.people.filter((p) => !p.hasPin).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="card-glass flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('clock.kioskTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('clock.kioskBody')}</p>
        </div>
        <button type="button" onClick={startKiosk} disabled={openingKiosk} className="cta-button !py-2 !px-4">
          {openingKiosk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}
          {t('clock.openKiosk')}
        </button>
      </div>

      <div className="card-glass p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={t('clock.prevMonth')} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 className="text-base font-bold capitalize text-foreground">{monthTitle}</h2>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentMonth()}
            aria-label={t('clock.nextMonth')}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>
        ) : data.people.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">{t('clock.empty')}</p>
          </div>
        ) : (
          <>
            {withoutPin > 0 && (
              <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                {t('clock.withoutPin').replace('{count}', String(withoutPin))}
              </p>
            )}
            <div className="mt-3 hidden grid-cols-[1fr_5.5rem_5.5rem_5.5rem_2rem] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>{t('clock.person')}</span>
              <span className="text-right">{t('clock.scheduled')}</span>
              <span className="text-right">{t('clock.worked')}</span>
              <span className="text-right">{t('clock.difference')}</span>
              <span />
            </div>
            <ul className="mt-1 divide-y divide-border">
              {data.people.map((p) => {
                const entries = data.entries.filter((e) => e.employeeId === p.id);
                const expanded = open === p.id;
                return (
                  <li key={p.id} className="py-1">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : p.id)}
                      aria-expanded={expanded}
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-muted/60 sm:grid-cols-[1fr_5.5rem_5.5rem_5.5rem_2rem]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: employeeColor(p.color).dot }} aria-hidden="true" />
                          <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-1.5 pl-[18px] text-xs">
                          {p.inSince && <span className="font-medium text-success">{t('clock.inSince').replace('{time}', time(p.inSince))}</span>}
                          {p.missingOut > 0 && <span className="font-medium text-danger">{t('clock.missingOut').replace('{count}', String(p.missingOut))}</span>}
                          {!p.hasPin && <span className="text-muted-foreground">{t('clock.noPin')}</span>}
                          <span className="text-muted-foreground sm:hidden">
                            {formatDuration(p.workedMin)} / {formatDuration(p.scheduledMin)}
                          </span>
                        </span>
                      </span>
                      <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{formatDuration(p.scheduledMin)}</span>
                      <span className="hidden text-right text-sm font-semibold tabular-nums text-foreground sm:block">{formatDuration(p.workedMin)}</span>
                      <span className={`hidden text-right text-sm tabular-nums sm:block ${p.diffMin > 0 ? 'text-warning' : p.diffMin < 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {signed(p.diffMin)}
                      </span>
                      <ChevronDown className={`h-4 w-4 justify-self-end text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>

                    {expanded && (
                      <div className="mb-2 ml-[26px] mr-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => newPin(p)} className="cta-button-secondary !py-1.5 !px-3 text-xs">
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(p.hasPin ? 'clock.replacePin' : 'clock.setPin')}
                          </button>
                          <button type="button" onClick={() => setEditing({ person: p, entry: null })} className="cta-button-secondary !py-1.5 !px-3 text-xs">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('clock.addEntry')}
                          </button>
                        </div>
                        {entries.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('clock.noEntries')}</p>
                        ) : (
                          <ul className="divide-y divide-border rounded-xl border border-border">
                            {entries.map((e) => {
                              const mins = entryMinutes(new Date(e.clockIn), e.clockOut ? new Date(e.clockOut) : null);
                              return (
                                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                  <span className="w-24 shrink-0 capitalize text-muted-foreground">{day(e.clockIn)}</span>
                                  <span className="flex-1 tabular-nums text-foreground">
                                    {time(e.clockIn)} – {e.clockOut ? time(e.clockOut) : <span className="text-danger">{t('clock.open')}</span>}
                                    {e.manual && <span className="ml-2 text-[11px] text-muted-foreground">{t('clock.edited')}</span>}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">{mins === null ? '—' : formatDuration(mins)}</span>
                                  <button type="button" onClick={() => setEditing({ person: p, entry: e })} aria-label={t('clock.editEntry')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{t('clock.footnote')}</p>
          </>
        )}
      </div>

      {pinShown && (
        <Dialog title={t('clock.pinTitle').replace('{name}', pinShown.name)} onClose={() => setPinShown(null)}>
          <p className="text-center text-5xl font-bold tracking-[0.3em] tabular-nums text-foreground">{pinShown.pin}</p>
          <p className="mt-4 text-sm text-muted-foreground">{t('clock.pinBody')}</p>
          <button type="button" onClick={() => setPinShown(null)} className="cta-button mt-5 w-full justify-center">{t('clock.pinDone')}</button>
        </Dialog>
      )}

      {editing && <EntryDialog editing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function EntryDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const { t, language } = useLanguage();
  const start = editing.entry ? lisbonParts(new Date(editing.entry.clockIn)) : null;
  const end = editing.entry?.clockOut ? lisbonParts(new Date(editing.entry.clockOut)) : null;
  const [date, setDate] = useState(start?.dateKey ?? lisbonParts(new Date()).dateKey);
  const [inTime, setInTime] = useState(start ? formatMinutes(start.minutes) : '');
  const [outTime, setOutTime] = useState(end ? formatMinutes(end.minutes) : '');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const inMin = parseTime(inTime);
    const outMin = outTime.trim() ? parseTime(outTime) : null;
    if (inMin === null || (outTime.trim() && outMin === null)) return toast.error(t('clock.errors.invalid'));
    setBusy(true);
    const r = await saveTimeEntry({ id: editing.entry?.id, employeeId: editing.person.id, date, inMin, outMin });
    setBusy(false);
    if (!r.success) return toast.error(translateError(language, r.error));
    toast.success(t('clock.entrySaved'));
    onSaved();
  };

  return (
    <Dialog title={`${t(editing.entry ? 'clock.editEntry' : 'clock.addEntry')} · ${editing.person.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t('clock.date')}</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input-field mt-1.5" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t('clock.in')}</span>
            <input type="time" required value={inTime} onChange={(e) => setInTime(e.target.value)} className="input-field mt-1.5" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t('clock.out')}</span>
            <input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="input-field mt-1.5" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t('clock.entryHint')}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="cta-button-secondary !py-2 !px-4">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="cta-button !py-2 !px-4">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
