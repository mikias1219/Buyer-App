import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { Sale } from '../../lib/api/types';
import { receiptText } from './receipt';

const t = ((key: string, opts?: Record<string, unknown>) => (opts?.no ? `${key}#${String(opts.no)}` : key)) as unknown as TFunction;

const sale: Sale = {
  id: 's',
  receipt_no: 1023,
  sold_at: '2026-10-18T09:00:00Z',
  cashier_id: '1',
  cashier_name: 'Abel',
  customer_id: null,
  customer_name: null,
  payment_method: 'cash',
  subtotal: 510,
  discount: 20,
  total: 490,
  status: 'completed',
  note: '',
  void_reason: '',
  voided_at: null,
  refunded: 0,
  items: [{ id: 1, product_id: 'p', product_name: 'Charger', unit: 'piece', qty: 2, unit_price: 160, discount: 10, line_total: 310, returned_qty: 0 }],
  returns: [],
};

describe('receiptText', () => {
  it('lists lines, discounts, total and footer', () => {
    const text = receiptText(sale, { shopName: 'Demo Shop', footer: 'Thank you!', date: '18 Oct 2026', t });
    expect(text).toContain('Demo Shop');
    expect(text).toContain('receipt.title#1023');
    expect(text).toContain('2 unitShort.piece × ETB 160 (−ETB 10) = ETB 310');
    expect(text).toContain('sell.discount: −ETB 20');
    expect(text).toContain('sell.total: ETB 490');
    expect(text.endsWith('Thank you!')).toBe(true);
  });
  it('marks voided sales', () => {
    expect(receiptText({ ...sale, status: 'voided' }, { shopName: '', footer: '', date: '', t })).toContain('receipt.voidedStamp');
  });
});
