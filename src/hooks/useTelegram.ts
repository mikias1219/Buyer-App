import { useEffect, useMemo, useState } from 'react';
import {
  getColorScheme,
  getUnsafeUser,
  getWebApp,
  initTelegram,
  type ColorScheme,
  type TelegramWebApp,
} from '../lib/telegram';
import type { TelegramUser } from '../types/telegram';

interface UseTelegramResult {
  tg: TelegramWebApp | null;
  user: TelegramUser | null;
  colorScheme: ColorScheme;
  isReady: boolean;
}

/**
 * Initializes the Telegram Mini App SDK and exposes user + theme data.
 * Outside Telegram (browser preview) it falls back to a demo user.
 */
export function useTelegram(): UseTelegramResult {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getColorScheme);
  const tg = useMemo(() => getWebApp(), []);

  useEffect(() => {
    return initTelegram(setColorScheme);
  }, []);

  const user = useMemo<TelegramUser | null>(() => {
    const fromTg = getUnsafeUser();
    if (fromTg?.id) {
      return {
        id: fromTg.id,
        first_name: fromTg.first_name ?? '',
        last_name: fromTg.last_name,
        username: fromTg.username,
        language_code: fromTg.language_code,
        photo_url: fromTg.photo_url,
      };
    }
    return { id: 0, first_name: 'Guest', username: 'guest_dev', language_code: 'en' };
  }, []);

  // The SDK script loads synchronously before the bundle, so the app is ready on first render.
  return { tg, user, colorScheme, isReady: true };
}
