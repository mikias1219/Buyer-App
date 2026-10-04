-- 0700 · Admin & moderation console RPCs (SPEC A5 flow 7).
-- Moderators: review queue, reports, listing removal. Admins: everything.

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_staff();
  s public.platform_settings := public.get_settings();
  v_today timestamptz := date_trunc('day', now());
  v_result jsonb;
begin
  v_result := jsonb_build_object(
    'role', v.role,
    'in_review', (select count(*) from public.products where status = 'in_review'),
    'oldest_in_review_at', (select min(status_changed_at) from public.products where status = 'in_review'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'new_listings_today', (select count(*) from public.products
                           where published_at >= v_today and status in ('active', 'paused', 'sold', 'expired')),
    'live_listings', (select count(*) from public.listings_public)
  );
  if v.role <> 'admin' then
    return v_result;
  end if;
  return v_result || jsonb_build_object(
    'payments_waiting', (select count(*) from public.payments where status = 'submitted'),
    'oldest_payment_at', (select min(submitted_at) from public.payments where status = 'submitted'),
    'sla_minutes', s.payment_sla_minutes,
    'revenue_7d', (select coalesce(sum(amount_etb) filter (where reviewed_at > now() - interval '7 days'
                                                           and status in ('confirmed', 'refunded')), 0)
                        - coalesce(sum(amount_etb) filter (where refunded_at > now() - interval '7 days'), 0)
                   from public.payments),
    'revenue_30d', (select coalesce(sum(amount_etb) filter (where reviewed_at > now() - interval '30 days'
                                                            and status in ('confirmed', 'refunded')), 0)
                         - coalesce(sum(amount_etb) filter (where refunded_at > now() - interval '30 days'), 0)
                    from public.payments),
    'revenue_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'amount', coalesce(x.amount, 0)) order by d)
      from generate_series(v_today - interval '13 days', v_today, interval '1 day') d
      left join (select date_trunc('day', reviewed_at) as paid_day, sum(amount_etb) as amount
                 from public.payments where status in ('confirmed', 'refunded')
                   and reviewed_at > v_today - interval '14 days'
                 group by 1) x on x.paid_day = d), '[]'::jsonb),
    'funnel_30d', (select jsonb_build_object(
                     'created', count(*),
                     'submitted', count(*) filter (where status <> 'draft'),
                     'paid', count(*) filter (where period_paid),
                     'live', count(*) filter (where published_at is not null))
                   from public.products where created_at > now() - interval '30 days'),
    'top_categories', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', n) order by n desc)
                                from (select category, count(*) n from public.listings_public
                                      group by category order by 2 desc limit 5) c), '[]'::jsonb),
    'users_total', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles where created_at >= v_today),
    'outbox_failed', (select count(*) from public.notifications_outbox where sent_at is null and attempts >= 5)
  );
end;
$$;

