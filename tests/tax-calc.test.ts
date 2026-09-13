import { describe, it, expect } from 'vitest';
import {
  quarterOf, quarterRange, deadlineFor, daysUntil,
  vatFromGross, netFromGross, salesVat, purchaseVat, vatReturn,
  estimateIrc, paymentsOnAccount, DEFAULT_SALES_MIX,
} from '@/lib/tax-calc';
import { IVA_RATES, IRC_BY_YEAR, SALES_VAT_CLASSES } from '@/lib/tax-rules';

describe('quarters', () => {
  it('maps months to quarters', () => {
    expect(quarterOf(new Date('2026-01-15T00:00:00Z'))).toBe(1);
    expect(quarterOf(new Date('2026-03-31T00:00:00Z'))).toBe(1);
    expect(quarterOf(new Date('2026-04-01T00:00:00Z'))).toBe(2);
    expect(quarterOf(new Date('2026-12-31T00:00:00Z'))).toBe(4);
  });

  it('spans a full quarter inclusive of the last day', () => {
    const { start, end } = quarterRange(2026, 1);
    expect(start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('gets February right in a non-leap year', () => {
    expect(quarterRange(2026, 1).end.getUTCDate()).toBe(31);
    // Q1 always ends 31 March; the leap day is interior to it.
    expect(quarterRange(2028, 1).end.toISOString().slice(0, 10)).toBe('2028-03-31');
  });
});

describe('deadlines', () => {
  it('defers Q2 out of August', () => {
    // The trap: the statutory rule is the 20th of the second month following,
    // which would put Q2 on 20 August. Obligations falling due in August move
    // to September (art. 57.º-A LGT), and 20 September 2026 is a Sunday.
    const q2 = deadlineFor(2026, 2);
    expect(q2?.submit).toBe('2026-09-21');
    expect(q2?.submit).not.toBe('2026-08-20');
  });

  it('carries Q4 into the following year', () => {
    expect(deadlineFor(2026, 4)?.submit).toBe('2027-02-22');
  });

  it('returns null for a year with no published calendar', () => {
    expect(deadlineFor(2099, 1)).toBeNull();
  });

  it('counts days to a deadline, and past it', () => {
    const today = new Date('2026-09-12T12:00:00Z');
    expect(daysUntil('2026-09-21', today)).toBe(9);
    expect(daysUntil('2026-09-12', today)).toBe(0);
    expect(daysUntil('2026-05-20', today)).toBeLessThan(0);
  });
});

describe('vatFromGross', () => {
  it('divides rather than taking a percentage of the gross', () => {
    // 123 at 23% contains 23 of VAT, not 28.29.
    expect(vatFromGross(123, 23)).toBeCloseTo(23, 6);
    expect(vatFromGross(123, 23)).not.toBeCloseTo(123 * 0.23, 2);
  });

  it('handles the intermediate rate', () => {
    expect(vatFromGross(113, 13)).toBeCloseTo(13, 6);
  });

  it('is zero at a zero rate', () => {
    expect(vatFromGross(100, 0)).toBe(0);
    expect(netFromGross(100, 0)).toBe(100);
  });

  it('reconstructs the gross', () => {
    const gross = 4_820.55;
    expect(netFromGross(gross, 13) + vatFromGross(gross, 13)).toBeCloseTo(gross, 6);
  });
});

describe('salesVat', () => {
  it('charges food at the intermediate rate and alcohol at the normal one', () => {
    const { lines } = salesVat(10_000, DEFAULT_SALES_MIX);
    const food = lines.find((l) => l.key === 'food')!;
    const alcohol = lines.find((l) => l.key === 'alcohol')!;
    expect(food.rate).toBe(13);
    expect(alcohol.rate).toBe(23);
  });

  it('charges juices and water at 13%, not 23%', () => {
    // OE2024 narrowed verba 3.1 to exclude only alcohol and refrigerantes.
    // Much published guidance still puts juices and carbonated water at 23%.
    const { lines } = salesVat(10_000, DEFAULT_SALES_MIX);
    expect(lines.find((l) => l.key === 'softDrink')!.rate).toBe(13);
  });

  it('keeps refrigerantes at 23%', () => {
    const { lines } = salesVat(10_000, DEFAULT_SALES_MIX);
    expect(lines.find((l) => l.key === 'refrigerante')!.rate).toBe(23);
  });

  it('uses the regional rates', () => {
    const acores = salesVat(10_000, DEFAULT_SALES_MIX, 'acores');
    expect(acores.lines.find((l) => l.key === 'food')!.rate).toBe(IVA_RATES.acores.intermedia);
    expect(acores.lines.find((l) => l.key === 'alcohol')!.rate).toBe(IVA_RATES.acores.normal);
  });

  it('normalises a mix that does not add to 100', () => {
    // Four boxes typed by hand will not always total 100, and inventing or
    // losing revenue would be worse than rescaling.
    const mix = { food: 50, softDrink: 10, refrigerante: 10, alcohol: 10 }; // 80
    const { lines, totalNet, totalVat } = salesVat(8_000, mix);
    expect(lines.reduce((s, l) => s + l.gross, 0)).toBeCloseTo(8_000, 6);
    expect(totalNet + totalVat).toBeCloseTo(8_000, 6);
  });

  it('does not divide by zero on an empty mix', () => {
    const mix = { food: 0, softDrink: 0, refrigerante: 0, alcohol: 0 };
    const { totalVat } = salesVat(5_000, mix);
    expect(Number.isFinite(totalVat)).toBe(true);
    expect(totalVat).toBe(0);
  });

  it('covers every declared class', () => {
    const { lines } = salesVat(1_000, DEFAULT_SALES_MIX);
    expect(lines).toHaveLength(SALES_VAT_CLASSES.length);
  });
});

describe('purchaseVat', () => {
  it('reclaims all the VAT on stock for resale', () => {
    // Article 21.º n.º 2: food bought to sell on is the exception that makes
    // a restaurant work.
    const { totalDeductible, totalCharged } = purchaseVat([
      { labelKey: 'Mercadorias', gross: 10_600, vatRate: 6, deductibility: 'full' },
    ]);
    expect(totalDeductible).toBeCloseTo(totalCharged, 6);
    expect(totalDeductible).toBeCloseTo(600, 2);
  });

  it('reclaims half on diesel', () => {
    const { lines } = purchaseVat([
      { labelKey: 'Gasóleo', gross: 1_230, vatRate: 23, deductibility: 'fuel50' },
    ]);
    expect(lines[0].vatCharged).toBeCloseTo(230, 2);
    expect(lines[0].vatDeductible).toBeCloseTo(115, 2);
  });

  it('reclaims nothing on entertainment', () => {
    const { lines } = purchaseVat([
      { labelKey: 'Representação', gross: 1_230, vatRate: 23, deductibility: 'none' },
    ]);
    expect(lines[0].vatCharged).toBeCloseTo(230, 2);
    expect(lines[0].vatDeductible).toBe(0);
  });

  it('shows charged and deductible separately, so the loss is visible', () => {
    const { totalCharged, totalDeductible } = purchaseVat([
      { labelKey: 'Mercadorias', gross: 10_600, vatRate: 6, deductibility: 'full' },
      { labelKey: 'Representação', gross: 1_230, vatRate: 23, deductibility: 'none' },
    ]);
    expect(totalCharged).toBeGreaterThan(totalDeductible);
  });
});

describe('vatReturn', () => {
  const base = {
    year: 2026,
    quarter: 3 as const,
    grossRevenue: 60_000,
    mix: DEFAULT_SALES_MIX,
    purchases: [
      { labelKey: 'Mercadorias', gross: 21_200, vatRate: 6, deductibility: 'full' as const },
      { labelKey: 'Despesas', gross: 12_300, vatRate: 23, deductibility: 'full' as const },
    ],
  };

  it('computes output less deductible', () => {
    const result = vatReturn(base);
    expect(result.balance).toBeCloseTo(result.outputVat - result.deductibleVat, 6);
    expect(result.payable).toBeGreaterThan(0);
    expect(result.credit).toBe(0);
  });

  it('treats a negative balance as a credit, not a negative payment', () => {
    const result = vatReturn({
      ...base,
      grossRevenue: 1_000,
      purchases: [
        { labelKey: 'Obra na cozinha', gross: 61_500, vatRate: 23, deductibility: 'full' },
      ],
    });
    expect(result.payable).toBe(0);
    expect(result.credit).toBeGreaterThan(0);
    expect(result.balance).toBeLessThan(0);
  });

  it('carries the quarter deadline', () => {
    expect(vatReturn(base).deadline?.submit).toBe('2026-11-20');
  });
});

describe('estimateIrc', () => {
  it('applies the PME rate to the first tranche and the standard rate above', () => {
    const result = estimateIrc({ year: 2026, accountingProfit: 80_000, isPme: true });
    expect(result.bands).toHaveLength(2);
    expect(result.bands[0].rate).toBe(IRC_BY_YEAR[2026].pme);   // 15
    expect(result.bands[1].rate).toBe(IRC_BY_YEAR[2026].standard); // 19
    expect(result.collecta).toBeCloseTo(50_000 * 0.15 + 30_000 * 0.19, 6);
  });

  it('uses one band when profit stays inside the tranche', () => {
    const result = estimateIrc({ year: 2026, accountingProfit: 30_000, isPme: true });
    expect(result.bands).toHaveLength(1);
    expect(result.collecta).toBeCloseTo(30_000 * 0.15, 6);
  });

  it('uses the year it is given, not a fixed rate', () => {
    const a = estimateIrc({ year: 2025, accountingProfit: 30_000, isPme: true });
    const b = estimateIrc({ year: 2026, accountingProfit: 30_000, isPme: true });
    expect(a.collecta).toBeGreaterThan(b.collecta);
  });

  it('caps carried-forward losses at 65% of taxable profit', () => {
    const result = estimateIrc({
      year: 2026, accountingProfit: 100_000, lossesCarriedForward: 200_000, isPme: true,
    });
    expect(result.lossesUsed).toBeCloseTo(65_000, 6);
    expect(result.taxableIncome).toBeCloseTo(35_000, 6);
  });

  it('does not use losses against a loss', () => {
    const result = estimateIrc({
      year: 2026, accountingProfit: -20_000, lossesCarriedForward: 50_000,
    });
    expect(result.lossesUsed).toBe(0);
    expect(result.taxableIncome).toBe(0);
    expect(result.collecta).toBe(0);
  });

  it('charges derrama municipal on taxable profit, capped at 1.5%', () => {
    const result = estimateIrc({
      year: 2026, accountingProfit: 100_000, derramaMunicipalRate: 5, isPme: true,
    });
    expect(result.derramaMunicipal).toBeCloseTo(100_000 * 0.015, 6);
  });

  it('still taxes vehicle costs in a loss year', () => {
    // The part owners are least ready for: autonomous taxation is charged on
    // the expense regardless of whether the year made a profit.
    const result = estimateIrc({
      year: 2026, accountingProfit: -10_000, vehicleExpenses: 6_000, vehicleValue: 30_000,
    });
    expect(result.collecta).toBe(0);
    expect(result.autonomousTax).toBeGreaterThan(0);
    expect(result.taxDespiteLoss).toBe(true);
  });

  it('does not add the loss surcharge while it is suspended', () => {
    // Suspended for 2026, not for 2027 as the law currently stands.
    const y2026 = estimateIrc({
      year: 2026, accountingProfit: -5_000, vehicleExpenses: 10_000, vehicleValue: 30_000,
    });
    const y2027 = estimateIrc({
      year: 2027, accountingProfit: -5_000, vehicleExpenses: 10_000, vehicleValue: 30_000,
    });
    expect(y2026.autonomousLines[0].rate).toBe(8);
    expect(y2027.autonomousLines[0].rate).toBe(18);
  });

  it('picks the vehicle bracket by acquisition cost', () => {
    const cheap = estimateIrc({ year: 2026, accountingProfit: 1, vehicleExpenses: 1_000, vehicleValue: 20_000 });
    const mid = estimateIrc({ year: 2026, accountingProfit: 1, vehicleExpenses: 1_000, vehicleValue: 40_000 });
    const dear = estimateIrc({ year: 2026, accountingProfit: 1, vehicleExpenses: 1_000, vehicleValue: 60_000 });
    expect(cheap.autonomousLines[0].rate).toBe(8);
    expect(mid.autonomousLines[0].rate).toBe(25);
    expect(dear.autonomousLines[0].rate).toBe(32);
  });

  it('taxes undocumented expenses at 50%', () => {
    const result = estimateIrc({ year: 2026, accountingProfit: 50_000, undocumentedExpenses: 1_000 });
    const line = result.autonomousLines.find((l) => l.label.includes('não documentadas'))!;
    expect(line.rate).toBe(50);
    expect(line.tax).toBeCloseTo(500, 6);
  });

  it('subtracts instalments already paid', () => {
    const result = estimateIrc({
      year: 2026, accountingProfit: 100_000, isPme: true, paymentsOnAccount: 5_000,
    });
    expect(result.balance).toBeCloseTo(result.totalTax - 5_000, 6);
  });

  it('reports a recoverable balance when overpaid', () => {
    const result = estimateIrc({
      year: 2026, accountingProfit: 10_000, isPme: true, paymentsOnAccount: 9_000,
    });
    expect(result.balance).toBeLessThan(0);
  });
});

describe('paymentsOnAccount', () => {
  it('takes 80% below the turnover limit', () => {
    // OCC worked example: collecta 4,000, withholdings 350, turnover 200,000.
    const result = paymentsOnAccount({
      previousCollecta: 4_000, withholdings: 350, turnover: 200_000,
    });
    expect(result.total).toBeCloseTo(2_920, 6);
    expect(result.perInstalment).toBe(974); // rounded up to the euro
  });

  it('takes 95% above the turnover limit', () => {
    const result = paymentsOnAccount({ previousCollecta: 10_000, turnover: 800_000 });
    expect(result.total).toBeCloseTo(9_500, 6);
  });

  it('exempts a small prior-year collecta', () => {
    const result = paymentsOnAccount({ previousCollecta: 150, turnover: 100_000 });
    expect(result.exempt).toBe(true);
    expect(result.total).toBe(0);
  });

  it('never asks for a negative instalment', () => {
    const result = paymentsOnAccount({
      previousCollecta: 1_000, withholdings: 5_000, turnover: 100_000,
    });
    expect(result.total).toBe(0);
    expect(result.exempt).toBe(true);
  });
});
