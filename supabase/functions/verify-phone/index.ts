// POST { response } (Authorization: Bearer <app JWT>)
// `response` is the signed string returned by WebApp.requestContact. We verify Telegram's signature,
// make sure the shared contact belongs to the caller, and mark the phone as verified.
import { parseSharedContact, verifyTelegramData } from '../_shared/telegramAuth.ts';
import { corsHeaders, env, fail, json, readJson, requireCaller, serviceClient, throttle } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 'method_not_allowed', 405);

  const caller = await requireCaller(req);
  if (!caller) return fail(req, 'not_authenticated', 401);
  if (!throttle(`phone:${caller.claims.tg_id}`, 5, 60_000)) return fail(req, 'rate_limited', 429);

  const body = await readJson<{ response?: string }>(req);
  if (!body?.response || body.response.length > 4096) return fail(req, 'invalid_contact', 400);

  const verified = await verifyTelegramData(body.response, env('BOT_TOKEN'), { maxAgeSeconds: 15 * 60 });
  if (!verified.ok) return fail(req, `contact_${verified.reason}`, 401);

  const contact = parseSharedContact(verified.data.fields);
  if (!contact) return fail(req, 'invalid_contact', 400);
  if (String(contact.user_id) !== caller.claims.tg_id) return fail(req, 'contact_not_yours', 403);

  const { error } = await serviceClient().rpc('set_verified_phone', {
    p_telegram_id: caller.claims.tg_id,
    p_phone: contact.phone_number,
  });
  if (error) return fail(req, error.message === 'invalid_input' ? 'invalid_contact' : 'server_error', 400);
  return json(req, { phone_verified: true });
});
