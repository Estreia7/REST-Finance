/**
 * What every figure on the Analytics tab actually means, in the words of
 * someone who runs a restaurant rather than someone who audits one.
 *
 * The tab is full of borrowed vocabulary — COGS, OPEX, prime cost, ticket
 * médio. An owner reading "COGS -3.420 €" learns nothing from the label; the
 * number is only useful once they know it is the food and drink they bought to
 * make what they sold. So each entry carries three parts:
 *
 *   term      what the screen shows, acronym included
 *   expansion what the acronym stands for, spelled out
 *   plain     the explanation, in concrete restaurant terms
 *
 * `plain` is the one that matters and the one that is hard to write. The rule
 * followed here: name things an owner touches — invoices, wages, rent, the
 * fridge — and never define a term using another term from this same file.
 * "Gross profit is revenue minus COGS" is circular for the person who needed
 * the tooltip in the first place.
 *
 * Deliberately absent: any judgement of the number. Whether 34% food cost is
 * good belongs to lib/benchmarks.ts, which carries the Portuguese bands and
 * their sources. A tooltip that said "too high" would be giving advice without
 * knowing the restaurant, and would drift out of step with the benchmark bands
 * the moment either side changed.
 */

import type { Language } from './translations';

export type GlossaryEntry = {
  /** As printed on screen, so the tooltip and the label cannot disagree. */
  term: string;
  /** The acronym written out. Omitted where the term is already plain. */
  expansion?: string;
  /** The explanation itself. One or two sentences, concrete. */
  plain: string;
};

export type GlossaryKey =
  | 'revenue'
  | 'dineIn'
  | 'takeaway'
  | 'cogs'
  | 'cogsPct'
  | 'opex'
  | 'opexPct'
  | 'grossProfit'
  | 'grossMargin'
  | 'netIncome'
  | 'netMargin'
  | 'pnlStatement'
  | 'primeCost'
  | 'labour'
  | 'controllableIncome'
  | 'occupancy'
  | 'pctOfRevenue'
  | 'costs'
  | 'margin'
  | 'monthlyAvg'
  | 'revenueVsPrev'
  | 'profitVsPrev'
  | 'avgTicket'
  | 'avgTicketDineIn'
  | 'avgTicketTakeaway'
  | 'totalTickets'
  | 'target'
  | 'progress'
  | 'dailyPace'
  | 'dailyNeeded'
  | 'projectedMonthly'
  | 'remaining'
  | 'trendBadge'
  | 'sparkline'
  | 'priceAlert'
  | 'priceThreshold'
  | 'unitPrice'
  | 'monthlyReport';

