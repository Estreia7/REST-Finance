import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ConditionalNavbar from './components/ConditionalNavbar';
import { LanguageProvider } from '@/lib/language-context';
import { getServerLanguage } from '@/lib/server-language';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme-context';
import SessionProvider from './components/SessionProvider';
import { Toaster } from 'sonner';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rest-finance.bruno-dev.xyz';

// Display: a grotesque with enough character to carry headlines without
// reading as a default. Body: Public Sans, chosen for legibility at small
// sizes and full Portuguese diacritic coverage. Mono: for figures, so columns
// of money align.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700', '800'],
});

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'REST Finance: controlo financeiro para restaurantes',
    template: '%s · REST Finance',
  },
  description:
    'Receitas, custos e margens do teu restaurante em tempo real. Prime Cost, food cost e lucro líquido calculados automaticamente. Sem Excel.',
  applicationName: 'REST Finance',
  openGraph: {
    type: 'website',
    locale: 'pt_PT',
    url: SITE_URL,
    siteName: 'REST Finance',
    title: 'REST Finance: controlo financeiro para restaurantes',
    description:
      'Receitas, custos e margens do teu restaurante em tempo real. Sem Excel, sem folhas de cálculo.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'REST Finance',
    description: 'Controla as finanças do teu restaurante em tempo real.',
  },
  robots: { index: true, follow: true },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is a fixed-layout tool with its own bottom bar, not a page to read.
  // A stray pinch on the schedule grid left it zoomed in with no obvious way
  // back, the header cut off and the nav half off-screen. Text is sized for
  // the phone already, so nothing here needs zooming to be legible.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#10141c' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved before the first byte, so the markup is already in the right
  // language rather than rendering Portuguese and switching after hydration.
  const language = await getServerLanguage();

  return (
    <html
      lang={language}
      className={`h-full ${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint so the page never
            flashes the wrong one. Must stay blocking and inline. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="REST Finance" />
        {/*
          `default`, not `black-translucent`. Translucent draws the page
          underneath the status bar, which on a light-first app puts dark
          system text on the off-white background and leaves the top of the
          screen feeling like it belongs to the browser rather than the app.
        */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* iOS ignores the manifest's icons for Add to Home Screen. */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      {/*
        min-h-dvh, not min-h-screen: `vh` on mobile Safari is the height with
        the browser chrome hidden, so a full-height page always overflows by
        the height of the toolbar. That overflow is what makes the first tap
        near the bottom scroll the page and reveal the bar instead of hitting
        the control — the "everything needs two taps" problem.
      */}
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <SessionProvider>
        <ThemeProvider>
          <LanguageProvider initialLanguage={language}>
            <div className="flex min-h-dvh flex-col">
              <ConditionalNavbar />
              {children}
            </div>
          </LanguageProvider>
        </ThemeProvider>
        </SessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'bg-card text-card-foreground border border-border',
          }}
        />
      </body>
    </html>
  );
}
