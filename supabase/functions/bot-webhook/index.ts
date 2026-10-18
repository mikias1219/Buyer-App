// Telegram bot webhook. Set with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTIONS_URL>/bot-webhook&secret_token=<WEBHOOK_SECRET>
// Handles /start and /help in private chats: opens the Mini App on the right screen for the
// sender's role. Owner commands (/today, /lowstock) arrive in Phase 6.
import { toLang, type Lang } from '../_shared/messages.ts';
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
    help: 'Tap <b>Open shop</b> to record sales, manage products and stock, and see reports.',
  },
  am: {
    welcome_member: 'እንኳን ደህና መጡ። ለመሸጥ፣ ክምችት ለማየት ወይም የዛሬውን ሂሳብ ለማየት <b>ሱቁን ይክፈቱ</b> የሚለውን ይጫኑ።',
    welcome_user: 'ይህ ቦት የግል የሱቅ መተግበሪያ ነው። አንድ ጊዜ ይክፈቱት እና የሱቁን ባለቤት ፈቃድ ይጠይቁ።',
    open: 'ሱቁን ይክፈቱ',
    help: 'ሽያጭ ለመመዝገብ፣ ዕቃዎችንና ክምችትን ለማስተዳደር እና ሪፖርቶችን ለማየት <b>ሱቁን ይክፈቱ</b> የሚለውን ይጫኑ።',
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

  const command = (msg.text ?? '').trim().split(/\s+/, 1)[0];
  const button = { inline_keyboard: [[{ text: t.open, web_app: { url: appUrl('/') } }]] };
  const text = command === '/start' ? (isMember ? t.welcome_member : t.welcome_user) : t.help;
  await call('sendMessage', { chat_id: msg.chat.id, text, parse_mode: 'HTML', reply_markup: button });
  return new Response('ok');
});
