/**
 * Bot notification rendering (SPEC A5 flow 6). Pure functions, localized en/am.
 * Messages use Telegram HTML parse mode; every interpolated value is escaped.
 */

export type Lang = 'en' | 'am';

export interface OutboxProduct {
  id: string;
  title: string;
  price: number | null;
  city: string;
  condition: string | null;
  status: string;
  cover_path: string | null;
}

export interface OutboxRow {
  id: number;
  chat_id: string;
  kind: string;
  payload: Record<string, unknown>;
  language: string;
  product: OutboxProduct | null;
}

export interface LinkConfig {
  /** Deployed Mini App URL (MINI_APP_URL), used for web_app buttons in private chats. */
  miniAppUrl: string;
  /** For channel posts: t.me/<bot>/<app>?startapp=… */
  botUsername: string;
  miniAppShortName: string;
  /** Public base URL for listing images (…/storage/v1/object/public/listing-images). */
  imageBaseUrl: string;
}

export interface RenderedMessage {
  text: string;
  button?: { text: string; webAppUrl?: string; url?: string };
  photoUrl?: string;
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
  return `ETB ${Math.round(n).toLocaleString('en-US')}`;
}

const REASONS: Record<Lang, Record<string, string>> = {
  en: {
    invalid_reference: 'the Telebirr reference could not be found',
    wrong_amount: 'the amount paid was not correct',
    prohibited_item: 'this item is not allowed on TechMarket',
    bad_photos: 'the photos are unclear or missing',
    misleading_price: 'the price looks misleading',
    duplicate: 'it duplicates another listing or payment',
    other: 'it did not meet our listing rules',
  },
  am: {
    invalid_reference: 'የቴሌብር ማጣቀሻ ቁጥሩ አልተገኘም',
    wrong_amount: 'የተከፈለው መጠን ትክክል አይደለም',
    prohibited_item: 'ይህ ዕቃ በቴክማርኬት ላይ አይፈቀድም',
    bad_photos: 'ፎቶዎቹ ግልጽ አይደሉም ወይም የሉም',
    misleading_price: 'ዋጋው አሳሳች ይመስላል',
    duplicate: 'ሌላ ማስታወቂያ ወይም ክፍያ ይደግማል',
    other: 'የማስታወቂያ ደንቦቻችንን አላሟላም',
  },
};

type Template = (p: Record<string, unknown>, product: OutboxProduct | null) => { text: string; button: string; path: string };

