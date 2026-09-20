import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toClientError, withFaultReporting, UserFacingError } from '@/lib/errors';

/**
 * What these guard.
 *
 * A fault raised for one owner must never be filed against another, and the
 * raw error must never leave the server. Both are the kind of mistake that
 * looks fine in testing and is wrong in production, so they are pinned here.
 */

// The reporter is imported lazily inside toClientError, so the mock has to
// stand in for the module rather than the function.
const reported: Array<{ restaurantId: string; userId: string; context: string }> = [];

vi.mock('@/lib/fault-report', () => ({
  reportFault: async (ctx: { restaurantId: string; userId: string; context: string }) => {
    reported.push(ctx);
  },
}));

beforeEach(() => {
  reported.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Lets the lazily-imported reporter run before assertions. */
const settle = () => new Promise((r) => setTimeout(r, 10));

describe('toClientError', () => {
  it('never returns the real error to the caller', async () => {
    const message = toClientError('someAction', new Error('relation "users" does not exist'));

    // A Prisma error names tables and columns. What comes back is a key.
    expect(message).toBe('errors.generic');
    expect(message).not.toContain('users');
  });

  it('passes a message we wrote ourselves straight through', () => {
    const message = toClientError('x', new UserFacingError('import.wrongFormat'));
    expect(message).toBe('import.wrongFormat');
  });

  it('does not raise a ticket for a message we wrote ourselves', async () => {
    // "This file is not the right report" is the app working correctly, not
    // a fault. Ticketing it would bury the queue in normal usage.
    toClientError('x', new UserFacingError('import.wrongFormat'));
    await settle();
    expect(reported).toHaveLength(0);
  });

  it('raises a ticket for an unexpected failure', async () => {
    await withFaultReporting({ restaurantId: 'r1', userId: 'u1' }, async () => {
      toClientError('commitPosImport', new Error('boom'));
    });
    await settle();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      restaurantId: 'r1',
      userId: 'u1',
      context: 'commitPosImport',
    });
  });

  it('files nothing when there is no owner to attribute it to', async () => {
    // A webhook or a cron has no owner. Logged, but not ticketed against
    // whoever happened to be last.
    toClientError('stripeWebhook', new Error('boom'));
    await settle();
    expect(reported).toHaveLength(0);
  });
});

describe('withFaultReporting under concurrency', () => {
  it('attributes each fault to the owner who actually hit it', async () => {
    // The bug this exists to prevent: with a module-level variable, two
    // owners submitting at once both suspend at their first await, and the
    // one that resumes last overwrites the other's identity — so every
    // fault is filed against the wrong restaurant.
    const run = (id: string, delay: number) =>
      withFaultReporting({ restaurantId: id, userId: `u-${id}` }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        toClientError(`action-${id}`, new Error('boom'));
      });

    await Promise.all([run('A', 30), run('B', 10), run('C', 20)]);
    await settle();

    expect(reported).toHaveLength(3);
    for (const entry of reported) {
      // Each report must name the restaurant whose action raised it.
      expect(entry.context, entry.restaurantId).toBe(`action-${entry.restaurantId}`);
      expect(entry.userId).toBe(`u-${entry.restaurantId}`);
    }
  });

  it('restores the previous owner when nesting', async () => {
    await withFaultReporting({ restaurantId: 'outer', userId: 'u-outer' }, async () => {
      await withFaultReporting({ restaurantId: 'inner', userId: 'u-inner' }, async () => {
        toClientError('inner', new Error('boom'));
      });
      toClientError('outer', new Error('boom'));
    });
    await settle();

    expect(reported.map((r) => r.restaurantId)).toEqual(['inner', 'outer']);
  });

  it('still attributes a fault thrown from deep in the call chain', async () => {
    const deep = async () => {
      await new Promise((r) => setTimeout(r, 5));
      toClientError('deep', new Error('boom'));
    };

    await withFaultReporting({ restaurantId: 'r9', userId: 'u9' }, async () => {
      await (async () => deep())();
    });
    await settle();

    expect(reported[0].restaurantId).toBe('r9');
  });
});
