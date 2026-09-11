import { describe, it, expect } from 'vitest';
import {
  dailySummarySchema,
  dailySummaryUpdateSchema,
  costEntrySchema,
  costEntryUpdateSchema,
  vendorSchema,
  invoiceItemSchema,
  registerSchema,
  formatZodError,
} from '@/lib/validations';

describe('dailySummaryUpdateSchema', () => {
  it('accepts a partial update', () => {
    const result = dailySummaryUpdateSchema.safeParse({ dineInRevenue: 1200 });
    expect(result.success).toBe(true);
  });

  it('accepts an empty update', () => {
    expect(dailySummaryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects negative revenue on update', () => {
    // Regression guard: creation rejected negative revenue but the update path
    // had no validation at all, so an entry could be edited into a negative.
    const result = dailySummaryUpdateSchema.safeParse({ dineInRevenue: -500 });
    expect(result.success).toBe(false);
  });

  it('rejects negative ticket counts on update', () => {
    expect(dailySummaryUpdateSchema.safeParse({ dineInTickets: -3 }).success).toBe(false);
  });

  it('rejects fractional ticket counts', () => {
    expect(dailySummaryUpdateSchema.safeParse({ dineInTickets: 2.5 }).success).toBe(false);
  });

  it('enforces the same upper bound as creation', () => {
    expect(dailySummaryUpdateSchema.safeParse({ dineInRevenue: 1_000_000 }).success).toBe(false);
  });

  it('enforces the notes length cap', () => {
    expect(dailySummaryUpdateSchema.safeParse({ notes: 'a'.repeat(501) }).success).toBe(false);
    expect(dailySummaryUpdateSchema.safeParse({ notes: 'a'.repeat(500) }).success).toBe(true);
  });

  it('rejects unknown fields rather than silently ignoring them', () => {
    expect(
      dailySummaryUpdateSchema.safeParse({ dineInRevenue: 100, restaurantId: 'other-tenant' }).success
    ).toBe(false);
  });
});

describe('dailySummarySchema (creation)', () => {
  const valid = {
    date: '2026-09-11',
    dineInRevenue: 1200,
    takeawayRevenue: 300,
    dineInTickets: 48,
    takeawayTickets: 15,
  };

  it('accepts a valid entry and coerces the date', () => {
    const result = dailySummarySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeInstanceOf(Date);
  });

  it('rejects negative revenue', () => {
    expect(dailySummarySchema.safeParse({ ...valid, dineInRevenue: -1 }).success).toBe(false);
  });

  it('accepts a zero-revenue day (a real closed day)', () => {
    expect(
      dailySummarySchema.safeParse({
        ...valid,
        dineInRevenue: 0,
        takeawayRevenue: 0,
        dineInTickets: 0,
        takeawayTickets: 0,
      }).success
    ).toBe(true);
  });
});

describe('costEntrySchema / costEntryUpdateSchema', () => {
  it('requires a positive amount on creation', () => {
    const base = { date: '2026-09-11', type: 'COGS' as const, amount: 0 };
    expect(costEntrySchema.safeParse(base).success).toBe(false);
    expect(costEntrySchema.safeParse({ ...base, amount: 0.01 }).success).toBe(true);
  });

  it('rejects a negative amount on update', () => {
    expect(costEntryUpdateSchema.safeParse({ amount: -250 }).success).toBe(false);
  });

  it('rejects an invalid cost type', () => {
    expect(
      costEntrySchema.safeParse({ date: '2026-09-11', type: 'LABOUR', amount: 10 }).success
    ).toBe(false);
  });

  it('rejects a non-uuid categoryId', () => {
    expect(costEntryUpdateSchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(false);
  });

  it('allows a null categoryId (uncategorised cost)', () => {
    expect(costEntryUpdateSchema.safeParse({ categoryId: null }).success).toBe(true);
  });
});

describe('vendorSchema', () => {
  it('accepts a valid vendor', () => {
    expect(vendorSchema.safeParse({ name: 'Makro', taxId: '501234567' }).success).toBe(true);
  });

  it('rejects a name that is too short', () => {
    expect(vendorSchema.safeParse({ name: 'A' }).success).toBe(false);
  });

  it('rejects an unbounded name', () => {
    expect(vendorSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const result = vendorSchema.safeParse({ name: '  Recheio  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Recheio');
  });
});

describe('invoiceItemSchema', () => {
  const valid = {
    productName: 'Batata 5kg',
    quantity: 4,
    unitPrice: 3.25,
    totalPrice: 13,
  };

  it('accepts a valid line item', () => {
    expect(invoiceItemSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero or negative quantity', () => {
    expect(invoiceItemSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
    expect(invoiceItemSchema.safeParse({ ...valid, quantity: -2 }).success).toBe(false);
  });

  it('rejects a negative unit price', () => {
    expect(invoiceItemSchema.safeParse({ ...valid, unitPrice: -1 }).success).toBe(false);
  });

  it('requires a product name', () => {
    expect(invoiceItemSchema.safeParse({ ...valid, productName: '' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'Bruno',
    email: 'bruno@example.com',
    password: 'correct-horse',
    restaurantName: 'Tasca Central',
  };

  it('accepts valid registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a short password', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('formatZodError', () => {
  it('joins all messages so the user sees every problem at once', () => {
    const result = dailySummarySchema.safeParse({
      date: '2026-09-11',
      dineInRevenue: -1,
      takeawayRevenue: -1,
      dineInTickets: 0,
      takeawayTickets: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatZodError(result.error);
      expect(message).toContain('negativa');
      expect(message.split(',').length).toBeGreaterThanOrEqual(2);
    }
  });
});