const pt: Record<GlossaryKey, GlossaryEntry> = {
  revenue: {
    term: 'Receita',
    plain:
      'Tudo o que entrou em vendas, antes de descontar qualquer despesa. É o dinheiro que os clientes pagaram.',
  },
  dineIn: {
    term: 'Local',
    plain: 'Vendas de clientes que comeram no restaurante, à mesa ou ao balcão.',
  },
  takeaway: {
    term: 'Takeaway',
    plain:
      'Vendas levadas para fora: take-away ao balcão e entregas, incluindo plataformas como a Uber Eats ou a Glovo.',
  },

  cogs: {
    term: 'COGS',
    expansion: 'Custo das Mercadorias Vendidas',
    plain:
      'O que pagou aos fornecedores pela comida e bebida que serviu. As facturas do talho, do peixe, da fruta, do vinho. Não inclui salários nem renda.',
  },
  cogsPct: {
    term: 'COGS %',
    expansion: 'Custo das Mercadorias Vendidas, em percentagem da receita',
    plain:
      'De cada 100 € que vendeu, quanto foi para pagar a comida e a bebida. É a forma de comparar meses de tamanhos diferentes: 3.000 € de compras num mês fraco pesa mais do que num mês cheio.',
  },
  opex: {
    term: 'OPEX',
    expansion: 'Despesas de Funcionamento',
    plain:
      'O custo de manter a porta aberta: salários, renda, luz, água, gás, seguros, contabilidade, licenças. Paga-os venda o que vender.',
  },
  opexPct: {
    term: 'OPEX %',
    expansion: 'Despesas de Funcionamento, em percentagem da receita',
    plain:
      'De cada 100 € que vendeu, quanto foi para salários, renda, luz e as restantes despesas fixas. Quando as vendas caem e esta percentagem dispara, é sinal de que os custos fixos pesam demais.',
  },
  grossProfit: {
    term: 'Lucro Bruto',
    plain:
      'O que sobra das vendas depois de pagar só a comida e a bebida. É o dinheiro disponível para pagar salários, renda e tudo o resto.',
  },
  grossMargin: {
    term: 'Margem Bruta',
    plain:
      'Quanto de cada 100 € vendidos sobra depois de pagar a comida e a bebida. Se for 65%, cada 100 € de vendas deixam 65 € para as outras despesas.',
  },
  netIncome: {
    term: 'Lucro Líquido',
    plain:
      'O que sobra no fim, depois de pagar absolutamente tudo. É o resultado real do mês: se for negativo, o restaurante perdeu dinheiro.',
  },
  netMargin: {
    term: 'Margem Líquida',
    plain:
      'Quanto de cada 100 € vendidos sobra mesmo no fim. Se for 8%, cada 100 € de vendas deixam 8 € de lucro real.',
  },
  pnlStatement: {
    term: 'Demonstração de Resultados',
    plain:
      'A conta do mês de cima a baixo: começa nas vendas, desce pelas despesas por ordem, e acaba no que sobrou.',
  },
  primeCost: {
    term: 'Prime Cost',
    expansion: 'Custo Principal',
    plain:
      'A comida e a bebida somadas aos salários. São as duas maiores despesas de um restaurante e as únicas que consegue mexer no dia-a-dia.',
  },
  labour: {
    term: 'Pessoal',
    plain:
      'O custo total de ter a equipa: ordenados, Segurança Social a cargo da empresa, subsídios de férias e de Natal. Não é só o que sai no recibo de vencimento.',
  },
  controllableIncome: {
    term: 'Resultado Controlável',
    plain:
      'O que sobra depois de pagar tudo aquilo que consegue mudar este mês — mercadorias, pessoal, despesas correntes — mas antes da renda. Mede a gestão do dia-a-dia, sem o peso de um contrato já assinado.',
  },
  occupancy: {
    term: 'Ocupação',
    plain:
      'O custo do espaço: renda, condomínio, seguro do imóvel, contribuição autárquica. Está separado por ser um custo que não muda com o movimento nem com as suas decisões deste mês.',
  },
  pctOfRevenue: {
    term: '% rec.',
    expansion: 'Percentagem da receita',
    plain:
      'Quanto esta linha representa de cada 100 € vendidos no ano. É o que permite comparar o seu restaurante com outro de tamanho diferente, ou este ano com o anterior.',
  },

  costs: {
    term: 'Custos',
    plain:
      'Todas as despesas do mês somadas: comida, bebida, salários, renda e o resto.',
  },
  margin: {
    term: 'Margem',
    plain:
      'A percentagem das vendas que ficou como lucro. Mostra quanto rendeu cada euro vendido, o que permite comparar meses de tamanhos diferentes.',
  },
  monthlyAvg: {
    term: 'Média Mensal',
    plain:
      'A média das vendas dos últimos meses. Serve para ver se o mês atual está acima ou abaixo do habitual.',
  },
  revenueVsPrev: {
    term: 'Receita vs Mês Anterior',
    plain:
      'Se vendeu mais ou menos do que no mês passado, em percentagem. +10% quer dizer que vendeu mais um décimo.',
  },
  profitVsPrev: {
    term: 'Lucro vs Mês Anterior',
    plain:
      'Se sobrou mais ou menos dinheiro do que no mês passado. Pode vender mais e lucrar menos, se as despesas subirem mais depressa.',
  },

  avgTicket: {
    term: 'Ticket Médio',
    plain:
      'Quanto gastou, em média, cada cliente. Divide-se as vendas pelo número de clientes servidos. Subir este número costuma ser mais fácil do que trazer mais gente.',
  },
  avgTicketDineIn: {
    term: 'Médio Local',
    plain:
      'Quanto gastou, em média, cada cliente que comeu no restaurante. Costuma ser mais alto do que o takeaway, porque há bebida e sobremesa.',
  },
  avgTicketTakeaway: {
    term: 'Médio Takeaway',
    plain: 'Quanto gastou, em média, cada cliente que levou para fora.',
  },
  totalTickets: {
    term: 'Total de Tickets',
    plain:
      'Quantas contas fechou no período. Cada ticket é uma mesa ou um pedido, não uma pessoa.',
  },

  target: {
    term: 'Meta',
    plain: 'O valor de vendas que definiu como objetivo para o mês.',
  },
  progress: {
    term: 'Progresso',
    plain:
      'Quanto da meta já cumpriu. 60% a meio do mês é estar a bom ritmo; 60% no dia 28 já não é.',
  },
  dailyPace: {
    term: 'Média Diária',
    plain: 'Quanto tem vendido por dia, em média, desde o início do mês.',
  },
  dailyNeeded: {
    term: 'Necessário por Dia',
    plain:
      'Quanto precisa de vender em cada dia que falta para chegar à meta. Se for maior do que a média diária, o ritmo atual não chega.',
  },
  projectedMonthly: {
    term: 'Projeção Mensal',
    plain:
      'Onde o mês vai acabar se continuar a vender ao ritmo dos dias que já passaram. É uma estimativa, não uma garantia.',
  },
  remaining: {
    term: 'Falta',
    plain: 'Quanto falta vender para chegar à meta do mês.',
  },

  trendBadge: {
    term: 'Variação',
    plain:
      'A comparação com o mesmo período do mês passado. Verde é o sentido que lhe convém, vermelho o contrário — num custo, descer é que é verde.',
  },
  sparkline: {
    term: 'Últimos 7 dias',
    plain:
      'O desenho das vendas dos últimos sete dias. Serve para ver a forma da semana — onde estão os dias fortes e os fracos — e não para ler valores exactos.',
  },
  priceAlert: {
    term: 'Alertas de Preço',
    plain:
      'Produtos que o seu fornecedor passou a cobrar mais caro. Compara o preço da última factura com o anterior, nos últimos 90 dias.',
  },
  priceThreshold: {
    term: 'Limiar do Alerta',
    plain:
      'A subida mínima a partir da qual vale a pena avisar. Em +5% aparece quase tudo; em +20% só os aumentos grandes.',
  },
  unitPrice: {
    term: 'Preço Unitário',
    plain:
      'Quanto custa uma unidade — um quilo, um litro, uma garrafa. É o que permite comparar facturas de quantidades diferentes.',
  },
  monthlyReport: {
    term: 'Relatório Mensal',
    plain:
      'Um PDF com as contas do mês fechadas, pronto a enviar ao contabilista ou ao banco.',
  },
};

