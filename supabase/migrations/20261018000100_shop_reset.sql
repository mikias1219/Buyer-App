-- 0100 (shop) · Remove the TechMarket marketplace (SPEC A8 "Reset migration").
--
-- Runs only while the marketplace shape is present (public.products.seller_id), so it is a no-op
-- on re-run and after the shop schema exists. Keeps: profiles (trimmed, roles mapped),
-- audit_log, notifications_outbox and the generic helpers listed in `v_keep`.
--
-- NOT handled here: the `listing-images` / `payment-proofs` Storage buckets. Supabase blocks
-- deleting storage objects from SQL; empty and delete them in the Dashboard at cutover.

do $$
declare
  v_keep text[] := array[
    'touch_updated_at', 'current_tg_id', 'app_error', 'require_user', 'write_audit',
    'enqueue_notification', 'complete_outbox'
  ];
  f record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'seller_id'
  ) then
    raise notice 'marketplace schema not present — reset skipped';
    return;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'techmarket-maintenance';
  end if;

  drop view if exists public.listings_public cascade;
  drop table if exists
    public.product_views, public.reviews, public.reports, public.leads, public.favorites,
    public.payments, public.product_images, public.products, public.platform_settings
    cascade;

  -- Policies on kept tables referenced marketplace helpers.
  drop policy if exists profiles_self_or_staff_read on public.profiles;
  drop policy if exists outbox_admin_read on public.notifications_outbox;
  drop policy if exists audit_admin_read on public.audit_log;

  -- Every remaining public function that is not a kept helper and not owned by an extension.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not (p.proname = any (v_keep))
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function if exists %s', f.sig);
  end loop;

  -- Pre-release MVP tables quarantined by 20261004000100.
  drop schema if exists legacy cascade;

  -- profiles: drop marketplace-only columns, map roles.
  alter table public.profiles drop constraint if exists profiles_role_check;
  update public.profiles set role = case role when 'admin' then 'owner'
                                              when 'moderator' then 'staff'
                                              else 'user' end;
  alter table public.profiles
    drop column if exists phone,
    drop column if exists phone_verified,
    drop column if exists city,
    drop column if exists is_verified_seller,
    drop column if exists listings_free_used,
    alter column role set default 'user',
    add constraint profiles_role_check check (role in ('user', 'staff', 'owner'));

  -- Pending marketplace notifications would render with templates that no longer exist.
  delete from public.notifications_outbox where sent_at is null;
end $$;
