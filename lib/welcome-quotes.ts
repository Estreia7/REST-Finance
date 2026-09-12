import type { Language } from './translations';

/**
 * Welcome-screen quotes.
 *
 * Shown once per sign-in while the dashboard loads. Two voices, because the
 * two audiences are not doing the same job:
 *
 *   - `owner` — a restaurant owner opening their own numbers. Lines are about
 *               margin, cost control and the daily discipline of the trade.
 *   - `admin` — the person running the platform itself. Lines are about the
 *               product, the clients it serves and steady operations.
 *
 * Kept as plain data rather than translation keys: they are a pool to draw
 * from, not labels to look up. `pt` and `en` stay index-aligned, so switching
 * language mid-splash swaps the translation rather than the quote.
 */

export type WelcomeAudience = 'owner' | 'admin';

type QuotePool = Record<Language, readonly string[]>;

const OWNER_QUOTES: QuotePool = {
  pt: [
    'Quem mede a margem todos os dias nunca é apanhado de surpresa ao fim do mês.',
    'Um euro poupado no custo vale mais do que um euro vendido a mais.',
    'O lucro não está na faturação. Está no que sobra depois de tudo pago.',
    'Cozinha cheia não é sinónimo de conta cheia. Os números é que dizem.',
    'Controlar o food cost é controlar o futuro do restaurante.',
    'O desperdício é o custo mais caro: paga-se duas vezes e não vende nada.',
    'Cada prato tem um preço. Só quem sabe a margem é que tem um negócio.',
    'Não se gere o que não se mede. Comece pelo essencial e seja constante.',
    'O prime cost conta a verdade que o movimento da sala esconde.',
    'A melhor promoção é a que continua a dar lucro no dia seguinte.',
    'Fornecedores mudam de preço em silêncio. Quem acompanha, negoceia melhor.',
    'Um restaurante saudável fecha o mês sabendo porquê — bom ou mau.',
    'Pequenos ajustes na ficha técnica valem mais do que grandes campanhas.',
    'Ticket médio acima, sem gastar mais: é aí que a margem nasce.',
    'A tesouraria é o oxigénio. O lucro só serve se houver caixa.',
    'Compare a semana com a semana anterior. A tendência vale mais que o dia.',
    'Equipa bem dimensionada custa menos do que equipa a mais ou a menos.',
    'O que entra pela porta é receita. O que fica na conta é resultado.',
    'Decidir com números demora menos do que corrigir decisões sem eles.',
    'Sazonalidade não é desculpa quando já está prevista no orçamento.',
    'Reduzir 1% no custo de mercadorias sente-se todos os meses do ano.',
    'O melhor momento para organizar as contas foi ontem. O segundo é agora.',
    'Um menu rentável é um menu conhecido linha a linha.',
    'Consistência bate intensidade: registar todos os dias muda o ano inteiro.',
    'Gerir bem é transformar rotina em vantagem competitiva.',
  ],
  en: [
    'Owners who check the margin daily are never surprised at month end.',
    'A euro saved on cost is worth more than a euro of extra sales.',
    'Profit is not revenue. It is what remains once everything is paid.',
    'A full kitchen is not a full account. Only the numbers say so.',
    'Controlling food cost is controlling the future of the restaurant.',
    'Waste is the most expensive cost: paid twice, and it sells nothing.',
    'Every dish has a price. Only those who know the margin have a business.',
    'You cannot manage what you do not measure. Start simple, stay consistent.',
    'Prime cost tells the truth that a busy dining room hides.',
    'The best promotion is the one still making money the next day.',
    'Suppliers change prices quietly. Those who track them negotiate better.',
    'A healthy restaurant closes the month knowing why — good or bad.',
    'Small recipe adjustments are worth more than big campaigns.',
    'A higher average ticket without higher spend is where margin is born.',
    'Cash flow is oxygen. Profit only counts if the cash is there.',
    'Compare the week with the week before. The trend beats the day.',
    'A right-sized team costs less than one over- or understaffed.',
    'What comes through the door is revenue. What stays is result.',
    'Deciding with numbers takes less time than fixing decisions without them.',
    'Seasonality is no excuse when the budget already accounts for it.',
    'Cutting cost of goods by 1% is felt every month of the year.',
    'The best time to sort out the accounts was yesterday. The second is now.',
    'A profitable menu is one you know line by line.',
    'Consistency beats intensity: daily entries change the whole year.',
    'Managing well turns routine into a competitive advantage.',
  ],
};