const T: Record<Lang, Record<string, Template>> = {
  en: {
    payment_submitted: (p) => ({
      text: `💳 <b>New payment to review</b>\n${escapeHtml(p.title)} · ${formatEtb(p.amount_etb)}\nReference: <code>${escapeHtml(p.reference)}</code>`,
      button: 'Review payment',
      path: '/admin/payments',
    }),
    payment_confirmed: (p) => ({
      text:
        p.kind === 'boost'
          ? `✅ Payment confirmed. <b>${escapeHtml(p.title)}</b> is now featured.`
          : p.listing_status === 'in_review'
            ? `✅ Payment confirmed for <b>${escapeHtml(p.title)}</b>. It will go live after a quick review.`
            : `✅ Payment confirmed. <b>${escapeHtml(p.title)}</b> is live!`,
      button: 'Open listing',
      path: `/p/${String(p.product_id)}`,
    }),
    payment_rejected: (p) => ({
      text: `⚠️ Your payment for <b>${escapeHtml(p.title)}</b> was not accepted: ${escapeHtml(reason('en', p.reason))}.${p.note ? `\n“${escapeHtml(p.note)}”` : ''}\nYou can fix it and resubmit.`,
      button: 'Fix & resubmit',
      path: '/mine?tab=action',
    }),
    payment_refunded: (p) => ({
      text: `↩️ Your payment for <b>${escapeHtml(p.title)}</b> was refunded.`,
      button: 'My listings',
      path: '/mine',
    }),
    listing_live: (p) => ({
      text: `🎉 <b>${escapeHtml(p.title)}</b> is live. Buyers can now contact you.`,
      button: 'View listing',
      path: `/p/${String(p.product_id)}`,
    }),
    listing_rejected: (p) => ({
      text: `⚠️ <b>${escapeHtml(p.title)}</b> was not approved: ${escapeHtml(reason('en', p.reason))}.${p.note ? `\n“${escapeHtml(p.note)}”` : ''}`,
      button: 'Fix listing',
      path: `/mine/${String(p.product_id)}/edit`,
    }),
    listing_removed: (p) => ({
      text: `🚫 <b>${escapeHtml(p.title)}</b> was removed: ${escapeHtml(reason('en', p.reason))}.`,
      button: 'My listings',
      path: '/mine',
    }),
    listing_expiring: (p) => ({
      text: `⏳ <b>${escapeHtml(p.title)}</b> expires soon. Mark it sold if it's gone, or renew it after it expires.`,
      button: 'Manage listing',
      path: '/mine',
    }),
    listing_expired: (p) => ({
      text: `⌛ <b>${escapeHtml(p.title)}</b> has expired and is hidden. Renew it to show it again.`,
      button: 'Renew',
      path: '/mine?tab=expired',
    }),
    new_lead: (p) => ({
      text: `👋 ${escapeHtml(p.buyer_name || 'A buyer')}${p.buyer_username ? ` (@${escapeHtml(p.buyer_username)})` : ''} is interested in <b>${escapeHtml(p.title)}</b>.`,
      button: 'Open listing',
      path: `/p/${String(p.product_id)}`,
    }),
    price_drop: (p) => ({
      text: `📉 Price drop on a saved item: <b>${escapeHtml(p.title)}</b> is now ${formatEtb(p.new_price)} (was ${formatEtb(p.old_price)}).`,
      button: 'See it',
      path: `/p/${String(p.product_id)}`,
    }),
    review_request: (p) => ({
      text: `⭐ <b>${escapeHtml(p.title)}</b> was marked sold. How was the seller? Your rating helps other buyers.`,
      button: 'Rate seller',
      path: `/p/${String(p.product_id)}?review=1`,
    }),
    channel_post: (_p, product) => ({
      text: `<b>${escapeHtml(product?.title)}</b>\n${formatEtb(product?.price)}${product?.city ? ` · ${escapeHtml(product.city)}` : ''}`,
      button: 'View in app',
      path: `/p/${String(product?.id ?? '')}`,
    }),
  },
  am: {
    payment_submitted: (p) => ({
      text: `💳 <b>አዲስ ክፍያ ለማረጋገጥ</b>\n${escapeHtml(p.title)} · ${formatEtb(p.amount_etb)}\nማጣቀሻ: <code>${escapeHtml(p.reference)}</code>`,
      button: 'ክፍያውን ይመልከቱ',
      path: '/admin/payments',
    }),
    payment_confirmed: (p) => ({
      text:
        p.kind === 'boost'
          ? `✅ ክፍያው ተረጋግጧል። <b>${escapeHtml(p.title)}</b> አሁን ተለይቶ ቀርቧል።`
          : p.listing_status === 'in_review'
            ? `✅ ለ<b>${escapeHtml(p.title)}</b> ክፍያው ተረጋግጧል። ከአጭር ግምገማ በኋላ ይታተማል።`
            : `✅ ክፍያው ተረጋግጧል። <b>${escapeHtml(p.title)}</b> ታትሟል!`,
      button: 'ማስታወቂያውን ይክፈቱ',
      path: `/p/${String(p.product_id)}`,
    }),
    payment_rejected: (p) => ({
      text: `⚠️ ለ<b>${escapeHtml(p.title)}</b> ያቀረቡት ክፍያ አልተቀበለም፦ ${escapeHtml(reason('am', p.reason))}።${p.note ? `\n“${escapeHtml(p.note)}”` : ''}\nአስተካክለው እንደገና ማቅረብ ይችላሉ።`,
      button: 'አስተካክለው ያቅርቡ',
      path: '/mine?tab=action',
    }),
    payment_refunded: (p) => ({
      text: `↩️ ለ<b>${escapeHtml(p.title)}</b> የከፈሉት ገንዘብ ተመልሷል።`,
      button: 'የእኔ ማስታወቂያዎች',
      path: '/mine',
    }),
    listing_live: (p) => ({
      text: `🎉 <b>${escapeHtml(p.title)}</b> ታትሟል። ገዢዎች አሁን ሊያገኙዎት ይችላሉ።`,
      button: 'ማስታወቂያውን ይመልከቱ',
      path: `/p/${String(p.product_id)}`,
    }),
    listing_rejected: (p) => ({
      text: `⚠️ <b>${escapeHtml(p.title)}</b> አልጸደቀም፦ ${escapeHtml(reason('am', p.reason))}።${p.note ? `\n“${escapeHtml(p.note)}”` : ''}`,
      button: 'ያስተካክሉ',
      path: `/mine/${String(p.product_id)}/edit`,
    }),
    listing_removed: (p) => ({
      text: `🚫 <b>${escapeHtml(p.title)}</b> ተወግዷል፦ ${escapeHtml(reason('am', p.reason))}።`,
      button: 'የእኔ ማስታወቂያዎች',
      path: '/mine',
    }),
    listing_expiring: (p) => ({
      text: `⏳ <b>${escapeHtml(p.title)}</b> በቅርቡ ጊዜው ያልፋል። ከተሸጠ «ተሸጧል» ይበሉ፣ ካለፈ በኋላ ደግሞ ማደስ ይችላሉ።`,
      button: 'ያስተዳድሩ',
      path: '/mine',
    }),
    listing_expired: (p) => ({
      text: `⌛ <b>${escapeHtml(p.title)}</b> ጊዜው አልፎ ተደብቋል። እንደገና ለማሳየት ያድሱት።`,
      button: 'ያድሱ',
      path: '/mine?tab=expired',
    }),
    new_lead: (p) => ({
      text: `👋 ${escapeHtml(p.buyer_name || 'አንድ ገዢ')}${p.buyer_username ? ` (@${escapeHtml(p.buyer_username)})` : ''} <b>${escapeHtml(p.title)}</b> ላይ ፍላጎት አሳይተዋል።`,
      button: 'ማስታወቂያውን ይክፈቱ',
      path: `/p/${String(p.product_id)}`,
    }),
    price_drop: (p) => ({
      text: `📉 ያስቀመጡት ዕቃ ዋጋ ቀንሷል፦ <b>${escapeHtml(p.title)}</b> አሁን ${formatEtb(p.new_price)} (ቀድሞ ${formatEtb(p.old_price)})።`,
      button: 'ይመልከቱ',
      path: `/p/${String(p.product_id)}`,
    }),
    review_request: (p) => ({
      text: `⭐ <b>${escapeHtml(p.title)}</b> ተሽጧል። ሻጩ እንዴት ነበር? ደረጃዎ ሌሎች ገዢዎችን ይረዳል።`,
      button: 'ሻጩን ይገምግሙ',
      path: `/p/${String(p.product_id)}?review=1`,
    }),
    channel_post: (_p, product) => ({
      text: `<b>${escapeHtml(product?.title)}</b>\n${formatEtb(product?.price)}${product?.city ? ` · ${escapeHtml(product.city)}` : ''}`,
      button: 'በመተግበሪያው ይመልከቱ',
      path: `/p/${String(product?.id ?? '')}`,
    }),
  },
};

