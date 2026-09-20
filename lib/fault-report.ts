import { prisma } from '@/lib/prisma';

/**
 * Putting a client-side failure in front of the administrator.
 *
 * An owner who hits a broken screen does not file a bug report. They try
 * again, shrug, and stop trusting the number — and nobody finds out until
 * they cancel. So when something fails for them, the app raises the ticket
 * itself, in the same queue as the ones they write by hand.
 *
 * ── What the owner sees, and what the administrator sees ─────────────────
 * The ticket carries two texts. `message` is written for the owner, because
 * it appears in their own support list: plain, brief, no blame. `technical`
 * is the real error and where it came from, which is what actually gets it
 * fixed — and which must never reach the browser, since Prisma errors name
 * tables and columns and an SDK error can describe how a request was handled.
 *
 * ── Why it can never throw ───────────────────────────────────────────────
 * This runs inside error handling. If reporting a failure could itself fail
 * loudly, one broken query would become two, and the owner would get a
 * crash instead of the graceful message the original handler was about to
 * send. Everything here is wrapped and swallowed.
 */

/** Longest technical detail kept. Enough for a stack, short of a novel. */
const TECHNICAL_MAX = 4000;

/** Faults closer together than this are treated as the same incident. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A cap per restaurant per day, so a screen failing in a loop cannot bury
 * the queue under a thousand identical rows. Once it is hit, the existing
 * ticket keeps counting occurrences but no new ones are opened.
 */
const MAX_NEW_PER_DAY = 20;

export interface FaultContext {
  restaurantId: string;
  userId: string;
  /** Where it happened, e.g. 'commitPosImport'. Groups repeats. */
  context: string;
  /** The caught error. Never sent to the browser. */
  error: unknown;
}

/**
 * Records a fault as a support ticket, or bumps the one already open for it.
 *
 * Returns nothing and never rejects: callers are error handlers, and their
 * job is to answer the owner, not to wait on this.
 */
export async function reportFault(ctx: FaultContext): Promise<void> {
  try {
    const technical = describe(ctx.error, ctx.context);
    const subject = subjectFor(ctx.context);

    // The same fault in the same place for the same restaurant is one
    // incident. Matching on subject rather than the full technical text,
    // because the detail often carries an id that differs every time.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await prisma.supportTicket.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        category: 'SYSTEM',
        subject,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        createdAt: { gte: since },
      },
      select: { id: true, occurrences: true },
    });

    if (existing) {
      await prisma.supportTicket.update({
        where: { id: existing.id },
        data: {
          occurrences: existing.occurrences + 1,
          lastSeenAt: new Date(),
          // Kept fresh: the newest occurrence is usually the one with the
          // most relevant detail.
          technical,
        },
      });
      return;
    }

    const todayCount = await prisma.supportTicket.count({
      where: {
        restaurantId: ctx.restaurantId,
        category: 'SYSTEM',
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
    });
    if (todayCount >= MAX_NEW_PER_DAY) return;

    await prisma.supportTicket.create({
      data: {
        restaurantId: ctx.restaurantId,
        userId: ctx.userId,
        category: 'SYSTEM',
        status: 'OPEN',
        subject,
        // Written for the owner, who sees this in their own support list.
        // A translation key rather than a sentence: the reader's language is
        // theirs, not the server's.
        message: 'support.systemTicketBody',
        technical,
        lastSeenAt: new Date(),
      },
    });
  } catch (err) {
    // The report failed. Log it and move on — the caller still owes the
    // owner an answer, and a failure to file a ticket must not become the
    // error they see.
    console.error('[reportFault] could not record fault', err);
  }
}

/**
 * A stable one-line subject per place a fault can happen.
 *
 * Derived from the context rather than the message, so the same broken
 * screen groups together even when the underlying error text varies.
 */
function subjectFor(context: string): string {
  return `Falha automática: ${context}`;
}

/** The error, flattened to text an administrator can act on. */
function describe(error: unknown, context: string): string {
  const parts: string[] = [`context: ${context}`];

  if (error instanceof Error) {
    parts.push(`${error.name}: ${error.message}`);
    // A Prisma error carries a code that says what went wrong far more
    // precisely than its message does.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') parts.push(`code: ${code}`);
    if (error.stack) parts.push(error.stack);
  } else {
    parts.push(String(error));
  }

  return parts.join('\n').slice(0, TECHNICAL_MAX);
}
