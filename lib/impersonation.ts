/**
 * Support access: an administrator signed in as a client, to see what they see.
 *
 * How it works, and why it is shaped this way:
 *
 * - The administrator presses a button in the console; nothing is a link. A
 *   link is a bearer secret that works for whoever holds it, and would let a
 *   forwarded message open a client's books. The button only works inside a
 *   live admin session.
 * - The button's server action writes a one-use ticket, good for a minute,
 *   and signs in with it at once through a dedicated Auth.js provider. The
 *   ticket never leaves the server.
 * - The session it produces carries who is really behind it, and ends on its
 *   own after an hour. A banner says so on every screen, with the way back.
 * - Every entry and exit is in the activity log, with who and when. The client
 *   is not asked: that was the owner's decision on 2026-10-09, recorded here
 *   so it can be revisited (Restaurant.adminAccessEnabled exists for consent).
 * - Settings that belong to the person, not the restaurant — password, name,
 *   picture, language, the walkthrough, billing — are refused while in.
 *
 * Pure helpers here; the database side is in impersonation-server.ts.
 */

/** How long a support session lasts before it ends by itself. */
export const IMPERSONATION_MINUTES = 60;

/** How long a ticket can wait to be redeemed. It is redeemed at once. */
export const TICKET_SECONDS = 60;

const PREFIX = 'impersonate:';

/** The ticket's identifier: who is going in, and as whom. */
export function ticketIdentifier(adminId: string, targetUserId: string): string {
  return `${PREFIX}${adminId}:${targetUserId}`;
}

export function parseTicketIdentifier(identifier: string): { adminId: string; targetUserId: string } | null {
  if (!identifier.startsWith(PREFIX)) return null;
  const [adminId, targetUserId, ...rest] = identifier.slice(PREFIX.length).split(':');
  if (!adminId || !targetUserId || rest.length > 0) return null;
  return { adminId, targetUserId };
}

/** Whether a support session has run its course. Missing means expired. */
export function impersonationExpired(expiresAt: number | undefined | null, now: number = Date.now()): boolean {
  return typeof expiresAt !== 'number' || now >= expiresAt;
}

/** The error key returned by anything a support session may not change. */
export const IMPERSONATION_REFUSED = 'errors.impersonating';
