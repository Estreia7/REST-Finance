import type { ReactNode } from 'react';
import './globals.css';
import ConditionalNavbar from './components/ConditionalNavbar';
import { LanguageProvider } from '@/lib/language-context';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'REST Finance – KPIs para o teu Restaurante em 2 Minutos por Dia',
  description: 'Controla receitas, custos e lucro em tempo real. Sem Excel, sem confusão. Feito para proprietários de restaurantes portugueses. Trial gratuito de 14 dias.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" className="h-full dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <LanguageProvider>
          <div className="flex min-h-screen flex-col">
            <ConditionalNavbar />
            {children}
          </div>
        </LanguageProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'hsl(222 40% 9%)',
              border: '1px solid hsl(222 30% 16%)',
              color: 'hsl(210 40% 96%)',
            },
          }}
        />
      </body>
    </html>
  );
}

