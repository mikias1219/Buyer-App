import { describe, expect, it } from 'vitest';
import { isValidQty, marginPct, stockStatus, weightedAverageCost } from './logic';

describe('product logic (mirrors SQL)', () => {
  it('whole units reject fractions, others allow 3 decimals', () => {
    expect(isValidQty('piece', 2)).toBe(true);
    expect(isValidQty('piece', 1.5)).toBe(false);
    expect(isValidQty('kg', 1.255)).toBe(true);
    expect(isValidQty('kg', 1.2555)).toBe(false);
    expect(isValidQty('metre', Number.NaN)).toBe(false);
  });
  it('weighted average cost (same cases as the DB tests)', () => {
    expect(weightedAverageCost(10, 100, 10, 130)).toBe(115);
    expect(weightedAverageCost(0, 300, 4, 320)).toBe(320);
    expect(weightedAverageCost(-2, 300, 4, 320)).toBe(320);
    expect(weightedAverageCost(3, 10, 1, 11)).toBe(10.25);
  });
  it('stock status', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(6, 5)).toBe('ok');
  });
  it('margin %', () => {
    expect(marginPct(150, 100)).toBe(33.3);
    expect(marginPct(0, 10)).toBeNull();
  });
});
