import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSetting, SETTING_KEYS } from '@/lib/settings';

/**
 * Authentication.
 *
 * Replaces Supabase Auth, whose project no longer exists. Identity now lives
 * in this database alongside everything else, so there is no external service
 * that can disappear and lock every client out.
 *
 * Two ways in:
 *   - Google, for the one-click sign-in people expect.
 *   - Email and password, for owners who prefer it and for accounts created
 *     from the admin console.
 *
 * Both resolve to the same User row, matched on email. Roles are NOT stored in
 * the session: they are read from the memberships table on every request, so
 * revoking access takes effect immediately rather than when a token expires.
 */

/**
 * Google credentials come from the database when an administrator has entered
 * them, falling back to the environment.
 *
 * The whole config is built per request (Auth.js accepts a function), so
 * credentials saved in the admin console take effect immediately. Reading
 * them at module load would require a restart after every change.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const [googleId, googleSecret] = await Promise.all([
    getSetting(SETTING_KEYS.googleClientId),
    getSetting(SETTING_KEYS.googleClientSecret),
  ]);

  return {
    adapter: PrismaAdapter(prisma),

    session: {
      // Auth.js supports the Credentials provider only with JWT sessions, so
      // the token carries identity and nothing else. Roles and membership are
      // still read from the database on every request (lib/auth-helpers.ts),
      // which is what makes deactivating a member take effect immediately
      // rather than when their token expires.
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      updateAge: 24 * 60 * 60, // refresh at most once a day
    },

    pages: {
      signIn: '/login',
      error: '/login',
    },

    providers: [
      // Registered only when configured, so an unconfigured Google button
      // cannot send people to a broken consent screen.
      ...(googleId && googleSecret
        ? [
            Google({
              clientId: googleId,
              clientSecret: googleSecret,
              // Google verifies the address, so an existing account with that
              // email is the same person and is linked rather than duplicated.
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : []),

      Credentials({
        name: 'credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Palavra-passe', type: 'password' },
        },
        async authorize(raw) {
          const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
          const password = typeof raw?.password === 'string' ? raw.password : '';
          if (!email || !password) return null;

          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, image: true, passwordHash: true },
          });

          // Compare against a dummy hash when the account is missing or has no
          // password, so the response takes the same time either way and does
          // not reveal which addresses are registered.
          const hash =
            user?.passwordHash ??
            '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidixx';

          const ok = await bcrypt.compare(password, hash);
          if (!ok || !user?.passwordHash) return null;

          return { id: user.id, email: user.email, name: user.name, image: user.image };
        },
      }),
    ],

    callbacks: {
      /**
       * Google verifies the address, so an existing account with that email is
       * the same person. Linking here means signing in with Google after
       * registering with a password reaches the same account rather than
       * creating a duplicate with no restaurant attached.
       */
      async signIn({ user, account }) {
        if (account?.provider !== 'google') return true;
        if (!user.email) return false;

        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true },
        });

        // The adapter links by email when the account is new; nothing else to do.
        return Boolean(existing) || true;
      },

      // With a JWT strategy the adapter does not populate `user`, so the id is
      // carried on the token instead.
      async jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },

      async session({ session, token }) {
        if (!session.user || !token.sub) return session;

        session.user.id = token.sub;

        // Read the role on each session fetch rather than baking it into the
        // token: a revoked admin loses the flag immediately, and the UI needs
        // it to send platform admins to /admin instead of a restaurant
        // dashboard they do not have.
        const membership = await prisma.membership.findFirst({
          where: { userId: token.sub, active: true },
          orderBy: { role: 'asc' },
          select: { role: true },
        });

        session.user.role = membership?.role ?? null;
        return session;
      },
    },

    // Auth.js needs an absolute URL behind a reverse proxy to build callbacks.
    trustHost: true,
  };
});
