'use server';

import { prisma } from '@/lib/prisma';
import { requireMember, requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';

/**
 * Support requests.
 *
 * An owner sees only their own restaurant's tickets, and an administrator sees
 * every one: the queue is the whole point of the admin side. Both directions go
 * through the auth helpers rather than trusting an id from the client, so a
 * forged restaurant or ticket id cannot read someone else's conversation.
 */

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 2000;
const REPLY_MAX = 2000;

type Category = 'QUESTION' | 'PROBLEM' | 'SUGGESTION' | 'BILLING';
type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

const CATEGORIES: Category[] = ['QUESTION', 'PROBLEM', 'SUGGESTION', 'BILLING'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

/** The tickets this restaurant has raised, newest first. */
export async function getMyTickets() {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const tickets = await prisma.supportTicket.findMany({
      where: { restaurantId: member.restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, subject: true, message: true, category: true, status: true,
        reply: true, repliedAt: true, createdAt: true,
      },
    });

    return { success: true, data: tickets };
  } catch (error: unknown) {
    return { error: toClientError('Failed to list support tickets', error, 'read') };
  }
}

/** Raises a request against the restaurant the owner is currently looking at. */
export async function createTicket(input: {
  subject: string;
  message: string;
  category: string;
}) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const subject = input.subject.trim();
    const message = input.message.trim();

    if (!subject || !message) return { error: 'support.errors.empty' };
    if (subject.length > SUBJECT_MAX) return { error: 'support.errors.subjectLong' };
    if (message.length > MESSAGE_MAX) return { error: 'support.errors.messageLong' };

    const category = CATEGORIES.includes(input.category as Category)
      ? (input.category as Category)
      : 'QUESTION';

    // One open request at a time per restaurant. Someone who hears nothing back
    // tends to send the same thing three times, which buries the queue rather
    // than getting them an answer any sooner.
    const openCount = await prisma.supportTicket.count({
      where: { restaurantId: member.restaurantId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (openCount >= 5) return { error: 'support.errors.tooMany' };

    await prisma.supportTicket.create({
      data: {
        restaurantId: member.restaurantId,
        userId: member.userId,
        subject,
        message,
        category,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to create support ticket', error, 'write') };
  }
}

/** Every ticket, for the administrator's queue. Open ones first. */
export async function getAllTickets() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const tickets = await prisma.supportTicket.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, subject: true, message: true, category: true, status: true,
        reply: true, repliedAt: true, createdAt: true,
        restaurant: { select: { id: true, name: true } },
        user: { select: { email: true, name: true } },
      },
    });

    return { success: true, data: tickets };
  } catch (error: unknown) {
    return { error: toClientError('Failed to list all support tickets', error, 'read') };
  }
}

/**
 * Answers a ticket, or moves it along without one.
 *
 * A reply is optional so a request can be picked up ("we are on it") before
 * there is anything to say, but resolving without ever writing one leaves the
 * owner with no answer, so that is refused.
 */
export async function replyToTicket(input: {
  ticketId: string;
  reply?: string;
  status: string;
}) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    if (!STATUSES.includes(input.status as Status)) {
      return { error: 'support.errors.badStatus' };
    }
    const status = input.status as Status;

    const reply = input.reply?.trim() || undefined;
    if (reply && reply.length > REPLY_MAX) return { error: 'support.errors.replyLong' };

    const existing = await prisma.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { reply: true },
    });
    if (!existing) return { error: 'support.errors.notFound' };

    if (status === 'RESOLVED' && !reply && !existing.reply) {
      return { error: 'support.errors.replyRequired' };
    }

    await prisma.supportTicket.update({
      where: { id: input.ticketId },
      data: {
        status,
        ...(reply
          ? { reply, repliedAt: new Date(), repliedById: admin.userId }
          : {}),
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to reply to support ticket', error, 'write') };
  }
}
