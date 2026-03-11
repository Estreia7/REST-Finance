'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, BarChart2, Clock, Shield, Wifi, Users,
  CheckCircle2, ArrowRight, ChevronDown, ChevronRight,
  Zap, Target, FileText, Bell, Star, DollarSign,
  UtensilsCrossed, ChefHat, Receipt, PieChart,
  ArrowUpRight, ArrowDownRight, Flame,
} from 'lucide-react';
import AuthModal from './components/AuthModal';
import LanguageSelector from './components/LanguageSelector';
import Tooltip from './components/Tooltip';

// ─── Animated counter hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  const start = useCallback(() => {
    if (started) return;
    setStarted(true);
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
  }, [target, duration, started]);

  return { count, start };
}

// ─── Intersection observer helper ─────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── Typewriter effect ────────────────────────────────────────────────────
function useTypewriter(words: string[], typingSpeed = 100, pauseTime = 2000) {
  const [text, setText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setText(currentWord.substring(0, text.length + 1));
        if (text.length === currentWord.length) {
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      } else {
        setText(currentWord.substring(0, text.length - 1));
        if (text.length === 0) {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
        }
      }
    }, isDeleting ? typingSpeed / 2 : typingSpeed);

    return () => clearTimeout(timeout);
  }, [text, wordIndex, isDeleting, words, typingSpeed, pauseTime]);

  return text;
}

