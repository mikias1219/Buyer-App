import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('writes an Excel-friendly file with quoting', () => {
    const out = toCsv([{ a: 'Rice, 5kg', b: 'say "hi"', c: 12.5 }], [
      { header: 'Name', value: (r) => r.a },
      { header: 'Note', value: (r) => r.b },
      { header: 'Qty', value: (r) => r.c },
    ]);
    expect(out).toBe('\uFEFFName,Note,Qty\r\n"Rice, 5kg","say ""hi""",12.5\r\n');
  });
  it('neutralizes formulas but keeps negative numbers', () => {
    const out = toCsv([{ v: '=HYPERLINK("x")' }, { v: '-230' }], [{ header: 'v', value: (r) => r.v }]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain('\r\n-230\r\n');
  });
  it('parses quotes, CRLF, BOM, blank lines and semicolons', () => {
    expect(parseCsv('\uFEFFname,price\r\n"Rice, 5kg",120\r\n\r\nSoap,"4""5"\n')).toEqual([
      ['name', 'price'],
      ['Rice, 5kg', '120'],
      ['Soap', '4"5'],
    ]);
    expect(parseCsv('name;price\nRice;120')).toEqual([
      ['name', 'price'],
      ['Rice', '120'],
    ]);
  });
  it('round-trips', () => {
    const csv = toCsv([{ n: 'a,"b"\nc' }], [{ header: 'n', value: (r) => r.n }]);
    expect(parseCsv(csv)).toEqual([['n'], ['a,"b"\nc']]);
  });
});
