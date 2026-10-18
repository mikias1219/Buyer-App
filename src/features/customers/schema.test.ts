import { describe, expect, it } from 'vitest';
import { customerSchema, paymentSchema } from './schema';

describe('customer forms', () => {
  it('normalizes phone spacing and accepts empty phone', () => {
    expect(customerSchema.parse({ name: 'Almaz', phone: '091 122-3344', note: '' }).phone).toBe('0911223344');
    expect(customerSchema.parse({ name: 'Almaz', phone: '', note: '' }).phone).toBe('');
  });
  it('rejects bad phones and empty names', () => {
    expect(customerSchema.safeParse({ name: 'A', phone: '12', note: '' }).success).toBe(false);
    expect(customerSchema.safeParse({ name: ' ', phone: '', note: '' }).success).toBe(false);
  });
  it('payment needs a positive amount and a money method', () => {
    expect(paymentSchema.safeParse({ amount: 0, method: 'cash', note: '' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 10, method: 'credit', note: '' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 10, method: 'telebirr', note: '' }).success).toBe(true);
  });
});
