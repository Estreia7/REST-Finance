import { describe, it, expect } from 'vitest';
import { checkReading,
  canSaveUnseen, betterProof, rereadHint, type CheckedReading, settleVat, isDiscountNote } from '@/lib/invoice-checks';
import { parseInvoiceQr } from '@/lib/pt-invoice-qr';

// A wholesale invoice with fictional identifiers: 0,905 kg of mushrooms at 3,69 the kilo.
const recheioQr = parseInvoiceQr(
  'A:500000000*B:999999990*C:PT*D:FR*E:N*F:20261006*G:FR TESTE/1*H:TESTE000-1*I1:PT*I3:8.03*I4:0.48*I7:33.68*I8:7.75*N:8.23*O:49.94*Q:abcd*R:0000',
)!;

const right: CheckedReading = {
  grandTotal: 49.94,
  items: [
    { quantity: 0.905, unitPrice: 3.69, total: 3.34, vatRate: 6, grossTotal: 3.54 },
    { quantity: 1.81, unitPrice: 2.59, total: 4.69, vatRate: 6, grossTotal: 4.97 },
    { quantity: 1, unitPrice: 12.99, total: 12.99, vatRate: 23, grossTotal: 15.98 },
    { quantity: 1, unitPrice: 20.69, total: 20.69, vatRate: 23, grossTotal: 25.45 },
  ],
};

// What the reader actually returned: every column one place to the left.
const shifted: CheckedReading = {
  grandTotal: 49.94,
  items: [
    { quantity: 1, unitPrice: 0.905, total: 3.69 },
    { quantity: 1, unitPrice: 1.81, total: 2.59 },
    { quantity: 1, unitPrice: 1, total: 12.99 },
    { quantity: 1, unitPrice: 1, total: 20.69 },
  ],
};

describe('the QR tax record', () => {
  it('reads the base and VAT of each rate', () => {
    expect(recheioQr.taxes).toEqual([
      { rate: 6, base: 8.03, tax: 0.48 },
      { rate: 23, base: 33.68, tax: 7.75 },
    ]);
  });

  it('reads all three mainland rates', () => {
    const qr = parseInvoiceQr('A:500000000*D:FT*I1:PT*I3:78.63*I4:4.72*I5:1.54*I6:0.2*I7:69.61*I8:16.01*N:20.93*O:170.71')!;
    expect(qr.taxes.map((t) => t.rate)).toEqual([6, 13, 23]);
  });

  it('treats the exempt base as a rate of zero', () => {
    const qr = parseInvoiceQr('A:500000000*D:FT*I1:PT*I2:10.00*I7:10.00*I8:2.30*N:2.30*O:22.30')!;
    expect(qr.taxes[0]).toEqual({ rate: 0, base: 10, tax: 0 });
  });

  it('uses the rates of the Azores and Madeira', () => {
    const azores = parseInvoiceQr('A:500000000*D:FT*J1:PT-AC*J3:10.00*J4:0.40*N:0.40*O:10.40')!;
    const madeira = parseInvoiceQr('A:500000000*D:FT*K1:PT-MA*K7:10.00*K8:2.20*N:2.20*O:12.20')!;
    expect(azores.taxes).toEqual([{ rate: 4, base: 10, tax: 0.4 }]);
    expect(madeira.taxes).toEqual([{ rate: 22, base: 10, tax: 2.2 }]);
  });

  it('recognises a credit note', () => {
    expect(parseInvoiceQr('A:500000000*D:NC*O:41.35')!.isCreditNote).toBe(true);
  });
});

