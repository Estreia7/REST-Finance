'use client';

import Link from 'next/link';
import { Check, ArrowRight, Zap, Star, Crown } from 'lucide-react';

export default function PlansPage() {
  const plans = [
    {
      name: 'Free Trial',
      description: 'Perfeito para experimentar todas as funcionalidades',
      price: 'Grátis',
      period: '14 dias',
      icon: Zap,
      features: [
        'Acesso completo a todas as funcionalidades',
        'Até 1 restaurante',
        'KPIs em tempo real',
        'Funciona offline',
        'Suporte por email',
        '14 dias de teste grátis',
      ],
      cta: 'Começar Teste Grátis',
      popular: false,
      gradient: 'from-muted to-muted/50',
    },
    {
      name: 'REST Finance Standard',
      description: 'Ideal para restaurantes individuais',
      price: '€29',
      period: 'por mês',
      icon: Star,
      features: [
        'Tudo do Free Trial',
        'Até 2 restaurantes',
        'Relatórios avançados',
        'Exportação de dados',
        'Suporte prioritário',
        'Atualizações automáticas',
        'Backup automático',
      ],
      cta: 'Começar Agora',
      popular: true,
      gradient: 'from-primary to-accent',
    },
    {
      name: 'REST Finance Pro',
      description: 'Para restaurantes que querem o máximo',
      price: '€79',
      period: 'por mês',
      icon: Crown,
      features: [
        'Tudo do Standard',
        'Restaurantes ilimitados',
        'API de integração',
        'Análises preditivas',
        'Suporte 24/7',
        'Gestor de conta dedicado',
        'Treinamento personalizado',
        'Relatórios personalizados',
      ],
      cta: 'Contactar Vendas',
      popular: false,
      gradient: 'from-accent to-primary',
    },
  ];

  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              Escolha o <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Plano</span> Ideal
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Planos flexíveis para restaurantes de todos os tamanhos. Comece grátis e atualize quando precisar.
            </p>
          </section>

          {/* Plans Grid */}
          <section className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <div
                  key={index}
                  className={`card p-8 space-y-6 relative ${
                    plan.popular
                      ? 'border-primary/50 border-2 scale-105 md:scale-110'
                      : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="px-4 py-1 bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-bold rounded-full">
                        Mais Popular
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                      <Icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                      <p className="text-muted-foreground text-sm">{plan.description}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      {plan.period && (
                        <span className="text-muted-foreground">/{plan.period}</span>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.name === 'Free Trial' ? '/register' : '/contact'}
                    className={`w-full block text-center py-3 px-6 rounded-lg font-semibold transition-all duration-300 ${
                      plan.popular
                        ? 'cta-button'
                        : 'cta-button-secondary'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="inline-block ml-2 w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </section>

          {/* FAQ Section */}
          <section className="card p-8 md:p-12 space-y-6">
            <h2 className="text-3xl font-bold text-center mb-8">Perguntas Frequentes</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Posso mudar de plano depois?</h3>
                <p className="text-muted-foreground">
                  Sim! Pode atualizar ou fazer downgrade do seu plano a qualquer momento. 
                  As alterações serão aplicadas no próximo ciclo de faturação.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">O que acontece após o período de teste?</h3>
                <p className="text-muted-foreground">
                  Após os 14 dias de teste grátis, pode escolher um dos nossos planos pagos 
                  ou cancelar sem compromisso. Não cobramos nada se decidir não continuar.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Os dados são seguros?</h3>
                <p className="text-muted-foreground">
                  Absolutamente. Todos os dados são criptografados e armazenados de forma segura. 
                  Fazemos backups regulares e nunca partilhamos os seus dados com terceiros.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Preciso de cartão de crédito para o teste?</h3>
                <p className="text-muted-foreground">
                  Não! O teste de 14 dias é completamente grátis e não requer cartão de crédito. 
                  Só pedimos os seus dados de pagamento se decidir continuar após o período de teste.
                </p>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="text-center space-y-6">
            <h2 className="text-3xl font-bold">Ainda tem dúvidas?</h2>
            <p className="text-lg text-muted-foreground">
              A nossa equipa está pronta para ajudar. Entre em contacto e responderemos todas as suas questões.
            </p>
            <Link
              href="/contact"
              className="cta-button-secondary inline-flex items-center gap-2"
            >
              Falar com Vendas
              <ArrowRight className="w-5 h-5" />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
