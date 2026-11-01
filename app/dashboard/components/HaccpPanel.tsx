'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, AlertTriangle, Loader2, Download, Plus, Trash2, Thermometer, ClipboardCheck } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { PRESETS, isOutOfRange, rangeLabel, recordsCsv, type ChecklistItem } from '@/lib/haccp';
import SubTabs from './SubTabs';
import CompliancePanel from './CompliancePanel';
import {
  getHaccpToday, saveChecklistTemplate, archiveChecklistTemplate, saveChecklistRecord, getChecklistRecords,
} from '../haccp-actions';

/**
 * Conformidade: the documents, and the HACCP records kept day to day.
 */
export function ComplianceArea() {
  const { t } = useLanguage();
  const [view, setView] = useState<'docs' | 'records'>('docs');
  return (
    <div className="space-y-4">
      <SubTabs
        label={t('nav.compliance')}
        active={view}
        onChange={setView}
        tabs={[{ value: 'docs', label: t('haccp.tabDocs') }, { value: 'records', label: t('haccp.tabRecords') }]}
      />
      {view === 'docs' ? <CompliancePanel /> : <HaccpPanel />}
    </div>
  );
}

type Template = { id: string; name: string; items: ChecklistItem[]; today: Array<{ at: string; by: string | null; issues: number }> };

