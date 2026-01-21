import type { ReactNode } from 'react';
import './globals.css';
import Navbar from './components/Navbar';

export const metadata = {
  title: 'REST Finance – Gerencie KPIs em 2 Minutos por Dia | Sem Planilhas',
  description: 'Pare de perder tempo com planilhas. Gerencie receita, custos e lucro em tempo real, sem internet. Feito para restaurantes que não têm tempo a perder. Teste grátis por 14 dias.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col">
          <Navbar />
          {children}
        </div>
      </body>
    </html>
  );
}

