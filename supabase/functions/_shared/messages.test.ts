import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatEtb,
  isPermanentTelegramError,
  NOTIFICATION_KINDS,
  renderNotification,
  type LinkConfig,
  type OutboxRow,
} from './messages.ts';

const cfg: LinkConfig = {
  miniAppUrl: 'https://techmarket.example/',
  botUsername: 'TechMarketBot',
  miniAppShortName: 'market',
  imageBaseUrl: 'https://proj.supabase.co/storage/v1/object/public/listing-images',
};

const product = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'iPhone 13',
  price: 32000,
  city: 'Adama',
  condition: 'good',
  status: 'active',
  cover_path: '42/11111111-1111-4111-8111-111111111111/a.webp',
};

function row(kind: string, language = 'en', payload: Record<string, unknown> = {}): OutboxRow {
  return {
    id: 1,
    chat_id: '42',
    kind,
    language,
    product,
    payload: { product_id: product.id, title: '<b>iPhone</b> & co', reason: 'bad_photos', amount_etb: 100, ...payload },
  };
}

describe('renderNotification', () => {
  it.each(NOTIFICATION_KINDS.flatMap((k) => [[k, 'en'], [k, 'am']]))('renders %s in %s', (kind, lang) => {
    const msg = renderNotification(row(kind, lang), cfg);
    expect(msg?.text.length).toBeGreaterThan(5);
    expect(msg?.button?.text).toBeTruthy();
  });

  it('escapes user content', () => {
    const msg = renderNotification(row('listing_live'), cfg);
    expect(msg?.text).toContain('&lt;b&gt;iPhone&lt;/b&gt; &amp; co');
    expect(msg?.text).not.toContain('<b><b>');
  });

  it('localizes reasons', () => {
    expect(renderNotification(row('listing_rejected', 'en'), cfg)?.text).toContain('photos are unclear');
    expect(renderNotification(row('listing_rejected', 'am'), cfg)?.text).toContain('ፎቶዎቹ');
  });

  it('private messages open the exact screen via web_app', () => {
    expect(renderNotification(row('payment_rejected'), cfg)?.button?.webAppUrl).toBe(
      'https://techmarket.example/#/mine?tab=action',
    );
    expect(renderNotification(row('listing_live'), cfg)?.button?.webAppUrl).toBe(
      `https://techmarket.example/#/p/${product.id}`,
    );
  });

  it('channel posts use a startapp deep link and the cover photo', () => {
    const msg = renderNotification(row('channel_post'), cfg);
    expect(msg?.button?.url).toBe(`https://t.me/TechMarketBot/market?startapp=p_${product.id}`);
    expect(msg?.photoUrl).toBe(`${cfg.imageBaseUrl}/${product.cover_path}`);
    expect(msg?.text).toContain('ETB 32,000');
  });

  it('unknown kinds are skipped, unknown languages fall back to English', () => {
    expect(renderNotification(row('nope'), cfg)).toBeNull();
    expect(renderNotification(row('listing_live', 'fr'), cfg)?.text).toContain('is live');
  });
});

describe('helpers', () => {
  it('formats ETB', () => {
    expect(formatEtb(25000)).toBe('ETB 25,000');
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
