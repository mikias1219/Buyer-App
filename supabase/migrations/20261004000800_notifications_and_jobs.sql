-- 0800 · Scheduled maintenance, notification outbox worker API, and service-only account functions.
-- Everything here is executable ONLY by service_role (Edge Functions), never by clients.

-- ─── Maintenance (A3.3, A3.5): expire, remind, end boosts ────────────
create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.platform_settings := public.get_settings();
  v_expired int;
  v_reminded int;
  v_unboosted int;
begin
  with expired as (
    update public.products
    set status = 'expired', boosted_until = null
    where status in ('active', 'paused') and expires_at is not null and expires_at <= now()
    returning id, seller_id, title
  ), notified as (
    insert into public.notifications_outbox (chat_id, kind, payload)
    select e.seller_id, 'listing_expired', jsonb_build_object('product_id', e.id, 'title', e.title)
    from expired e join public.profiles u on u.telegram_id = e.seller_id
    where not u.bot_blocked
    returning 1
  )
  select count(*) into v_expired from expired;

  with due as (
    update public.products
    set reminder_sent_at = now()
    where status = 'active' and reminder_sent_at is null and s.reminder_days_before > 0
      and expires_at is not null
      and expires_at <= now() + make_interval(days => s.reminder_days_before)
      and expires_at > now()
    returning id, seller_id, title, expires_at
  ), notified as (
    insert into public.notifications_outbox (chat_id, kind, payload)
    select d.seller_id, 'listing_expiring',
           jsonb_build_object('product_id', d.id, 'title', d.title, 'expires_at', d.expires_at)
    from due d join public.profiles u on u.telegram_id = d.seller_id
    where not u.bot_blocked
    returning 1
  )
  select count(*) into v_reminded from due;

  update public.products set boosted_until = null
  where boosted_until is not null and boosted_until <= now();
  get diagnostics v_unboosted = row_count;

  -- Housekeeping: old view-dedupe rows and delivered notifications.
  delete from public.product_views where viewed_on < current_date - 2;
  delete from public.notifications_outbox where sent_at < now() - interval '30 days';

  return jsonb_build_object('expired', v_expired, 'reminded', v_reminded, 'unboosted', v_unboosted);
end;
$$;

-- ─── Outbox worker API ───────────────────────────────────────────────
-- Claims due rows (skip locked, so parallel workers never double-send) and pushes their
-- next attempt into the future with exponential backoff. Returns everything needed to render.
create or replace function public.claim_outbox(p_limit int default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  with due as (
    select id from public.notifications_outbox
    where sent_at is null and attempts < 5 and next_attempt_at <= now()
    order by id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications_outbox o
    set attempts = o.attempts + 1,
        next_attempt_at = now() + make_interval(secs => 30 * power(4, o.attempts)::int)
    from due where o.id = due.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'chat_id', c.chat_id, 'kind', c.kind, 'payload', c.payload, 'attempts', c.attempts,
    'language', coalesce(u.language, 'en'),
    'product', case when c.payload ? 'product_id' then (
        select jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price, 'city', p.city,
                                  'condition', p.condition, 'status', p.status,
                                  'cover_path', (select path from public.product_images
                                                 where product_id = p.id order by position limit 1))
        from public.products p where p.id::text = c.payload ->> 'product_id') end
  ) order by c.id), '[]'::jsonb)
  into v_rows
  from claimed c
  left join public.profiles u on u.telegram_id = c.chat_id;
  return v_rows;
end;
$$;

create or replace function public.complete_outbox(
  p_id bigint, p_ok boolean, p_error text default null, p_permanent boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat text;
begin
  if p_ok then
    update public.notifications_outbox set sent_at = now(), error = null where id = p_id;
    return;
  end if;
  update public.notifications_outbox
  set error = left(coalesce(p_error, 'unknown'), 500),
      attempts = case when p_permanent then 5 else attempts end
  where id = p_id
  returning chat_id into v_chat;
  -- 403 "bot was blocked by the user": stop queueing for this user.
  if p_permanent then
    update public.profiles set bot_blocked = true where telegram_id = v_chat;
  end if;
end;
$$;

-- ─── Account functions used by Edge Functions ────────────────────────
-- Called by auth-telegram after the initData signature is verified.
create or replace function public.upsert_telegram_profile(
  p_telegram_id text, p_username text, p_first_name text, p_last_name text,
  p_photo_url text, p_language text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles;
begin
  insert into public.profiles (telegram_id, username, first_name, last_name, photo_url, language)
  values (
    p_telegram_id,
    coalesce(substring(coalesce(p_username, '') from '^[A-Za-z0-9_]{0,32}'), ''),
    left(coalesce(p_first_name, ''), 64),
    left(coalesce(p_last_name, ''), 64),
    case when coalesce(p_photo_url, '') ~ '^https://' then left(p_photo_url, 512) else '' end,
    case when p_language like 'am%' then 'am' else 'en' end
  )
  on conflict (telegram_id) do update
  set username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      photo_url = excluded.photo_url,
      last_seen_at = now(),
      -- A user who opens the app again can receive messages again.
      bot_blocked = false
  returning * into v;
  return v;
end;
$$;

-- First-admin bootstrap from env (INITIAL_ADMIN_TELEGRAM_IDS): only while no admin exists.
create or replace function public.bootstrap_admin(p_telegram_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;
  update public.profiles set role = 'admin', is_banned = false where telegram_id = p_telegram_id;
  if found then
    insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
    values (null, 'user.bootstrap_admin', 'user', p_telegram_id, null, jsonb_build_object('role', 'admin'));
  end if;
  return found;
end;
$$;

-- Called by verify-phone after the signed requestContact payload is verified.
create or replace function public.set_verified_phone(p_telegram_id text, p_phone text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if v_phone !~ '^\+?[0-9]{9,15}$' then
    perform public.app_error('invalid_input', 'phone');
  end if;
  if v_phone ~ '^0[79][0-9]{8}$' then
    v_phone := '+251' || substr(v_phone, 2);   -- Ethiopian local format 09xxxxxxxx / 07xxxxxxxx
  elsif left(v_phone, 1) <> '+' then
    v_phone := '+' || v_phone;
  end if;
  update public.profiles set phone = v_phone, phone_verified = true
  where telegram_id = p_telegram_id
  returning * into v;
  if not found then
    perform public.app_error('not_found');
  end if;
  return v;
end;
$$;

-- Ownership check for signed upload URLs issued by the `storage` Edge Function.
create or replace function public.can_upload_listing_image(p_telegram_id text, p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.products p
    join public.profiles u on u.telegram_id = p.seller_id
    where p.id = p_product_id and p.seller_id = p_telegram_id and not u.is_banned
      and p.status in ('draft', 'rejected', 'pending_payment', 'active', 'paused', 'expired')
  );
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.run_maintenance(),
      public.claim_outbox(int),
      public.complete_outbox(bigint, boolean, text, boolean),
      public.upsert_telegram_profile(text, text, text, text, text, text),
      public.bootstrap_admin(text),
      public.set_verified_phone(text, text),
      public.can_upload_listing_image(text, uuid),
      public.search_listings(text, text, text[], text, text, numeric, numeric, jsonb, text, boolean, int, int),
      public.get_public_settings()
      to service_role;
  end if;
end $$;

-- ─── Schedule (Supabase: enable pg_cron in Dashboard → Integrations) ─
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'techmarket-maintenance';
    perform cron.schedule('techmarket-maintenance', '*/10 * * * *', 'select public.run_maintenance()');
  end if;
end $$;
