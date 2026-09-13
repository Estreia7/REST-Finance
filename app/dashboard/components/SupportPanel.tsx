'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, LifeBuoy, Send, CheckCircle2, Clock, CircleDot } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getMyTickets, createTicket } from '../support-actions';

/**
 * Where an owner asks us for help.
 *
 * Past requests sit under the form rather than behind a tab: someone opening
 * this panel has usually come back to see whether their last question was
 * answered, and hiding that behind another click answers nobody.
 */

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  reply: string | null;
  repliedAt: Date | string | null;
  createdAt: Date | string;
}

const CATEGORIES = ['QUESTION', 'PROBLEM', 'SUGGESTION', 'BILLING'] as const;

/** Status colours follow the compliance lamps, so they read the same way. */
const STATUS_STYLE: Record<string, { icon: typeof Clock; className: string }> = {
  OPEN: { icon: CircleDot, className: 'text-muted-foreground' },
  IN_PROGRESS: { icon: Clock, className: 'text-warning' },
  RESOLVED: { icon: CheckCircle2, className: 'text-success' },
};

export default function SupportPanel() {
  const { t, language } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('QUESTION');

  const load = useCallback(() => {
    getMyTickets().then((r) => {
      if (r.success && r.data) setTickets(r.data as Ticket[]);
      else if (r.error) toast.error(translateError(language, r.error));
      setLoading(false);
    });
  }, [language]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setSending(true);
    const result = await createTicket({ subject, message, category });
    if (result.success) {
      toast.success(t('support.sent'));
      setSubject('');
      setMessage('');
      setCategory('QUESTION');
      load();
    } else {
      toast.error(translateError(language, result.error));
    }
    setSending(false);
  };

  const dateFmt = (d: Date | string) =>
    new Date(d).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  return (
    <div className="max-w-3xl space-y-6">
      {/* New request */}
      <div className="card-glass p-6">
        <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" aria-hidden="true" />
          {t('support.title')}
        </h2>
        <p className="text-xs text-muted-foreground mb-5">{t('support.subtitle')}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">{t('support.category')}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field !py-2 w-full"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`support.categories.${c}`)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">{t('support.subject')}</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
                placeholder={t('support.subjectPlaceholder')}
                className="input-field !py-2 w-full"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">{t('support.message')}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              required
              placeholder={t('support.messagePlaceholder')}
              className="input-field !py-2 w-full resize-y"
            />
            <span className="text-[11px] text-muted-foreground mt-1 block">
              {message.length}/2000
            </span>
          </label>

          <button type="submit" disabled={sending} className="cta-button disabled:opacity-40">
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <Send className="w-4 h-4" aria-hidden="true" />}
            {t('support.send')}
          </button>
        </form>
      </div>

      {/* Past requests */}
      <div className="card-glass p-6">
        <h3 className="text-sm font-bold text-foreground mb-4">{t('support.historyTitle')}</h3>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('support.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => {
              const style = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.OPEN;
              const Icon = style.icon;
              return (
                <li key={ticket.id} className="rounded-xl border border-border-subtle p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.className}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold text-sm text-foreground">{ticket.subject}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {t(`support.categories.${ticket.category}`)} · {dateFmt(ticket.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{ticket.message}</p>

                      {ticket.reply && (
                        /* The answer is visually separated rather than appended,
                           so it is obvious at a glance that we replied. */
                        <div className="mt-3 rounded-lg bg-muted/60 p-3">
                          <p className="text-[11px] font-semibold text-foreground mb-1">
                            {t('support.ourReply')}
                            {ticket.repliedAt && (
                              <span className="font-normal text-muted-foreground"> · {dateFmt(ticket.repliedAt)}</span>
                            )}
                          </p>
                          <p className="text-xs text-foreground whitespace-pre-wrap">{ticket.reply}</p>
                        </div>
                      )}
                    </div>

                    <span className={`text-[11px] font-semibold shrink-0 ${style.className}`}>
                      {t(`support.status.${ticket.status}`)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
