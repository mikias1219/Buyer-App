import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildShareUrl, isInTelegram, showMainButton } from './telegram';

function stubWindow(webApp: unknown, search = '') {
  vi.stubGlobal('window', {
    Telegram: webApp === undefined ? undefined : { WebApp: webApp },
    location: { search },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('main button is a no-op outside Telegram', () => {
    stubWindow(undefined);
    const cleanup = showMainButton({ text: 'Go', onClick: () => {} });
    expect(() => cleanup()).not.toThrow();
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
});

describe('buildShareUrl', () => {
  it('encodes link and text', () => {
    expect(buildShareUrl('https://t.me/bot/app?startapp=p_1', 'iPhone 13 · ETB 30,000')).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fbot%2Fapp%3Fstartapp%3Dp_1&text=iPhone%2013%20%C2%B7%20ETB%2030%2C000',
    );
  });
});