function time(iso: string, language: string) {
  return new Date(iso).toLocaleTimeString(language === 'pt' ? 'pt-PT' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function HaccpPanel() {
  const { t, language } = useLanguage();
  const [view, setView] = useState<'today' | 'history' | 'sheets'>('today');
  const [data, setData] = useState<{ canEdit: boolean; templates: Template[] } | null>(null);
  const [filling, setFilling] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await getHaccpToday();
    if (r.success) setData(r.data);
    else toast.error(translateError(language, r.error));
  }, [language]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('common.loading')}</div>;

  if (filling) return <FillForm template={filling} onDone={() => { setFilling(null); load(); }} />;

  const startWithPresets = async () => {
    setBusy(true);
    for (const p of PRESETS) {
      await saveChecklistTemplate({
        name: t(`haccp.presets.${p.key}.name`),
        items: p.items.map((i) => ({ label: t(`haccp.presets.${p.key}.${i.key}`), kind: i.kind, min: i.min ?? null, max: i.max ?? null })),
      });
    }
    setBusy(false);
    load();
  };

  if (data.templates.length === 0) {
    return (
      <div className="card-glass px-6 py-12 text-center">
        <ClipboardCheck className="mx-auto h-9 w-9 text-primary-ink" aria-hidden="true" />
        <p className="mt-3 text-base font-semibold text-foreground">{t('haccp.emptyTitle')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t(data.canEdit ? 'haccp.emptyBodyOwner' : 'haccp.emptyBodyStaff')}</p>
        {data.canEdit && (
          <button type="button" onClick={startWithPresets} disabled={busy} className="cta-button mt-6 !py-2 !px-5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {t('haccp.startPresets')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SubTabs
        label={t('haccp.tabRecords')}
        active={view}
        onChange={setView}
        tabs={[
          { value: 'today', label: t('haccp.today') },
          { value: 'history', label: t('haccp.history') },
          ...(data.canEdit ? [{ value: 'sheets' as const, label: t('haccp.sheets') }] : []),
        ]}
      />

      {view === 'today' && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.templates.map((tpl) => {
            const last = tpl.today[0];
            return (
              <li key={tpl.id} className="card-glass flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                  {last ? (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${last.issues ? 'bg-danger/10 text-danger' : 'bg-success/15 text-success'}`}>
                      {last.issues ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />}
                      {last.issues ? t('haccp.withIssues').replace('{count}', String(last.issues)) : t('haccp.done')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t('haccp.toDo')}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {last
                    ? t('haccp.lastDone').replace('{time}', time(last.at, language)).replace('{who}', last.by ?? '—')
                    : t('haccp.itemsCount').replace('{count}', String(tpl.items.length))}
                </p>
                <button type="button" onClick={() => setFilling(tpl)} className="cta-button-secondary mt-4 !py-2 !px-4 self-start">
                  {t(last ? 'haccp.fillAgain' : 'haccp.fill')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {view === 'history' && <History />}
      {view === 'sheets' && data.canEdit && <Sheets templates={data.templates} onChanged={load} />}
    </div>
  );
}

function FillForm({ template, onDone }: { template: Template; onDone: () => void }) {
  const { t, language } = useLanguage();
  const [given, setGiven] = useState<Record<string, { ok?: boolean; value?: number | null; raw?: string }>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const payload = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, { ok: v.ok, value: v.value }]));
    const r = await saveChecklistRecord({ templateId: template.id, given: payload, notes });
    setBusy(false);
    if (!r.success) return toast.error(translateError(language, r.error));
    if (r.data.issues > 0) toast.warning(t('haccp.savedWithIssues').replace('{count}', String(r.data.issues)));
    else toast.success(t('haccp.saved'));
    onDone();
  };

  return (
    <div className="card-glass p-5 sm:p-6">
      <h2 className="text-lg font-bold text-foreground">{template.name}</h2>
      <ul className="mt-4 divide-y divide-border">
        {template.items.map((item) => {
          const g = given[item.id] ?? {};
          if (item.kind === 'temperature') {
            const out = typeof g.value === 'number' && isOutOfRange(g.value, item);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <Thermometer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <label htmlFor={`h-${item.id}`} className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{rangeLabel(item, t('haccp.to'))}</span>
                </label>
                <div className="relative">
                  <input
                    id={`h-${item.id}`}
                    inputMode="decimal"
                    value={g.raw ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw.replace(',', '.'));
                      setGiven((v) => ({ ...v, [item.id]: { raw, value: raw.trim() === '' || !Number.isFinite(n) ? null : n } }));
                    }}
                    className={`w-24 rounded-lg border bg-card px-2 py-1.5 pr-8 text-right tabular-nums ${out ? 'border-danger text-danger' : 'border-border'}`}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">°C</span>
                </div>
                {out && <span className="w-full text-xs font-medium text-danger sm:w-auto">{t('haccp.outOfRange')}</span>}
              </li>
            );
          }
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 text-sm text-foreground">{item.label}</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={item.label}>
                {([true, false] as const).map((ok) => (
                  <button
                    key={String(ok)}
                    type="button"
                    role="radio"
                    aria-checked={g.ok === ok}
                    onClick={() => setGiven((v) => ({ ...v, [item.id]: { ok } }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      g.ok === ok ? (ok ? 'border-success bg-success/15 text-success' : 'border-danger bg-danger/10 text-danger') : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t(ok ? 'haccp.ok' : 'haccp.problem')}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <label htmlFor="haccp-notes" className="mt-4 block text-xs font-medium text-muted-foreground">{t('haccp.notes')}</label>
      <textarea id="haccp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field mt-1.5" placeholder={t('haccp.notesPlaceholder')} />
      <div className="mt-5 flex justify-between gap-2">
        <button type="button" onClick={onDone} className="cta-button-secondary !py-2 !px-4">{t('common.cancel')}</button>
        <button type="button" onClick={save} disabled={busy} className="cta-button !py-2 !px-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {t('haccp.saveRecord')}
        </button>
      </div>
    </div>
  );
}

function History() {
  const { t, language } = useLanguage();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<Awaited<ReturnType<typeof getChecklistRecords>> | null>(null);

  useEffect(() => { setRecords(null); getChecklistRecords(month).then(setRecords); }, [month]);

  const exportCsv = () => {
    if (!records?.success) return;
    const csv = recordsCsv(
      records.data.map((r) => ({
        doneAt: new Date(r.doneAt).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB'),
        template: r.template, by: r.by, answers: r.answers, notes: r.notes,
      })),
      ['date', 'sheet', 'by', 'item', 'value', 'issue', 'notes'].map((k) => t(`haccp.csv.${k}`)),
    );
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `haccp-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t('haccp.month')} className="input-field !w-auto !py-2" />
        <button type="button" onClick={exportCsv} disabled={!records?.success || records.data.length === 0} className="cta-button-secondary !py-2 !px-4">
          <Download className="h-4 w-4" aria-hidden="true" />{t('haccp.export')}
        </button>
      </div>
      {!records && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {records && !records.success && <p className="text-sm text-muted-foreground">{translateError(language, records.error)}</p>}
      {records?.success && records.data.length === 0 && <p className="card-glass px-5 py-10 text-center text-sm text-muted-foreground">{t('haccp.noRecords')}</p>}
      {records?.success && records.data.length > 0 && (
        <ul className="card-glass divide-y divide-border">
          {records.data.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {new Date(r.doneAt).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-sm font-medium text-foreground">{r.template}</span>
                <span className="text-xs text-muted-foreground">{r.by ?? '—'}</span>
                {r.issues > 0 && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">{t('haccp.withIssues').replace('{count}', String(r.issues))}</span>}
              </div>
              {(r.issues > 0 || r.notes) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.answers.filter((a) => a.outOfRange || a.ok === false).map((a) => `${a.label}${a.value !== null ? ` ${a.value} °C` : ''}`).join(' · ')}
                  {r.notes ? ` — ${r.notes}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sheets({ templates, onChanged }: { templates: Template[]; onChanged: () => void }) {
  const { t, language } = useLanguage();
  const [editing, setEditing] = useState<{ id?: string; name: string; items: ChecklistItem[] } | null>(null);

  if (editing) {
    const setItem = (i: number, patch: Partial<ChecklistItem>) =>
      setEditing({ ...editing, items: editing.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
    const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    const save = async () => {
      const r = await saveChecklistTemplate(editing);
      if (!r.success) return toast.error(translateError(language, r.error));
      toast.success(t('haccp.sheetSaved'));
      setEditing(null);
      onChanged();
    };
    return (
      <div className="card-glass space-y-4 p-5 sm:p-6">
        <div>
          <label htmlFor="sheet-name" className="text-xs font-medium text-muted-foreground">{t('haccp.sheetName')}</label>
          <input id="sheet-name" className="input-field mt-1.5" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        </div>
        <ul className="space-y-2">
          {editing.items.map((it, i) => (
            <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <input aria-label={t('haccp.itemLabel')} className="input-field !py-1.5 min-w-[10rem] flex-1" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
              <select aria-label={t('haccp.itemKind')} className="input-field !w-auto !py-1.5" value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value as ChecklistItem['kind'] })}>
                <option value="check">{t('haccp.kindCheck')}</option>
                <option value="temperature">{t('haccp.kindTemperature')}</option>
              </select>
              {it.kind === 'temperature' && (
                <>
                  <input aria-label={t('haccp.min')} placeholder={t('haccp.min')} inputMode="decimal" className="input-field !w-20 !py-1.5" defaultValue={it.min ?? ''} onBlur={(e) => setItem(i, { min: num(e.target.value) })} />
                  <input aria-label={t('haccp.max')} placeholder={t('haccp.max')} inputMode="decimal" className="input-field !w-20 !py-1.5" defaultValue={it.max ?? ''} onBlur={(e) => setItem(i, { max: num(e.target.value) })} />
                </>
              )}
              <button type="button" aria-label={t('common.delete')} onClick={() => setEditing({ ...editing, items: editing.items.filter((_, j) => j !== i) })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setEditing({ ...editing, items: [...editing.items, { id: crypto.randomUUID(), label: '', kind: 'check' }] })} className="text-xs font-semibold text-primary-ink hover:underline">
          + {t('haccp.addItem')}
        </button>
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => setEditing(null)} className="cta-button-secondary !py-2 !px-4">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="cta-button !py-2 !px-4">{t('common.save')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="card-glass divide-y divide-border">
        {templates.map((tpl) => (
          <li key={tpl.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{tpl.name}</span>
              <span className="block text-xs text-muted-foreground">{t('haccp.itemsCount').replace('{count}', String(tpl.items.length))}</span>
            </span>
            <button type="button" onClick={() => setEditing({ id: tpl.id, name: tpl.name, items: tpl.items })} className="text-xs font-semibold text-primary-ink hover:underline">{t('common.edit')}</button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(t('haccp.archiveConfirm'))) return;
                const r = await archiveChecklistTemplate(tpl.id);
                if (!r.success) toast.error(translateError(language, r.error)); else onChanged();
              }}
              className="text-xs font-medium text-muted-foreground hover:text-danger"
            >
              {t('haccp.archive')}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setEditing({ name: '', items: [{ id: crypto.randomUUID(), label: '', kind: 'check' }] })} className="cta-button-secondary !py-2 !px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />{t('haccp.newSheet')}
      </button>
    </div>
  );
}
