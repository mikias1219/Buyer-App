import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CONDITIONS,
  LISTING_REJECT_REASONS,
  LISTING_STATUSES,
  PAYMENT_REJECT_REASONS,
  REPORT_REASONS,
} from '../lib/api/types';
import { KNOWN_ERROR_CODES } from '../lib/api/errors';
import { MINE_TABS } from '../features/listings/logic';
import { CATEGORY_FIELDS } from '../features/sell/categoryFields';
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
    const validation = new Set([...code.matchAll(/'(validation\.[a-zA-Z]+)'/g)].map((m) => m[1] ?? ''));
    const missing = [...used, ...validation].filter((k) => !has(EN, k));
    expect(missing).toEqual([]);
  });

  it('dynamic key families are complete', () => {
    const families: Array<[string, readonly string[]]> = [
      ['category', CATEGORIES],
      ['condition', CONDITIONS],
      ['conditionHelp', CONDITIONS],
      ['status', LISTING_STATUSES],
      ['owner.statusHelp', LISTING_STATUSES],
      ['paymentStatus', ['pending', 'submitted', 'confirmed', 'rejected', 'refunded']],
      ['rejectReason', [...LISTING_REJECT_REASONS, ...PAYMENT_REJECT_REASONS]],
      ['reportReason', REPORT_REASONS],
      ['errors', KNOWN_ERROR_CODES],
      ['mine.tab', MINE_TABS],
      ['mine.empty', MINE_TABS],
      ['specs', [...new Set(Object.values(CATEGORY_FIELDS).flat().map((f) => f.key))]],
      ['fields', ['title', 'description', 'price', 'category', 'condition', 'city', 'photos', 'brand', 'model']],
      ['owner.action', ['continue', 'edit', 'fix', 'resubmit', 'pay', 'view_payment', 'pause', 'resume', 'mark_sold', 'renew', 'boost', 'delete']],
      ['role', ['user', 'moderator', 'admin']],
      ['flag', ['price_low', 'price_high', 'duplicate_image']],
      ['sell.steps', ['photos', 'details', 'price', 'review']],
      ['pay.title', ['listing', 'renew', 'boost']],
      ['pay.subtitle', ['listing', 'renew', 'boost']],
      ['admin.payments.kind', ['listing', 'renew', 'boost']],
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
