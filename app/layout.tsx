import type { ReactNode } from 'react';
import './globals.css';
import ConditionalNavbar from './components/ConditionalNavbar';
import { LanguageProvider } from '@/lib/language-context';

export const metadata = {
  title: 'REST Finance – Gerencie KPIs em 2 Minutos por Dia | Sem Planilhas',
  description: 'Pare de perder tempo com planilhas. Gerencie receita, custos e lucro em tempo real, sem internet. Feito para restaurantes que não têm tempo a perder. Teste grátis por 14 dias.'
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
      </body>
    </html>
  );
}

