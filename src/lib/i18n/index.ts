import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import am from '../../locales/am.json';
import en from '../../locales/en.json';
import { cloudStorage, getUnsafeUser } from '../telegram';
import type { Language } from '../api/types';

export const LANGUAGES: readonly Language[] = ['en', 'am'];
const STORAGE_KEY = 'tm_lang';

function initialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'am') return stored;
  } catch {
    /* storage unavailable */
  }
  return getUnsafeUser()?.language_code?.startsWith('am') ? 'am' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, am: { translation: am } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

/** Persist locally + in Telegram CloudStorage; the profile language is saved by the caller. */
export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  void cloudStorage.set(STORAGE_KEY, lang);
}

/** Restore a language chosen on another device (CloudStorage) once at boot. */
export async function restoreLanguage(): Promise<void> {
  const stored = await cloudStorage.get(STORAGE_KEY);
  if ((stored === 'en' || stored === 'am') && stored !== i18n.language) {
    void i18n.changeLanguage(stored);
    document.documentElement.lang = stored;
  }
}

export default i18n;
