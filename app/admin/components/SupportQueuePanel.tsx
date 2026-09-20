'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Loader2, LifeBuoy, RefreshCw, Send, ChevronDown,
  CheckCircle2, Clock, CircleDot, Building2, Mail,
} from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getAllTickets, replyToTicket } from '@/app/dashboard/support-actions';

/**
 * The administrator's queue.
 *
 * One card per request, with the client's own words in full: a support queue
 * that truncates the message makes you open every ticket to find out which one
 * matters. The reply box is collapsed until it is needed, so a queue of twenty
 * still reads as a list rather than twenty forms.
 */

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  reply: string | null;
  repliedAt: Date | string | null;
  createdAt: Date | string;
  restaurant: { id: string; name: string };
  user: { email: string; name: string | null };
  /** The real error, on a SYSTEM ticket. Never sent to the owner's own list. */
  technical?: string | null;
  /** How many times this same fault happened. */
  occurrences?: number;
  lastSeenAt?: Date | string | null;
}

/** Same iconography and colours as the client's panel, so both sides read alike. */
const STATUS_STYLE: Record<string, { icon: typeof Clock; className: string }> = {
  OPEN: { icon: CircleDot, className: 'text-muted-foreground' },
  IN_PROGRESS: { icon: Clock, className: 'text-warning' },
  RESOLVED: { icon: CheckCircle2, className: 'text-success' },
};

interface SupportQueuePanelProps {
  /** Keeps the sidebar badge honest after a reply changes a status. */
  onOpenCountChange?: (count: number) => void;
}

