/**
 * Client-safe error handling.
 *
 * Raw `error.message` must never reach the browser: Prisma errors name tables,
 * columns and constraints, and third-party SDK errors can expose internals of
 * how a request was processed. These helpers log the real error server-side and
 * return a generic Portuguese message to the caller.
 */

/** Generic fallbacks, keyed by the kind of operation that failed. */
const MESSAGES = {
  read: 'Não foi possível carregar os dados. Tenta novamente.',
  write: 'Não foi possível guardar as alterações. Tenta novamente.',
  delete: 'Não foi possível eliminar. Tenta novamente.',
  auth: 'Sessão inválida. Inicia sessão novamente.',
  generic: 'Ocorreu um erro. Tenta novamente.',
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
  // Deliberate, already-safe messages pass through unchanged.
  if (err instanceof UserFacingError) {
    console.error(`[${context}]`, err.message);
    return err.message;
  }

  console.error(`[${context}]`, err);
  return MESSAGES[kind];
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