-- Listings waiting for review, oldest first, with seller trust signals.
create or replace function public.admin_review_queue(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'description', p.description, 'price', p.price,
      'category', p.category, 'brand', p.brand, 'model', p.model, 'condition', p.condition,
      'city', p.city, 'specs', p.specs, 'negotiable', p.negotiable, 'exchange', p.exchange,
      'flags', p.flags, 'is_free', p.is_free, 'waiting_since', p.status_changed_at,
      'was_live', p.published_at is not null,
      'median_price', public.price_median(p.category, p.brand, p.id),
      'images', coalesce((select jsonb_agg(path order by position) from public.product_images
                          where product_id = p.id), '[]'::jsonb),
      'seller', jsonb_build_object(
        'public_id', s.public_id, 'name', s.first_name, 'username', s.username,
        'verified', s.is_verified_seller, 'member_since', s.created_at,
        'phone_verified', s.phone_verified,
        'rating', public.seller_rating(s.telegram_id),
        'live_count', (select count(*) from public.products where seller_id = s.telegram_id and status = 'active'),
        'sold_count', (select count(*) from public.products where seller_id = s.telegram_id and status = 'sold'),
        'past_rejections', (select count(*) from public.audit_log
                            where action in ('listing.reject', 'listing.remove') and target_type = 'product'
                              and target_id in (select id::text from public.products where seller_id = s.telegram_id)),
        'open_reports', (select count(*) from public.reports where status = 'open'
                           and target_type = 'user' and target_id = s.telegram_id)
      )
    ) order by p.status_changed_at)
    from (select * from public.products where status = 'in_review'
          order by status_changed_at limit least(greatest(coalesce(p_limit, 20), 1), 100)) p
    join public.profiles s on s.telegram_id = p.seller_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_payments(
  p_status text default 'submitted', p_search text default null, p_limit int default 30, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_data order by sort_key)
    from (
      select
        jsonb_build_object(
          'id', pay.id, 'kind', pay.kind, 'status', pay.status, 'amount_etb', pay.amount_etb,
          'reference', pay.reference, 'has_screenshot', pay.screenshot_path <> '',
          'reject_reason', pay.reject_reason, 'admin_note', pay.admin_note,
          'submitted_at', pay.submitted_at, 'reviewed_at', pay.reviewed_at, 'created_at', pay.created_at,
          'duplicate_count', (select count(*) from public.payments d
                              where d.reference = pay.reference and d.reference <> '' and d.id <> pay.id),
          'product', jsonb_build_object(
            'id', p.id, 'title', p.title, 'price', p.price, 'status', p.status, 'category', p.category,
            'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1)),
          'seller', jsonb_build_object('name', s.first_name, 'username', s.username, 'public_id', s.public_id,
                                       'verified', s.is_verified_seller)
        ) as row_data,
        case when pay.status = 'submitted' then extract(epoch from pay.submitted_at)
             else -extract(epoch from coalesce(pay.reviewed_at, pay.created_at)) end as sort_key
      from public.payments pay
      join public.products p on p.id = pay.product_id
      join public.profiles s on s.telegram_id = pay.telegram_id
      where (p_status is null or p_status = 'all' or pay.status = p_status)
        and (v_search is null
             or lower(pay.reference) like '%' || v_search || '%'
             or lower(s.username) like '%' || v_search || '%'
             or lower(s.first_name) like '%' || v_search || '%'
             or lower(p.title) like '%' || v_search || '%')
      order by sort_key
      limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
    ) rows
  ), '[]'::jsonb);
end;
$$;

-- Short-lived access for staff to view a payment screenshot happens in the `storage` Edge Function,
-- which calls this to authorize.
create or replace function public.can_view_payment_proof(p_payment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
  pay public.payments;
begin
  select * into pay from public.payments where id = p_payment_id;
  if not found or pay.screenshot_path = '' then
    perform public.app_error('not_found');
  end if;
  if v.role <> 'admin' and pay.telegram_id <> v.telegram_id then
    perform public.app_error('not_authorized');
  end if;
  return pay.screenshot_path;
end;
$$;

create or replace function public.admin_list_reports(p_status text default 'open', p_limit int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'target_type', r.target_type, 'reason', r.reason, 'note', r.note,
      'status', r.status, 'resolution', r.resolution, 'created_at', r.created_at,
      'reporter_name', rp.first_name,
      'same_target_open', (select count(*) from public.reports o
                           where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open'),
      'product', case when r.target_type = 'product' then (
          select jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price, 'status', p.status,
            'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1),
            'seller_name', ps.first_name, 'seller_public_id', ps.public_id)
          from public.products p join public.profiles ps on ps.telegram_id = p.seller_id
          where p.id::text = r.target_id) end,
      'user', (select jsonb_build_object('public_id', u.public_id, 'name', u.first_name, 'username', u.username,
                                         'is_banned', u.is_banned)
               from public.profiles u
               where u.telegram_id = case when r.target_type = 'user' then r.target_id
                                          else (select seller_id from public.products where id::text = r.target_id) end)
    ) order by r.created_at)
    from (select * from public.reports
          where p_status is null or p_status = 'all' or status = p_status
          order by created_at limit least(greatest(coalesce(p_limit, 30), 1), 100)) r
    join public.profiles rp on rp.telegram_id = r.reporter_id
  ), '[]'::jsonb);
end;
$$;

