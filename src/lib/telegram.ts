/**
 * Typed, defensive wrapper around `window.Telegram.WebApp`.
 *
 * Every helper is a safe no-op (or a sensible browser fallback) when the app runs
 * outside Telegram, so screens never need to null-check the SDK themselves.
 * Only the subset of the Bot API we actually use is typed here.
 */

export type ColorScheme = 'light' | 'dark';
export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type NotificationType = 'error' | 'success' | 'warning';

export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  destructive_text_color?: string;
  section_bg_color?: string;
  header_bg_color?: string;
}

export interface TelegramUnsafeUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface BottomButton {
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  show(): void;
  hide(): void;
}

interface BackButtonApi {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface RequestContactResult {
  status: 'sent' | 'cancelled';
  /** Signed query string; validate server-side like initData. */
  response?: string;
  responseUnsafe?: { contact?: { phone_number?: string; user_id?: number } };
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUnsafeUser; start_param?: string; auth_date?: number };
  version: string;
  platform: string;
  colorScheme: ColorScheme;
  themeParams: TelegramThemeParams;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  showAlert(message: string, cb?: () => void): void;
  showConfirm(message: string, cb?: (ok: boolean) => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  requestContact?(cb?: (ok: boolean, result?: RequestContactResult) => void): void;
  MainButton: BottomButton;
  BackButton: BackButtonApi;
  HapticFeedback?: {
    impactOccurred(style: ImpactStyle): void;
    notificationOccurred(type: NotificationType): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  };
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  // The SDK script defines WebApp even in a normal browser, but with empty initData.
  return tg ?? null;
}

/** True only when launched by a Telegram client (signed initData present). */
export function isInTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}

function supports(version: string): boolean {
  const tg = getWebApp();
  try {
    return Boolean(tg?.isVersionAtLeast(version));
  } catch {
    return false;
  }
}

// ─── Lifecycle & theme ──────────────────────────────────────────────

export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

export function getUnsafeUser(): TelegramUnsafeUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

export function getColorScheme(): ColorScheme {
  const tg = getWebApp();
  if (tg?.initData) return tg.colorScheme === 'dark' ? 'dark' : 'light';
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Mirror Telegram theme params into CSS variables used by the design tokens. */
export function syncTelegramTheme(): ColorScheme {
  const scheme = getColorScheme();
  if (typeof document === 'undefined') return scheme;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.classList.toggle('dark', scheme === 'dark');
  const params = isInTelegram() ? (getWebApp()?.themeParams ?? {}) : {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) {
      root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value);
    }
  }
  return scheme;
}

/**
 * Call once at boot. Signals readiness, expands, syncs theme and subscribes to
 * theme changes. Returns an unsubscribe function.
 */
export function initTelegram(onThemeChange?: (scheme: ColorScheme) => void): () => void {
  const tg = getWebApp();
  syncTelegramTheme();
  if (!tg?.initData) return () => {};
  try {
    tg.ready();
    tg.expand();
    if (supports('7.7')) tg.disableVerticalSwipes?.();
  } catch {
    // Older clients: best effort only.
  }
  const handler = () => onThemeChange?.(syncTelegramTheme());
  tg.onEvent('themeChanged', handler);
  return () => tg.offEvent('themeChanged', handler);
}

export function setChromeColor(color: string): void {
  const tg = getWebApp();
  if (!tg?.initData) return;
  try {
    tg.setHeaderColor?.(color);
    tg.setBackgroundColor?.(color);
  } catch {
    // Unsupported on old clients.
  }
}

// ─── Deep links ─────────────────────────────────────────────────────

export type StartParam =
  | { kind: 'product'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'seller'; id: string };

const START_PARAM_RE = /^([pcs])_([A-Za-z0-9-]{1,64})$/;

export function parseStartParam(input?: string | null): StartParam | null {
  if (!input) return null;
  const match = START_PARAM_RE.exec(input.trim());
  if (!match) return null;
  const [, prefix, id] = match;
  if (!id) return null;
  if (prefix === 'p') return { kind: 'product', id };
  if (prefix === 'c') return { kind: 'category', id };
  return { kind: 'seller', id };
}

export function getStartParam(): StartParam | null {
  const tg = getWebApp();
  const fromSdk = tg?.initDataUnsafe?.start_param;
  if (fromSdk) return parseStartParam(fromSdk);
  if (typeof window === 'undefined') return null;
  // Direct links (t.me/<bot>/<app>?startapp=…) also pass tgWebAppStartParam in the URL.
  const params = new URLSearchParams(window.location.search);
  return parseStartParam(params.get('tgWebAppStartParam') ?? params.get('startapp'));
}