function reason(lang: Lang, code: unknown): string {
  const table = REASONS[lang];
  return table[String(code)] ?? table.other ?? '';
}

export function toLang(value: string | null | undefined): Lang {
  return value === 'am' ? 'am' : 'en';
}

export const NOTIFICATION_KINDS = Object.keys(T.en);

/** Deep link that opens the Mini App on a given route from any chat (incl. channels). */
export function startAppLink(cfg: LinkConfig, path: string): string | null {
  if (!cfg.botUsername || !cfg.miniAppShortName) return null;
  const product = /^\/p\/([0-9a-f-]{36})/.exec(path);
  const base = `https://t.me/${cfg.botUsername}/${cfg.miniAppShortName}`;
  return product ? `${base}?startapp=p_${product[1]}` : base;
}

export function renderNotification(row: OutboxRow, cfg: LinkConfig): RenderedMessage | null {
  const lang = toLang(row.language);
  const template = T[lang][row.kind] ?? T.en[row.kind];
  if (!template) return null;
  const { text, button, path } = template(row.payload, row.product);

  if (row.kind === 'channel_post') {
    const url = startAppLink(cfg, path);
    const photoUrl =
      row.product?.cover_path && cfg.imageBaseUrl ? `${cfg.imageBaseUrl}/${row.product.cover_path}` : undefined;
    return {
      text,
      ...(url ? { button: { text: button, url } } : {}),
      ...(photoUrl ? { photoUrl } : {}),
    };
  }
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