-- action: dismiss | remove_listing | ban_user (ban requires admin)
create or replace function public.resolve_report(p_id uuid, p_action text, p_note text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_staff();
  r public.reports;
  v_user text;
begin
  select * into r from public.reports where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if r.status <> 'open' then
    perform public.app_error('illegal_transition', r.status || ' -> resolved');
  end if;

  if p_action = 'dismiss' then
    update public.reports
    set status = 'dismissed', resolution = left(coalesce(p_note, ''), 300), resolved_by = v.telegram_id, resolved_at = now()
    where target_type = r.target_type and target_id = r.target_id and status = 'open';
  elsif p_action = 'remove_listing' and r.target_type = 'product' then
    if exists (select 1 from public.products where id::text = r.target_id and status not in ('draft', 'sold', 'removed')) then
      perform public.admin_remove_listing(r.target_id::uuid, 'other', coalesce(p_note, ''));
    end if;
    update public.reports
    set status = 'actioned', resolution = 'listing_removed', resolved_by = v.telegram_id, resolved_at = now()
    where target_type = r.target_type and target_id = r.target_id and status = 'open';
  elsif p_action = 'ban_user' then
    if v.role <> 'admin' then
      perform public.app_error('not_authorized');
    end if;
    v_user := case when r.target_type = 'user' then r.target_id
                   else (select seller_id from public.products where id::text = r.target_id) end;
    perform public.admin_set_ban_internal(v_user, true, coalesce(nullif(p_note, ''), 'report:' || r.reason));
    update public.reports
    set status = 'actioned', resolution = 'user_banned', resolved_by = v.telegram_id, resolved_at = now()
    where status = 'open'
      and ((target_type = 'user' and target_id = v_user)
           or (target_type = 'product' and target_id in (select id::text from public.products where seller_id = v_user)));
  else
    perform public.app_error('invalid_input', 'action');
  end if;

  perform public.write_audit('report.' || p_action, 'report', p_id::text, to_jsonb(r),
                             (select to_jsonb(x) from public.reports x where x.id = p_id));
  return p_action;
end;
$$;

-- ─── Users ───────────────────────────────────────────────────────────
create or replace function public.admin_user_json(p public.profiles)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'public_id', p.public_id, 'telegram_id', p.telegram_id, 'username', p.username,
    'first_name', p.first_name, 'last_name', p.last_name, 'phone', p.phone,
    'phone_verified', p.phone_verified, 'city', p.city, 'role', p.role,
    'is_banned', p.is_banned, 'ban_reason', p.ban_reason, 'is_verified_seller', p.is_verified_seller,
    'language', p.language, 'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
    'live_count', (select count(*) from public.products where seller_id = p.telegram_id and status = 'active'),
    'listing_count', (select count(*) from public.products where seller_id = p.telegram_id),
    'rating', public.seller_rating(p.telegram_id)
  );
$$;

create or replace function public.admin_list_users(
  p_search text default null, p_filter text default 'all', p_limit int default 30, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(public.admin_user_json(p) order by p.created_at desc)
    from (
      select * from public.profiles pr
      where (v_search is null
             or lower(pr.username) like '%' || replace(v_search, '@', '') || '%'
             or lower(pr.first_name || ' ' || pr.last_name) like '%' || v_search || '%'
             or pr.telegram_id = v_search
             or pr.phone like '%' || v_search || '%')
        and (coalesce(p_filter, 'all') = 'all'
             or (p_filter = 'banned' and pr.is_banned)
             or (p_filter = 'staff' and pr.role <> 'user')
             or (p_filter = 'verified' and pr.is_verified_seller))
      order by pr.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
    ) p
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_user(p_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  perform public.require_admin();
  select * into p from public.profiles where public_id = p_public_id;
  if not found then
    perform public.app_error('not_found');
  end if;
  return public.admin_user_json(p) || jsonb_build_object(
    'listings', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'title', title, 'price', price, 'status', status, 'updated_at', updated_at)
                  order by updated_at desc)
                from (select * from public.products where seller_id = p.telegram_id
                      order by updated_at desc limit 50) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'kind', kind, 'status', status, 'amount_etb', amount_etb,
                  'reference', reference, 'created_at', created_at) order by created_at desc)
                from (select * from public.payments where telegram_id = p.telegram_id
                      order by created_at desc limit 50) x), '[]'::jsonb),
    'reports_against', (select count(*) from public.reports
                        where (target_type = 'user' and target_id = p.telegram_id)
                           or (target_type = 'product' and target_id in (
                                 select id::text from public.products where seller_id = p.telegram_id))),
    'reports_filed', (select count(*) from public.reports where reporter_id = p.telegram_id)
  );
end;
$$;

