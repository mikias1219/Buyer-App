import { describe, expect, it } from 'vitest';
import { adjustSchema, productSchema, restockSchema, type ProductForm } from './schema';

const valid: ProductForm = {
  name: 'Charger 20W',
  category_id: null,
  unit: 'piece',
  sell_price: 450,
  cost_price: 280,
  opening_stock: 10,
  reorder_level: 3,
  sku: 'CHG-20',
  barcode: '',
  notes: '',
  image_path: '',
};
const issue = (schema: { safeParse: (v: unknown) => { error?: { issues: Array<{ message: string }> } } }, v: unknown) =>
  schema.safeParse(v).error?.issues[0]?.message;

describe('productSchema', () => {
  it('accepts a valid product', () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });
  it('requires a name and non-negative prices', () => {
    expect(issue(productSchema, { ...valid, name: ' ' })).toBe('validation.required');
    expect(issue(productSchema, { ...valid, sell_price: -1 })).toBe('validation.min0');
  });
  it('whole units need whole opening stock; kg allows decimals', () => {
    expect(issue(productSchema, { ...valid, opening_stock: 1.5 })).toBe('validation.wholeNumber');
    expect(productSchema.safeParse({ ...valid, unit: 'kg', opening_stock: 1.5 }).success).toBe(true);
  });
  it('validates SKU and barcode formats', () => {
    expect(issue(productSchema, { ...valid, sku: 'has space' })).toBe('validation.sku');
    expect(issue(productSchema, { ...valid, barcode: '12' })).toBe('validation.barcode');
  });
});

describe('stock forms', () => {
  it('restock needs a positive quantity', () => {
    expect(issue(restockSchema, { qty: 0, unit_cost: null, supplier: '', note: '' })).toBe('validation.positive');
  });
  it('adjustment needs a reason', () => {
    expect(issue(adjustSchema, { mode: 'loss', qty: 1, reason: '' })).toBe('validation.required');
  });
});
