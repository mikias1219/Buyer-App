// POST (Authorization: Bearer <app JWT>)
//   { action: 'product-image', ext } → signed upload URL in product-images/products/<rand>.<ext>
// Only shop owners may upload. The returned `path` is then saved on the product with
// create_product / update_product ({ image_path }). Bucket limits (2 MB, webp/jpeg/png) are
// enforced by Storage itself.
import { corsHeaders, fail, json, readJson, requireCaller, serve, serviceClient, throttle } from '../_shared/runtime.ts';

const EXT = new Set(['webp', 'jpg', 'jpeg', 'png']);
const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface Body {
  action?: string;
  ext?: string;
}

/** 20 random alphanumerics (matches the products.image_path check constraint). */
function randomName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ALPHANUM[b % ALPHANUM.length]).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 'method_not_allowed', 405);

  const caller = await requireCaller(req);
  if (!caller) return fail(req, 'not_authenticated', 401);
  const tgId = caller.claims.tg_id;
  if (!throttle(`storage:${tgId}`, 60, 60_000)) return fail(req, 'rate_limited', 429);

  const body = await readJson<Body>(req);
  const ext = (body?.ext ?? 'webp').toLowerCase();
  if (body?.action !== 'product-image' || !EXT.has(ext)) return fail(req, 'invalid_input');

  const db = serviceClient();
  const { data: allowed, error } = await db.rpc('can_manage_products', { p_telegram_id: tgId });
  if (error) return fail(req, 'server_error', 500);
  if (!allowed) return fail(req, 'not_authorized', 403);

  const path = `products/${randomName()}.${ext}`;
  const { data, error: signError } = await db.storage.from('product-images').createSignedUploadUrl(path);
  if (signError || !data) return fail(req, 'server_error', 500);
  return json(req, { path, token: data.token, signed_url: data.signedUrl });
});
