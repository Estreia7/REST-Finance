import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Client-safe error handling.
 *
 * Raw `error.message` must never reach the browser: Prisma errors name tables,
 * columns and constraints, and third-party SDK errors can expose internals of
 * how a request was processed. These helpers log the real error server-side and
 * return a safe message to the caller.
 *
 * What comes back is a translation KEY, not a sentence. A server action has no
 * React context and so cannot call `t()`, and the language belongs to the
 * reader, not to the request: returning Portuguese here is what left English
 * users with Portuguese toasts. The component resolves the key when it shows
 * the message. `translateError` in `lib/error-messages.ts` does that, and falls
 * back to showing an unrecognised string as-is so nothing is ever swallowed.
 */

/** Generic fallbacks, keyed by the kind of operation that failed. */
const MESSAGES = {
  read: 'errors.read',
  write: 'errors.write',
  delete: 'errors.delete',
  auth: 'errors.auth',
  generic: 'errors.generic',
} as const;

export type ErrorKind = keyof typeof MESSAGES;

/**
 * Errors deliberately written for the user. These ARE safe to surface, because
 * we authored them — unlike anything thrown by Prisma, Stripe or the runtime.
 */
export class UserFacingError extends Error {
  readonly userFacing = true;

  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/**
 * Logs `err` with its context and returns a message safe to send to the client.
 *
 * @param context  Where the failure happened, e.g. 'updateCostEntry'. Server log only.
 * @param err      The caught error. Never returned verbatim.
 * @param kind     Which generic fallback to use.
 */
export function toClientError(context: string, err: unknown, kind: ErrorKind = 'generic'): string {
  // Deliberate, already-safe messages pass through unchanged. They are the
  // app telling the owner something it meant to say — "this file is not the
  // right report" — not a fault, so nothing is reported.
  if (err instanceof UserFacingError) {
    console.error(`[${context}]`, err.message);
    return err.message;
  }

  console.error(`[${context}]`, err);

  // An owner who hits a broken screen does not file a bug report, so the app
  // files it for them. Deliberately not awaited: the caller owes the owner an
  // answer now, and a slow database must not make a handled error feel like a
  // hang. `reportFault` never rejects, so there is nothing to catch here.
  const fault = currentFault();
  if (fault) {
    void import('@/lib/fault-report').then(({ reportFault }) =>
      reportFault({ ...fault, context, error: err }),
    );
  }

  return MESSAGES[kind];
}

/**
 * Who the current failure belongs to.
 *
 * `toClientError` is called from every server action and knows nothing about
 * the request, so the action tells it beforehand with `withFaultReporting`.
 * Without that, a fault is logged but not ticketed — which is the right
 * default for code paths that have no owner to attribute one to.
 */
type FaultOwner = { restaurantId: string; userId: string };

/**
 * Per-request storage, not a module-level variable.
 *
 * A plain variable is wrong here and quietly so: two owners submitting at the
 * same time both suspend at their first `await`, and whichever resumes last
 * overwrites the other's identity. Every fault then gets filed against the
 * wrong restaurant — worse than not filing it at all, because the record
 * looks authoritative. `AsyncLocalStorage` keeps a value bound to the async
 * call chain that set it, which is exactly the guarantee needed.
 */
const faultOwner = new AsyncLocalStorage<FaultOwner>();

function currentFault(): FaultOwner | null {
  return faultOwner.getStore() ?? null;
}

/**
 * Attributes any fault raised inside `run` to this restaurant and user.
 *
 * A server action wraps its own body, so a failure is filed against the owner
 * who actually hit it. Without a wrapper a fault is still logged but not
 * ticketed, which is the right default for code paths with no owner to
 * attribute one to — a webhook, a cron, sign-in.
 */
export async function withFaultReporting<T>(owner: FaultOwner, run: () => Promise<T>): Promise<T> {
  return faultOwner.run(owner, run);
}

/** Shorthand for the common `{ error }` server-action return shape. */
export function errorResult(context: string, err: unknown, kind: ErrorKind = 'generic') {
  return { error: toClientError(context, err, kind) };
}

/** A Prisma known-request error, narrowed from `unknown` without casting. */
type PrismaKnownError = {
  code: string;
  meta?: { target?: string[] | string };
};

function isPrismaError(err: unknown): err is PrismaKnownError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

/**
 * True when `err` is a Prisma unique-constraint violation (P2002), optionally
 * on a specific field. Lets callers turn a duplicate key into a helpful
 * message ("this email is already registered") without touching `any`.
 */
export function isUniqueConstraintError(err: unknown, field?: string): boolean {
  if (!isPrismaError(err) || err.code !== 'P2002') return false;
  if (!field) return true;

  const target = err.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return false;
}
