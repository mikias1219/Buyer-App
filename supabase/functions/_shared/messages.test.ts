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

const cfg: LinkConfig = { miniAppUrl: 'https://shop.example/' };

function row(kind: string, language = 'en', payload: Record<string, unknown> = {}): OutboxRow {
  return {
    id: 1,
    chat_id: '42',
    kind,
    language,
    payload: { name: '<b>Abel</b> & co', username: 'abel_k', role: 'staff', ...payload },
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
