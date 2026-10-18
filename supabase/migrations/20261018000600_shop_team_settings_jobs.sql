-- 0600 (shop) · Session, team, settings, Edge Function helpers, outbox, storage (SPEC A2, A5.11, A9).

-- ─── Settings ────────────────────────────────────────────────────────
create or replace function public.settings_json(p_owner boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop_name', s.shop_name, 'currency', s.currency, 'timezone', s.timezone,
    'allow_negative_stock', s.allow_negative_stock, 'staff_can_restock', s.staff_can_restock,
    'staff_can_sell_below_cost', s.staff_can_sell_below_cost, 'receipt_footer', s.receipt_footer
  ) || case when p_owner then jsonb_build_object(
    'default_reorder_level', s.default_reorder_level, 'slow_mover_days', s.slow_mover_days,
    'daily_summary_enabled', s.daily_summary_enabled,
    'daily_summary_time', to_char(s.daily_summary_time, 'HH24:MI'),
    'low_stock_alerts', s.low_stock_alerts, 'updated_at', s.updated_at
  ) else '{}'::jsonb end
  from public.shop_settings s where s.id = 1;
$$;

create or replace function public.get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
begin
  return public.settings_json(v_me.role = 'owner');
end;
$$;

create or replace function public.update_settings(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  v_before public.shop_settings;
  s public.shop_settings;
  f jsonb := coalesce(p_input, '{}'::jsonb);
begin
  select * into v_before from public.shop_settings where id = 1 for update;
  s := v_before;
  begin
    if f ? 'shop_name' then s.shop_name := btrim(f ->> 'shop_name'); end if;
    if f ? 'timezone' then
      s.timezone := f ->> 'timezone';
      perform now() at time zone s.timezone;   -- rejects unknown zones
    end if;
    if f ? 'default_reorder_level' then s.default_reorder_level := (f ->> 'default_reorder_level')::numeric; end if;
    if f ? 'allow_negative_stock' then s.allow_negative_stock := (f ->> 'allow_negative_stock')::boolean; end if;
    if f ? 'staff_can_restock' then s.staff_can_restock := (f ->> 'staff_can_restock')::boolean; end if;
    if f ? 'staff_can_sell_below_cost' then s.staff_can_sell_below_cost := (f ->> 'staff_can_sell_below_cost')::boolean; end if;
    if f ? 'slow_mover_days' then s.slow_mover_days := (f ->> 'slow_mover_days')::int; end if;
    if f ? 'daily_summary_enabled' then s.daily_summary_enabled := (f ->> 'daily_summary_enabled')::boolean; end if;
    if f ? 'daily_summary_time' then s.daily_summary_time := (f ->> 'daily_summary_time')::time; end if;
    if f ? 'low_stock_alerts' then s.low_stock_alerts := (f ->> 'low_stock_alerts')::boolean; end if;
    if f ? 'receipt_footer' then s.receipt_footer := btrim(f ->> 'receipt_footer'); end if;

    update public.shop_settings
    set shop_name = s.shop_name, timezone = s.timezone, default_reorder_level = s.default_reorder_level,
        allow_negative_stock = s.allow_negative_stock, staff_can_restock = s.staff_can_restock,
        staff_can_sell_below_cost = s.staff_can_sell_below_cost, slow_mover_days = s.slow_mover_days,
        daily_summary_enabled = s.daily_summary_enabled, daily_summary_time = s.daily_summary_time,
        low_stock_alerts = s.low_stock_alerts, receipt_footer = s.receipt_footer,
        updated_by = v_me.telegram_id
    where id = 1
    returning * into s;
  exception
    when raise_exception then raise;
    when others then perform public.app_error('invalid_input', 'settings');
  end;
  perform public.write_audit('settings.update', 'settings', '1', to_jsonb(v_before), to_jsonb(s));
  return public.settings_json(true);
end;
$$;

-- ─── Session ─────────────────────────────────────────────────────────
create or replace function public.get_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
begin
  return jsonb_build_object(
    'public_id', v.public_id, 'username', v.username, 'first_name', v.first_name,
    'last_name', v.last_name, 'photo_url', v.photo_url, 'language', v.language,
    'role', v.role, 'is_banned', v.is_banned,
    'settings', case when v.role in ('staff', 'owner') and not v.is_banned
                     then public.settings_json(v.role = 'owner')
                     else jsonb_build_object('shop_name', (select shop_name from public.shop_settings where id = 1)) end
  );
end;
$$;

-- p_input: { language? }
create or replace function public.update_my_profile(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
begin
  if p_input ? 'language' then
    if p_input ->> 'language' not in ('en', 'am') then perform public.app_error('invalid_input', 'language'); end if;
    update public.profiles set language = p_input ->> 'language' where telegram_id = v.telegram_id;
  end if;
  return public.get_me();
end;
$$;

-- ─── Team ────────────────────────────────────────────────────────────
create or replace function public.member_json(u public.profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'public_id', u.public_id, 'name', coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), u.username),
    'username', u.username, 'photo_url', u.photo_url, 'role', u.role,
    'is_banned', u.is_banned, 'last_seen_at', u.last_seen_at, 'created_at', u.created_at
  );
