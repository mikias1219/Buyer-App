// POST { initData } → { access_token, expires_at }
// Verifies Telegram's initData signature, upserts the profile and issues a Supabase-compatible JWT
// carrying `tg_id`. The client then reads its profile with the get_me() RPC.
import { parseInitUser, verifyTelegramData } from '../_shared/telegramAuth.ts';
import { signJwt } from '../_shared/jwt.ts';
import { corsHeaders, env, fail, json, readJson, serviceClient, throttle } from '../_shared/runtime.ts';

const MAX_INIT_AGE_SECONDS = 24 * 60 * 60;
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 'method_not_allowed', 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!throttle(`auth:${ip}`, 30, 60_000)) return fail(req, 'rate_limited', 429);

  const body = await readJson<{ initData?: string }>(req);
  if (!body?.initData || body.initData.length > 4096) return fail(req, 'invalid_init_data', 400);

  const verified = await verifyTelegramData(body.initData, env('BOT_TOKEN'), { maxAgeSeconds: MAX_INIT_AGE_SECONDS });
  if (!verified.ok) return fail(req, `init_data_${verified.reason}`, 401);

  const user = parseInitUser(verified.data.fields);
  if (!user) return fail(req, 'invalid_init_data', 401);
  const tgId = String(user.id);

  const db = serviceClient();
  const { error: upsertError } = await db.rpc('upsert_telegram_profile', {
    p_telegram_id: tgId,
    p_username: user.username ?? '',
    p_first_name: user.first_name ?? '',
    p_last_name: user.last_name ?? '',
    p_photo_url: user.photo_url ?? '',
    p_language: user.language_code ?? 'en',
  });
  if (upsertError) {
    console.error('upsert_telegram_profile failed', upsertError.message);
    return fail(req, 'server_error', 500);
  }

  // First-admin bootstrap: only takes effect while the project has no admin at all.
  const bootstrapIds = env('INITIAL_ADMIN_TELEGRAM_IDS', false).split(',').map((s) => s.trim());
  if (bootstrapIds.includes(tgId)) {
    await db.rpc('bootstrap_admin', { p_telegram_id: tgId });
  }

  const now = Math.floor(Date.now() / 1000);
  // Never outlive the initData it was derived from.
  const exp = Math.min(now + TOKEN_TTL_SECONDS, verified.data.authDate + MAX_INIT_AGE_SECONDS);
  const accessToken = await signJwt(
    { sub: tgId, tg_id: tgId, role: 'authenticated', aud: 'authenticated', iat: now, exp, iss: 'techmarket-auth' },
    env('JWT_SECRET'),
  );
  return json(req, { access_token: accessToken, expires_at: exp });
});
