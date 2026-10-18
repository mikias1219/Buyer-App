/**
 * Bot notification rendering (SPEC A5 flow 11–12). Pure functions, localized en/am.
 * Messages use Telegram HTML parse mode; every interpolated value is escaped.
 */

export type Lang = 'en' | 'am';

export interface OutboxRow {
  id: number;
  chat_id: string;
  kind: string;
  payload: Record<string, unknown>;
  language: string;
}

export interface LinkConfig {
  /** Deployed Mini App URL (MINI_APP_URL), used for web_app buttons in private chats. */
  miniAppUrl: string;
}

export interface RenderedMessage {
  text: string;
  button?: { text: string; webAppUrl: string };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatEtb(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `ETB ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const ROLES: Record<Lang, Record<string, string>> = {
  en: { owner: 'owner', staff: 'staff (cashier)', user: 'no access' },
  am: { owner: 'ባለቤት', staff: 'ሠራተኛ (ገንዘብ ተቀባይ)', user: 'ፈቃድ የለም' },
};

type Template = (p: Record<string, unknown>) => { text: string; button: string; path: string };

const T: Record<Lang, Record<string, Template>> = {
  en: {
    access_request: (p) => ({
      text: `<b>${escapeHtml(p.name || 'Someone')}</b>${p.username ? ` (@${escapeHtml(p.username)})` : ''} opened the shop app and is asking for access.`,
      button: 'Review in Team',
      path: '/more/team',
    }),
    role_changed: (p) => ({
      text:
        p.role === 'user'
          ? 'Your access to the shop app was removed.'
          : `You now have <b>${escapeHtml(ROLES.en[String(p.role)] ?? p.role)}</b> access to the shop app.`,
      button: 'Open the app',
      path: '/',
    }),
  },
  am: {
    access_request: (p) => ({
      text: `<b>${escapeHtml(p.name || 'አንድ ሰው')}</b>${p.username ? ` (@${escapeHtml(p.username)})` : ''} የሱቁን መተግበሪያ ከፍተው ፈቃድ እየጠየቁ ነው።`,
      button: 'በቡድን ገጽ ይመልከቱ',
      path: '/more/team',
    }),
    role_changed: (p) => ({
      text:
        p.role === 'user'
          ? 'የሱቁ መተግበሪያ ፈቃድዎ ተነስቷል።'
          : `አሁን በሱቁ መተግበሪያ የ<b>${escapeHtml(ROLES.am[String(p.role)] ?? p.role)}</b> ፈቃድ አለዎት።`,
      button: 'መተግበሪያውን ይክፈቱ',
      path: '/',
    }),
  },
};

export function toLang(value: string | null | undefined): Lang {
  return value === 'am' ? 'am' : 'en';
}

export const NOTIFICATION_KINDS = Object.keys(T.en);

export function renderNotification(row: OutboxRow, cfg: LinkConfig): RenderedMessage | null {
  const lang = toLang(row.language);
  const template = T[lang][row.kind] ?? T.en[row.kind];
  if (!template) return null;
  const { text, button, path } = template(row.payload);
  const webAppUrl = cfg.miniAppUrl ? `${cfg.miniAppUrl.replace(/\/+$/, '')}/#${path}` : undefined;
  return { text, ...(webAppUrl ? { button: { text: button, webAppUrl } } : {}) };
}

/**
 * Telegram API errors that will never succeed on retry → stop retrying (and mark the user
 * bot_blocked for 403s).
 */
export function isPermanentTelegramError(status: number, description: string): boolean {
  if (status === 403) return true;
  if (status === 400 && /chat not found|user is deactivated|PEER_ID_INVALID/i.test(description)) return true;
  return false;
}
