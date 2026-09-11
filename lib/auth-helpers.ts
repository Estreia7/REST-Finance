import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

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
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: 'Sessão expirada. Por favor, faça login novamente.', requiresAuth: true };
  }

  return { userId: user.id, email: user.email! };
}

export async function requireOwner(): Promise<OwnerResult | AuthError> {
  const auth = await requireAuth();
  if ('error' in auth) return auth;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: auth.userId,
      role: 'OWNER',
      active: true,
    },
    // See requireMember: an owner of several restaurants must resolve to the
    // same one on every request, not an arbitrary row.
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    return { error: 'Sem permissão de proprietário' };
  }

  return {
    userId: auth.userId,
    email: auth.email,
    restaurantId: membership.restaurantId,
    membershipId: membership.id,
  };
}

export async function requireMember(): Promise<MemberResult | AuthError> {
  const auth = await requireAuth();
  if ('error' in auth) return auth;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: auth.userId,
      role: { in: ['OWNER', 'STAFF'] },
      active: true,
    },
    // Deterministic selection: without an explicit order, a user belonging to
    // more than one restaurant would be scoped to whichever row Postgres
    // happened to return first, and could see a different one per request.
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  if (!membership) {
    return { error: 'Sem acesso ao restaurante' };
  }

  return {
    userId: auth.userId,
    email: auth.email,
    restaurantId: membership.restaurantId,
    role: membership.role as 'OWNER' | 'STAFF',
  };
}

export function isAuthError(result: unknown): result is AuthError {
  return typeof result === 'object' && result !== null && 'error' in result;
}
