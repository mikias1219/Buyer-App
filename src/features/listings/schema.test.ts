import { describe, expect, it } from 'vitest';
import { activeFilterCount, EMPTY_FILTERS, filtersFromParams, filtersToParams } from './schema';

describe('search filters ⇄ URL', () => {
  it('round-trips', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: 'iphone',
      category: 'phone' as const,
      conditions: ['good' as const, 'like_new' as const],
      city: 'Adama',
      minPrice: 10000,
      maxPrice: 50000,
      specs: { storage: '128GB' },
      sort: 'price_asc' as const,
      featured: true,
    };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
  });
  it('drops invalid params instead of failing', () => {
    const f = filtersFromParams(new URLSearchParams('category=spaceship&cond=good,broken&min=abc&q=tv&sort=weird'));
    expect(f.category).toBeUndefined();
    expect(f.q).toBe('tv');
    expect(f.minPrice).toBeUndefined();
    expect(f.sort).toBe('newest');
  });
  it('rejects inverted price ranges', () => {
    const f = filtersFromParams(new URLSearchParams('min=50000&max=1000'));
    expect(f.minPrice === undefined || f.maxPrice === undefined).toBe(true);
  });
  it('counts active filters', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, category: 'phone', conditions: ['new'], minPrice: 1 })).toBe(3);
  });
});
