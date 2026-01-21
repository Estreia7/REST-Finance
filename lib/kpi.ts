export type KpiInput = {
  revenueTotal: number;
  cogsTotal: number;
  opexTotal: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
};

export function calculateKpis(input: KpiInput) {
  const totalRevenue = input.revenueTotal;
  const totalCogs = input.cogsTotal;
  const grossProfit = totalRevenue - totalCogs;
  const grossProfitPct = totalRevenue === 0 ? 0 : grossProfit / totalRevenue;

  const operatingExpenses = input.opexTotal;
  const netIncome = grossProfit - operatingExpenses;
  const netIncomePct = totalRevenue === 0 ? 0 : netIncome / totalRevenue;

  const avgTicketDineIn =
    input.dineInTickets === 0 ? 0 : input.dineInRevenue / input.dineInTickets;
  const avgTicketTakeaway =
    input.takeawayTickets === 0 ? 0 : input.takeawayRevenue / input.takeawayTickets;

  return {
    totalRevenue,
    totalCogs,
    grossProfit,
    grossProfitPct,
    operatingExpenses,
    netIncome,
    netIncomePct,
    avgTicketDineIn,
    avgTicketTakeaway
  };
}

