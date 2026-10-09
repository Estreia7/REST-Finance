import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { TICKET_SECONDS, ticketIdentifier, parseTicketIdentifier } from './impersonation';

/**
 * One-use tickets for support access, kept in the verification-token table.
 *
 * Only the hash is stored, so a database dump holds nothing that signs anyone
 * in. Redeeming deletes the row first and checks it after, so a ticket cannot
 * be used twice even by two requests racing.
 *
 * Not server actions: they trust the ids they are given. Callers check them.
 */

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function issueTicket(adminId: string, targetUserId: string): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: {
      identifier: ticketIdentifier(adminId, targetUserId),
      token: hash(raw),
      expires: new Date(Date.now() + TICKET_SECONDS * 1000),
    },
  });
  return raw;
}

export async function redeemTicket(raw: string): Promise<{ adminId: string; targetUserId: string } | null> {
  if (!raw || typeof raw !== 'string') return null;
  const deleted = await prisma.verificationToken
    .delete({ where: { token: hash(raw) } })
    .catch(() => null);
  if (!deleted || deleted.expires.getTime() < Date.now()) return null;
  return parseTicketIdentifier(deleted.identifier);
}

/** Whether a user is an active platform administrator right now. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { userId, role: 'PLATFORM_ADMIN', active: true },
    select: { id: true },
  });
  return Boolean(membership);
}
