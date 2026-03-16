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

export async function requireMember(): Promise<(AuthResult & { restaurantId: string }) | AuthError> {
  const auth = await requireAuth();
  if ('error' in auth) return auth;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: auth.userId,
      role: { in: ['OWNER', 'STAFF'] },
      active: true,
    },
  });

  if (!membership) {
    return { error: 'Sem acesso ao restaurante' };
  }

  return {
    userId: auth.userId,
    email: auth.email,
    restaurantId: membership.restaurantId,
  };
}

export function isAuthError(result: unknown): result is AuthError {
  return typeof result === 'object' && result !== null && 'error' in result;
}