export function startParamToPath(param: StartParam | null): string | null {
  if (!param) return null;
  switch (param.kind) {
    case 'product':
      return `/p/${param.id}`;
    case 'category':
      return `/search?category=${encodeURIComponent(param.id)}`;
    case 'seller':
      return `/seller/${param.id}`;
  }
}

// ─── Buttons ────────────────────────────────────────────────────────

export interface MainButtonOptions {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  textColor?: string;
}

/** Shows Telegram's MainButton. Returns a cleanup that hides it again. */
export function showMainButton(opts: MainButtonOptions): () => void {
  const tg = getWebApp();
  if (!tg?.initData) return () => {};
  const btn = tg.MainButton;
  btn.setParams({
    text: opts.text,
    is_active: !opts.disabled,
    is_visible: true,
    ...(opts.color ? { color: opts.color } : {}),
    ...(opts.textColor ? { text_color: opts.textColor } : {}),
  });
  if (opts.loading) btn.showProgress(false);
  else btn.hideProgress();
  btn.onClick(opts.onClick);
  return () => {
    btn.offClick(opts.onClick);
    btn.hideProgress();
    btn.hide();
  };
}

export function showBackButton(onClick: () => void): () => void {
  const tg = getWebApp();
  if (!tg?.initData) return () => {};
  tg.BackButton.onClick(onClick);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onClick);
    tg.BackButton.hide();
  };
}

// ─── Haptics ────────────────────────────────────────────────────────

export const haptic = {
  impact(style: ImpactStyle = 'light'): void {
    try {
      getWebApp()?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not supported */
    }
  },
  notify(type: NotificationType): void {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred(type);
    } catch {
      /* not supported */
    }
  },
  selection(): void {
    try {
      getWebApp()?.HapticFeedback?.selectionChanged();
    } catch {
      /* not supported */
    }
  },
};

// ─── Dialogs & links ────────────────────────────────────────────────

export function showConfirm(message: string): Promise<boolean> {
  const tg = getWebApp();
  if (tg?.initData) {
    return new Promise((resolve) => tg.showConfirm(message, (ok) => resolve(Boolean(ok))));
  }
  return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
}

export function showAlert(message: string): Promise<void> {
  const tg = getWebApp();
  if (tg?.initData) return new Promise((resolve) => tg.showAlert(message, resolve));
  if (typeof window !== 'undefined') window.alert(message);
  return Promise.resolve();
}

export function openTelegramLink(url: string): void {
  const tg = getWebApp();
  if (tg?.initData && /^https:\/\/t\.me\//.test(url)) {
    tg.openTelegramLink(url);
    return;
  }
  openExternalLink(url);
}

export function openExternalLink(url: string): void {
  const tg = getWebApp();
  if (tg?.initData && /^https?:\/\//.test(url)) {
    tg.openLink(url);
    return;
  }
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
}

export function buildShareUrl(link: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

export function shareLink(link: string, text: string): void {
  openTelegramLink(buildShareUrl(link, text));
}

// ─── Contact (phone verification) ───────────────────────────────────

export type ContactRequestResult =
  | { ok: true; response: string; phone?: string }
  | { ok: false; reason: 'unsupported' | 'cancelled' };

/** Ask the user to share their phone. `response` must be verified by the backend. */
export function requestContact(): Promise<ContactRequestResult> {
  const tg = getWebApp();
  if (!tg?.initData || !tg.requestContact || !supports('6.9')) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }
  return new Promise((resolve) => {
    tg.requestContact?.((ok, result) => {
      if (ok && result?.response) {
        const phone = result.responseUnsafe?.contact?.phone_number;
        resolve(phone ? { ok: true, response: result.response, phone } : { ok: true, response: result.response });
      } else {
        resolve({ ok: false, reason: 'cancelled' });
      }
    });
  });
}

// ─── Cloud storage (falls back to localStorage) ─────────────────────

function localGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const cloudStorage = {
  get(key: string): Promise<string | null> {
    const cs = getWebApp()?.CloudStorage;
    if (!isInTelegram() || !cs || !supports('6.9')) return Promise.resolve(localGet(key));
    return new Promise((resolve) => {
      cs.getItem(key, (err, value) => resolve(err ? localGet(key) : (value ?? null) || null));
    });
  },
  set(key: string, value: string): Promise<void> {
    localSet(key, value);
    const cs = getWebApp()?.CloudStorage;
    if (!isInTelegram() || !cs || !supports('6.9')) return Promise.resolve();
    return new Promise((resolve) => cs.setItem(key, value, () => resolve()));
  },
};