const en: Record<GlossaryKey, GlossaryEntry> = {
  revenue: {
    term: 'Revenue',
    plain:
      'Everything that came in from sales, before any expense is taken out. The money customers paid you.',
  },
  dineIn: {
    term: 'Dine-in',
    plain: 'Sales from customers who ate in the restaurant, at a table or at the counter.',
  },
  takeaway: {
    term: 'Takeaway',
    plain:
      'Sales taken off the premises: counter takeaway and deliveries, including platforms such as Uber Eats or Glovo.',
  },

  cogs: {
    term: 'COGS',
    expansion: 'Cost of Goods Sold',
    plain:
      'What you paid suppliers for the food and drink you served. The butcher, the fishmonger, the produce and wine invoices. Wages and rent are not in here.',
  },
  cogsPct: {
    term: 'COGS %',
    expansion: 'Cost of Goods Sold, as a share of revenue',
    plain:
      'Of every €100 you sold, how much went on food and drink. It is how you compare months of different sizes: €3,000 of purchases weighs more in a quiet month than a busy one.',
  },
  opex: {
    term: 'OPEX',
    expansion: 'Operating Expenses',
    plain:
      'The cost of keeping the doors open: wages, rent, electricity, water, gas, insurance, accounting, licences. You pay these whatever you sell.',
  },
  opexPct: {
    term: 'OPEX %',
    expansion: 'Operating Expenses, as a share of revenue',
    plain:
      'Of every €100 you sold, how much went on wages, rent, power and the other fixed costs. When sales fall and this percentage jumps, the fixed costs are carrying too much weight.',
  },
  grossProfit: {
    term: 'Gross Profit',
    plain:
      'What is left from sales once only the food and drink are paid for. This is the money available for wages, rent and everything else.',
  },
  grossMargin: {
    term: 'Gross Margin',
    plain:
      'How much of every €100 sold survives paying for food and drink. At 65%, every €100 of sales leaves €65 for the other expenses.',
  },
  netIncome: {
    term: 'Net Profit',
    plain:
      'What is left at the very end, once absolutely everything is paid. The real result for the month: if it is negative, the restaurant lost money.',
  },
  netMargin: {
    term: 'Net Margin',
    plain:
      'How much of every €100 sold is left at the very end. At 8%, every €100 of sales leaves €8 of real profit.',
  },
  pnlStatement: {
    term: 'Profit & Loss Statement',
    plain:
      "The month's accounts from top to bottom: it starts at sales, works down through the expenses in order, and ends at what was left.",
  },
  primeCost: {
    term: 'Prime Cost',
    plain:
      'Food and drink plus wages. These are a restaurant’s two largest expenses and the only ones you can move day to day.',
  },
  labour: {
    term: 'Labour',
    plain:
      'The full cost of having the team: wages, the employer’s social security, and the mandatory holiday and Christmas payments. It is more than what appears on a payslip.',
  },
  controllableIncome: {
    term: 'Controllable Income',
    plain:
      'What is left after paying everything you can change this month — goods, labour, running costs — but before rent. It measures day-to-day management, without the weight of a lease already signed.',
  },
  occupancy: {
    term: 'Occupancy',
    plain:
      'The cost of the space: rent, service charges, building insurance, property tax. It sits apart because it does not move with trade or with the decisions you make this month.',
  },
  pctOfRevenue: {
    term: '% rev.',
    expansion: 'Percentage of revenue',
    plain:
      'What this line represents out of every €100 sold in the year. It is what lets you compare your restaurant with one of a different size, or this year with the last.',
  },

  costs: {
    term: 'Costs',
    plain: 'Every expense for the month added up: food, drink, wages, rent and the rest.',
  },
  margin: {
    term: 'Margin',
    plain:
      'The share of sales that stayed as profit. It shows what each euro sold earned, which lets you compare months of different sizes.',
  },
  monthlyAvg: {
    term: 'Monthly Average',
    plain:
      'Average sales over the last few months. Use it to see whether this month is running above or below normal.',
  },
  revenueVsPrev: {
    term: 'Revenue vs Last Month',
    plain:
      'Whether you sold more or less than last month, as a percentage. +10% means you sold a tenth more.',
  },
  profitVsPrev: {
    term: 'Profit vs Last Month',
    plain:
      'Whether more or less money was left than last month. You can sell more and earn less, if expenses climb faster.',
  },

  avgTicket: {
    term: 'Average Ticket',
    plain:
      'What each customer spent on average — sales divided by customers served. Raising this is usually easier than bringing in more people.',
  },
  avgTicketDineIn: {
    term: 'Average Dine-in',
    plain:
      'What each customer who ate in spent on average. Usually higher than takeaway, because of drinks and dessert.',
  },
  avgTicketTakeaway: {
    term: 'Average Takeaway',
    plain: 'What each customer who took food away spent on average.',
  },
  totalTickets: {
    term: 'Total Tickets',
    plain:
      'How many bills you closed in the period. A ticket is one table or one order, not one person.',
  },

  target: {
    term: 'Target',
    plain: 'The sales figure you set as the goal for the month.',
  },
  progress: {
    term: 'Progress',
    plain:
      'How much of the target you have reached. 60% halfway through the month is good going; 60% on the 28th is not.',
  },
  dailyPace: {
    term: 'Daily Average',
    plain: 'How much you have been selling per day, on average, since the month began.',
  },
  dailyNeeded: {
    term: 'Needed per Day',
    plain:
      'How much you need to sell on each remaining day to hit the target. If it is above your daily average, the current pace will not get you there.',
  },
  projectedMonthly: {
    term: 'Monthly Projection',
    plain:
      'Where the month lands if you keep selling at the pace of the days so far. An estimate, not a promise.',
  },
  remaining: {
    term: 'Remaining',
    plain: 'How much is still to be sold to reach the monthly target.',
  },

  trendBadge: {
    term: 'Change',
    plain:
      'The comparison with the same period last month. Green is the direction that suits you, red the opposite — on a cost, going down is the green one.',
  },
  sparkline: {
    term: 'Last 7 days',
    plain:
      'The shape of sales over the last seven days. It is there to show the shape of the week — where the strong and weak days are — not to read exact figures from.',
  },
  priceAlert: {
    term: 'Price Alerts',
    plain:
      'Products your supplier started charging more for. It compares the price on the latest invoice with the one before, over the last 90 days.',
  },
  priceThreshold: {
    term: 'Alert Threshold',
    plain:
      'The smallest rise worth flagging. At +5% almost everything shows up; at +20% only the large increases do.',
  },
  unitPrice: {
    term: 'Unit Price',
    plain:
      'What one unit costs — a kilo, a litre, a bottle. It is what lets you compare invoices for different quantities.',
  },
  monthlyReport: {
    term: 'Monthly Report',
    plain:
      "A PDF of the month's closed accounts, ready to send to your accountant or your bank.",
  },
};

const GLOSSARY: Record<Language, Record<GlossaryKey, GlossaryEntry>> = { pt, en };

export function glossary(key: GlossaryKey, language: Language): GlossaryEntry {
  // Portuguese is the product's first language and the complete one, so it is
  // the fallback rather than English.
  return GLOSSARY[language]?.[key] ?? GLOSSARY.pt[key];
}

/**
 * The tooltip body: the acronym spelled out, then the explanation.
 *
 * Kept here rather than in the component so that the pairing is decided once.
 * An owner who sees "COGS" needs "Custo das Mercadorias Vendidas" before the
 * sentence that follows means anything.
 */
export function glossaryText(key: GlossaryKey, language: Language): string {
  const entry = glossary(key, language);
  return entry.expansion ? `${entry.expansion} — ${entry.plain}` : entry.plain;
}
