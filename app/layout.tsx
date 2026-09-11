import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import ConditionalNavbar from './components/ConditionalNavbar';
import { LanguageProvider } from '@/lib/language-context';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme-context';
import { Toaster } from 'sonner';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rest-finance.bruno-dev.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'REST Finance — Controla as finanças do teu restaurante',
    template: '%s · REST Finance',
  },
  description:
    'Receitas, custos e margens do teu restaurante em tempo real. Prime Cost, food cost e lucro líquido calculados automaticamente — sem Excel.',
  applicationName: 'REST Finance',
  openGraph: {
    type: 'website',
    locale: 'pt_PT',
    url: SITE_URL,
    siteName: 'REST Finance',
    title: 'REST Finance — Controla as finanças do teu restaurante',
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
    <html lang="pt" className="h-full" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint so the page never
            flashes the wrong one. Must stay blocking and inline. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <div className="flex min-h-screen flex-col">
              <ConditionalNavbar />
              {children}
            </div>
          </LanguageProvider>
        </ThemeProvider>
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
