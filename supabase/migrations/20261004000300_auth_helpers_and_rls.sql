-- 0300 · Identity helpers, error helper, audit/outbox helpers, RLS and grants (SPEC A9).
--
-- Identity: the `auth-telegram` Edge Function signs a JWT with claim `tg_id`.
-- Roles are ALWAYS read from public.profiles, never from a client-controlled value.

-- ─── Identity ────────────────────────────────────────────────────────
create or replace function public.current_tg_id()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(coalesce(auth.jwt() ->> 'tg_id', ''), '');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where telegram_id = public.current_tg_id()
      and role in ('moderator', 'admin')
      and not is_banned
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where telegram_id = public.current_tg_id()
      and role = 'admin'
      and not is_banned
  );
$$;

-- ─── Errors: message is a stable code the client maps to i18n ───────
create or replace function public.app_error(p_code text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  raise exception using message = p_code, errcode = 'P0001', detail = coalesce(p_detail, '');
end;
$$;

-- Caller's profile; raises unless signed in (and not banned, unless allowed).
create or replace function public.require_user(p_allow_banned boolean default false)
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text := public.current_tg_id();
  v_profile public.profiles;
begin
  if v_id is null then
    perform public.app_error('not_authenticated');
  end if;
  select * into v_profile from public.profiles where telegram_id = v_id;
  if not found then
    perform public.app_error('not_authenticated');
  end if;
  if v_profile.is_banned and not p_allow_banned then
    perform public.app_error('banned');
  end if;
  return v_profile;
end;
$$;

create or replace function public.require_staff()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.require_user();
begin
  if v_profile.role not in ('moderator', 'admin') then
    perform public.app_error('not_authorized');
  end if;
  return v_profile;
end;
$$;

create or replace function public.require_admin()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.require_user();
begin
  if v_profile.role <> 'admin' then
    perform public.app_error('not_authorized');
  end if;
  return v_profile;
end;
$$;

-- ─── Audit + outbox (internal; never granted to clients) ────────────
create or replace function public.write_audit(
  p_action text, p_target_type text, p_target_id text, p_before jsonb, p_after jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
  values (public.current_tg_id(), p_action, p_target_type, p_target_id, p_before, p_after);
$$;

create or replace function public.enqueue_notification(p_chat_id text, p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications_outbox (chat_id, kind, payload)
  select p_chat_id, p_kind, coalesce(p_payload, '{}')
  where coalesce(p_chat_id, '') <> '';
$$;

create or replace function public.notify_admins(p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications_outbox (chat_id, kind, payload)
  select telegram_id, p_kind, coalesce(p_payload, '{}')
  from public.profiles
  where role = 'admin' and not is_banned and not bot_blocked;
$$;

-- ─── Row level security ──────────────────────────────────────────────
alter table public.platform_settings    enable row level security;
alter table public.profiles             enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.payments             enable row level security;
alter table public.favorites            enable row level security;
alter table public.leads                enable row level security;
alter table public.reports              enable row level security;
alter table public.reviews              enable row level security;
alter table public.product_views        enable row level security;
alter table public.notifications_outbox enable row level security;
alter table public.audit_log            enable row level security;

-- Reads only. There are deliberately NO insert/update/delete policies:
-- every write goes through a SECURITY DEFINER RPC or an Edge Function.
drop policy if exists settings_admin_read on public.platform_settings;
create policy settings_admin_read on public.platform_settings
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_self_or_staff_read on public.profiles;
create policy profiles_self_or_staff_read on public.profiles
  for select to authenticated using (telegram_id = public.current_tg_id() or public.is_staff());

drop policy if exists products_owner_or_staff_read on public.products;
create policy products_owner_or_staff_read on public.products
  for select to authenticated using (seller_id = public.current_tg_id() or public.is_staff());

drop policy if exists product_images_owner_or_staff_read on public.product_images;
create policy product_images_owner_or_staff_read on public.product_images
  for select to authenticated using (
    public.is_staff()
    or exists (select 1 from public.products p
               where p.id = product_id and p.seller_id = public.current_tg_id())
  );

drop policy if exists payments_owner_or_staff_read on public.payments;
create policy payments_owner_or_staff_read on public.payments
  for select to authenticated using (telegram_id = public.current_tg_id() or public.is_staff());

drop policy if exists favorites_owner_read on public.favorites;
create policy favorites_owner_read on public.favorites
  for select to authenticated using (telegram_id = public.current_tg_id());

drop policy if exists leads_party_or_staff_read on public.leads;
create policy leads_party_or_staff_read on public.leads
  for select to authenticated using (
    buyer_id = public.current_tg_id() or seller_id = public.current_tg_id() or public.is_staff()
  );

drop policy if exists reports_reporter_or_staff_read on public.reports;
create policy reports_reporter_or_staff_read on public.reports
  for select to authenticated using (reporter_id = public.current_tg_id() or public.is_staff());

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews
  for select to anon, authenticated using (true);

drop policy if exists outbox_admin_read on public.notifications_outbox;
create policy outbox_admin_read on public.notifications_outbox
  for select to authenticated using (public.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- ─── Table privileges (defense in depth on top of RLS) ──────────────
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.platform_settings, public.profiles, public.products, public.product_images,
  public.payments, public.favorites, public.leads, public.reports, public.reviews,
  public.notifications_outbox, public.audit_log
  to authenticated;
grant select on public.reviews to anon;

-- Functions: nothing is callable by clients unless explicitly granted in later migrations.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Helpers that RLS policies evaluate must be executable by the querying role.
grant execute on function public.current_tg_id(), public.is_staff(), public.is_admin()
  to anon, authenticated;