const ADMIN_QUOTES: QuotePool = {
  pt: [
    'Uma plataforma estável vale mais do que uma plataforma cheia de opções.',
    'Cada cliente que percebe os seus números é um cliente que fica.',
    'Bons dados hoje evitam suporte amanhã.',
    'O produto certo é o que o cliente abre todos os dias sem pensar.',
    'Resolver o problema de um cliente resolve o problema de dezenas.',
    'Simplicidade é a funcionalidade mais difícil de construir.',
    'A confiança constrói-se com uptime, não com promessas.',
    'Antes de somar funcionalidades, confirme que as atuais são usadas.',
    'Um ticket bem respondido vale mais do que uma campanha de marketing.',
    'Métricas sem contexto são ruído. Com contexto, são direção.',
    'O crescimento sustentável começa na retenção, não na aquisição.',
    'Quem conhece bem os clientes não precisa de adivinhar a próxima prioridade.',
    'Um bug corrigido cedo custa uma fração de um bug corrigido tarde.',
    'A melhor documentação é a interface que não precisa dela.',
    'Escalar é manter a qualidade quando o volume duplica.',
    'Observar o uso real ensina mais do que qualquer reunião de produto.',
    'Segurança não é uma funcionalidade: é a base de tudo o resto.',
    'Cada minuto de indisponibilidade é pago em confiança.',
    'Feedback recorrente não é opinião. É um requisito por descobrir.',
    'Manutenção regular é mais barata do que qualquer recuperação.',
    'Um onboarding claro reduz mais churn do que qualquer desconto.',
    'Decidir com dados não elimina o risco, mas elimina a adivinhação.',
    'A plataforma serve o negócio do cliente, nunca o contrário.',
    'Consistência na experiência é o que transforma uso em hábito.',
    'Construir devagar e bem é a forma mais rápida de chegar longe.',
  ],
  en: [
    'A stable platform is worth more than a feature-packed one.',
    'Every client who understands their numbers is a client who stays.',
    'Good data today prevents support tickets tomorrow.',
    'The right product is the one clients open daily without thinking.',
    'Solving one client problem solves it for dozens.',
    'Simplicity is the hardest feature to build.',
    'Trust is built on uptime, not on promises.',
    'Before adding features, confirm the current ones are used.',
    'A well-answered ticket is worth more than a marketing campaign.',
    'Metrics without context are noise. With context, they are direction.',
    'Sustainable growth starts with retention, not acquisition.',
    'Know your clients well and you never guess the next priority.',
    'A bug fixed early costs a fraction of one fixed late.',
    'The best documentation is an interface that does not need it.',
    'Scaling is keeping quality when volume doubles.',
    'Watching real usage teaches more than any product meeting.',
    'Security is not a feature: it is the ground everything else stands on.',
    'Every minute of downtime is paid for in trust.',
    'Recurring feedback is not opinion. It is an undiscovered requirement.',
    'Regular maintenance is cheaper than any recovery.',
    'Clear onboarding cuts more churn than any discount.',
    'Deciding with data does not remove risk, but it removes guesswork.',
    'The platform serves the client business, never the other way round.',
    'A consistent experience is what turns usage into habit.',
    'Building slowly and well is the fastest way to go far.',
  ],
};

const POOLS: Record<WelcomeAudience, QuotePool> = {
  owner: OWNER_QUOTES,
  admin: ADMIN_QUOTES,
};

/** Every quote for one audience in one language. */
export function getQuotes(audience: WelcomeAudience, language: Language): readonly string[] {
  return POOLS[audience][language];
}

/**
 * Picks which quote to show.
 *
 * Returns an index rather than the string itself, so the caller can re-read
 * the same line in whichever language is active.
 */
export function pickQuoteIndex(audience: WelcomeAudience): number {
  return Math.floor(Math.random() * POOLS[audience].pt.length);
}

/** The quote at `index`, wrapped around if the index falls outside the pool. */
export function quoteAt(audience: WelcomeAudience, language: Language, index: number): string {
  const pool = POOLS[audience][language];
  return pool[((index % pool.length) + pool.length) % pool.length];
}

/**
 * The name to greet someone by: their first name only.
 *
 * Falls back to the part of the email before the `@` when no name is stored,
 * and to an empty string when neither is available — the caller then greets
 * without a name rather than with a placeholder.
 */
export function greetingName(name?: string | null, email?: string | null): string {
  const fromName = (name ?? '').trim().split(/\s+/)[0];
  if (fromName) return fromName;

  const local = (email ?? '').split('@')[0]?.replace(/[._-]+/g, ' ').trim().split(/\s+/)[0];
  if (!local) return '';

  return local.charAt(0).toUpperCase() + local.slice(1);
}
