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
  }
}
