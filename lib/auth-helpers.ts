import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { readActiveRestaurantCookie, resolveActiveRestaurant } from '@/lib/active-restaurant';
import { IMPERSONATION_REFUSED } from '@/lib/impersonation';

/**
 * Authorisation helpers.
 *
 * Every server action and route handler goes through one of these rather than
 * querying memberships inline, so the rules live in one place.
 *
 * Roles are read fresh from the database on each call, never from the session,
 * so deactivating a member takes effect on their next request.
 */

interface AuthResult {
  userId: string;
  email: string;
  /**
   * The administrator behind this session when it is support access
   * (lib/impersonation.ts), or null. Settings that belong to the person are
   * refused while it is set — see refuseWhileImpersonating.
   */
  impersonatedBy: string | null;
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

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    impersonatedBy: session.impersonation?.adminId ?? null,
  };
}

/**
 * Refuses what belongs to the person rather than the restaurant — password,
 * name, picture, billing — while an administrator is signed in as them.
 * Returns the error to send back, or null to carry on.
 */
export function refuseWhileImpersonating(result: { impersonatedBy: string | null }): { success: false; error: string } | null {
  return result.impersonatedBy ? { success: false, error: IMPERSONATION_REFUSED } : null;
}

export async function requireOwner(): Promise<OwnerResult | AuthError> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const memberships = await prisma.membership.findMany({
    where: { userId: authResult.userId, role: 'OWNER', active: true },
    // Deterministic: an owner of several restaurants must resolve to the same
    // one on every request, not an arbitrary row.
    orderBy: { createdAt: 'asc' },
  });

  // The cookie only chooses among restaurants this owner already holds, so a
  // forged value selects nothing they could not already reach.
  const membership = resolveActiveRestaurant(memberships, readActiveRestaurantCookie());

  if (!membership) {
    return { error: 'Sem permissão de proprietário' };
  }

  return {
    userId: authResult.userId,
    email: authResult.email,
    impersonatedBy: authResult.impersonatedBy,
    restaurantId: membership.restaurantId,
    membershipId: membership.id,
  };
}

export async function requireMember(): Promise<MemberResult | AuthError> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const memberships = await prisma.membership.findMany({
    where: { userId: authResult.userId, role: { in: ['OWNER', 'STAFF'] }, active: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  const membership = resolveActiveRestaurant(memberships, readActiveRestaurantCookie());

  if (!membership) {
    return { error: 'Sem acesso ao restaurante' };
  }

  return {
    userId: authResult.userId,
    email: authResult.email,
    impersonatedBy: authResult.impersonatedBy,
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
