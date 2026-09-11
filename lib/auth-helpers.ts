import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';

/**
 * Authorisation helpers.
 *
 * Every server action and route handler goes through one of these rather than
 * querying memberships inline. The signatures are unchanged from the Supabase
 * implementation so call sites did not have to move; only the session lookup
 * underneath is different.
 *
 * Roles are read fresh from the database on each call, never from the session,
 * so deactivating a member takes effect on their next request.
 */

interface AuthResult {
  userId: string;
  email: string;
}

interface OwnerResult extends AuthResult {
  restaurantId: string;
  membershipId: string;
}

interface MemberResult extends AuthResult {
  restaurantId: string;
  role: 'OWNER' | 'STAFF';
}

type AuthError = { error: string; requiresAuth?: boolean };

export async function requireAuth(): Promise<AuthResult | AuthError> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Sessão expirada. Por favor, faça login novamente.', requiresAuth: true };
  }

  return { userId: session.user.id, email: session.user.email ?? '' };
}

export async function requireOwner(): Promise<OwnerResult | AuthError> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const membership = await prisma.membership.findFirst({
    where: { userId: authResult.userId, role: 'OWNER', active: true },
    // Deterministic: an owner of several restaurants must resolve to the same
    // one on every request, not an arbitrary row.
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    return { error: 'Sem permissão de proprietário' };
  }

  return {
    userId: authResult.userId,
    email: authResult.email,
    restaurantId: membership.restaurantId,
    membershipId: membership.id,
  };
}

export async function requireMember(): Promise<MemberResult | AuthError> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const membership = await prisma.membership.findFirst({
    where: { userId: authResult.userId, role: { in: ['OWNER', 'STAFF'] }, active: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  if (!membership) {
    return { error: 'Sem acesso ao restaurante' };
  }

  return {
    userId: authResult.userId,
    email: authResult.email,
    restaurantId: membership.restaurantId,
    role: membership.role as 'OWNER' | 'STAFF',
  };
}

/** Platform administrator. Checked independently of any restaurant. */
export async function requireAdmin(): Promise<AuthResult | AuthError> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const membership = await prisma.membership.findFirst({
    where: { userId: authResult.userId, role: 'PLATFORM_ADMIN', active: true },
    select: { id: true },
  });

  if (!membership) {
    return { error: 'Sem permissões de administrador' };
  }

  return authResult;
}

export function isAuthError(result: unknown): result is AuthError {
  return typeof result === 'object' && result !== null && 'error' in result;
}