export default function SupportQueuePanel({ onOpenCountChange }: SupportQueuePanelProps) {
  const { t, language } = useLanguage();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(true);

  /** Which ticket has its reply box open. One at a time. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState('');
  const [draftStatus, setDraftStatus] = useState<Status>('IN_PROGRESS');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getAllTickets();
    if (result.success && result.data) setTickets(result.data as Ticket[]);
    else if (result.error) toast.error(translateError(language, result.error));
    setLoading(false);
  }, [language]);

  useEffect(() => { void load(); }, [load]);

  const openCount = useMemo(
    () => tickets.filter((tk) => tk.status !== 'RESOLVED').length,
    [tickets],
  );

  useEffect(() => { onOpenCountChange?.(openCount); }, [openCount, onOpenCountChange]);

  const visible = useMemo(
    () => (onlyOpen ? tickets.filter((tk) => tk.status !== 'RESOLVED') : tickets),
    [tickets, onlyOpen],
  );

  const dateFmt = (d: Date | string) =>
    new Date(d).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  const startEditing = (ticket: Ticket) => {
    setEditingId(ticket.id);
    setDraftReply(ticket.reply ?? '');
    // A ticket nobody has touched moves to "in progress" by default, because
    // opening the reply box is exactly the moment it stopped being untouched.
    setDraftStatus(
      STATUSES.includes(ticket.status as Status) ? (ticket.status as Status) : 'OPEN',
    );
  };

  const save = async (ticket: Ticket) => {
    setSaving(true);
    const result = await replyToTicket({
      ticketId: ticket.id,
      reply: draftReply.trim() || undefined,
      status: draftStatus,
    });
    if (result.success) {
      toast.success(t('supportAdmin.saved'));
      setEditingId(null);
      setDraftReply('');
      await load();
    } else {
      toast.error(translateError(language, result.error));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" aria-hidden="true" />
            {t('supportAdmin.title')}
            {openCount > 0 && (
              <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                {openCount} {t('supportAdmin.openCount')}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('supportAdmin.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('supportAdmin.filterLabel')}</span>
            <select
              value={onlyOpen ? 'open' : 'all'}
              onChange={(e) => setOnlyOpen(e.target.value === 'open')}
              className="input-field !py-1.5 text-xs"
            >
              <option value="open">{t('supportAdmin.filterOpen')}</option>
              <option value="all">{t('supportAdmin.filterAll')}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            aria-label={t('supportAdmin.refresh')}
            title={t('supportAdmin.refresh')}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Queue */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('supportAdmin.loading')}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card-glass rounded-2xl text-center py-16 px-4">
          <LifeBuoy className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {tickets.length === 0 ? t('supportAdmin.empty') : t('supportAdmin.emptyFiltered')}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((ticket) => {
            const style = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.OPEN;
            const Icon = style.icon;
            const editing = editingId === ticket.id;

            // The server refuses to resolve a ticket that has never had a
            // reply. Mirrored here so the button is unavailable rather than
            // the person discovering the rule through a failed save.
            const wouldResolveUnanswered =
              draftStatus === 'RESOLVED' && !draftReply.trim() && !ticket.reply;

            return (
              <li key={ticket.id} className="card-glass rounded-2xl p-4 sm:p-5">
                {/* Who and what */}
                <div className="flex items-start gap-3">
                  <Icon
                    className={`w-4 h-4 mt-1 shrink-0 ${style.className}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-semibold text-sm text-foreground break-words">
                        {ticket.subject}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {t(`support.categories.${ticket.category}`)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 min-w-0">
                        <Building2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate font-medium text-foreground">
                          {ticket.restaurant.name}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {ticket.user.name || t('supportAdmin.unnamedUser')} · {ticket.user.email}
                        </span>
                      </span>
                      <span>
                        {t('supportAdmin.raisedOn')} {dateFmt(ticket.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Status, in words as well as colour */}
                  <span className={`text-[11px] font-semibold shrink-0 ${style.className}`}>
                    {t(`support.status.${ticket.status}`)}
                  </span>
                </div>

                {/* The request itself, in full */}
                <div className="mt-3 rounded-xl border border-border-subtle p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                    {t('supportAdmin.messageLabel')}
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                    {ticket.category === 'SYSTEM'
                      ? t('support.systemTicketBody')
                      : ticket.message}
                  </p>
                </div>

                {/* What actually broke. Only on a fault the app raised itself,
                    and only ever here — the owner's own list does not select
                    this column. */}
                {ticket.technical && (
                  <div className="mt-2 rounded-xl bg-destructive/5 border border-destructive/20 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-[11px] font-semibold text-destructive">
                        {t('supportAdmin.technicalLabel')}
                      </p>
                      {(ticket.occurrences ?? 1) > 1 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive tabular-nums">
                          {t('supportAdmin.occurrences').replace('{n}', String(ticket.occurrences))}
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap
                                    break-all max-h-48 overflow-y-auto">
                      {ticket.technical}
                    </pre>
                  </div>
                )}

                {/* The answer already sent, if any */}
                {ticket.reply && (
                  <div className="mt-2 rounded-xl bg-muted/60 p-3">
                    <p className="text-[11px] font-semibold text-foreground mb-1">
                      {t('supportAdmin.currentReply')}
                      {ticket.repliedAt && (
                        <span className="font-normal text-muted-foreground">
                          {' '}· {dateFmt(ticket.repliedAt)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                      {ticket.reply}
                    </p>
                  </div>
                )}

                {/* Reply */}
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => startEditing(ticket)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('supportAdmin.openReply')}
                  </button>
                ) : (
                  <div className="mt-3 space-y-3 border-t border-border-subtle pt-3">
                    <div>
                      <label
                        htmlFor={`reply-${ticket.id}`}
                        className="text-xs text-muted-foreground block mb-1.5"
                      >
                        {t('supportAdmin.replyLabel')}
                      </label>
                      <textarea
                        id={`reply-${ticket.id}`}
                        value={draftReply}
                        onChange={(e) => setDraftReply(e.target.value)}
                        maxLength={2000}
                        rows={4}
                        placeholder={t('supportAdmin.replyPlaceholder')}
                        className="input-field !py-2 w-full resize-y"
                      />
                      <span className="text-[11px] text-muted-foreground mt-1 block">
                        {draftReply.length}/2000
                        {ticket.reply ? ` · ${t('supportAdmin.replyEdit')}` : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[10rem]">
                        <label
                          htmlFor={`status-${ticket.id}`}
                          className="text-xs text-muted-foreground block mb-1.5"
                        >
                          {t('supportAdmin.statusLabel')}
                        </label>
                        <select
                          id={`status-${ticket.id}`}
                          value={draftStatus}
                          onChange={(e) => setDraftStatus(e.target.value as Status)}
                          className="input-field !py-2 w-full"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{t(`support.status.${s}`)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void save(ticket)}
                          disabled={saving || wouldResolveUnanswered}
                          className="cta-button disabled:opacity-40"
                        >
                          {saving
                            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            : <Send className="w-4 h-4" aria-hidden="true" />}
                          {saving ? t('supportAdmin.saving') : t('supportAdmin.save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setDraftReply(''); }}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          {t('supportAdmin.closeReply')}
                        </button>
                      </div>
                    </div>

                    {/* Says why saving is unavailable, rather than leaving a
                        greyed-out button with no explanation. */}
                    {wouldResolveUnanswered && (
                      <p role="status" className="text-xs text-warning">
                        {t('supportAdmin.needsReplyToResolve')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
