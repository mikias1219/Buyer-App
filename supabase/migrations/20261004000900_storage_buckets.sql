-- 0900 · Storage buckets (SPEC A9.5).
-- listing-images: public read; uploads ONLY via signed upload URLs issued by the `storage`
--   Edge Function after it checks listing ownership. No client insert/update policies exist.
-- payment-proofs: private; signed upload by the payer, signed download for the payer and admins.
-- Size/type limits are enforced by the bucket itself.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present (plain Postgres) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('listing-images', 'listing-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png']),
    ('payment-proofs', 'payment-proofs', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
end $$;
