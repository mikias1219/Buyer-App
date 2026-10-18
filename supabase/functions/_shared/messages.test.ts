import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatEtb,
  formatQty,
  isPermanentTelegramError,
  lowStockText,
  NOTIFICATION_KINDS,
  renderNotification,
  summaryText,
  type LinkConfig,
  type OutboxRow,
} from './messages.ts';

const cfg: LinkConfig = { miniAppUrl: 'https://shop.example/' };

function row(kind: string, language = 'en', payload: Record<string, unknown> = {}): OutboxRow {
  return {
    id: 1,
    chat_id: '42',
    kind,
    language,
    payload: {
      name: '<b>Abel</b> & co',
      username: 'abel_k',
      role: 'staff',
      unit: 'kg',
      stock_qty: 2.5,
      reorder_level: 5,
      shop_name: 'Demo Shop',
      date: '2026-10-18',
      revenue: 9455,
      gross_profit: 1625,
      expenses: 300,
      net_profit: 1210,
      sales_count: 3,
      items_sold: 12,
      low_count: 1,
      receivables: 0,
      ...payload,
    },
  };
}

describe('renderNotification', () => {
  it.each(NOTIFICATION_KINDS.flatMap((k) => [[k, 'en'], [k, 'am']]))('renders %s in %s', (kind, lang) => {
    const msg = renderNotification(row(kind, lang), cfg);
    expect(msg?.text.length).toBeGreaterThan(5);
    expect(msg?.button?.text).toBeTruthy();
  });

  it('escapes user content', () => {
    const msg = renderNotification(row('access_request'), cfg);
    expect(msg?.text).toContain('&lt;b&gt;Abel&lt;/b&gt; &amp; co');
    expect(msg?.text).toContain('@abel_k');
  });

  it('localizes roles and handles removal', () => {
    expect(renderNotification(row('role_changed', 'en'), cfg)?.text).toContain('staff (cashier)');
    expect(renderNotification(row('role_changed', 'am'), cfg)?.text).toContain('ሠራተኛ');
    expect(renderNotification(row('role_changed', 'en', { role: 'user' }), cfg)?.text).toContain('removed');
  });

  it('buttons open the exact screen via web_app', () => {
    expect(renderNotification(row('access_request'), cfg)?.button?.webAppUrl).toBe('https://shop.example/#/more/team');
    expect(renderNotification(row('role_changed'), { miniAppUrl: '' })?.button).toBeUndefined();
  });

  it('unknown kinds are skipped, unknown languages fall back to English', () => {
    expect(renderNotification(row('nope'), cfg)).toBeNull();
    expect(renderNotification(row('access_request', 'fr'), cfg)?.text).toContain('asking for access');
  });
});

describe('shop messages', () => {
  it('low-stock alert names the product and opens filtered products', () => {
    const msg = renderNotification(row('low_stock'), cfg);
    expect(msg?.text).toContain('2.5 kg left');
    expect(msg?.button?.webAppUrl).toBe('https://shop.example/#/products?stock=low');
  });
  it('daily summary lists the key numbers', () => {
    const text = summaryText('en', row('daily_summary').payload);
    expect(text).toContain('Revenue: <b>ETB 9,455</b>');
    expect(text).toContain('Net profit: <b>ETB 1,210</b>');
    expect(text).not.toContain('Unpaid credit');
    expect(summaryText('en', { ...row('daily_summary').payload, receivables: 500 })).toContain('Unpaid credit: ETB 500');
    expect(summaryText('am', row('daily_summary').payload)).toContain('ገቢ');
  });
  it('low-stock list', () => {
    expect(lowStockText('en', [])).toBe('Everything is well stocked.');
    expect(lowStockText('en', [{ name: 'Rice', stock_qty: 3, unit: 'kg' }])).toContain('• Rice: 3 kg');
    expect(formatQty(90.75)).toBe('90.75');
  });
});

describe('helpers', () => {
  it('formats ETB', () => {
    expect(formatEtb(25000)).toBe('ETB 25,000');
    expect(formatEtb(40.5)).toBe('ETB 40.5');
    expect(formatEtb('x')).toBe('');
  });
  it('escapes html', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
  it('classifies permanent Telegram errors', () => {
    expect(isPermanentTelegramError(403, 'Forbidden: bot was blocked by the user')).toBe(true);
    expect(isPermanentTelegramError(400, 'Bad Request: chat not found')).toBe(true);
    expect(isPermanentTelegramError(429, 'Too Many Requests')).toBe(false);
    expect(isPermanentTelegramError(500, 'Internal')).toBe(false);
  });
});