describe('checkReading', () => {
  it('proves a right reading to the cent against the QR', () => {
    const proof = checkReading(right, recheioQr);
    expect(proof.status).toBe('proved');
    expect(proof.gap).toBe(0);
  });

  it('catches the shifted columns of the mushrooms', () => {
    const proof = checkReading(shifted, recheioQr);
    expect(proof.status).toBe('failed');
    expect(proof.problems.filter((p) => p.kind === 'line').map((p) => (p as { index: number }).index))
      .toEqual([0, 1, 2, 3]);
    expect(proof.gap).toBe(1.75);
  });

  it('catches a missing line even when the others multiply out', () => {
    const proof = checkReading({ ...right, items: right.items.slice(0, 3) }, recheioQr);
    expect(proof.status).toBe('failed');
    expect(proof.gap).toBe(20.69);
  });

  it('catches a line booked with VAT included', () => {
    const items = [...right.items];
    items[0] = { ...items[0], unitPrice: 3.91, total: 3.54 };
    expect(checkReading({ ...right, items }, recheioQr).status).toBe('failed');
  });

  it('allows for the rounding of a heavy line', () => {
    const qr = parseInvoiceQr('A:500000000*D:FT*I1:PT*I3:100.05*I4:6.00*N:6.00*O:106.05')!;
    const proof = checkReading({
      grandTotal: 106.05,
      items: [{ quantity: 23.1, unitPrice: 4.33, total: 100.05, vatRate: 6 }],
    }, qr);
    expect(proof.status).toBe('proved');
  });

  it('stops at partial when only the print can be checked against', () => {
    const proof = checkReading({
      ...right,
      vatSummary: [{ rate: 6, base: 8.03, tax: 0.48 }, { rate: 23, base: 33.68, tax: 7.75 }],
    }, null);
    expect(proof.status).toBe('partial');
    expect(proof.source).toBe('printed');
  });

  it('checks the VAT against what was paid when there is no table at all', () => {
    expect(checkReading(right, null).status).toBe('partial');
    expect(checkReading({ ...right, grandTotal: 60 }, null).status).toBe('failed');
  });
});

describe('betterProof', () => {
  it('prefers the reading that adds up', () => {
    expect(betterProof(checkReading(shifted, recheioQr), checkReading(right, recheioQr))).toBe('second');
    expect(betterProof(checkReading(right, recheioQr), checkReading(shifted, recheioQr))).toBe('first');
  });
});

describe('rereadHint', () => {
  it('states the figures and forbids bending the numbers', () => {
    const hint = rereadHint(checkReading(shifted, recheioQr), shifted);
    expect(hint).toContain('6% VAT: base 8.03');
    expect(hint).toContain('line 1 read as 1 x 0.905 = 3.69');
    expect(hint).toContain('Never adjust a figure');
  });
});

describe('canSaveUnseen', () => {
  const proved = { vendor: 'Recheio', lines: 3, checks: { proof: { status: 'proved' as const }, doubt: null } };

  it('lets in only what the QR proved', () => {
    expect(canSaveUnseen(proved)).toBe(true);
    expect(canSaveUnseen({ ...proved, checks: { proof: { status: 'partial' } } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: { proof: { status: 'failed' } } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: undefined })).toBe(false);
  });

  it('stops for any doubt about who the supplier is', () => {
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, doubt: 'customerNif' } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, knownVendorIsCustomer: true } })).toBe(false);
    expect(canSaveUnseen({ ...proved, vendor: '  ' })).toBe(false);
  });

  it('stops for a credit note, and for an invoice with no lines', () => {
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, creditNote: true } })).toBe(false);
    expect(canSaveUnseen({ ...proved, lines: 0 })).toBe(false);
  });
});

describe('isDiscountNote', () => {
  it('knows the discount at the foot of an invoice', () => {
    expect(isDiscountNote('Desconto total')).toBe(true);
    expect(isDiscountNote('Total de descontos')).toBe(true);
    expect(isDiscountNote('DESCONTO')).toBe(true);
  });

  it('leaves a product alone', () => {
    expect(isDiscountNote('CAFE SEM DESCONTO')).toBe(false);
    expect(isDiscountNote('MC MIOLO NOZ')).toBe(false);
  });
});

