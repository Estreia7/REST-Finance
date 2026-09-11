'use client';

import { SessionProvider as AuthSessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

/**
 * Makes the Auth.js session available to client components via useSession().
 *
 * Thin wrapper so the root layout, which is a server component, does not have
 * to be marked 'use client' just to mount a provider.
 */
export default function SessionProvider({ children }: { children: ReactNode }) {
  return <AuthSessionProvider>{children}</AuthSessionProvider>;
}
