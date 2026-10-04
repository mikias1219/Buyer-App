#!/usr/bin/env node
// Moves MVP listing images (base64 data URLs / external URLs stored in legacy.products.image_url)
// into the `listing-images` Storage bucket and attaches them as cover photos.
//
// Run once during cutover, after supabase/scripts/migrate_legacy.sql:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-legacy-images.mjs
// Safe to re-run: already-migrated listings are skipped; failures are recorded in legacy_image_skips.

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never commit them).');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const MAX_BYTES = 2 * 1024 * 1024;
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png' };

async function rpc(name, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadImage(imageUrl) {
  const dataUrl = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(imageUrl);
  if (dataUrl) return { mime: dataUrl[1].toLowerCase(), bytes: Buffer.from(dataUrl[2], 'base64') };
  if (/^https:\/\//.test(imageUrl)) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    return { mime, bytes: Buffer.from(await res.arrayBuffer()) };
  }
  throw new Error('unsupported image url');
}

let moved = 0;
let skipped = 0;
for (;;) {
  const batch = await rpc('legacy_image_batch', { p_limit: 20 });
  if (!batch?.length) break;
  for (const row of batch) {
    try {
      const { mime, bytes } = await loadImage(row.image_url);
      const ext = EXT[mime];
      if (!ext) throw new Error(`type ${mime || 'unknown'} not allowed`);
      if (bytes.length > MAX_BYTES) throw new Error(`too large (${bytes.length} bytes)`);
      const path = `${row.seller_id}/${row.product_id}/legacy.${ext}`;
      const up = await fetch(`${url}/storage/v1/object/listing-images/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'true' },
        body: bytes,
      });
      if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
      await rpc('legacy_image_attach', { p_product_id: row.product_id, p_path: path });
      moved++;
    } catch (err) {
      await rpc('legacy_image_attach', { p_product_id: row.product_id, p_path: '', p_skip_reason: String(err.message ?? err) });
      skipped++;
      console.warn(`skip ${row.product_id}: ${err.message ?? err}`);
    }
  }
}
console.log(`Done. Moved ${moved} images, skipped ${skipped} (see table legacy_image_skips; sellers can re-add photos).`);
