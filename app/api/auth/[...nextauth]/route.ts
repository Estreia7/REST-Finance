// Auth.js mounts its own endpoints here: sign-in, callback, session, sign-out.
import { handlers } from '@/lib/auth-config';

export const { GET, POST } = handlers;