// ─── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ value, suffix, label, icon: Icon }: { value: number; suffix: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const { count, start } = useCountUp(value);
  const { ref, inView } = useInView();
  useEffect(() => { if (inView) start(); }, [inView, start]);
  return (
    <div ref={ref} className="text-center group">
      <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-3 shadow-glow-sm group-hover:shadow-glow transition-all duration-500 group-hover:scale-110">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="text-4xl md:text-5xl font-black tabular-nums gradient-text">
        {count.toLocaleString('pt-PT')}{suffix}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ─── Feature card ──────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, delay = 0 }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  delay?: number;
}) {
  const { ref, inView } = useInView(0.1);
  return (
    <div
      ref={ref}
      className="card-glass p-6 group hover:scale-[1.02]"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.5s ${delay}ms ease-out, transform 0.5s ${delay}ms ease-out`,
      }}
    >
      <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center mb-4 shadow-glow-sm group-hover:shadow-glow group-hover:scale-110 transition-all duration-500">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="font-bold text-foreground mb-2 text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Pricing card ──────────────────────────────────────────────────────────
function PricingCard({ plan, onSelect }: {
  plan: { name: string; price: number; yearlyPrice: number; badge?: string; features: string[]; recommended?: boolean };
  onSelect: () => void;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:scale-[1.02] ${
      plan.recommended
        ? 'glow-border bg-gradient-to-b from-violet-600/10 to-indigo-600/5 scale-[1.02]'
        : 'card-glass'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 text-xs font-bold gradient-bg text-white rounded-full shadow-glow-sm">
            {plan.badge}
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="font-bold text-foreground text-lg mb-1">{plan.name}</h3>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-4xl font-black text-foreground">Grátis</span>
          ) : (
            <>
              <span className="text-4xl font-black text-foreground">€{plan.price}</span>
              <span className="text-muted-foreground text-sm">/mês</span>
            </>
          )}
        </div>
        {plan.price > 0 && (
          <p className="text-xs text-muted-foreground mt-1">ou €{plan.yearlyPrice}/ano — poupa 2 meses</p>
        )}
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        className={plan.recommended ? 'cta-button w-full justify-center' : 'cta-button-secondary w-full justify-center'}
      >
        {plan.price === 0 ? 'Começar grátis' : 'Escolher plano'}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── FAQ item ──────────────────────────────────────────────────────────────
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group"
      >
        <span className="font-medium text-foreground group-hover:text-primary transition-colors text-sm md:text-base">
          {question}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '200px' : '0', opacity: open ? 1 : 0 }}
      >
        <div className="pb-5 text-sm text-muted-foreground leading-relaxed">
          {answer}
        </div>
      </div>
    </div>
  );
}

// ─── Animated revenue ticker ──────────────────────────────────────────────
function RevenueTicker() {
  const [values, setValues] = useState([
    { label: 'Almoço', value: 1240, trend: 8 },
    { label: 'Jantar', value: 2180, trend: 12 },
    { label: 'Take-away', value: 460, trend: -3 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setValues(prev => prev.map(v => ({
        ...v,
        value: v.value + Math.floor(Math.random() * 40 - 15),
        trend: v.trend + (Math.random() * 2 - 1),
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-3">
      {values.map(v => (
        <div key={v.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/5 flex-1 transition-all duration-700">
          <div className="text-[10px] text-muted-foreground mb-1">{v.label}</div>
          <div className="text-sm font-black text-foreground transition-all duration-700">€{v.value.toLocaleString('pt-PT')}</div>
          <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${v.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {v.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {v.trend >= 0 ? '+' : ''}{v.trend.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Animated chart bars ──────────────────────────────────────────────────
function AnimatedBarChart() {
  const { ref, inView } = useInView(0.3);
  const bars = [40, 65, 45, 80, 60, 90, 75];
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  return (
    <div ref={ref} className="bg-white/[0.02] rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Receita Semanal</span>
        <span className="text-[10px] text-green-400 font-semibold">+14% vs semana anterior</span>
      </div>
      <div className="flex items-end justify-between gap-1.5 h-24">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-violet-600/80 to-indigo-500/60 relative group cursor-pointer hover:from-violet-500 hover:to-indigo-400 transition-all duration-300"
            style={{
              height: inView ? `${h}%` : '0%',
              transition: `height 0.8s ${i * 0.1}s cubic-bezier(0.34, 1.56, 0.64, 1)`,
            }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-foreground font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-card-elevated px-1.5 py-0.5 rounded whitespace-nowrap">
              €{(h * 30 + 200).toLocaleString('pt-PT')}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {days.map(d => (
          <span key={d} className="text-[9px] text-muted-foreground flex-1 text-center">{d}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Mock dashboard preview ────────────────────────────────────────────────
function DashboardPreview() {
  return (
    <div className="relative w-full max-w-xl mx-auto mt-12 md:mt-16">
      <div className="absolute inset-0 blur-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/10 rounded-3xl -z-10 scale-110 animate-pulse-slow" />
      <div className="card-glass rounded-2xl overflow-hidden border border-white/8 shadow-modal animate-float" style={{ animationDuration: '8s' }}>
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">REST Finance — Dashboard</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-400">Live</span>
          </div>
        </div>
        <div className="p-5">
          {/* KPI row - animated */}
          <RevenueTicker />
          {/* Mini bar chart - animated */}
          <div className="mt-4">
            <AnimatedBarChart />
          </div>
          {/* Today row */}
          <div className="mt-4 flex items-center justify-between py-3 px-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse-slow" />
              <span className="text-xs font-medium text-foreground">Hoje · €3,880</span>
            </div>
            <span className="text-xs text-green-400 font-semibold">↑ +11% vs ontem</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Floating restaurant icons ─────────────────────────────────────────────
function FloatingIcons() {
  const icons = [
    { Icon: UtensilsCrossed, x: '10%', y: '20%', delay: '0s', size: 'w-5 h-5' },
    { Icon: ChefHat, x: '85%', y: '15%', delay: '1s', size: 'w-6 h-6' },
    { Icon: Receipt, x: '5%', y: '70%', delay: '2s', size: 'w-4 h-4' },
    { Icon: PieChart, x: '90%', y: '65%', delay: '0.5s', size: 'w-5 h-5' },
    { Icon: Flame, x: '15%', y: '45%', delay: '1.5s', size: 'w-4 h-4' },
    { Icon: DollarSign, x: '80%', y: '40%', delay: '2.5s', size: 'w-5 h-5' },
  ];

  return (
    <>
      {icons.map(({ Icon, x, y, delay, size }, i) => (
        <div
          key={i}
          className="absolute text-violet-400/15 animate-float pointer-events-none"
          style={{ left: x, top: y, animationDelay: delay, animationDuration: `${6 + i}s` }}
        >
          <Icon className={size} />
        </div>
      ))}
    </>
  );
}

// ─── How it works step ─────────────────────────────────────────────────────
function HowItWorksStep({ step, title, desc, icon: Icon, delay }: {
  step: string; title: string; desc: string;
  icon: React.ComponentType<{ className?: string }>;
  delay: number;
}) {
  const { ref, inView } = useInView(0.2);
  return (
    <div
      ref={ref}
      className="flex gap-6 md:gap-10 items-start"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateX(0)' : 'translateX(-30px)',
        transition: `all 0.6s ${delay}ms ease-out`,
      }}
    >
      <div className="w-16 h-16 shrink-0 rounded-2xl gradient-bg flex items-center justify-center shadow-glow-sm relative group">
        <Icon className="w-7 h-7 text-white group-hover:scale-110 transition-transform duration-300" />
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-card-elevated border border-white/10 flex items-center justify-center text-xs font-black text-violet-400">
          {step}
        </div>
      </div>
      <div className="pt-2">
        <h3 className="font-bold text-foreground text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Testimonial card with hover ──────────────────────────────────────────
function TestimonialCard({ name, role, quote, delay }: {
  name: string; role: string; quote: string; delay: number;
}) {
  const { ref, inView } = useInView(0.1);
  return (
    <div
      ref={ref}
      className="card-glass p-6 hover:scale-[1.02] transition-all duration-300"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        transition: `all 0.5s ${delay}ms ease-out`,
      }}
    >
      <div className="flex gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
        ))}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6 italic">&ldquo;{quote}&rdquo;</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-sm">
          {name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div className="font-semibold text-foreground text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI card ──────────────────────────────────────────────────────────────
function KPICard({ label, value, desc, color, delay }: {
  label: string; value: string; desc: string; color: string; delay: number;
}) {
  const { ref, inView } = useInView(0.1);
  return (
    <div
      ref={ref}
      className="card-glass p-6 text-center group hover:scale-[1.03] transition-all duration-300"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
        transition: `all 0.5s ${delay}ms ease-out`,
      }}
    >
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-500`}>
        <BarChart2 className="w-6 h-6 text-white" />
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-black text-foreground mb-2">{value}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
function LandingPageInner() {
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab]   = useState<'login' | 'register'>('login');

  const typedWord = useTypewriter(['finanças', 'margem', 'custos', 'lucro', 'receita'], 120, 2000);

  // Open from URL params
  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth === 'login' || auth === 'register') {
      setModalTab(auth);
      setModalOpen(true);
    }
  }, [searchParams]);

  // Open from Navbar custom events
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<'login' | 'register'>).detail;
      setModalTab(tab);
      setModalOpen(true);
    };
    window.addEventListener('open-auth', handler);
    return () => window.removeEventListener('open-auth', handler);
  }, []);

  const openModal = (tab: 'login' | 'register') => {
    setModalTab(tab);
    setModalOpen(true);
  };

  const pricing = [
    {
      name: 'Trial Gratuito',
      price: 0,
      yearlyPrice: 0,
      features: [
        '14 dias sem limitações',
        '1 restaurante',
        'KPIs em tempo real',
        'Exportação CSV',
        'Suporte por email',
      ],
    },
    {
      name: 'Standard',
      price: 29,
      yearlyPrice: 290,
      badge: 'Mais Popular',
      recommended: true,
      features: [
        'Tudo no Trial, sem limite de tempo',
        '1 restaurante',
        'Até 2 colaboradores',
        'Relatórios mensais PDF',
        'Alertas de custo',
        'Metas de receita',
        'Suporte prioritário',
      ],
    },
    {
      name: 'Pro',
      price: 79,
      yearlyPrice: 790,
      features: [
        'Tudo no Standard',
        'Até 3 restaurantes',
        'Colaboradores ilimitados',
        'Comparação ano a ano',
        'API de dados',
        'Gestor de conta dedicado',
      ],
    },
  ];

  const features = [
    { icon: Clock,     title: '2 minutos por dia',    description: 'Introdução rápida de receitas e custos. Sem formulários complexos, sem Excel.' },
    { icon: TrendingUp,title: 'KPIs em tempo real',   description: 'Prime Cost, COGS%, margem líquida — sempre actualizados e fáceis de interpretar.' },
    { icon: Target,    title: 'Metas e alertas',       description: 'Define objectivos mensais e recebe alertas quando os custos excedem o orçamento.' },
    { icon: FileText,  title: 'Relatórios automáticos',description: 'Relatório mensal em PDF gerado automaticamente. Ideal para o teu contabilista.' },
    { icon: Wifi,      title: 'Funciona offline',      description: 'Introduz dados mesmo sem internet. Sincroniza quando ligares novamente.' },
    { icon: Shield,    title: 'Dados em segurança',    description: 'Infraestrutura europeia, backups diários, encriptação end-to-end. RGPD compliant.' },
  ];

  const faqs = [
    { question: 'Preciso de cartão de crédito para o trial?', answer: 'Não. O trial de 14 dias é completamente gratuito e sem cartão de crédito. Só pedimos pagamento se quiseres continuar depois do trial.' },
    { question: 'Os meus dados ficam guardados se cancelar?', answer: 'Sim. Se cancelares a subscrição, os teus dados ficam guardados por 90 dias. Podes exportar tudo em CSV antes de sair.' },
    { question: 'Posso mudar de plano a qualquer momento?', answer: 'Sim. Podes fazer upgrade ou downgrade a qualquer momento. O valor é ajustado proporcionalmente ao tempo restante no ciclo actual.' },
    { question: 'A aplicação funciona em telemóvel?', answer: 'Sim. REST Finance é uma PWA (Progressive Web App) — funciona no browser do telemóvel com suporte offline. Podes adicionar ao ecrã inicial.' },
    { question: 'Posso adicionar colaboradores?', answer: 'No plano Standard podes ter até 2 colaboradores. No plano Pro é ilimitado. Os colaboradores introduzem dados mas não vêem os relatórios financeiros completos.' },
    { question: 'Onde estão os meus dados armazenados?', answer: 'Os dados estão em servidores europeus (Frankfurt, Alemanha), em conformidade com o RGPD. Nunca partilhamos os teus dados com terceiros.' },
  ];

  return (
    <>
      <AuthModal open={modalOpen} onOpenChange={setModalOpen} defaultTab={modalTab} />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center pt-20 pb-16 overflow-hidden">
        <div className="hero-blob w-[700px] h-[700px] bg-violet-600/20 top-[-150px] left-1/2 -translate-x-1/2 animate-pulse-slow" />
        <div className="hero-blob w-[450px] h-[450px] bg-indigo-600/15 bottom-0 right-[-120px] animate-pulse-slow" style={{ animationDelay: '1s' }} />
        <div className="hero-blob w-[300px] h-[300px] bg-violet-800/10 bottom-0 left-[-60px] animate-pulse-slow" style={{ animationDelay: '2s' }} />

        <FloatingIcons />

        <div className="container mx-auto px-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-8 animate-fade-in">
            <UtensilsCrossed className="w-3 h-3 text-violet-400" />
            Feito para restaurantes portugueses
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-foreground mb-6 animate-fade-in-up leading-[1.05]">
            Controla{' '}
            <span className="gradient-text inline-block min-w-[200px] md:min-w-[300px] text-left">
              {typedWord}
              <span className="animate-pulse text-violet-400">|</span>
            </span>
            <br />
            em 2 minutos por dia
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 animate-fade-in-up leading-relaxed" style={{ animationDelay: '100ms' }}>
            O painel financeiro que todo o dono de restaurante precisa.
            <br className="hidden md:block" />
            <Tooltip text="Custo de comida + pessoal em % da receita">Prime Cost</Tooltip>, <Tooltip text="Cost of Goods Sold — custo das matérias-primas">COGS</Tooltip>, <Tooltip text="Lucro real após todos os custos">margem líquida</Tooltip>. Sem Excel. Sem confusão.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <button onClick={() => openModal('register')} className="cta-button text-base px-8 py-3.5 shadow-glow group">
              <ChefHat className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
              Começar grátis — 14 dias
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button onClick={() => openModal('login')} className="cta-button-secondary text-base px-8 py-3.5">
              Já tenho conta
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: '300ms' }}>
            {['Sem cartão de crédito', 'Cancela quando quiseres', 'Dados em Portugal (RGPD)'].map((t, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />{t}
              </span>
            ))}
          </div>

          <DashboardPreview />
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-5 h-5 text-muted-foreground/50" />
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ── */}
      <section className="py-6 border-y border-white/5 bg-white/[0.01] overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-8 text-muted-foreground/40 text-xs font-medium uppercase tracking-wider">
            <span className="flex items-center gap-2"><UtensilsCrossed className="w-4 h-4" /> Tascas</span>
            <span className="hidden sm:block w-px h-4 bg-white/10" />
            <span className="flex items-center gap-2"><Flame className="w-4 h-4" /> Pizzarias</span>
            <span className="hidden sm:block w-px h-4 bg-white/10" />
            <span className="flex items-center gap-2"><ChefHat className="w-4 h-4" /> Fine Dining</span>
            <span className="hidden sm:block w-px h-4 bg-white/10" />
            <span className="hidden md:flex items-center gap-2"><Receipt className="w-4 h-4" /> Cafés</span>
            <span className="hidden md:block w-px h-4 bg-white/10" />
            <span className="hidden md:flex items-center gap-2"><Users className="w-4 h-4" /> Grupos</span>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-20 border-b border-white/5 bg-white/[0.01]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <StatCard value={320}  suffix="+"    label="restaurantes activos" icon={UtensilsCrossed} />
            <StatCard value={12}   suffix="M€"   label="receita monitorizada" icon={TrendingUp} />
            <StatCard value={99}   suffix=".9%"  label="de disponibilidade" icon={Shield} />
            <StatCard value={2}    suffix=" min" label="por dia de entrada" icon={Clock} />
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ── */}
      <section className="py-24 container mx-auto px-4">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
            <BarChart2 className="w-3 h-3 text-violet-400" />
            Antes vs Depois
          </div>
          <h2 className="section-title mb-4">A realidade de gerir um restaurante</h2>
          <p className="section-subtitle mx-auto">Conheces bem esta situação?</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="rounded-2xl p-8 border border-red-500/15 bg-red-500/[0.04] hover:border-red-500/25 transition-all duration-300">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-5 uppercase tracking-wider">
              <span className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <span className="text-lg">😰</span>
              </span>
              Sem REST Finance
            </div>
            <ul className="space-y-3">
              {[
                'Excel com 15 abas impossíveis de manter',
                'Não sabes a tua margem até ao fim do mês',
                'Os custos saem do controlo sem perceberes porquê',
                'Reuniões com o contabilista cheias de surpresas',
                'Tomas decisões de preçário no escuro',
              ].map(p => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="text-red-400 mt-0.5 shrink-0 font-bold">✕</span>{p}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-8 glow-border bg-violet-500/[0.04] hover:shadow-glow transition-all duration-300">
            <div className="flex items-center gap-2 font-bold text-sm mb-5 uppercase tracking-wider">
              <span className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
                <span className="text-lg">🚀</span>
              </span>
              <span className="gradient-text">Com REST Finance</span>
            </div>
            <ul className="space-y-3">
              {[
                '2 minutos por dia e os teus KPIs estão actualizados',
                'Vês a margem hoje, não no mês que vem',
                'Alertas automáticos quando um custo sobe',
                'Relatório PDF mensal pronto para o contabilista',
                'Decides o preçário com dados reais',
              ].map(p => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />{p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 bg-white/[0.01] border-y border-white/5 relative overflow-hidden">
        <div className="hero-blob w-[400px] h-[400px] bg-violet-600/10 top-[-100px] right-[-100px] animate-pulse-slow" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
              <Zap className="w-3 h-3 text-violet-400" />
              Funcionalidades
            </div>
            <h2 className="section-title mb-4">Tudo o que precisas, nada do que não precisas</h2>
            <p className="section-subtitle mx-auto">
              Construído especificamente para proprietários de restaurantes — não para contabilistas.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {features.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 100} />)}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 container mx-auto px-4">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
            <Target className="w-3 h-3 text-violet-400" />
            Passo a passo
          </div>
          <h2 className="section-title mb-4">Como funciona</h2>
          <p className="section-subtitle mx-auto">Três passos. Começas hoje.</p>
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-8 top-12 bottom-12 w-px bg-gradient-to-b from-violet-600/0 via-violet-600/40 to-violet-600/0 hidden md:block" />
          <div className="space-y-12">
            <HowItWorksStep
              step="1" title="Cria a tua conta em 2 minutos"
              desc="Regista-te, personaliza as categorias de custo do teu restaurante e defines a meta mensal de receita. Trial gratuito de 14 dias."
              icon={Users} delay={0}
            />
            <HowItWorksStep
              step="2" title="Introduz os dados de cada dia"
              desc="No final do serviço: receita do jantar, take-away e custos principais. São apenas 4 campos e menos de 2 minutos."
              icon={Receipt} delay={200}
            />
            <HowItWorksStep
              step="3" title="Acompanha os teus KPIs"
              desc="O dashboard calcula tudo automaticamente — Prime Cost, COGS%, margem líquida. Recebe alertas quando algo sai dos limites."
              icon={BarChart2} delay={400}
            />
          </div>
        </div>
      </section>

      {/* ── RESTAURANT KPI SHOWCASE ── */}
      <section className="py-24 bg-white/[0.01] border-y border-white/5 relative overflow-hidden">
        <div className="hero-blob w-[500px] h-[500px] bg-indigo-600/10 bottom-[-150px] left-[-150px] animate-pulse-slow" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
              <PieChart className="w-3 h-3 text-violet-400" />
              Métricas que importam
            </div>
            <h2 className="section-title mb-4">KPIs feitos para restauração</h2>
            <p className="section-subtitle mx-auto">
              Não são métricas genéricas. São os números que realmente impactam o teu negócio.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {[
              { label: 'Prime Cost', value: '58-62%', desc: 'Comida + Pessoal. O indicador #1 de saúde financeira.', color: 'from-violet-500 to-purple-600' },
              { label: 'Food Cost', value: '28-32%', desc: 'Custo de matéria-prima vs receita total.', color: 'from-indigo-500 to-blue-600' },
              { label: 'Margem Líquida', value: '10-15%', desc: 'O que realmente fica no teu bolso ao final do mês.', color: 'from-emerald-500 to-green-600' },
              { label: 'RevPASH', value: '€12-18', desc: 'Receita por lugar disponível por hora de serviço.', color: 'from-amber-500 to-orange-600' },
            ].map((kpi, i) => (
              <KPICard key={kpi.label} {...kpi} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
              <DollarSign className="w-3 h-3 text-violet-400" />
              Preços
            </div>
            <h2 className="section-title mb-4">Preços simples e transparentes</h2>
            <p className="section-subtitle mx-auto">Começa grátis. Sem surpresas.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-center">
            {pricing.map(plan => (
              <PricingCard key={plan.name} plan={plan} onSelect={() => openModal('register')} />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Pagamento seguro com Stripe · Cancela a qualquer momento · Facturação em euros
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 bg-white/[0.01] border-y border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
              <Star className="w-3 h-3 text-violet-400" />
              Testemunhos
            </div>
            <h2 className="section-title mb-4">O que dizem os nossos clientes</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <TestimonialCard
              name="Miguel Santos" role="Proprietário, Tasca do Miguel"
              quote="Finalmente sei a minha margem sem ter de esperar pelo contabilista. Em 2 semanas já recuperei o valor da subscrição."
              delay={0}
            />
            <TestimonialCard
              name="Ana Ferreira" role="Gestora, Restaurante A Ribeira"
              quote="Os alertas de custo salvaram-me várias vezes. Quando o fornecedor aumentou os preços, vi logo o impacto no Prime Cost."
              delay={150}
            />
            <TestimonialCard
              name="Paulo Gomes" role="Chef-Proprietário, O Bistrô"
              quote="Uso no telemóvel depois do serviço de jantar. São literalmente 90 segundos e tenho o dia todo analisado."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-6">
              <Bell className="w-3 h-3 text-violet-400" />
              FAQ
            </div>
            <h2 className="section-title mb-4">Perguntas frequentes</h2>
          </div>
          <div className="card-glass rounded-2xl px-8 divide-y divide-white/5">
            {faqs.map(faq => <FAQItem key={faq.question} {...faq} />)}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-32 container mx-auto px-4 text-center relative overflow-hidden">
        <div className="hero-blob w-[500px] h-[500px] bg-violet-600/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
        <div className="relative max-w-2xl mx-auto z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted-foreground mb-8">
            <Zap className="w-3 h-3 text-violet-400" />
            Começa hoje. Sem risco.
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight text-foreground mb-6">
            O teu restaurante merece{' '}
            <span className="gradient-text">clareza financeira</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            14 dias grátis. Sem cartão. Sem compromisso.<br />Cancelas quando quiseres.
          </p>
          <button onClick={() => openModal('register')} className="cta-button text-base px-10 py-4 shadow-glow animate-glow group">
            <ChefHat className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
            Criar conta gratuita
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />14 dias grátis
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Setup em 2 min
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Cancela a qualquer momento
            </span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-16 bg-black/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center">
                  <UtensilsCrossed className="w-4 h-4 text-white" />
                </div>
                <span className="font-black gradient-text">REST Finance</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Software de gestão financeira para restaurantes portugueses.
              </p>
              <div className="mt-4">
                <LanguageSelector />
              </div>
            </div>
            <div>
              <div className="section-label mb-4">Produto</div>
              <ul className="space-y-2">
                {[{ href: '/plans', label: 'Planos' }, { href: '#pricing', label: 'Preços' }, { href: '/about', label: 'Sobre nós' }].map(l => (
                  <li key={l.href}><Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="section-label mb-4">Conta</div>
              <ul className="space-y-2">
                {[
                  { label: 'Entrar', action: () => openModal('login') },
                  { label: 'Criar conta', action: () => openModal('register') },
                ].map(l => (
                  <li key={l.label}><button onClick={l.action} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="section-label mb-4">Contacto</div>
              <ul className="space-y-2">
                {[{ href: '/contact', label: 'Suporte' }, { href: '/contact', label: 'Contactos' }].map(l => (
                  <li key={l.label}><Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} REST Finance. Todos os direitos reservados.</span>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacidade</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Termos</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  );
}
