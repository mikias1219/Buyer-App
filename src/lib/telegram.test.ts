import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildShareUrl,
  getStartParam,
  isInTelegram,
  parseStartParam,
  requestContact,
  showMainButton,
  startParamToPath,
} from './telegram';

function stubWindow(webApp: unknown, search = '') {
  vi.stubGlobal('window', {
    Telegram: webApp === undefined ? undefined : { WebApp: webApp },
    location: { search },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseStartParam', () => {
  it('parses product, category and seller payloads', () => {
    expect(parseStartParam('p_6f1c2a4e-1111-4222-8333-944455556666')).toEqual({
      kind: 'product',
      id: '6f1c2a4e-1111-4222-8333-944455556666',
    });
    expect(parseStartParam('c_Phone')).toEqual({ kind: 'category', id: 'Phone' });
    expect(parseStartParam('s_abc123')).toEqual({ kind: 'seller', id: 'abc123' });
  });

  it('rejects unknown prefixes, empty ids and injection attempts', () => {
    expect(parseStartParam(null)).toBeNull();
    expect(parseStartParam('')).toBeNull();
    expect(parseStartParam('x_1')).toBeNull();
    expect(parseStartParam('p_')).toBeNull();
    expect(parseStartParam('p_../../admin')).toBeNull();
    expect(parseStartParam('c_<script>')).toBeNull();
  });

  it('maps params to routes', () => {
    expect(startParamToPath({ kind: 'product', id: 'a1' })).toBe('/p/a1');
    expect(startParamToPath({ kind: 'category', id: 'Phone' })).toBe('/search?category=Phone');
    expect(startParamToPath({ kind: 'seller', id: 's9' })).toBe('/seller/s9');
    expect(startParamToPath(null)).toBeNull();
  });
});

describe('browser fallbacks', () => {
  it('is not "in Telegram" without signed initData', () => {
    stubWindow(undefined);
    expect(isInTelegram()).toBe(false);
    stubWindow({ initData: '' });
    expect(isInTelegram()).toBe(false);
    stubWindow({ initData: 'query_id=1&hash=abc' });
    expect(isInTelegram()).toBe(true);
  });

  it('reads startapp from the URL when the SDK has none', () => {
    stubWindow({ initData: '', initDataUnsafe: {} }, '?tgWebAppStartParam=p_abc');
    expect(getStartParam()).toEqual({ kind: 'product', id: 'abc' });
  });

  it('main button is a no-op outside Telegram', () => {
    stubWindow(undefined);
    const cleanup = showMainButton({ text: 'Go', onClick: () => {} });
    expect(() => cleanup()).not.toThrow();
  });

  it('requestContact reports unsupported outside Telegram', async () => {
    stubWindow(undefined);
    await expect(requestContact()).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('inside Telegram', () => {
  it('wires and cleans up the MainButton', () => {
    const btn = {
      setParams: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    };
    stubWindow({ initData: 'x', MainButton: btn });
    const onClick = () => {};
    const cleanup = showMainButton({ text: 'Publish', onClick, loading: true });
    expect(btn.setParams).toHaveBeenCalledWith({ text: 'Publish', is_active: true, is_visible: true });
    expect(btn.showProgress).toHaveBeenCalled();
    expect(btn.onClick).toHaveBeenCalledWith(onClick);
    cleanup();
    expect(btn.offClick).toHaveBeenCalledWith(onClick);
    expect(btn.hide).toHaveBeenCalled();
  });

  it('returns the signed contact response', async () => {
    stubWindow({
      initData: 'x',
      isVersionAtLeast: () => true,
      requestContact: (cb: (ok: boolean, r: unknown) => void) =>
        cb(true, {
          status: 'sent',
          response: 'contact=...&hash=h',
          responseUnsafe: { contact: { phone_number: '251911000000' } },
        }),
    });
    await expect(requestContact()).resolves.toEqual({
      ok: true,
      response: 'contact=...&hash=h',
      phone: '251911000000',
    });
  });
});

describe('buildShareUrl', () => {
  it('encodes link and text', () => {
    expect(buildShareUrl('https://t.me/bot/app?startapp=p_1', 'iPhone 13 · ETB 30,000')).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fbot%2Fapp%3Fstartapp%3Dp_1&text=iPhone%2013%20%C2%B7%20ETB%2030%2C000',
    );
  });
});
