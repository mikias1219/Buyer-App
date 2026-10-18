import { UNITS, type ImportRow, type Unit } from '../../lib/api/types';
import { parseCsv, toCsv } from '../../lib/csv';

export const IMPORT_COLUMNS = ['name', 'category', 'sku', 'barcode', 'unit', 'sell_price', 'cost_price', 'opening_stock', 'reorder_level'] as const;
type Column = (typeof IMPORT_COLUMNS)[number];

/** Header aliases people commonly use (English, Amharic, spreadsheet defaults). */
const ALIASES: Record<string, Column> = {
  name: 'name', product: 'name', 'product name': 'name', item: 'name', ስም: 'name', 'የዕቃ ስም': 'name',
  category: 'category', ምድብ: 'category',
  sku: 'sku', code: 'sku',
  barcode: 'barcode', ባርኮድ: 'barcode',
  unit: 'unit', መለኪያ: 'unit',
  sell_price: 'sell_price', price: 'sell_price', 'selling price': 'sell_price', 'sell price': 'sell_price', ዋጋ: 'sell_price', 'የመሸጫ ዋጋ': 'sell_price',
  cost_price: 'cost_price', cost: 'cost_price', 'buying price': 'cost_price', 'cost price': 'cost_price', 'purchase price': 'cost_price', 'የግዢ ዋጋ': 'cost_price',
  opening_stock: 'opening_stock', stock: 'opening_stock', qty: 'opening_stock', quantity: 'opening_stock', 'in stock': 'opening_stock', ብዛት: 'opening_stock', ክምችት: 'opening_stock',
  reorder_level: 'reorder_level', reorder: 'reorder_level', 'low stock': 'reorder_level', 'min stock': 'reorder_level',
};

const UNIT_ALIASES: Record<string, Unit> = {
  pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece', ፍሬ: 'piece',
  pack: 'pack', packs: 'pack', ጥቅል: 'pack',
  box: 'box', boxes: 'box', ሳጥን: 'box',
  kg: 'kg', kilo: 'kg', kilogram: 'kg', ኪሎ: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  l: 'litre', litre: 'litre', liter: 'litre', ሊትር: 'litre',
  m: 'metre', metre: 'metre', meter: 'metre', ሜትር: 'metre',
};

export interface ParsedImport {
  rows: ImportRow[];
  /** Problems found before sending (1-based data row numbers, like the server). */
  errors: Array<{ row: number; field: Column | 'header'; value: string }>;
  missingColumns: Column[];
}

function num(v: string): number | undefined {
  const cleaned = v.replace(/[\s,]/g, '').replace(/^ETB/i, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function parseImport(text: string): ParsedImport {
  const table = parseCsv(text);
  const [header = [], ...data] = table;
  const map = header.map((h) => ALIASES[h.trim().toLowerCase()] ?? null);
  const missingColumns = (['name', 'sell_price'] as const).filter((c) => !map.includes(c));
  const rows: ImportRow[] = [];
  const errors: ParsedImport['errors'] = [];
  if (missingColumns.length) return { rows, errors, missingColumns };

  data.forEach((cells, i) => {
    const rowNo = i + 1;
    const get = (c: Column) => {
      const idx = map.indexOf(c);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const row: ImportRow = { name: get('name'), sell_price: Number.NaN };
    const fail = (field: Column, value: string) => errors.push({ row: rowNo, field, value });
    if (!row.name) fail('name', '');
    for (const f of ['sell_price', 'cost_price', 'opening_stock', 'reorder_level'] as const) {
      const raw = get(f);
      const n = num(raw);
      if (n === undefined) {
        if (f === 'sell_price') fail(f, raw);
        continue;
      }
      if (Number.isNaN(n) || n < 0) fail(f, raw);
      else row[f] = n;
    }
    const unitRaw = get('unit').toLowerCase();
    if (unitRaw) {
      const unit = UNIT_ALIASES[unitRaw] ?? (UNITS as readonly string[]).find((u) => u === unitRaw);
      if (unit) row.unit = unit as Unit;
      else fail('unit', unitRaw);
    }
    for (const f of ['category', 'sku', 'barcode'] as const) {
      const v = get(f);
      if (v) row[f] = v;
    }
    rows.push(row);
  });
  return { rows, errors, missingColumns };
}

export function importTemplate(): string {
  return toCsv(
    [
      { name: 'Charger 20W', category: 'Accessories', sku: 'CHG-20', barcode: '', unit: 'piece', sell_price: 450, cost_price: 280, opening_stock: 25, reorder_level: 8 },
      { name: 'Rice', category: 'Groceries', sku: '', barcode: '', unit: 'kg', sell_price: 120, cost_price: 95, opening_stock: 48.5, reorder_level: 20 },
    ],
    IMPORT_COLUMNS.map((c) => ({ header: c, value: (r: Record<Column, string | number>) => r[c] })),
  );
}
