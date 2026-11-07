import { describe, it, expect } from 'vitest';
import { checkReading,
  canSaveUnseen, betterProof, rereadHint, type CheckedReading, settleVat, settleFigures, isDiscountNote, isIncludedNote, isUnitGross, foldNotes, withoutArticleCode, documentIssues } from '@/lib/invoice-checks';
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
  const proved = { vendor: 'Recheio', lines: 3, checks: { proof: { status: 'proved' as const }, doubt: null, knownVendorId: 'v1' } };

  it('lets in only what the QR proved', () => {
    expect(canSaveUnseen(proved)).toBe(true);
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, proof: { status: 'partial' } } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, proof: { status: 'failed' } } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: undefined })).toBe(false);
  });

  it('stops for any doubt about who the supplier is', () => {
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, doubt: 'customerNif' } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, knownVendorIsCustomer: true } })).toBe(false);
    expect(canSaveUnseen({ ...proved, vendor: '  ' })).toBe(false);
  });

  it('keeps a new supplier and an odd price for a person', () => {
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, knownVendorId: null } })).toBe(false);
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, oddPrices: 1 } })).toBe(false);
  });

  it('never lets an invoice with an issue through', () => {
    expect(canSaveUnseen({ ...proved, checks: { ...proved.checks, issues: [{ kind: 'totalVsQr' }] } })).toBe(false);
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
    expect(isDiscountNote('Leve Mais Pague Menos')).toBe(true);
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

describe('settleFigures', () => {
  const line = (productName: string, quantity: number, unitPrice: number, total: number, vatRate: number | null) =>
    ({ productName, quantity, unitPrice, total, vatRate });

  it('takes out the VAT of a till receipt that prints its values with it', () => {
    const lines = [line('Asas Frango', 3.497, 3.5, 12.24, 6), line('Carne Picada Novilho', 10.545, 9.9, 104.4, 6)];
    const truth = [{ rate: 6, base: 110.04, tax: 6.6 }];
    const result = settleFigures(lines, truth);
    expect(result?.vatIncluded).toBe(true);
    expect(result?.totals).toEqual([11.55, 98.49]);
    expect(result?.grossTotals).toEqual([12.24, 104.4]);
    expect(result?.unitPrices[1]).toBeCloseTo(9.34, 2);

    const fixed = lines.map((l, i) => ({
      ...l, total: result!.totals[i], unitPrice: result!.unitPrices[i], grossTotal: result!.grossTotals[i],
    }));
    expect(checkReading({ items: fixed, grandTotal: 116.64 }, { taxes: truth }).status).toBe('proved');
  });

  it('lands every rate exactly on the invoice, with several rates', () => {
    const lines = [line('A', 1, 10.6, 10.6, 23), line('B', 1, 12.3, 12.3, 6), line('C', 1, 11.3, 11.3, 13)];
    const truth = [{ rate: 6, base: 10, tax: 0.6 }, { rate: 13, base: 10, tax: 1.3 }, { rate: 23, base: 10, tax: 2.3 }];
    const result = settleFigures(lines, truth);
    expect(result?.rates).toEqual([6, 23, 13]);
    expect(result?.totals).toEqual([10, 10, 10]);
  });

  it('leaves alone an invoice whose values are already before VAT', () => {
    const lines = [line('A', 2, 5, 10, 13), line('B', 1, 20, 20, 23)];
    const truth = [{ rate: 6, base: 10, tax: 0.6 }, { rate: 23, base: 20, tax: 4.6 }];
    const result = settleFigures(lines, truth);
    expect(result?.vatIncluded).toBe(false);
    expect(result?.totals).toEqual([10, 20]);
    expect(result?.rates).toEqual([6, 23]);
  });

  it('gives up when the lines reach neither total', () => {
    expect(settleFigures([line('A', 1, 50, 50, 6)], [{ rate: 6, base: 110.04, tax: 6.6 }])).toBeNull();
  });
});

describe('checkReading', () => {
  it('does not prove lines that fit the rates but not what was paid', () => {
    const items = [{ quantity: 1, unitPrice: 10, total: 10, vatRate: 6 }];
    const proof = checkReading({ items, grandTotal: 99 }, { taxes: [{ rate: 6, base: 10, tax: 0.6 }] });
    expect(proof.status).toBe('failed');
    expect(proof.problems.some((p) => p.kind === 'total')).toBe(true);
  });
});

describe('documentIssues', () => {
  const clean = {
    reading: {
      items: [{ quantity: 1, unitPrice: 10, total: 10, vatRate: 6 }],
      grandTotal: 10.6,
      vatSummary: [{ rate: 6, base: 10, tax: 0.6 }],
      qrVisible: true,
      pagesTotal: 0,
      continuesOnNextPage: false,
      totalVisible: true,
      covered: false,
      cutOff: false,
    },
    proof: checkReading({ items: [{ quantity: 1, unitPrice: 10, total: 10, vatRate: 6 }], grandTotal: 10.6 }, { taxes: [{ rate: 6, base: 10, tax: 0.6 }] }),
    qrRead: true,
    qrTotal: 10.6,
    printedTotal: 10.6,
    pages: 1,
    isPdf: false,
  };
  const kinds = (input: Parameters<typeof documentIssues>[0]) => documentIssues(input).map((i) => i.kind);

  it('finds nothing on an invoice the QR proves', () => {
    expect(kinds(clean)).toEqual([]);
  });

  it('asks again when the print and the QR disagree, even if the lines fit', () => {
    expect(kinds({ ...clean, printedTotal: 9.6 })).toEqual(['totalVsQr']);
  });

  it('does not compare a total nobody could see', () => {
    expect(kinds({ ...clean, printedTotal: 9.6, reading: { ...clean.reading, totalVisible: false } })).toEqual([]);
  });

  it('forgives a covered corner when the QR proved everything', () => {
    expect(kinds({ ...clean, reading: { ...clean.reading, covered: true, cutOff: true } })).toEqual([]);
  });

  it('asks for the QR when one is printed and could not be read', () => {
    expect(kinds({ ...clean, qrRead: false, qrTotal: null, proof: null })).toEqual(['qrUnread']);
  });

  it('does not ask a PDF for a QR', () => {
    expect(kinds({ ...clean, qrRead: false, qrTotal: null, proof: null, isPdf: true })).toEqual([]);
  });

  it('holds the total against the printed VAT table with no QR at all', () => {
    const reading = { ...clean.reading, qrVisible: false, grandTotal: 219.94, vatSummary: [{ rate: 6, base: 205.26, tax: 26.15 }] };
    const issues = documentIssues({ ...clean, reading, qrRead: false, qrTotal: null, proof: null });
    expect(issues[0]).toEqual({ kind: 'totalVsVatTable', expected: 231.41, found: 219.94 });
  });

  it('sees a page that carries on to the next one, and lines over the total', () => {
    const reading = {
      ...clean.reading,
      items: [{ quantity: 1, unitPrice: 54.96, total: 54.96, vatRate: 6 }],
      grandTotal: 45.98,
      vatSummary: [],
      qrVisible: false,
      continuesOnNextPage: true,
      covered: true,
    };
    const found = kinds({ ...clean, reading, qrRead: false, qrTotal: null, printedTotal: 45.98, proof: null });
    expect(found).toEqual(['missingPages', 'covered', 'doesNotAddUp']);
  });

  it('counts the pages it was given', () => {
    const reading = { ...clean.reading, pagesTotal: 2, qrVisible: false };
    const unproved = { ...clean, reading, qrRead: false, qrTotal: null, proof: null };
    expect(kinds(unproved)).toContain('missingPages');
    expect(kinds({ ...unproved, pages: 2 })).not.toContain('missingPages');
  });

  it('will not call anything verified with no figures to go on', () => {
    const reading = { ...clean.reading, qrVisible: false, vatSummary: [], items: [{ quantity: 1, unitPrice: 10, total: 10, vatRate: null }] };
    expect(kinds({ ...clean, reading, qrRead: false, qrTotal: null, proof: null })).toEqual(['cannotVerify']);
  });
});

describe('a Makro invoice with a tax note and a promotion', () => {
  const row = (product: string, quantity: number, unitPrice: number, total: number, vatRate: number, lineDiscount?: number) =>
    ({ product, quantity, unitPrice, total, vatRate, lineDiscount });
  // FAC 06001202501/015053: 140,87 before VAT, 162,77 to pay.
  const lines = [
    row('MC BACON FATIAS 500G', 4, 4.44, 17.76, 23),
    row('COSTELINHA/PIANOS PORCO', 3.955, 5.49, 21.71, 6),
    row('MC ALFACE ICEBERG', 2, 1.08, 2.16, 6),
    { ...row('MC OLEO ALTO RENDIMENTO 10LT', 3, 19.59, 58.77, 13, 4.41), lineDiscountName: 'Leve Mais Pague Menos' },
    row('MC MAIONESE 5LT', 1, 10.09, 10.09, 23),
    row('CERV.SUPER BOCK 24X33CL', 24, 0.52, 12.48, 23),
    row('TAXA IEC INCL. PREÇO U.V', 1, 1.53, 1.53, 23),
    row('AGUA PED.SALGADAS 24X25CL', 24, 0.42, 10.08, 13),
    row('ARO PAPEL FORNO 50MX30CM', 1, 3.89, 3.89, 23),
    row('MPRO DESENGORDURANTE QUENTE 5L', 3, 2.78, 8.34, 23),
  ];
  const taxes = [{ rate: 23, base: 52.56, tax: 12.09 }, { rate: 6, base: 23.87, tax: 1.43 }, { rate: 13, base: 64.44, tax: 8.38 }];

  it('adds up to the cent once the rows are folded in', () => {
    const { items, discountTotal } = foldNotes(lines, 4.41);
    expect(items).toHaveLength(9);
    expect(discountTotal).toBe(0);
    const proof = checkReading({ items, grandTotal: 162.77 }, { taxes });
    expect(proof.status).toBe('proved');
    expect(proof.gap).toBe(0);
  });

  it('leaves the discounted product at what it really cost', () => {
    const oil = foldNotes(lines, 4.41).items.find((l) => l.product.includes('OLEO'));
    expect(oil).toMatchObject({
      quantity: 3, unitPrice: 18.12, total: 54.36, discount: 4.41, discountLabel: 'Leve Mais Pague Menos',
    });
    expect(oil).not.toHaveProperty('lineDiscount');
    expect(oil).not.toHaveProperty('lineDiscountName');
  });

  it('still lands on the rates when the reader did not tie the discount to a product', () => {
    const { items } = foldNotes(lines.map(({ lineDiscount: _, ...l }) => l));
    const named = items.map((l) => ({ ...l, productName: l.product }));
    const settled = settleFigures(named, taxes, 4.41);
    expect(settled?.discounted).toBe(true);
    const band = items.reduce((sum, l, i) => sum + (l.vatRate === 13 ? settled?.totals[i] ?? 0 : 0), 0);
    expect(band).toBeCloseTo(64.44, 2);
  });
});

describe('a Recheio invoice whose last column is the unit price with VAT', () => {
  const row = (product: string, quantity: number, unitPrice: number, total: number, vatRate: number, grossTotal: number) =>
    ({ product, quantity, unitPrice, total, vatRate, grossTotal });
  // FR 26202904/0000088787, page 1: the lines reach TRANSPORTE 54,96.
  const lines = [
    row('ACUCAR AMANH AMAR 1KG', 4, 0.94, 3.76, 23, 1.16),
    row('PAO HAMBURGER BIMBO', 2, 1.39, 2.78, 6, 1.47),
    row('LIMAO CAL.3/4', 1.3, 1.44, 1.87, 6, 1.53),
    row('ALFACE ICEBERG RCH', 1.78, 2.59, 4.61, 6, 2.75),
    row('TOMATE BBB 82/102 1 CAM', 2.72, 2.59, 7.04, 6, 2.75),
    row('CHALOTTE ROXO RCH', 0.78, 3.99, 3.11, 6, 4.23),
    row('ALHO SECO INT DESCASCAD 500GR', 1, 3.19, 3.19, 6, 3.38),
    row('BAT DOCE MCCAIN 2,5K', 1, 12.99, 12.99, 23, 15.98),
    row('GEL.CAT NATA GOURM 4,5LT', 1, 6.89, 6.89, 23, 8.47),
    row('AGUA CALDAS PENACOVA PET 5L', 4, 0.74, 2.96, 13, 0.84),
    row('AGUA PENACOVA 50C SDR', 24, 0.14, 3.36, 13, 0.16),
    row('VALOR DEPOSITO UNIDADE', 24, 0.1, 2.4, 0, 0.1),
  ];

  it('does not fail a right line over that column', () => {
    const proof = checkReading({ items: lines, grandTotal: 62.58 }, null);
    expect(proof.problems).toEqual([]);
    expect(proof.linesNet).toBe(54.96);
  });

  it('keeps a unit price out of the line value', () => {
    const { items } = foldNotes(lines);
    expect(items[0].grossTotal).toBeUndefined();
    expect(items[4].grossTotal).toBeUndefined();
    expect(items[7].grossTotal).toBe(15.98);
  });

  it('still catches a value with VAT that is simply wrong', () => {
    const wrong = { quantity: 2, unitPrice: 5, total: 10, vatRate: 23, grossTotal: 9 };
    expect(isUnitGross(wrong)).toBe(false);
    expect(checkReading({ items: [wrong], grandTotal: 12.3 }, null).problems.some((p) => p.kind === 'lineVat')).toBe(true);
  });

  it('keeps a real line value with VAT', () => {
    expect(isUnitGross({ unitPrice: 3.69, total: 3.34, vatRate: 6, grossTotal: 3.54 })).toBe(false);
  });
});

describe('a Makro reread with VAT codes as rates and two promotions', () => {
  const line = (productName: string, total: number, vatRate: number) =>
    ({ productName, quantity: 1, unitPrice: total, total, vatRate });
  // FAC 06004202501/026078: lines of 152,42, Desconto total 2,64, 149,78 before VAT.
  const truth = [{ rate: 6, base: 78.63, tax: 4.72 }, { rate: 13, base: 1.54, tax: 0.2 }, { rate: 23, base: 69.61, tax: 16.01 }];
  const lines = [line('PAO', 10.14, 4), line('CHEDDAR', 43.74, 4), line('RESTO', 27.39, 4), line('AGUA', 1.54, 5), line('FRITOS', 69.61, 2)];

  it('reads the codes as rates and lands every rate on the invoice', () => {
    const settled = settleFigures(lines, truth, 2.64);
    expect(settled?.rates).toEqual([6, 6, 6, 13, 23]);
    expect(settled?.discounted).toBe(true);
    const sum = (rate: number) => settled?.totals.reduce((s, t, i) => s + (settled.rates[i] === rate ? t : 0), 0) ?? 0;
    expect(sum(6)).toBeCloseTo(78.63, 2);
    expect(sum(13)).toBeCloseTo(1.54, 2);
    expect(sum(23)).toBeCloseTo(69.61, 2);
  });

  it('settles a misread rate and the discount together', () => {
    // As reread: the 8,86 line under 13%, and the 2,64 still inside the 6% lines.
    const reread = [line('PAO', 10.14, 6), line('CHEDDAR', 43.74, 6), line('RESTO', 27.39, 6),
      line('AGUA', 1.54, 13), line('DESENGORDURANTE', 8.86, 13), line('FRITOS', 60.75, 23)];
    const settled = settleFigures(reread, truth, 2.64);
    expect(settled?.rates).toEqual([6, 6, 6, 13, 23, 23]);
    expect(settled?.discounted).toBe(true);
    const items = reread.map((l, i) => ({ ...l, total: settled?.totals[i] ?? 0, unitPrice: settled?.unitPrices[i] ?? 0, vatRate: settled?.rates[i] }));
    const proof = checkReading({ items, grandTotal: 170.71 }, { taxes: truth });
    expect(proof.status).toBe('proved');
  });

  it('does not take a discount the rates cannot explain', () => {
    expect(settleFigures([line('A', 50, 6), line('B', 50, 23)], truth, 2.64)).toBeNull();
  });

  it('does not ask for a page when the lines reach the figures', () => {
    const reading = { items: [{ quantity: 1, unitPrice: 10, total: 10, vatRate: 6 }], grandTotal: 10.6, pagesTotal: 3, vatSummary: [{ rate: 6, base: 10, tax: 0.6 }] };
    const issues = documentIssues({ reading, proof: checkReading(reading, null), qrRead: false, qrTotal: null, printedTotal: 10.6, pages: 1, isPdf: false });
    expect(issues.map((i) => i.kind)).not.toContain('missingPages');
  });

  it('still asks for it when they fall short', () => {
    const reading = { items: [{ quantity: 1, unitPrice: 4, total: 4, vatRate: 6 }], grandTotal: 10.6, pagesTotal: 2, vatSummary: [{ rate: 6, base: 10, tax: 0.6 }] };
    const issues = documentIssues({ reading, proof: checkReading(reading, null), qrRead: false, qrTotal: null, printedTotal: 10.6, pages: 1, isPdf: false });
    expect(issues.map((i) => i.kind)).toContain('missingPages');
  });

  it('leaves 4% alone where it is a real rate', () => {
    const azores = [{ rate: 4, base: 10, tax: 0.4 }, { rate: 16, base: 20, tax: 3.2 }];
    expect(settleFigures([line('A', 10, 4), line('B', 20, 16)], azores)?.rates).toEqual([4, 16]);
  });
});

describe('withoutArticleCode', () => {
  it('takes the code off the description', () => {
    expect(withoutArticleCode('8414892330664 MC PAO BURG BRIOCHE BAT. 300G')).toBe('MC PAO BURG BRIOCHE BAT. 300G');
    expect(withoutArticleCode('110219.1 ACUCAR AMANH AMAR 1KG')).toBe('ACUCAR AMANH AMAR 1KG');
  });

  it('leaves a description that only starts with a number', () => {
    expect(withoutArticleCode('7UP LATA 33CL')).toBe('7UP LATA 33CL');
    expect(withoutArticleCode('24 OVOS')).toBe('24 OVOS');
    expect(withoutArticleCode('5601234567890')).toBe('5601234567890');
  });

  it('is applied to what was read', () => {
    const { items } = foldNotes([{ product: '5609707007999 QJ CHEDDAR FAT 1KG', quantity: 1, unitPrice: 2, total: 2 }]);
    expect(items[0].product).toBe('QJ CHEDDAR FAT 1KG');
  });
});

describe('foldNotes', () => {
  const row = (product: string, total: number, lineDiscount?: number) =>
    ({ product, quantity: 2, unitPrice: total / 2, total, lineDiscount });

  it('does not believe a discount larger than its line', () => {
    const { items, discountTotal } = foldNotes([row('A', 5, 9)], 9);
    expect(items[0].total).toBe(5);
    expect(discountTotal).toBe(9);
  });

  it('keeps what is left of a discount not tied to a line', () => {
    expect(foldNotes([row('A', 10, 2)], 3).discountTotal).toBe(1);
  });

  it('never empties a reading', () => {
    expect(foldNotes([row('TAXA IEC INCL. PRECO', 1)]).items).toHaveLength(1);
  });
});

describe('isIncludedNote', () => {
  it('knows a charge already inside a price', () => {
    expect(isIncludedNote('94 TAXA IEC INCL. PREÇO U.V')).toBe(true);
    expect(isIncludedNote('Ecovalor incluído no preço')).toBe(true);
  });

  it('leaves real charges and products alone', () => {
    expect(isIncludedNote('TAXA IEC')).toBe(false);
    expect(isIncludedNote('CERV.SUPER BOCK 24X33CL')).toBe(false);
    expect(isIncludedNote('PRECO FIXO')).toBe(false);
  });
});

describe('settleFigures with a discount', () => {
  const line = (productName: string, total: number, vatRate: number) =>
    ({ productName, quantity: 2, unitPrice: total / 2, total, vatRate });
  const truth = [{ rate: 6, base: 90, tax: 5.4 }, { rate: 23, base: 95, tax: 21.85 }];

  it('shares it out so each rate lands on what the invoice states', () => {
    const lines = [line('A', 60, 6), line('B', 40, 6), line('C', 100, 23)];
    const result = settleFigures(lines, truth, 15);
    expect(result?.discounted).toBe(true);
    expect(result?.totals).toEqual([54, 36, 95]);
    expect(result?.unitPrices[0]).toBe(27);
  });

  it('proves against the QR once shared out', () => {
    const lines = [line('A', 60, 6), line('B', 40, 6), line('C', 100, 23)];
    const result = settleFigures(lines, truth, 15)!;
    const items = lines.map((l, i) => ({ ...l, total: result.totals[i], unitPrice: result.unitPrices[i], grossTotal: result.grossTotals[i] }));
    expect(checkReading({ items, grandTotal: 212.25 }, { taxes: truth }).status).toBe('proved');
  });

  it('will not invent a discount the figures do not show', () => {
    const lines = [line('A', 60, 6), line('C', 100, 23)];
    expect(settleFigures(lines, truth, 15)?.discounted).toBeFalsy();
  });
});
