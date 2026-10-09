import type { MembershipRole } from '@prisma/client';
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** Highest active membership role, refreshed on every session read. */
      role: MembershipRole | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    /**
     * Set when an administrator is signed in as this user for support
     * (lib/impersonation.ts): who they really are, and when it ends.
     */
    impersonation?: { adminId: string; expiresAt: number } | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    impersonatedBy?: string;
    impersonationExpires?: number;
  }
}
