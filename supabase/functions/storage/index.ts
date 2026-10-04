// POST (Authorization: Bearer <app JWT>)
//   { action: 'listing-image', product_id, ext }  → signed upload URL in listing-images/<tg>/<product>/<rand>.<ext>
//   { action: 'payment-proof', ext }              → signed upload URL in payment-proofs/<tg>/<uuid>.<ext>
//   { action: 'view-proof', payment_id }          → short-lived signed download URL (payer or admin)
// Bucket limits (2 MB, webp/jpeg/png) are enforced by Storage itself.
import { corsHeaders, fail, json, readJson, requireCaller, serviceClient, throttle, userClient } from '../_shared/runtime.ts';

const EXT = new Set(['webp', 'jpg', 'jpeg', 'png']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Body {
  action?: string;
  product_id?: string;
  payment_id?: string;
  ext?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 'method_not_allowed', 405);

  const caller = await requireCaller(req);
  if (!caller) return fail(req, 'not_authenticated', 401);
  const tgId = caller.claims.tg_id;
  if (!throttle(`storage:${tgId}`, 60, 60_000)) return fail(req, 'rate_limited', 429);

  const body = await readJson<Body>(req);
  const ext = (body?.ext ?? 'webp').toLowerCase();
  const db = serviceClient();

  if (body?.action === 'listing-image') {
    if (!body.product_id || !UUID.test(body.product_id) || !EXT.has(ext)) return fail(req, 'invalid_input');
    const { data: allowed, error } = await db.rpc('can_upload_listing_image', {
      p_telegram_id: tgId,
      p_product_id: body.product_id,
    });
    if (error) return fail(req, 'server_error', 500);
    if (!allowed) return fail(req, 'not_found', 404);
    const path = `${tgId}/${body.product_id}/${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}.${ext}`;
    const { data, error: signError } = await db.storage.from('listing-images').createSignedUploadUrl(path);
    if (signError || !data) return fail(req, 'server_error', 500);
    return json(req, { path, token: data.token, signed_url: data.signedUrl });
  }

  if (body?.action === 'payment-proof') {
    if (!EXT.has(ext)) return fail(req, 'invalid_input');
    const path = `${tgId}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await db.storage.from('payment-proofs').createSignedUploadUrl(path);
    if (error || !data) return fail(req, 'server_error', 500);
    return json(req, { path, token: data.token, signed_url: data.signedUrl });
  }

  if (body?.action === 'view-proof') {
    if (!body.payment_id || !UUID.test(body.payment_id)) return fail(req, 'invalid_input');
    // Authorization runs as the caller inside the database (payer or admin only).
    const { data: path, error } = await userClient(caller.token).rpc('can_view_payment_proof', {
      p_payment_id: body.payment_id,
    });
    if (error || typeof path !== 'string') return fail(req, error?.message ?? 'not_found', 403);
    const { data, error: signError } = await db.storage.from('payment-proofs').createSignedUrl(path, 300);
    if (signError || !data) return fail(req, 'server_error', 500);
    return json(req, { url: data.signedUrl });
  }

  return fail(req, 'invalid_input');
});
