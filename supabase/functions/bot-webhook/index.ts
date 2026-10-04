// Telegram bot webhook. Set with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTIONS_URL>/bot-webhook&secret_token=<WEBHOOK_SECRET>
// Handles /start [payload], /help, /mylistings, /sell, shared contacts (phone verification fallback)
// and inline queries (@bot <text> → matching live listings).
import { escapeHtml, formatEtb, toLang, type Lang } from '../_shared/messages.ts';
import { timingSafeEqual } from '../_shared/telegramAuth.ts';
import { env, serviceClient } from '../_shared/runtime.ts';

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}
interface Update {
  message?: {
    chat: { id: number; type: string };
    from?: TgUser;
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
  inline_query?: { id: string; from: TgUser; query: string };
}

const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    welcome: 'Welcome to <b>TechMarket ET</b> — buy and sell used phones, laptops and gadgets safely, right here in Telegram.',
    open: 'Open TechMarket',
    help: 'Tap <b>Open TechMarket</b> to browse or sell.\n\n/sell — post an item\n/mylistings — manage your listings\n\nSafety: meet in a public place, check the IMEI, never pay in advance.',
    sell: 'Sell an item',
    mine: 'My listings',
    phone_ok: 'Thanks! Your phone number is verified.',
    phone_not_yours: 'Please share your own contact using the button.',
    inline_empty: 'No listings found',
    view: 'View listing',
  },
  am: {
    welcome: 'ወደ <b>ቴክማርኬት ኢቲ</b> እንኳን ደህና መጡ — ያገለገሉ ስልኮችን፣ ላፕቶፖችን እና መሣሪያዎችን በቴሌግራም ውስጥ በደህንነት ይግዙ እና ይሽጡ።',
    open: 'ቴክማርኬትን ይክፈቱ',
    help: 'ለመፈለግ ወይም ለመሸጥ <b>ቴክማርኬትን ይክፈቱ</b> የሚለውን ይጫኑ።\n\n/sell — ዕቃ ይለጥፉ\n/mylistings — ማስታወቂያዎችዎን ያስተዳድሩ\n\nደህንነት፦ በሕዝብ ቦታ ይገናኙ፣ IMEI ያረጋግጡ፣ አስቀድመው አይክፈሉ።',
    sell: 'ዕቃ ይሽጡ',
    mine: 'የእኔ ማስታወቂያዎች',
    phone_ok: 'እናመሰግናለን! ስልክ ቁጥርዎ ተረጋግጧል።',
    phone_not_yours: 'እባክዎ በአዝራሩ በኩል የራስዎን አድራሻ ያጋሩ።',
    inline_empty: 'ምንም ማስታወቂያ አልተገኘም',
    view: 'ማስታወቂያውን ይመልከቱ',
  },
};

async function call(method: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error(method, res.status, await res.text());
}

function appUrl(hashPath = '/'): string {
  return `${env('MINI_APP_URL').replace(/\/+$/, '')}/#${hashPath}`;
}

function startPathFromPayload(payload: string): string {
  const m = /^([pcs])_([A-Za-z0-9-]{1,64})$/.exec(payload);
  if (!m) return '/';
  if (m[1] === 'p') return `/p/${m[2]}`;
  if (m[1] === 'c') return `/search?category=${m[2]}`;
  return `/seller/${m[2]}`;
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !timingSafeEqual(secret, env('WEBHOOK_SECRET'))) return new Response('forbidden', { status: 403 });

  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) return new Response('ok');
  const db = serviceClient();

  if (update.inline_query) {
    const q = update.inline_query;
    const lang = toLang(q.from.language_code?.startsWith('am') ? 'am' : 'en');
    const { data } = await db.rpc('search_listings', { p_query: q.query.slice(0, 80), p_limit: 20 });
    const { data: settings } = await db.rpc('get_public_settings');
    const s = (settings ?? {}) as { bot_username?: string; mini_app_short_name?: string };
    const items = ((data as { items?: Array<Record<string, unknown>> } | null)?.items ?? []);
    const base = s.bot_username && s.mini_app_short_name ? `https://t.me/${s.bot_username}/${s.mini_app_short_name}` : null;
    const imageBase = `${env('SUPABASE_URL')}/storage/v1/object/public/listing-images`;
    await call('answerInlineQuery', {
      inline_query_id: q.id,
      cache_time: 30,
      is_personal: false,
      results: base
        ? items.map((it) => ({
            type: 'article',
            id: String(it.id),
            title: String(it.title),
            description: `${formatEtb(it.price)}${it.city ? ` · ${String(it.city)}` : ''}`,
            ...(it.cover_path ? { thumbnail_url: `${imageBase}/${String(it.cover_path)}` } : {}),
            input_message_content: {
              message_text: `<b>${escapeHtml(it.title)}</b>\n${formatEtb(it.price)}${it.city ? ` · ${escapeHtml(it.city)}` : ''}`,
              parse_mode: 'HTML',
            },
            reply_markup: { inline_keyboard: [[{ text: TEXT[lang].view, url: `${base}?startapp=p_${String(it.id)}` }]] },
          }))
        : [],
    });
    return new Response('ok');
  }

  const msg = update.message;
  if (!msg?.from || msg.chat.type !== 'private') return new Response('ok');
  const lang: Lang = msg.from.language_code?.startsWith('am') ? 'am' : 'en';
  const t = TEXT[lang];

  // Keep the profile fresh (also clears bot_blocked once the user talks to the bot again).
  await db.rpc('upsert_telegram_profile', {
    p_telegram_id: String(msg.from.id),
    p_username: msg.from.username ?? '',
    p_first_name: msg.from.first_name ?? '',
    p_last_name: msg.from.last_name ?? '',
    p_photo_url: '',
    p_language: msg.from.language_code ?? 'en',
  });

  if (msg.contact) {
    // Contacts sent through Telegram's own share-contact flow carry the sender's user_id.
    if (msg.contact.user_id === msg.from.id) {
      await db.rpc('set_verified_phone', { p_telegram_id: String(msg.from.id), p_phone: msg.contact.phone_number });
      await call('sendMessage', { chat_id: msg.chat.id, text: t.phone_ok, reply_markup: { remove_keyboard: true } });
    } else {
      await call('sendMessage', { chat_id: msg.chat.id, text: t.phone_not_yours });
    }
    return new Response('ok');
  }

  const text = (msg.text ?? '').trim();
  const [command, payload = ''] = text.split(/\s+/, 2);
  const button = (label: string, path: string) => ({
    inline_keyboard: [[{ text: label, web_app: { url: appUrl(path) } }]],
  });

  if (command === '/start') {
    await call('sendMessage', {
      chat_id: msg.chat.id,
      text: t.welcome,
      parse_mode: 'HTML',
      reply_markup: button(t.open, startPathFromPayload(payload)),
    });
  } else if (command === '/sell') {
    await call('sendMessage', { chat_id: msg.chat.id, text: t.sell, reply_markup: button(t.sell, '/sell') });
  } else if (command === '/mylistings') {
    await call('sendMessage', { chat_id: msg.chat.id, text: t.mine, reply_markup: button(t.mine, '/mine') });
  } else {
    await call('sendMessage', { chat_id: msg.chat.id, text: t.help, parse_mode: 'HTML', reply_markup: button(t.open, '/') });
  }
  return new Response('ok');
});
