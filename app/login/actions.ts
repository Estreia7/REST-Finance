'use server';

import { AuthError } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { signIn, signOut } from '@/lib/auth-config';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';

/**
 * Sign-in actions.
 *
 * Authentication is local (Auth.js + Postgres). Email confirmation is not
 * enforced during the private beta, since accounts are created by an admin
 * after an access request, so the address has already been seen.
 */

/** Where this user belongs after signing in. */
export async function checkUserRole(userId: string) {
  try {
    const adminMembership = await prisma.membership.findFirst({
      where: { userId, role: 'PLATFORM_ADMIN', active: true },
      select: { id: true },
    });

    if (adminMembership) return { role: 'PLATFORM_ADMIN' as const, redirectTo: '/admin' };

    const membership = await prisma.membership.findFirst({
      where: { userId, role: { in: ['OWNER', 'STAFF'] }, active: true },
      select: { role: true },
    });

    if (!membership) {
      return { error: 'A tua conta ainda não tem acesso a nenhum restaurante.' };
    }

    return { role: membership.role, redirectTo: '/dashboard' };
  } catch (error: unknown) {
    return { error: toClientError('Failed to resolve role', error, 'read') };
  }
}

export async function getCurrentUserRole() {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return { error: authResult.error };
    return checkUserRole(authResult.userId);
  } catch (error: unknown) {
    return { error: toClientError('Failed to resolve role', error, 'read') };
  }
}

/**
 * Email and password sign-in.
 *
 * Auth.js throws a redirect on success, so `redirect: false` is used and the
 * caller decides where to go based on the role.
 */
export async function loginWithPassword(email: string, password: string) {
  const normalised = email.trim().toLowerCase();

  // Resolve the destination BEFORE signing in. signIn() sets the session
  // cookie on the outgoing response, but auth() reads the incoming request,
  // which still has no cookie: reading the session here would always fail on
  // a first login even though the sign-in itself succeeded.
  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: { id: true },
  });

  try {
    await signIn('credentials', {
      email: normalised,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // One message for both a wrong password and an unknown address, so the
      // form cannot be used to discover which emails are registered.
      return { error: 'Email ou palavra-passe incorretos.' };
    }
    throw error;
  }

  // signIn() did not throw, so the credentials were valid and the user row
  // exists. Fall back to the dashboard if the role lookup is inconclusive
  // rather than failing a sign-in that has already happened.
  if (!user) return { success: true, redirectTo: '/dashboard' };

  const role = await checkUserRole(user.id);
  if ('error' in role) return { success: true, redirectTo: '/dashboard' };

  return { success: true, redirectTo: role.redirectTo };
}

export async function logout() {
  await signOut({ redirect: false });
  return { success: true };
}
