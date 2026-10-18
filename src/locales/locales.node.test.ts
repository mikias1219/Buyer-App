import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, MOVEMENT_TYPES, PAYMENT_METHODS, STOCK_STATUSES, UNITS } from '../lib/api/types';
import { KNOWN_ERROR_CODES } from '../lib/api/errors';
import { PERIOD_PRESETS } from '../lib/period';
import am from './am.json';
import en from './en.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const EN = flatten(en as Tree);
const AM = flatten(am as Tree);
/** A key exists if present directly or as plural forms (_one/_other). */
const has = (map: Map<string, string>, key: string) => map.has(key) || (map.has(`${key}_one`) && map.has(`${key}_other`));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith('UiGallery.tsx') ? [p] : [];
  });
}

const SRC = join(__dirname, '..');
const code = sourceFiles(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('locales', () => {
  it('every static t() key used in the code exists in English', () => {
    const used = new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1] ?? ''));
    const validation = new Set([...code.matchAll(/'(validation\.[a-zA-Z0-9]+)'/g)].map((m) => m[1] ?? ''));
    const missing = [...used, ...validation].filter((k) => !has(EN, k));
    expect(missing).toEqual([]);
  });

  it('dynamic key families are complete', () => {
    const families: Array<[string, readonly string[]]> = [
      ['errors', KNOWN_ERROR_CODES],
      ['role', ['user', 'staff', 'owner']],
      ['stock', STOCK_STATUSES],
      ['unit', UNITS],
      ['unitShort', UNITS],
      ['period', [...PERIOD_PRESETS, 'custom']],
      ['paymentMethod', PAYMENT_METHODS],
      ['expenseCategory', EXPENSE_CATEGORIES],
      ['movement', MOVEMENT_TYPES],
      ['language', ['en', 'am']],
      ['dashboard.trendTitle', ['day', 'week', 'month']],
      ['products.sort', ['name', 'stock_asc', 'stock_desc', 'best_selling', 'margin', 'newest']],
      ['sell.problem', ['invalid_quantity', 'insufficient_stock', 'discount']],
      ['stockOps.mode', ['set', 'loss']],
      ['sales.statusOption', ['all', 'completed', 'voided']],
      ['reports.kind', ['sale', 'return']],
      ...(['sales', 'products', 'stock', 'expenses'].flatMap((k) => [[`reports.${k}`, ['title', 'body']]]) as Array<[string, string[]]>),
      ['import.field', ['name', 'category', 'sku', 'barcode', 'unit', 'sell_price', 'cost_price', 'opening_stock', 'reorder_level', 'header']],
    ];
    const missing = families.flatMap(([prefix, values]) => values.map((v) => `${prefix}.${v}`)).filter((k) => !has(EN, k));
    expect(missing).toEqual([]);
  });

  it('Amharic has exactly the same keys as English', () => {
    expect([...EN.keys()].filter((k) => !AM.has(k))).toEqual([]);
    expect([...AM.keys()].filter((k) => !EN.has(k))).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
    const mismatched = [...EN.entries()].filter(([k, v]) => vars(v) !== vars(AM.get(k) ?? '')).map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it('no empty translations', () => {
    expect([...AM.entries()].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
});
