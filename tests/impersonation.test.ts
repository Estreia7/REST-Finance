import { describe, it, expect } from 'vitest';
import {
  ticketIdentifier, parseTicketIdentifier, impersonationExpired, IMPERSONATION_MINUTES, TICKET_SECONDS,
} from '@/lib/impersonation';

describe('support access tickets', () => {
  it('round-trips who is going in and as whom', () => {
    const id = ticketIdentifier('admin-1', 'user-2');
    expect(parseTicketIdentifier(id)).toEqual({ adminId: 'admin-1', targetUserId: 'user-2' });
  });

  it('refuses identifiers that are not support tickets', () => {
    // The verification-token table also holds e-mail verification rows.
    expect(parseTicketIdentifier('daniel@example.pt')).toBeNull();
    expect(parseTicketIdentifier('impersonate:only-one')).toBeNull();
    expect(parseTicketIdentifier('impersonate:a:b:c')).toBeNull();
    expect(parseTicketIdentifier('impersonate::b')).toBeNull();
  });

  it('keeps tickets short-lived and sessions to an hour', () => {
    expect(TICKET_SECONDS).toBeLessThanOrEqual(60);
    expect(IMPERSONATION_MINUTES).toBe(60);
  });
});

describe('impersonationExpired', () => {
  const now = 1_000_000;
  it('is live until its time, and over from then on', () => {
    expect(impersonationExpired(now + 1, now)).toBe(false);
    expect(impersonationExpired(now, now)).toBe(true);
    expect(impersonationExpired(now - 1, now)).toBe(true);
  });

  it('treats a missing expiry as expired, never as forever', () => {
    expect(impersonationExpired(undefined, now)).toBe(true);
    expect(impersonationExpired(null, now)).toBe(true);
  });
});
