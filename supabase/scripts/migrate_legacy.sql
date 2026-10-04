-- One-time copy of MVP data (schema `legacy`, created by migration 0100) into the v1 schema.
-- Safe to run more than once: rows that already exist are skipped.
--
-- Run during the production cutover, AFTER the migrations and BEFORE opening the new app:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/migrate_legacy.sql
-- Then move base64 images to Storage:  node scripts/migrate-legacy-images.mjs
--
-- Mapping decisions (see docs/BACKEND.md › Legacy migration):
--   • profiles: phone kept but NOT verified (MVP phones were typed, not verified via Telegram).
--   • admin_telegram_ids from legacy settings → role 'admin'.
--   • products: status draft→draft, pending_payment→pending_payment, payment_submitted→payment_submitted,
--     active→active (fresh 30-day period), rejected→rejected, sold→sold, hidden→removed.
--     Browser-guest rows (seller_id '0' or non-numeric) are skipped.
--   • payments: kind 'listing'; references normalized; invalid ones replaced by 'LEGACY-<id>' with the
--     original kept in admin_note; duplicates get a '-D<n>' suffix so the unique index holds.

do $$
declare
  s record;
  pay record;
  v_admins text[] := '{}';
  v_ref text;
  v_try int;
begin
  if to_regclass('legacy.products') is null then
    raise notice 'No legacy schema found — nothing to migrate.';
    return;
  end if;

  -- ─── Settings ─────────────────────────────────────────────────────
  if to_regclass('legacy.platform_settings') is not null then
    select * into s from legacy.platform_settings where id = 1;
    if found then
      v_admins := coalesce(s.admin_telegram_ids, '{}');
      update public.platform_settings
      set listing_fee_etb = coalesce(s.listing_fee_etb, listing_fee_etb),
          telebirr_number = left(coalesce(nullif(s.telebirr_number, ''), telebirr_number), 20),
          telebirr_name = left(coalesce(nullif(s.telebirr_name, ''), telebirr_name), 80),
          support_username = coalesce(substring(ltrim(coalesce(s.support_username, ''), '@') from '^[A-Za-z0-9_]{0,32}'),
                                      support_username)
      where id = 1;
    end if;
  end if;

  -- ─── Profiles ─────────────────────────────────────────────────────
  if to_regclass('legacy.profiles') is not null then
    insert into public.profiles (telegram_id, username, first_name, phone, city, role, is_banned, created_at)
    select lp.telegram_id,
           coalesce(substring(coalesce(lp.username, '') from '^[A-Za-z0-9_]{0,32}'), ''),
           left(coalesce(lp.first_name, ''), 64),
           case
             when regexp_replace(coalesce(lp.phone, ''), '[^0-9+]', '', 'g') ~ '^0[79][0-9]{8}$'
               then '+251' || substr(regexp_replace(lp.phone, '[^0-9+]', '', 'g'), 2)
             when regexp_replace(coalesce(lp.phone, ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{9,15}$'
               then regexp_replace(lp.phone, '[^0-9+]', '', 'g')
             else ''
           end,
           left(coalesce(lp.city, ''), 40),
           case when lp.role = 'admin' then 'admin' else 'user' end,
           coalesce(lp.is_banned, false),
           coalesce(lp.created_at, now())
    from legacy.profiles lp
    where lp.telegram_id ~ '^[1-9][0-9]{0,19}$'
    on conflict (telegram_id) do nothing;
  end if;

  -- Sellers that only exist on legacy products.
  insert into public.profiles (telegram_id, username)
  select distinct on (lp.seller_id) lp.seller_id,
         coalesce(substring(coalesce(lp.seller_username, '') from '^[A-Za-z0-9_]{0,32}'), '')
  from legacy.products lp
  where lp.seller_id ~ '^[1-9][0-9]{0,19}$'
  on conflict (telegram_id) do nothing;

  update public.profiles set role = 'admin'
  where telegram_id = any (v_admins) and role <> 'admin';

  -- ─── Products ─────────────────────────────────────────────────────
  insert into public.products (
    id, seller_id, title, description, price, category, brand, condition, city, status,
    is_free, period_paid, published_at, expires_at, sold_at, created_at
  )
  select lp.id, lp.seller_id,
         left(coalesce(lp.title, ''), 80),
         left(coalesce(lp.description, ''), 2000),
         case when lp.price > 0 and lp.price < 100000000 then lp.price end,
         case lower(lp.category)
           when 'phone' then 'phone' when 'laptop' then 'laptop' when 'tablet' then 'tablet'
           when 'accessory' then 'accessory' else 'other' end,
         left(coalesce(lp.brand, ''), 40),
         case lp.condition
           when 'New' then 'new' when 'Like New' then 'like_new' when 'Good' then 'good'
           when 'Fair' then 'fair' else 'good' end,
         left(coalesce(lp.city, ''), 40),
         case lp.status
           when 'hidden' then 'removed'
           when 'draft' then 'draft' when 'pending_payment' then 'pending_payment'
           when 'payment_submitted' then 'payment_submitted' when 'active' then 'active'
           when 'rejected' then 'rejected' when 'sold' then 'sold'
           else 'draft' end,
         false,
         lp.status in ('active', 'sold', 'hidden'),
         case when lp.status in ('active', 'sold', 'hidden') then coalesce(lp.created_at, now()) end,
         case when lp.status = 'active' then now() + interval '30 days' end,
         case when lp.status = 'sold' then now() end,
         coalesce(lp.created_at, now())
  from legacy.products lp
  where lp.seller_id ~ '^[1-9][0-9]{0,19}$'
  on conflict (id) do nothing;

  -- ─── Payments ─────────────────────────────────────────────────────
  if to_regclass('legacy.payments') is not null then
    for pay in
      select lp.* from legacy.payments lp
      join public.products p on p.id = lp.product_id
      join public.profiles u on u.telegram_id = lp.telegram_id
      where not exists (select 1 from public.payments x where x.id = lp.id)
      order by lp.created_at
    loop
      v_ref := public.normalize_reference(pay.reference);
      if pay.status <> 'pending' and v_ref !~ '^[A-Z0-9-]{6,32}$' then
        v_ref := 'LEGACY-' || upper(left(replace(pay.id::text, '-', ''), 12));
      elsif pay.status = 'pending' and v_ref !~ '^[A-Z0-9-]{6,32}$' then
        v_ref := '';
      end if;
      v_try := 0;
      loop
        begin
          insert into public.payments (id, telegram_id, product_id, kind, amount_etb, method, reference,
                                       status, admin_note, submitted_at, reviewed_at, refunded_at, created_at)
          values (pay.id, pay.telegram_id, pay.product_id, 'listing', greatest(pay.amount_etb, 1),
                  'telebirr_manual', v_ref,
                  case when pay.status = 'pending' and v_ref = '' then 'pending'
                       when pay.status = 'pending' then 'submitted' else pay.status end,
                  left(trim(both ' ' from coalesce(pay.admin_note, '') ||
                       case when public.normalize_reference(pay.reference) <> v_ref
                            then ' [legacy ref: ' || left(coalesce(pay.reference, ''), 60) || ']' else '' end), 500),
                  case when pay.status <> 'pending' or v_ref <> '' then pay.updated_at end,
                  case when pay.status in ('confirmed', 'rejected', 'refunded') then pay.updated_at end,
                  case when pay.status = 'refunded' then pay.updated_at end,
                  pay.created_at);
          exit;
        exception when unique_violation then
          v_try := v_try + 1;
          if v_try > 20 then
            raise;
          end if;
          -- Either the reference is a duplicate, or a second open payment exists for the listing.
          if v_ref <> '' then
            v_ref := left(regexp_replace(v_ref, '-D[0-9]+$', ''), 28) || '-D' || v_try;
          else
            pay.status := 'rejected';
            v_ref := 'LEGACY-' || upper(left(replace(pay.id::text, '-', ''), 12));
          end if;
        end;
      end loop;
    end loop;

    update public.products p
    set period_paid = true
    where exists (select 1 from public.payments x where x.product_id = p.id and x.status = 'confirmed');
  end if;

  raise notice 'Legacy migration done: % profiles, % products, % payments in v1 schema.',
    (select count(*) from public.profiles), (select count(*) from public.products),
    (select count(*) from public.payments);
end $$;

-- Images: report which listings still need their photos moved (run the image script next).
do $$
begin
  if to_regclass('legacy.products') is not null then
    raise notice 'Listings still needing image migration: %', (
      select count(*) from legacy.products lp
      where exists (select 1 from public.products p where p.id = lp.id)
        and not exists (select 1 from public.product_images i where i.product_id = lp.id)
        and coalesce(lp.image_url, '') <> '');
  end if;
end $$;

-- ─── Temporary service-role RPCs for scripts/migrate-legacy-images.mjs ─────────
-- Dropped by supabase/scripts/cleanup_legacy.sql once images are moved.
do $$
begin
  if to_regclass('legacy.products') is null then
    return;
  end if;

  create table if not exists public.legacy_image_skips (product_id uuid primary key, reason text not null);
  alter table public.legacy_image_skips enable row level security;
  revoke all on public.legacy_image_skips from anon, authenticated;

  create or replace function public.legacy_image_batch(p_limit int default 20)
  returns table (product_id uuid, seller_id text, image_url text)
  language sql
  stable
  security definer
  set search_path = public
  as $fn$
    select lp.id, lp.seller_id, lp.image_url
    from legacy.products lp
    join public.products p on p.id = lp.id
    where coalesce(lp.image_url, '') <> ''
      and not exists (select 1 from public.product_images i where i.product_id = lp.id)
      and not exists (select 1 from public.legacy_image_skips s where s.product_id = lp.id)
    order by lp.created_at
    limit least(greatest(p_limit, 1), 50);
  $fn$;

  create or replace function public.legacy_image_attach(p_product_id uuid, p_path text, p_skip_reason text default null)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    if p_skip_reason is not null then
      insert into public.legacy_image_skips values (p_product_id, left(p_skip_reason, 200))
      on conflict (product_id) do update set reason = excluded.reason;
      return;
    end if;
    insert into public.product_images (product_id, path, position) values (p_product_id, p_path, 0)
    on conflict (product_id, position) do nothing;
  end;
  $fn$;

  revoke execute on function public.legacy_image_batch(int), public.legacy_image_attach(uuid, text, text)
    from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.legacy_image_batch(int), public.legacy_image_attach(uuid, text, text) to service_role;
  end if;
end $$;
