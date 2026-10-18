import { describe, expect, it } from 'vitest';
import { importTemplate, parseImport } from './logic';

describe('parseImport', () => {
  it('reads the template exactly', () => {
    const r = parseImport(importTemplate());
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toEqual({ name: 'Rice', category: 'Groceries', unit: 'kg', sell_price: 120, cost_price: 95, opening_stock: 48.5, reorder_level: 20 });
  });
  it('accepts header aliases, Amharic headers, thousands separators and unit aliases', () => {
    const r = parseImport('ስም,ዋጋ,Quantity,Unit\n"Samsung A15","14,500",6,pcs\nCopper wire,40.5,180.5,m');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: 'Samsung A15', sell_price: 14500, opening_stock: 6, unit: 'piece' });
    expect(r.rows[1]).toMatchObject({ unit: 'metre', opening_stock: 180.5 });
  });
  it('reports missing required columns', () => {
    expect(parseImport('name,stock\nRice,3').missingColumns).toEqual(['sell_price']);
  });
  it('flags bad rows with row numbers', () => {
    const r = parseImport('name,price,stock,unit\n,10,1,pcs\nSoap,abc,1,pcs\nOil,10,-2,barrel');
    expect(r.errors).toEqual([
      { row: 1, field: 'name', value: '' },
      { row: 2, field: 'sell_price', value: 'abc' },
      { row: 3, field: 'opening_stock', value: '-2' },
      { row: 3, field: 'unit', value: 'barrel' },
    ]);
  });
});
