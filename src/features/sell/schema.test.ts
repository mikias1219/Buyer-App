import { describe, expect, it } from 'vitest';
import { diffInput, listingFormSchema, suggestTitle, type ListingFormValues } from './schema';

const valid: ListingFormValues = {
  category: 'phone',
  condition: 'good',
  brand: 'Apple',
  model: 'iPhone 13',
  title: 'iPhone 13 128GB',
  description: 'Clean device, box included.',
  city: 'Addis Ababa',
  specs: { storage: '128GB' },
  price: 52000,
  negotiable: false,
  exchange: false,
};

describe('listingFormSchema', () => {
  it('accepts a complete listing', () => {
    expect(listingFormSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ['category', null, 'validation.categoryRequired'],
    ['condition', null, 'validation.conditionRequired'],
    ['title', 'ab', 'validation.titleMin'],
    ['description', 'short', 'validation.descriptionMin'],
    ['city', ' ', 'validation.cityRequired'],
    ['price', null, 'validation.priceRequired'],
    ['price', 0, 'validation.priceRequired'],
    ['price', 100_000_000, 'validation.priceTooHigh'],
  ] as const)('rejects %s=%s with %s', (field, value, message) => {
    const r = listingFormSchema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });
});

describe('diffInput', () => {
  it('sends only changed fields, trimmed', () => {
    expect(diffInput(valid, { ...valid, price: 50000, title: ' iPhone 13 128GB Blue ' })).toEqual({
      price: 50000,
      title: 'iPhone 13 128GB Blue',
    });
    expect(diffInput(valid, { ...valid })).toEqual({});
    expect(diffInput(valid, { ...valid, specs: { storage: '256GB' } })).toEqual({ specs: { storage: '256GB' } });
  });
});

describe('suggestTitle', () => {
  it('composes brand, model and storage', () => {
    expect(suggestTitle({ brand: 'Apple', model: 'iPhone 13', specs: { storage: '128GB' } })).toBe('Apple iPhone 13 128GB');
    expect(suggestTitle({ brand: '', model: '', specs: {} })).toBe('');
  });
});