-- Internal: shared by admin_set_ban and resolve_report (callers check permissions).
create or replace function public.admin_set_ban_internal(p_telegram_id text, p_banned boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where telegram_id = p_telegram_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if p.telegram_id = public.current_tg_id() then
    perform public.app_error('cannot_target_self');
  end if;
  if p.role = 'admin' and p_banned then
    perform public.app_error('cannot_ban_admin');
  end if;
  update public.profiles
  set is_banned = p_banned, ban_reason = case when p_banned then left(coalesce(p_reason, ''), 300) else '' end
  where telegram_id = p_telegram_id;
  perform public.write_audit(case when p_banned then 'user.ban' else 'user.unban' end, 'user', p_telegram_id,
    jsonb_build_object('is_banned', p.is_banned, 'ban_reason', p.ban_reason),
    jsonb_build_object('is_banned', p_banned, 'ban_reason', p_reason));
end;
$$;

create or replace function public.admin_set_ban(p_public_id uuid, p_banned boolean, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  perform public.require_admin();
  select telegram_id into v_id from public.profiles where public_id = p_public_id;
  if p_banned and coalesce(btrim(p_reason), '') = '' then
    perform public.app_error('reason_required');
  end if;
  perform public.admin_set_ban_internal(v_id, p_banned, p_reason);
  return (select public.admin_user_json(p) from public.profiles p where p.telegram_id = v_id);
end;
$$;

create or replace function public.admin_set_role(p_public_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  perform public.require_admin();
  if p_role not in ('user', 'moderator', 'admin') then
    perform public.app_error('invalid_input', 'role');
  end if;
  select * into p from public.profiles where public_id = p_public_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if p.telegram_id = public.current_tg_id() then
    perform public.app_error('cannot_target_self');
  end if;
  if p.is_banned and p_role <> 'user' then
    perform public.app_error('user_banned');
  end if;
  update public.profiles set role = p_role where telegram_id = p.telegram_id;
  perform public.write_audit('user.set_role', 'user', p.telegram_id,
    jsonb_build_object('role', p.role), jsonb_build_object('role', p_role));
  return (select public.admin_user_json(x) from public.profiles x where x.telegram_id = p.telegram_id);
end;
$$;

create or replace function public.admin_set_verified(p_public_id uuid, p_verified boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  perform public.require_admin();
  select * into p from public.profiles where public_id = p_public_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  update public.profiles set is_verified_seller = p_verified where telegram_id = p.telegram_id;
  perform public.write_audit('user.set_verified', 'user', p.telegram_id,
    jsonb_build_object('is_verified_seller', p.is_verified_seller),
    jsonb_build_object('is_verified_seller', p_verified));
  return (select public.admin_user_json(x) from public.profiles x where x.telegram_id = p.telegram_id);
end;
$$;

-- ─── Listings browser for staff ──────────────────────────────────────
create or replace function public.admin_list_listings(
  p_status text default 'active', p_search text default null, p_limit int default 30, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'price', p.price, 'status', p.status, 'category', p.category,
      'city', p.city, 'flags', p.flags, 'views', p.views, 'updated_at', p.updated_at,
      'published_at', p.published_at, 'expires_at', p.expires_at,
      'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1),
      'seller', jsonb_build_object('name', s.first_name, 'username', s.username, 'public_id', s.public_id)
    ) order by p.updated_at desc)
    from (select * from public.products pr
          where (coalesce(p_status, 'all') = 'all' or pr.status = p_status)
            and (v_search is null or pr.search_text like '%' || v_search || '%' or pr.id::text = v_search)
          order by pr.updated_at desc
          limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) p
    join public.profiles s on s.telegram_id = p.seller_id
  ), '[]'::jsonb);
end;
$$;

-- ─── Settings ────────────────────────────────────────────────────────
create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (select to_jsonb(s) - 'id' from public.platform_settings s where s.id = 1);
end;
$$;

create or replace function public.admin_update_settings(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_admin();
  v_before public.platform_settings := public.get_settings();
  v_allowed text[] := array[
    'listing_fee_etb', 'free_listings_quota', 'listing_duration_days', 'reminder_days_before',
    'max_active_listings', 'boost_price_etb', 'boost_days', 'contact_daily_limit', 'payment_sla_minutes',
    'telebirr_number', 'telebirr_name', 'support_username', 'bot_username', 'mini_app_short_name',
    'channel_id', 'channel_autopost', 'banned_words'];
  v_key text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform public.app_error('invalid_input');
  end if;
  for v_key in select jsonb_object_keys(p_input) loop
    if not v_key = any (v_allowed) then
      perform public.app_error('invalid_input', v_key);
    end if;
  end loop;

  update public.platform_settings set
    listing_fee_etb       = coalesce((p_input ->> 'listing_fee_etb')::numeric, listing_fee_etb),
    free_listings_quota   = coalesce((p_input ->> 'free_listings_quota')::int, free_listings_quota),
    listing_duration_days = coalesce((p_input ->> 'listing_duration_days')::int, listing_duration_days),
    reminder_days_before  = coalesce((p_input ->> 'reminder_days_before')::int, reminder_days_before),
    max_active_listings   = coalesce((p_input ->> 'max_active_listings')::int, max_active_listings),
    boost_price_etb       = coalesce((p_input ->> 'boost_price_etb')::numeric, boost_price_etb),
    boost_days            = coalesce((p_input ->> 'boost_days')::int, boost_days),
    contact_daily_limit   = coalesce((p_input ->> 'contact_daily_limit')::int, contact_daily_limit),
    payment_sla_minutes   = coalesce((p_input ->> 'payment_sla_minutes')::int, payment_sla_minutes),
    telebirr_number       = coalesce(btrim(p_input ->> 'telebirr_number'), telebirr_number),
    telebirr_name         = coalesce(btrim(p_input ->> 'telebirr_name'), telebirr_name),
    support_username      = coalesce(ltrim(btrim(p_input ->> 'support_username'), '@'), support_username),
    bot_username          = coalesce(ltrim(btrim(p_input ->> 'bot_username'), '@'), bot_username),
    mini_app_short_name   = coalesce(btrim(p_input ->> 'mini_app_short_name'), mini_app_short_name),
    channel_id            = coalesce(btrim(p_input ->> 'channel_id'), channel_id),
    channel_autopost      = coalesce((p_input ->> 'channel_autopost')::boolean, channel_autopost),
    banned_words          = case when p_input ? 'banned_words'
                              then (select coalesce(array_agg(distinct lower(btrim(w))) filter (where btrim(w) <> ''), '{}')
                                    from jsonb_array_elements_text(p_input -> 'banned_words') w)
                              else banned_words end,
    updated_by = v.telegram_id
  where id = 1;

  perform public.write_audit('settings.update', 'settings', '1', to_jsonb(v_before),
                             (select to_jsonb(s) from public.platform_settings s where s.id = 1));
  return public.admin_get_settings();
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform public.app_error('invalid_input', sqlerrm);
    return null;
end;
$$;

create or replace function public.admin_audit_log(
  p_action text default null, p_target_type text default null, p_actor text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
      'before', a.before, 'after', a.after, 'created_at', a.created_at,
      'actor', jsonb_build_object('name', u.first_name, 'username', u.username, 'public_id', u.public_id)
    ) order by a.created_at desc)
    from (select * from public.audit_log l
          where (p_action is null or l.action like p_action || '%')
            and (p_target_type is null or l.target_type = p_target_type)
            and (p_actor is null or l.actor_id = (select telegram_id from public.profiles
                                                   where public_id::text = p_actor or username = ltrim(p_actor, '@')
                                                   limit 1))
            and (p_from is null or l.created_at >= p_from)
            and (p_to is null or l.created_at < p_to)
          order by l.created_at desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) a
    left join public.profiles u on u.telegram_id = a.actor_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function
  public.admin_dashboard(),
  public.admin_review_queue(int),
  public.admin_list_payments(text, text, int, int),
  public.can_view_payment_proof(uuid),
  public.admin_list_reports(text, int),
  public.resolve_report(uuid, text, text),
  public.admin_list_users(text, text, int, int),
  public.admin_get_user(uuid),
  public.admin_set_ban(uuid, boolean, text),
  public.admin_set_role(uuid, text),
  public.admin_set_verified(uuid, boolean),
  public.admin_list_listings(text, text, int, int),
  public.admin_get_settings(),
  public.admin_update_settings(jsonb),
  public.admin_audit_log(text, text, text, timestamptz, timestamptz, int, int)
  to authenticated;
