import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import type { Language } from '@/lib/translations';

/**
 * Which language to render this request in, decided on the server.
 *
 * Resolving on the client was what produced the flash: the page was rendered
 * in Portuguese, hydrated, and only then switched, so an English user watched
 * the whole dashboard change under them on every load. Everything here runs
 * before the first byte, so the markup is right the first time.
 *
 * The order matters, and follows one rule: once signed in, the account decides.
 *
 *   1. The signed-in account's saved language. A choice made on one phone is
 *      the same choice on the next one, which is the point of storing it.
 *   2. The cookie, for visitors with no account — the landing page lets anyone
 *      switch, and that has to survive a page load.
 *   3. Accept-Language, so a browser asking for English is not shown
 *      Portuguese on the very first visit.
 *   4. Portuguese, the default for the landing page.
 */

export const LANGUAGE_COOKIE = 'rf_language';

export function isLanguage(value: unknown): value is Language {
  return value === 'pt' || value === 'en';
}

/** The language the browser is asking for, unvalidated. */
export function readLanguageCookie(): Language | null {
  const value = cookies().get(LANGUAGE_COOKIE)?.value?.trim();
  return isLanguage(value) ? value : null;
}

/**
 * The first supported language the browser asks for.
 *
 * Parsed rather than matched loosely, so "en-GB" counts as English but
 * "pt-BR" does not accidentally read as English because it contains no "en".
 */
export function preferredFromHeader(headerValue: string | null): Language | null {
  if (!headerValue) return null;

  const tags = headerValue
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((t) => t.tag && !Number.isNaN(t.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const base = tag.split('-')[0];
    if (base === 'pt' || base === 'en') return base;
  }
  return null;
}

/**
 * The language for the current request.
 *
 * Safe to call on any server component: a signed-out visitor simply skips the
 * account lookup. A missing user row or an unreadable session falls through to
 * the cookie rather than failing the render.
 */
export async function getServerLanguage(): Promise<Language> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { language: true },
      });
      if (isLanguage(user?.language)) return user.language;
    }
  } catch {
    // An auth or database hiccup must not take the page down: fall through to
    // the cookie, which is good enough to render with.
  }

  const fromCookie = readLanguageCookie();
  if (fromCookie) return fromCookie;

  const fromHeader = preferredFromHeader(headers().get('accept-language'));
  if (fromHeader) return fromHeader;

  return 'pt';
}
