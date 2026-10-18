import { describe, expect, it } from 'vitest';
import { cartReducer, type CartState } from './useCart';

const p = { id: 'a', name: 'Rice', unit: 'kg' as const, sell_price: 120, stock_qty: 10 };
const empty: CartState = { clientRef: 'r1', lines: [], discount: 0, paymentMethod: 'cash', customer: null, note: '' };

describe('cartReducer', () => {
  it('adding the same product merges quantities (no float drift)', () => {
    let s = cartReducer(empty, { type: 'add', product: p, qty: 0.1 });
    s = cartReducer(s, { type: 'add', product: p, qty: 0.2 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]?.qty).toBe(0.3);
  });
  it('quantity 0 removes the line', () => {
    const s = cartReducer(cartReducer(empty, { type: 'add', product: p, qty: 1 }), { type: 'setQty', productId: 'a', qty: 0 });
    expect(s.lines).toHaveLength(0);
  });
  it('clear starts a new sale with a new idempotency key', () => {
    const s = cartReducer({ ...empty, lines: [{ product: p, qty: 1, discount: 0 }] }, { type: 'clear' });
    expect(s.lines).toHaveLength(0);
    expect(s.clientRef).not.toBe('r1');
  });
  it('keeps the idempotency key while editing', () => {
    const s = cartReducer(empty, { type: 'setDiscount', discount: 5 });
    expect(s.clientRef).toBe('r1');
  });
});
