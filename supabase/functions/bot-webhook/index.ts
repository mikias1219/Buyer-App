// Telegram bot webhook. Set with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTIONS_URL>/bot-webhook&secret_token=<WEBHOOK_SECRET>
// Private chats only:
//   /start, /help  → open the Mini App
//   /today         → today's numbers (owners)
//   /lowstock      → products at or below their reorder level (owners and staff)
import { lowStockText, summaryText, toLang, type Lang } from '../_shared/messages.ts';
import { timingSafeEqual } from '../_shared/telegramAuth.ts';
import { env, serve, serviceClient } from '../_shared/runtime.ts';

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
  };
}

const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    welcome_member: 'Welcome back. Tap <b>Open shop</b> to sell, check stock or see today\'s numbers.',
    welcome_user: 'This bot runs a private shop app. Open it once and ask the shop owner to give you access.',
    open: 'Open shop',
    help: 'Tap <b>Open shop</b> to record sales, manage products and stock, and see reports.\n\n/today — today\'s numbers (owner)\n/lowstock — products running out',
    noAccess: 'You don\'t have access to this shop yet. Ask the owner.',
  },
  am: {
    welcome_member: 'እንኳን ደህና መጡ። ለመሸጥ፣ ክምችት ለማየት ወይም የዛሬውን ሂሳብ ለማየት <b>ሱቁን ይክፈቱ</b> የሚለውን ይጫኑ።',
    welcome_user: 'ይህ ቦት የግል የሱቅ መተግበሪያ ነው። አንድ ጊዜ ይክፈቱት እና የሱቁን ባለቤት ፈቃድ ይጠይቁ።',
    open: 'ሱቁን ይክፈቱ',
    help: 'ሽያጭ ለመመዝገብ፣ ዕቃዎችንና ክምችትን ለማስተዳደር እና ሪፖርቶችን ለማየት <b>ሱቁን ይክፈቱ</b> የሚለውን ይጫኑ።\n\n/today — የዛሬ ሂሳብ (ባለቤት)\n/lowstock — እያለቁ ያሉ ዕቃዎች',
    noAccess: 'ገና የዚህ ሱቅ ፈቃድ የለዎትም። ባለቤቱን ይጠይቁ።',
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

serve(async (req) => {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !timingSafeEqual(secret, env('WEBHOOK_SECRET'))) return new Response('forbidden', { status: 403 });

  const update = (await req.json().catch(() => null)) as Update | null;
  const msg = update?.message;
  if (!msg?.from || msg.chat.type !== 'private') return new Response('ok');
  const lang = toLang(msg.from.language_code?.startsWith('am') ? 'am' : 'en');
  const t = TEXT[lang];
  const db = serviceClient();
  const tgId = String(msg.from.id);

  // Keep the profile fresh (also clears bot_blocked once the user talks to the bot again).
  await db.rpc('upsert_telegram_profile', {
    p_telegram_id: tgId,
    p_username: msg.from.username ?? '',
    p_first_name: msg.from.first_name ?? '',
    p_last_name: msg.from.last_name ?? '',
    p_photo_url: '',
    p_language: msg.from.language_code ?? 'en',
  });
  const { data: role } = await db.rpc('member_role', { p_telegram_id: tgId });
  const isMember = role === 'owner' || role === 'staff';

  // "/today@ShopBot" → "/today"
  const command = ((msg.text ?? '').trim().split(/\s+/, 1)[0] ?? '').split('@')[0];
  const button = (path: string) => ({ inline_keyboard: [[{ text: t.open, web_app: { url: appUrl(path) } }]] });
  const send = (text: string, path = '/') =>
    call('sendMessage', { chat_id: msg.chat.id, text, parse_mode: 'HTML', reply_markup: button(path) });

  if (command === '/today') {
    const { data } = await db.rpc('bot_today', { p_telegram_id: tgId });
    await send(data ? summaryText(lang, data as Record<string, unknown>) : t.noAccess, '/dashboard');
  } else if (command === '/lowstock') {
    const { data } = await db.rpc('bot_low_stock', { p_telegram_id: tgId });
    await send(Array.isArray(data) ? lowStockText(lang, data as Array<Record<string, unknown>>) : t.noAccess, '/products?stock=low');
  } else {
    await send(command === '/start' ? (isMember ? t.welcome_member : t.welcome_user) : t.help);
  }
  return new Response('ok');
});
