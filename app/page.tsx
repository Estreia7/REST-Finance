'use client';

import { 
  TrendingUp, 
  Smartphone, 
  BarChart3, 
  Clock, 
  Shield,
  Mail,
  Phone,
  MapPin,
  Zap,
  CheckCircle2,
  ArrowRight,
  Star,
  Timer,
  Users,
  DollarSign
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <main className="flex-1 overflow-hidden pt-16 md:pt-20">
      {/* Hero Section - Ultra Impactante */}
      <section className="relative container py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 blur-3xl opacity-50"></div>
        <div className={`relative max-w-5xl mx-auto text-center space-y-8 ${isVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-medium mb-4 animate-fade-in">
            <Timer className="w-4 h-4" />
            <span>Oferta de Lançamento - Apenas 50 vagas disponíveis</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Pare de Perder Tempo
            </span>
            <br />
            <span className="text-foreground">com Planilhas</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            <strong className="text-foreground">Gerencie suas finanças em 2 minutos por dia.</strong> 
            {' '}KPIs em tempo real, sem internet, sem complicação. 
            <span className="text-primary font-semibold"> Feito para restaurantes que não têm tempo a perder.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button className="cta-button group">
              Começar Agora - Grátis
              <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="cta-button-secondary">
              Ver Demonstração
            </button>
          </div>

          <div className="flex items-center justify-center gap-8 pt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span>Sem cartão de crédito</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span>Setup em 5 minutos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span>Suporte 24/7</span>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof - Estatísticas Impactantes */}
      <section className="container py-16 border-t border-border/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="text-center space-y-2 group">
            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
              2,847+
            </div>
            <div className="text-sm text-muted-foreground font-medium">Restaurantes Ativos</div>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-2">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span>4.9/5 avaliação</span>
            </div>
          </div>
          <div className="text-center space-y-2 group">
            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
              $12.4M
            </div>
            <div className="text-sm text-muted-foreground font-medium">Receita Rastreada</div>
            <div className="text-xs text-success mt-2">+127% este mês</div>
          </div>
          <div className="text-center space-y-2 group">
            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
              98.2%
            </div>
            <div className="text-sm text-muted-foreground font-medium">Tempo de Atividade</div>
            <div className="text-xs text-success mt-2">Zero downtime</div>
          </div>
          <div className="text-center space-y-2 group">
            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
              15min
            </div>
            <div className="text-sm text-muted-foreground font-medium">Economia Diária</div>
            <div className="text-xs text-primary mt-2">Por restaurante</div>
          </div>
        </div>
      </section>

      {/* Problema vs Solução - Persuasivo */}
      <section className="container py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Você está <span className="text-danger">perdendo dinheiro</span> todos os dias
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Enquanto você perde horas com planilhas, seus concorrentes já estão tomando decisões baseadas em dados
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="card p-8 space-y-6 border-danger/30 bg-danger/5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-danger/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-danger" />
                </div>
                <h3 className="text-2xl font-bold text-danger">O Problema</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-danger mt-1">✗</span>
                  <span className="text-muted-foreground">2-3 horas por semana perdidas com planilhas</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-danger mt-1">✗</span>
                  <span className="text-muted-foreground">Dados desatualizados quando você mais precisa</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-danger mt-1">✗</span>
                  <span className="text-muted-foreground">Erros de cálculo custando caro</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-danger mt-1">✗</span>
                  <span className="text-muted-foreground">Sem acesso quando não há internet</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-danger mt-1">✗</span>
                  <span className="text-muted-foreground">Decisões baseadas em "achismo"</span>
                </li>
              </ul>
            </div>

            <div className="card p-8 space-y-6 border-primary/50 bg-primary/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/30 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-primary">A Solução REST Finance</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">2 minutos por dia. Ponto final.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">KPIs atualizados em tempo real, sempre</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">Cálculos automáticos, zero erros</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">Funciona offline, sincroniza depois</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">Decisões baseadas em dados reais</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <button className="cta-button text-lg px-12 py-5">
              Quero Economizar Tempo Agora
              <ArrowRight className="inline-block ml-2 w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Features - Foco em Benefícios */}
      <section className="container py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Tudo que você precisa. <span className="text-primary">Nada que você não precisa.</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Recursos poderosos, interface simples. Feito para quem não tem tempo para aprender sistemas complexos.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">KPIs em Tempo Real</h3>
              <p className="text-muted-foreground leading-relaxed">
                Veja receita, custos e lucro <strong className="text-foreground">agora mesmo</strong>, não amanhã. 
                Cálculos instantâneos, zero espera.
              </p>
            </div>

            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Smartphone className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Funciona Sem Internet</h3>
              <p className="text-muted-foreground leading-relaxed">
                Seu restaurante não para quando cai a internet. <strong className="text-foreground">Você também não precisa parar.</strong>
              </p>
            </div>

            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <BarChart3 className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Insights que Valem Ouro</h3>
              <p className="text-muted-foreground leading-relaxed">
                Descubra padrões, identifique oportunidades e <strong className="text-foreground">aumente sua margem de lucro</strong> com dados reais.
              </p>
            </div>

            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Clock className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Economize 15 Minutos/Dia</h3>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">7 horas por mês</strong> que você pode usar para o que realmente importa: 
                seu negócio.
              </p>
            </div>

            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Seus Dados Protegidos</h3>
              <p className="text-muted-foreground leading-relaxed">
                Criptografia de ponta a ponta. <strong className="text-foreground">Seus números financeiros são só seus.</strong>
              </p>
            </div>

            <div className="card p-6 space-y-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Rápido como um Flash</h3>
              <p className="text-muted-foreground leading-relaxed">
                Interface otimizada. <strong className="text-foreground">Respostas instantâneas.</strong> 
                Sem travamentos, sem espera.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Urgência e Escassez */}
      <section className="container py-20 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="card p-12 text-center space-y-8 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border-primary/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-primary/5 to-accent/5 opacity-50"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-danger/20 border border-danger/30 text-danger text-sm font-bold mb-4 animate-pulse-slow">
                <Timer className="w-4 h-4" />
                <span>OFERTA LIMITADA</span>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Últimas <span className="text-primary">47 vagas</span> disponíveis
              </h2>
              
              <p className="text-xl text-muted-foreground mb-8">
                Mais de <strong className="text-foreground">2.800 restaurantes</strong> já estão economizando tempo e 
                aumentando lucros. <span className="text-primary font-semibold">Não fique de fora.</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button className="cta-button text-lg px-12 py-5 group">
                  Garantir Minha Vaga Agora
                  <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground mt-6">
                ✓ Teste grátis por 14 dias • ✓ Cancele quando quiser • ✓ Sem compromisso
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contato - Persuasivo */}
      <section className="container py-20 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">Fale Conosco</h2>
            <p className="text-xl text-muted-foreground">
              Nossa equipe está pronta para ajudar você a <span className="text-primary font-semibold">transformar sua gestão financeira</span>
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card p-8 text-center space-y-4 group hover:border-primary/50 transition-all">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <Phone className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-lg">Telefone</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Vendas</p>
                  <a href="tel:+1-555-234-5678" className="text-primary hover:text-accent font-semibold text-lg transition-colors block">
                    +1 (555) 234-5678
                  </a>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Suporte</p>
                  <a href="tel:+1-555-234-5679" className="text-primary hover:text-accent font-semibold text-lg transition-colors block">
                    +1 (555) 234-5679
                  </a>
                </div>
              </div>
            </div>

            <div className="card p-8 text-center space-y-4 group hover:border-primary/50 transition-all">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-lg">Email</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Geral</p>
                  <a href="mailto:hello@restfinance.com" className="text-primary hover:text-accent font-semibold text-sm break-all transition-colors block">
                    hello@restfinance.com
                  </a>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Suporte</p>
                  <a href="mailto:support@restfinance.com" className="text-primary hover:text-accent font-semibold text-sm break-all transition-colors block">
                    support@restfinance.com
                  </a>
                </div>
              </div>
            </div>

            <div className="card p-8 text-center space-y-4 group hover:border-primary/50 transition-all">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-lg">Escritório</h3>
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  1247 Market Street<br />
                  Suite 450<br />
                  San Francisco, CA 94102<br />
                  United States
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final - Máxima Urgência */}
      <section className="container py-20 border-t border-border/50">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold">
            Pronto para <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">revolucionar</span> sua gestão?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Junte-se a milhares de restaurantes que já estão <strong className="text-foreground">economizando tempo e aumentando lucros</strong> todos os dias.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button className="cta-button text-lg px-12 py-5 group">
              Começar Teste Grátis Agora
              <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="cta-button-secondary text-lg px-12 py-5">
              Agendar Demonstração
            </button>
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            ✓ 14 dias grátis • ✓ Sem cartão de crédito • ✓ Setup em 5 minutos
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="container py-12 border-t border-border/50 mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-4">
              <h3 className="font-bold text-lg">REST Finance</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A forma moderna de gerenciar KPIs de restaurantes. Rápido, offline e feito para quem não tem tempo a perder.
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Recursos</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Preços</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Demonstração</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Atualizações</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Empresa</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Sobre</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Carreiras</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contato</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Suporte</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Central de Ajuda</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Documentação</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">API</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Status</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2024 REST Finance. Todos os direitos reservados.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
              <a href="#" className="hover:text-primary transition-colors">Termos</a>
              <a href="#" className="hover:text-primary transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