$$;

-- Members (staff + owners) and recent access requests (users seen in the last 30 days).
create or replace function public.list_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
begin
  return jsonb_build_object(
    'me', v_me.public_id,
    'members', coalesce((select jsonb_agg(public.member_json(u) order by u.role desc, lower(u.first_name))
                         from public.profiles u where u.role in ('staff', 'owner')), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(public.member_json(u) order by u.last_seen_at desc)
                          from (select * from public.profiles
                                where role = 'user' and not is_banned
                                  and last_seen_at > now() - interval '30 days'
                                order by last_seen_at desc limit 50) u), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_member_role(p_public_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  v public.profiles;
  v_old text;
begin
  if p_role not in ('user', 'staff', 'owner') then perform public.app_error('invalid_input', 'role'); end if;
  -- Serialize role changes so two owners cannot demote each other at once.
  perform 1 from public.profiles where role = 'owner' for update;
  select * into v from public.profiles where public_id = p_public_id for update;
  if not found then perform public.app_error('not_found'); end if;
  if v.role = p_role then return public.member_json(v); end if;
  v_old := v.role;
  if v.role = 'owner' and (select count(*) from public.profiles where role = 'owner' and not is_banned) <= 1 then
    perform public.app_error('last_owner');
  end if;
  update public.profiles set role = p_role where telegram_id = v.telegram_id returning * into v;
  perform public.write_audit('user.set_role', 'user', v.telegram_id,
                             jsonb_build_object('role', v_old),
                             jsonb_build_object('role', p_role));
  if not v.bot_blocked then
    perform public.enqueue_notification(v.telegram_id, 'role_changed', jsonb_build_object('role', p_role));
  end if;
  return public.member_json(v);
end;
$$;

-- ─── Edge Function helpers (service_role only) ──────────────────────
-- Called by auth-telegram after the initData signature is verified. A brand-new user is
-- announced to the owners as an access request.
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
  v_new boolean := not exists (select 1 from public.profiles where telegram_id = p_telegram_id);
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
      photo_url = case when excluded.photo_url <> '' then excluded.photo_url else public.profiles.photo_url end,
      last_seen_at = now(),
      bot_blocked = false
  returning * into v;
  if v_new and v.role = 'user' then
    perform public.notify_owners('access_request', jsonb_build_object(
      'name', coalesce(nullif(btrim(v.first_name || ' ' || v.last_name), ''), v.username),
      'username', v.username));
  end if;
  return v;
end;
$$;

-- First-owner bootstrap from env (INITIAL_ADMIN_TELEGRAM_IDS): only while no owner exists.
create or replace function public.bootstrap_owner(p_telegram_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where role = 'owner') then
    return false;
  end if;
  update public.profiles set role = 'owner', is_banned = false where telegram_id = p_telegram_id;
  if found then
    insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
    values (null, 'user.bootstrap_owner', 'user', p_telegram_id, null, jsonb_build_object('role', 'owner'));
  end if;
  return found;
end;
$$;

-- Ownership check for signed product-image upload URLs issued by the `storage` Edge Function.
create or replace function public.can_manage_products(p_telegram_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles
                 where telegram_id = p_telegram_id and role = 'owner' and not is_banned);
$$;

-- ─── Outbox worker API ───────────────────────────────────────────────
-- Claims due rows (skip locked, so parallel workers never double-send) with exponential backoff.
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
    'language', coalesce(u.language, 'en')
  ) order by c.id), '[]'::jsonb)
  into v_rows
  from claimed c
  left join public.profiles u on u.telegram_id = c.chat_id;
  return v_rows;
end;
$$;

-- Bot: is this Telegram user an owner? (commands like /today in Phase 6)
create or replace function public.member_role(p_telegram_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when is_banned then 'user' else role end from public.profiles where telegram_id = p_telegram_id;
$$;

-- ─── Storage: product images ─────────────────────────────────────────
-- Public read; uploads only via signed URLs from the `storage` function (owner check).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present (plain Postgres) — skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function
  public.get_me(),
  public.update_my_profile(jsonb),
  public.get_settings(),
  public.update_settings(jsonb),
  public.list_team(),
  public.set_member_role(uuid, text)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.upsert_telegram_profile(text, text, text, text, text, text),
      public.bootstrap_owner(text),
      public.can_manage_products(text),
      public.claim_outbox(int),
      public.complete_outbox(bigint, boolean, text, boolean),
      public.member_role(text)
    to service_role;
  end if;
end $$;
