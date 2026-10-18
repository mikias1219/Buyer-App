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

/** Quantities: up to 3 decimals, no trailing zeros. */
export function formatQty(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

const UNITS: Record<Lang, Record<string, string>> = {
  en: { piece: 'pcs', pack: 'packs', box: 'boxes', kg: 'kg', g: 'g', litre: 'L', metre: 'm' },
  am: { piece: 'ፍሬ', pack: 'ጥቅል', box: 'ሳጥን', kg: 'ኪ.ግ', g: 'ግ', litre: 'ሊ', metre: 'ሜ' },
};

/** Daily summary / `/today` body (also used by the bot command). */
export function summaryText(lang: Lang, p: Record<string, unknown>): string {
  const L = lang === 'am'
    ? { title: 'የዛሬ ማጠቃለያ', revenue: 'ገቢ', gross: 'ጠቅላላ ትርፍ', expenses: 'ወጪዎች', net: 'የተጣራ ትርፍ', sales: 'ሽያጮች', items: 'የተሸጡ ዕቃዎች', low: 'ዝቅተኛ ክምችት', credit: 'ያልተከፈለ ዱቤ' }
    : { title: "Today's summary", revenue: 'Revenue', gross: 'Gross profit', expenses: 'Expenses', net: 'Net profit', sales: 'Sales', items: 'Items sold', low: 'Low stock', credit: 'Unpaid credit' };
  const lines = [
    `<b>${escapeHtml(p.shop_name || L.title)}</b> · ${escapeHtml(p.date)}`,
    '',
    `${L.revenue}: <b>${formatEtb(p.revenue)}</b>`,
    `${L.gross}: ${formatEtb(p.gross_profit)}`,
    `${L.expenses}: ${formatEtb(p.expenses)}`,
    `${L.net}: <b>${formatEtb(p.net_profit)}</b>`,
    `${L.sales}: ${formatQty(p.sales_count)} · ${L.items}: ${formatQty(p.items_sold)}`,
    `${L.low}: ${formatQty(p.low_count)}`,
  ];
  if (Number(p.receivables) > 0) lines.push(`${L.credit}: ${formatEtb(p.receivables)}`);
  return lines.join('\n');
}

/** `/lowstock` body. */
export function lowStockText(lang: Lang, items: Array<Record<string, unknown>>): string {
  if (items.length === 0) return lang === 'am' ? 'ሁሉም ዕቃዎች በበቂ ክምችት አሉ።' : 'Everything is well stocked.';
  const head = lang === 'am' ? '<b>ዝቅተኛ ክምችት</b>' : '<b>Low stock</b>';
  return [
    head,
    ...items.map((i) => `• ${escapeHtml(i.name)}: ${formatQty(i.stock_qty)} ${UNITS[lang][String(i.unit)] ?? ''}`.trimEnd()),
  ].join('\n');
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
    low_stock: (p) => ({
      text: `<b>Low stock:</b> ${escapeHtml(p.name)} — ${formatQty(p.stock_qty)} ${UNITS.en[String(p.unit)] ?? ''} left (reorder at ${formatQty(p.reorder_level)}).`,
      button: 'Open products',
      path: '/products?stock=low',
    }),
    daily_summary: (p) => ({ text: summaryText('en', p), button: 'Open dashboard', path: '/dashboard' }),
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
    low_stock: (p) => ({
      text: `<b>ዝቅተኛ ክምችት፦</b> ${escapeHtml(p.name)} — ${formatQty(p.stock_qty)} ${UNITS.am[String(p.unit)] ?? ''} ቀርቷል (የመሙያ ደረጃ ${formatQty(p.reorder_level)})።`,
      button: 'ዕቃዎችን ክፈት',
      path: '/products?stock=low',
    }),
    daily_summary: (p) => ({ text: summaryText('am', p), button: 'ዳሽቦርድ ክፈት', path: '/dashboard' }),
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
