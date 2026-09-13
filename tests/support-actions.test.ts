import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The support flow, exercised against a stubbed database.
 *
 * What matters here is not the SQL but the rules around it: that an owner can
 * only ever read their own restaurant's tickets, that a flood of unanswered
 * requests is refused, and that a ticket cannot be closed without the person
 * waiting ever being told anything.
 */

const db = {
  supportTicket: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

const auth = {
  requireMember: vi.fn(),
  requireAdmin: vi.fn(),
  isAuthError: (r: unknown) => typeof r === 'object' && r !== null && 'error' in r,
};

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth-helpers', () => ({
  requireMember: (...a: unknown[]) => auth.requireMember(...a),
  requireAdmin: (...a: unknown[]) => auth.requireAdmin(...a),
  isAuthError: (r: unknown) => auth.isAuthError(r),
}));

const MEMBER = { userId: 'u1', email: 'owner@r.pt', restaurantId: 'r1', role: 'OWNER' as const };
const ADMIN = { userId: 'admin1', email: 'admin@r.pt' };

const actions = await import('@/app/dashboard/support-actions');

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireMember.mockResolvedValue(MEMBER);
  auth.requireAdmin.mockResolvedValue(ADMIN);
  db.supportTicket.count.mockResolvedValue(0);
  db.supportTicket.create.mockResolvedValue({ id: 't1' });
  db.supportTicket.update.mockResolvedValue({ id: 't1' });
  db.supportTicket.findMany.mockResolvedValue([]);
});

describe('getMyTickets', () => {
  it('only ever reads the caller\u2019s own restaurant', async () => {
    await actions.getMyTickets();
    const where = db.supportTicket.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ restaurantId: 'r1' });
  });

  it('refuses when not signed in', async () => {
    auth.requireMember.mockResolvedValue({ error: 'errors.auth' });
    const r = await actions.getMyTickets();
    expect(r).toEqual({ error: 'errors.auth' });
    expect(db.supportTicket.findMany).not.toHaveBeenCalled();
  });
});

describe('createTicket', () => {
  const good = { subject: 'Nao consigo lancar', message: 'Da erro ao guardar', category: 'PROBLEM' };

  it('files the ticket against the caller\u2019s restaurant and user', async () => {
    const r = await actions.createTicket(good);
    expect(r).toEqual({ success: true });
    expect(db.supportTicket.create.mock.calls[0][0].data).toMatchObject({
      restaurantId: 'r1', userId: 'u1', category: 'PROBLEM',
    });
  });

  it('rejects an empty subject or message', async () => {
    expect(await actions.createTicket({ ...good, subject: '   ' })).toEqual({ error: 'support.errors.empty' });
    expect(await actions.createTicket({ ...good, message: '' })).toEqual({ error: 'support.errors.empty' });
    expect(db.supportTicket.create).not.toHaveBeenCalled();
  });

  it('falls back to a question rather than trusting an unknown category', async () => {
    await actions.createTicket({ ...good, category: 'NONSENSE' });
    expect(db.supportTicket.create.mock.calls[0][0].data.category).toBe('QUESTION');
  });

  it('stops a flood of unanswered requests', async () => {
    db.supportTicket.count.mockResolvedValue(5);
    expect(await actions.createTicket(good)).toEqual({ error: 'support.errors.tooMany' });
    expect(db.supportTicket.create).not.toHaveBeenCalled();
  });

  it('counts only requests still awaiting an answer', async () => {
    await actions.createTicket(good);
    expect(db.supportTicket.count.mock.calls[0][0].where).toEqual({
      restaurantId: 'r1', status: { in: ['OPEN', 'IN_PROGRESS'] },
    });
  });
});

describe('replyToTicket', () => {
  it('requires an administrator', async () => {
    auth.requireAdmin.mockResolvedValue({ error: 'errors.auth' });
    expect(await actions.replyToTicket({ ticketId: 't1', reply: 'hi', status: 'RESOLVED' }))
      .toEqual({ error: 'errors.auth' });
    expect(db.supportTicket.update).not.toHaveBeenCalled();
  });

  it('will not close a ticket the owner was never answered on', async () => {
    db.supportTicket.findUnique.mockResolvedValue({ reply: null });
    expect(await actions.replyToTicket({ ticketId: 't1', status: 'RESOLVED' }))
      .toEqual({ error: 'support.errors.replyRequired' });
    expect(db.supportTicket.update).not.toHaveBeenCalled();
  });

  it('closes it when an answer is supplied now', async () => {
    db.supportTicket.findUnique.mockResolvedValue({ reply: null });
    const r = await actions.replyToTicket({ ticketId: 't1', reply: 'Ja corrigimos', status: 'RESOLVED' });
    expect(r).toEqual({ success: true });
    const data = db.supportTicket.update.mock.calls[0][0].data;
    expect(data.status).toBe('RESOLVED');
    expect(data.reply).toBe('Ja corrigimos');
    expect(data.repliedById).toBe('admin1');
  });

  it('closes it when an answer was given earlier', async () => {
    db.supportTicket.findUnique.mockResolvedValue({ reply: 'answered last week' });
    expect(await actions.replyToTicket({ ticketId: 't1', status: 'RESOLVED' })).toEqual({ success: true });
  });

  it('can pick a ticket up without answering it yet', async () => {
    db.supportTicket.findUnique.mockResolvedValue({ reply: null });
    expect(await actions.replyToTicket({ ticketId: 't1', status: 'IN_PROGRESS' })).toEqual({ success: true });
    // No reply written, so none of the reply fields should be touched.
    expect(db.supportTicket.update.mock.calls[0][0].data.reply).toBeUndefined();
  });

  it('rejects a status it does not recognise', async () => {
    expect(await actions.replyToTicket({ ticketId: 't1', status: 'DELETED' }))
      .toEqual({ error: 'support.errors.badStatus' });
  });

  it('reports a ticket that is gone rather than throwing', async () => {
    db.supportTicket.findUnique.mockResolvedValue(null);
    expect(await actions.replyToTicket({ ticketId: 'nope', status: 'IN_PROGRESS' }))
      .toEqual({ error: 'support.errors.notFound' });
  });
});
