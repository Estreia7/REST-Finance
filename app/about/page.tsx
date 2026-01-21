'use client';

import Link from 'next/link';
import { Target, Users, Zap, Heart, ArrowRight } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-12 md:py-20">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              Sobre <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Nós</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Somos uma equipa apaixonada por ajudar restaurantes a prosperar através de dados e tecnologia.
            </p>
          </section>

          {/* Missão */}
          <section className="card p-8 md:p-12 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <Target className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-3xl font-bold">A Nossa Missão</h2>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Acreditamos que cada restaurante merece ter acesso a ferramentas profissionais de gestão financeira, 
              sem a complexidade e o custo elevado das soluções tradicionais. O REST Finance foi criado para 
              democratizar o acesso a KPIs de qualidade, permitindo que restaurantes de todos os tamanhos tomem 
              decisões baseadas em dados reais.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Sabemos que gerir um restaurante é desafiante. Entre cozinha, atendimento, gestão de equipa e 
              operações diárias, sobra pouco tempo para análise financeira detalhada. Por isso, criámos uma 
              solução que funciona em <strong className="text-foreground">2 minutos por dia</strong>, sem 
              necessidade de internet constante, e com uma interface tão simples que qualquer membro da equipa 
              pode usar.
            </p>
          </section>

          {/* Valores */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center">Os Nossos Valores</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="card p-6 space-y-4 text-center">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Simplicidade</h3>
                <p className="text-muted-foreground">
                  Acreditamos que as melhores ferramentas são aquelas que você realmente usa. 
                  Por isso, priorizamos a simplicidade em tudo o que fazemos.
                </p>
              </div>

              <div className="card p-6 space-y-4 text-center">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Paixão</h3>
                <p className="text-muted-foreground">
                  Somos apaixonados por restaurantes e pela indústria da restauração. 
                  Cada funcionalidade é pensada com o seu negócio em mente.
                </p>
              </div>

              <div className="card p-6 space-y-4 text-center">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Apoio</h3>
                <p className="text-muted-foreground">
                  O seu sucesso é o nosso sucesso. Estamos aqui para apoiá-lo em cada passo, 
                  com suporte dedicado e recursos que realmente fazem a diferença.
                </p>
              </div>
            </div>
          </section>

          {/* História */}
          <section className="card p-8 md:p-12 space-y-6">
            <h2 className="text-3xl font-bold">A Nossa História</h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                O REST Finance nasceu da frustração de ver restaurantes a perderem tempo e dinheiro 
                com planilhas complexas e sistemas caros que não atendiam às suas necessidades reais.
              </p>
              <p className="text-lg">
                Depois de trabalhar diretamente com dezenas de restaurantes, percebemos que o problema 
                não era a falta de dados, mas sim a falta de uma ferramenta que transformasse esses dados 
                em insights acionáveis de forma rápida e simples.
              </p>
              <p className="text-lg">
                Hoje, mais de <strong className="text-foreground">2.800 restaurantes</strong> confiam no 
                REST Finance para gerir os seus KPIs diários. E estamos apenas no início. A nossa visão é 
                tornar o REST Finance a plataforma de referência para gestão financeira de restaurantes em 
                todo o mundo.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="card p-8 md:p-12 text-center space-y-6 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border-primary/30">
            <h2 className="text-3xl font-bold">Junte-se a Nós</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Está pronto para transformar a gestão financeira do seu restaurante? 
              Comece hoje mesmo e veja a diferença que dados reais podem fazer.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/plans"
                className="cta-button inline-flex items-center justify-center gap-2"
              >
                Ver Planos
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/contact"
                className="cta-button-secondary inline-flex items-center justify-center gap-2"
              >
                Falar Conosco
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
