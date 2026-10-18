import { describe, expect, it } from 'vitest';
import { expenseSchema } from './schema';

describe('expenseSchema', () => {
  it('accepts a valid expense', () => {
    expect(expenseSchema.safeParse({ spent_on: '2026-10-18', category: 'rent', amount: 6000, note: '' }).success).toBe(true);
  });
  it('rejects zero amounts, bad dates and unknown categories', () => {
    expect(expenseSchema.safeParse({ spent_on: '2026-10-18', category: 'rent', amount: 0, note: '' }).success).toBe(false);
    expect(expenseSchema.safeParse({ spent_on: '2026-02-30', category: 'rent', amount: 1, note: '' }).success).toBe(false);
    expect(expenseSchema.safeParse({ spent_on: '2026-10-18', category: 'food', amount: 1, note: '' }).success).toBe(false);
  });
});
