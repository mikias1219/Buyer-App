import { useEffect, useMemo, useState } from 'react';
import type { TelegramUser } from '../types/telegram';

type ColorScheme = 'light' | 'dark';
type TgWebApp = Window['Telegram']['WebApp'];

interface UseTelegramResult {
  tg: TgWebApp | null;
  user: TelegramUser | null;
  colorScheme: ColorScheme;
  isReady: boolean;
}

function getWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Initializes the Telegram Mini App SDK and exposes safe user + theme data.
 * Outside Telegram (browser preview), falls back to a demo user and light theme.
 */
export function useTelegram(): UseTelegramResult {
  const [isReady, setIsReady] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');

  const tg = useMemo(() => getWebApp(), []);

  useEffect(() => {
    if (!tg) {
      setIsReady(true);
      return;
    }

    try {
      tg.ready();
      tg.expand();

      const scheme = (tg.colorScheme as ColorScheme) || 'light';
      setColorScheme(scheme);
      applyTheme(tg, scheme);

      const onThemeChanged = () => {
        const next = (tg.colorScheme as ColorScheme) || 'light';
        setColorScheme(next);
        applyTheme(tg, next);
      };

      tg.onEvent?.('themeChanged', onThemeChanged);
      setIsReady(true);

      return () => {
        tg.offEvent?.('themeChanged', onThemeChanged);
      };
    } catch (err) {
      console.warn('[telegram] init failed:', err);
      setIsReady(true);
    }
  }, [tg]);

  const user = useMemo<TelegramUser | null>(() => {
    const fromTg = tg?.initDataUnsafe?.user;
    if (fromTg?.id) {
      return {
        id: fromTg.id,
        first_name: fromTg.first_name,
        last_name: fromTg.last_name,
        username: fromTg.username,
        language_code: fromTg.language_code,
        is_premium: fromTg.is_premium,
        photo_url: fromTg.photo_url,
      };
    }

    // Browser preview fallback so Profile is never empty during local dev
    return {
      id: 0,
      first_name: 'Guest',
      username: 'guest_dev',
      language_code: 'en',
    };
  }, [tg]);

  return { tg, user, colorScheme, isReady };
}

function applyTheme(tg: TgWebApp, scheme: ColorScheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', scheme === 'dark');

  const bg = tg.themeParams?.bg_color || (scheme === 'dark' ? '#0f0f0f' : '#efeff4');
  const text =
    tg.themeParams?.text_color || (scheme === 'dark' ? '#ffffff' : '#000000');

  document.body.style.backgroundColor = bg;
  document.body.style.color = text;

  // Sync browser chrome when running inside Telegram
  try {
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
  } catch {
    // Older clients may not support these — ignore
  }
}
