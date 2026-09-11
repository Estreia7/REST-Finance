import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ConditionalNavbar from './components/ConditionalNavbar';
import { LanguageProvider } from '@/lib/language-context';
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
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#10141c' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt"
      className={`h-full ${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint so the page never
            flashes the wrong one. Must stay blocking and inline. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SessionProvider>
        <ThemeProvider>
          <LanguageProvider>
            <div className="flex min-h-screen flex-col">
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