describe('settleVat', () => {
  const line = (productName: string, total: number, vatRate: number | null) =>
    ({ productName, quantity: 1, unitPrice: total, total, vatRate });
  const truth = [{ rate: 6, base: 52.66, tax: 3.16 }, { rate: 13, base: 21.82, tax: 2.84 }, { rate: 23, base: 59.48, tax: 13.68 }];

  it('finds the rates that add up, changing only what must change', () => {
    const lines = [
      line('NATA', 9.69, 6), line('QUEIJO', 21.87, 6), line('BACON', 23.45, 23), line('LIMAO', 2.78, 6),
      line('MORANGO', 6.96, 6), line('NOZ', 8.18, 6), line('ALHO', 4.99, 23), line('SUMO', 12.48, 13),
      line('AGUA', 9.34, 13), line('ETIQUETAS', 7.99, 23), line('SACOS', 26.25, 23),
    ];
    const result = settleVat(lines, [
      { rate: 6, base: 21.43 + 6.96 + 2.78 + 4.99 + 8.18 + 9.69 - 21.43, tax: 0 },
      { rate: 13, base: 21.82 + 21.87 - 21.82, tax: 0 },
      { rate: 23, base: 23.45 + 7.99 + 26.25 + 12.48 + 9.34, tax: 0 },
    ]);
    expect(result).not.toBeNull();
    const sum = (rate: number) => lines.reduce((s, l, i) => s + (result?.rates[i] === rate ? l.total : 0), 0);
    expect(sum(13)).toBeCloseTo(21.87, 1);
    expect(sum(23)).toBeCloseTo(79.51, 1);
  });

  it('touches nothing when the rates are already right', () => {
    const lines = [line('A', 10, 6), line('B', 20, 23)];
    const result = settleVat(lines, [{ rate: 6, base: 10, tax: 0.6 }, { rate: 23, base: 20, tax: 4.6 }]);
    expect(result).toEqual({ rates: [6, 23], changed: 0, drop: [] });
  });

  it('fills in a rate nobody read', () => {
    const lines = [line('A', 10, null), line('B', 20, 23)];
    expect(settleVat(lines, [{ rate: 6, base: 10, tax: 0.6 }, { rate: 23, base: 20, tax: 4.6 }])?.rates).toEqual([6, 23]);
  });

  it('leaves out a discount note when that is what makes it add up', () => {
    const lines = [line('A', 10, 6), line('Desconto total', 0.25, 6), line('B', 20, 23)];
    const result = settleVat(lines, [{ rate: 6, base: 10, tax: 0.6 }, { rate: 23, base: 20, tax: 4.6 }]);
    expect(result?.drop).toEqual([1]);
  });

  it('copes with a discount taken off as a negative line', () => {
    const lines = [line('A', 10, 23), line('Oferta', -2, 23), line('B', 20, 23)];
    const result = settleVat(lines, [{ rate: 6, base: 8, tax: 0.48 }, { rate: 23, base: 20, tax: 4.6 }]);
    expect(result?.rates).toEqual([6, 6, 23]);
  });

  it('says so when no choice of rates adds up', () => {
    const lines = [line('A', 10, 6), line('B', 20, 23)];
    expect(settleVat(lines, [{ rate: 6, base: 11, tax: 0 }, { rate: 23, base: 25, tax: 0 }])).toBeNull();
  });

  it('stays quick on a long invoice', () => {
    const lines = Array.from({ length: 60 }, (_, i) => line('L' + i, 1 + (i * 37) % 91 / 7, 6));
    const total = lines.reduce((s, l) => s + l.total, 0);
    const started = Date.now();
    settleVat(lines, [{ rate: 6, base: total / 2, tax: 0 }, { rate: 13, base: total / 4, tax: 0 }, { rate: 23, base: total / 4, tax: 0 }]);
    expect(Date.now() - started).toBeLessThan(4000);
  });

  void truth;
});
