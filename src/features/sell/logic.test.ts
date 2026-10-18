import { describe, expect, it } from 'vitest';
import { cartProblems, cartTotals, lineProblem, refundFor, type CartLine } from './logic';

const charger = { id: 'c', name: 'Charger', unit: 'piece' as const, sell_price: 160, stock_qty: 17, avg_cost: 115 };
const kase = { id: 'k', name: 'Case', unit: 'piece' as const, sell_price: 200, stock_qty: 10, avg_cost: 80 };
const wire = { id: 'w', name: 'Wire', unit: 'metre' as const, sell_price: 40.5, stock_qty: 100.75 };

describe('cart (mirrors record_sale)', () => {
  it('line and sale discounts (same numbers as the DB test)', () => {
    const lines: CartLine[] = [
      { product: charger, qty: 2, discount: 10 },
      { product: kase, qty: 1, discount: 0 },
    ];
    expect(cartTotals(lines, 20)).toEqual({ subtotal: 510, discount: 20, total: 490, cost: 310, profit: 180, itemCount: 3 });
  });
  it('decimal quantities and unknown cost for staff', () => {
    const t = cartTotals([{ product: wire, qty: 10.5, discount: 0 }], 0);
    expect(t.total).toBe(425.25);
    expect(t.cost).toBeNull();
  });
  it('line problems', () => {
    expect(lineProblem({ product: charger, qty: 1.5, discount: 0 }, false)).toBe('invalid_quantity');
    expect(lineProblem({ product: charger, qty: 18, discount: 0 }, false)).toBe('insufficient_stock');
    expect(lineProblem({ product: charger, qty: 18, discount: 0 }, true)).toBeNull();
    expect(lineProblem({ product: charger, qty: 1, discount: 161 }, false)).toBe('discount');
  });
  it('sale discount cannot exceed the subtotal', () => {
    const lines: CartLine[] = [{ product: charger, qty: 1, discount: 0 }];
    expect(cartProblems(lines, 161, false).saleDiscountInvalid).toBe(true);
    expect(cartProblems(lines, 160, false).ok).toBe(true);
    expect(cartProblems([], 0, false).ok).toBe(false);
  });
});

describe('refundFor (mirrors return_sale_items)', () => {
  const base = { lineTotal: 310, lineQty: 2, saleTotal: 490, saleSubtotal: 510 };
  it('partial return gets its share of the sale discount', () => {
    expect(refundFor({ ...base, returnedQty: 0, alreadyRefunded: 0, qty: 1 })).toBe(148.92);
  });
  it('last units refund exactly what is left', () => {
    expect(refundFor({ ...base, returnedQty: 1, alreadyRefunded: 148.92, qty: 1 })).toBe(148.92);
    expect(refundFor({ lineTotal: 100, lineQty: 3, saleTotal: 100, saleSubtotal: 100, returnedQty: 2, alreadyRefunded: 66.66, qty: 1 })).toBe(33.34);
  });
});
