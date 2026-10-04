-- 0600 · Public catalogue, buyer actions and account RPCs (SPEC A3.9, A5 flows 1–2, A8).
-- Seller contact data (username, phone) is never exposed here except through request_contact().

-- ─── Seller rating helper ────────────────────────────────────────────
create or replace function public.seller_rating(p_seller text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rating', round(avg(rating)::numeric, 1),
    'count', count(*)
  )
  from public.reviews where seller_id = p_seller;
$$;

-- ─── Public view: active listings only, no contact fields ───────────
-- Runs with the owner's rights (intentionally not security_invoker) so anon can read the
-- safe projection without any access to the underlying tables.
create or replace view public.listings_public as
select
  p.id,
  p.title,
  p.description,
  p.price,
  p.category,
  p.brand,
  p.model,
  p.condition,
  p.city,
  p.specs,
  p.negotiable,
  p.exchange,
  p.published_at,
  p.expires_at,
  (p.boosted_until is not null and p.boosted_until > now()) as is_featured,
  p.views,
  s.public_id as seller_public_id,
  s.first_name as seller_name,
  s.is_verified_seller as seller_verified,
  (select i.path from public.product_images i where i.product_id = p.id order by i.position limit 1)
    as cover_path,
  p.search_text,
  p.seller_id as _seller_key
from public.products p
join public.profiles s on s.telegram_id = p.seller_id
where p.status = 'active'
  and not s.is_banned
  and (p.expires_at is null or p.expires_at > now());

-- The internal seller key must not leak; expose a column-restricted grant.
revoke all on public.listings_public from anon, authenticated;
grant select (id, title, description, price, category, brand, model, condition, city, specs,
              negotiable, exchange, published_at, expires_at, is_featured, views,
              seller_public_id, seller_name, seller_verified, cover_path)
  on public.listings_public to anon, authenticated;

create or replace function public.card_json(v public.listings_public)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id, 'title', v.title, 'price', v.price, 'category', v.category, 'brand', v.brand,
    'model', v.model, 'condition', v.condition, 'city', v.city, 'negotiable', v.negotiable,
    'exchange', v.exchange, 'is_featured', v.is_featured, 'published_at', v.published_at,
    'cover_path', v.cover_path, 'seller_verified', v.seller_verified
  );
$$;

-- ─── Search (server-side filters, sort, pagination) ─────────────────
create or replace function public.search_listings(
  p_query      text default null,
  p_category   text default null,
  p_conditions text[] default null,
  p_city       text default null,
  p_brand      text default null,
  p_min_price  numeric default null,
  p_max_price  numeric default null,
  p_specs      jsonb default null,
  p_sort       text default 'newest',
  p_featured_only boolean default false,
  p_limit      int default 20,
  p_offset     int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_words text[];
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 10000);
  v_result jsonb;
begin
  if coalesce(btrim(p_query), '') <> '' then
    select array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_'))
    into v_words
    from unnest(regexp_split_to_array(lower(left(btrim(p_query), 80)), '\s+')) w
    where w <> '';
  end if;

  with filtered as (
    select v as lp, v.id, v.is_featured, v.price, v.published_at
    from public.listings_public v
    where (v_words is null or not exists (
             select 1 from unnest(v_words) w where v.search_text not like '%' || w || '%'))
      and (p_category is null or v.category = p_category)
      and (p_conditions is null or cardinality(p_conditions) = 0 or v.condition = any (p_conditions))
      and (coalesce(p_city, '') = '' or v.city = p_city)
      and (coalesce(p_brand, '') = '' or lower(v.brand) = lower(p_brand))
      and (p_min_price is null or v.price >= p_min_price)
      and (p_max_price is null or v.price <= p_max_price)
      and (p_specs is null or v.specs @> public.sanitize_specs(p_specs))
      and (not coalesce(p_featured_only, false) or v.is_featured)
  ),
  ranked as (
    select f.lp,
           row_number() over (order by
             case when coalesce(p_sort, 'newest') = 'newest' then f.is_featured end desc nulls last,
             case when p_sort = 'price_asc' then f.price end asc,
             case when p_sort = 'price_desc' then f.price end desc,
             f.published_at desc,
             f.id) as rn,
           count(*) over () as total
    from filtered f
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public.card_json(r.lp) order by r.rn)
                        filter (where r.rn > v_offset and r.rn <= v_offset + v_limit), '[]'::jsonb),
    'total', coalesce(max(r.total), 0),
    'next_offset', case when coalesce(max(r.total), 0) > v_offset + v_limit then v_offset + v_limit end
  )
  into v_result
  from ranked r;

  return v_result;
end;
$$;

-- Home rails in one round-trip: featured, newest, near you (profile city), under 20,000 ETB.
create or replace function public.home_feed(p_city text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'featured', coalesce((select jsonb_agg(public.card_json(x.v) order by (x.v).published_at desc)
                 from (select v from public.listings_public v where v.is_featured
                       order by v.published_at desc limit 10) x), '[]'::jsonb),
    'newest',   coalesce((select jsonb_agg(public.card_json(x.v) order by (x.v).published_at desc)
                 from (select v from public.listings_public v
                       order by v.published_at desc limit 10) x), '[]'::jsonb),
    'near_you', coalesce((select jsonb_agg(public.card_json(x.v) order by (x.v).published_at desc)
                 from (select v from public.listings_public v
                       where coalesce(p_city, '') <> '' and v.city = p_city
                       order by v.published_at desc limit 10) x), '[]'::jsonb),
    'under_20k', coalesce((select jsonb_agg(public.card_json(x.v) order by (x.v).published_at desc)
                 from (select v from public.listings_public v where v.price <= 20000
                       order by v.published_at desc limit 10) x), '[]'::jsonb),
    'category_counts', coalesce((select jsonb_object_agg(category, n)
                 from (select category, count(*) n from public.listings_public group by category) c), '{}'::jsonb)
  );
$$;

-- ─── Listing detail ──────────────────────────────────────────────────
-- Public for active listings; owners and staff also see non-active ones with status details.
create or replace function public.get_listing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me text := public.current_tg_id();
  v_staff boolean := public.is_staff();
  p public.products;
  s public.profiles;
  v_public boolean;
  v_owner boolean;
  v_result jsonb;
begin
  select * into p from public.products where id = p_id;
  if not found then
    perform public.app_error('not_found');
  end if;
  select * into s from public.profiles where telegram_id = p.seller_id;
  v_owner := v_me is not null and v_me = p.seller_id;
  v_public := exists (select 1 from public.listings_public where id = p_id);
  if not (v_public or v_owner or v_staff or p.status = 'sold') then
    perform public.app_error('not_found');
  end if;

  v_result := jsonb_build_object(
    'id', p.id, 'title', p.title, 'description', p.description, 'price', p.price,
    'category', p.category, 'brand', p.brand, 'model', p.model, 'condition', p.condition,
    'city', p.city, 'specs', p.specs, 'negotiable', p.negotiable, 'exchange', p.exchange,
    'status', case when v_public then 'active' else p.status end,
    'published_at', p.published_at, 'expires_at', p.expires_at,
    'is_featured', p.boosted_until is not null and p.boosted_until > now(),
    'views', p.views,
    'images', coalesce((select jsonb_agg(path order by position) from public.product_images
                        where product_id = p.id), '[]'::jsonb),
    'favorites_count', (select count(*) from public.favorites where product_id = p.id),
    'is_owner', v_owner,
    'is_favorite', v_me is not null and exists (
      select 1 from public.favorites where product_id = p.id and telegram_id = v_me),
    'can_review', v_me is not null and p.status = 'sold' and not v_owner
      and exists (select 1 from public.leads where product_id = p.id and buyer_id = v_me)
      and not exists (select 1 from public.reviews where product_id = p.id and reviewer_id = v_me),
    'seller', jsonb_build_object(
      'public_id', s.public_id, 'name', s.first_name, 'verified', s.is_verified_seller,
      'member_since', s.created_at, 'rating', public.seller_rating(s.telegram_id),
      'active_count', (select count(*) from public.listings_public where _seller_key = s.telegram_id)
    )
  );

  if v_owner or v_staff then
    v_result := v_result || jsonb_build_object(
      'manage', jsonb_build_object(
        'status', p.status, 'reject_reason', p.reject_reason, 'reject_note', p.reject_note,
        'flags', p.flags, 'is_free', p.is_free, 'period_paid', p.period_paid,
        'renew_count', p.renew_count, 'boosted_until', p.boosted_until,
        'leads_count', (select count(*) from public.leads where product_id = p.id),
        'open_payment', (select jsonb_build_object('id', id, 'kind', kind, 'status', status, 'amount_etb', amount_etb)
                         from public.payments
                         where product_id = p.id and status in ('pending', 'submitted')
                         order by created_at desc limit 1),
        'last_payment', (select jsonb_build_object('id', id, 'kind', kind, 'status', status,
                                                   'reject_reason', reject_reason, 'admin_note', admin_note)
                         from public.payments where product_id = p.id order by created_at desc limit 1)
      ));
  end if;
  return v_result;
end;
$$;

-- One view per viewer per day; owners don't count.
create or replace function public.register_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.current_tg_id();
  v_inserted int;
begin
  if v_me is null or not exists (select 1 from public.listings_public where id = p_id and _seller_key <> v_me) then
    return;
  end if;
  if not exists (select 1 from public.profiles where telegram_id = v_me) then
    return;
  end if;
  insert into public.product_views (product_id, viewer_id) values (p_id, v_me) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.products set views = views + 1 where id = p_id;
  end if;
end;
$$;

-- ─── Favorites ───────────────────────────────────────────────────────
create or replace function public.toggle_favorite(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user(true);
begin
  if exists (select 1 from public.favorites where telegram_id = v_user.telegram_id and product_id = p_id) then
    delete from public.favorites where telegram_id = v_user.telegram_id and product_id = p_id;
    return false;
  end if;
  if not exists (select 1 from public.listings_public where id = p_id) then
    perform public.app_error('listing_not_active');
  end if;
  if (select count(*) from public.favorites where telegram_id = v_user.telegram_id) >= 500 then
    perform public.app_error('rate_limited');
  end if;
  insert into public.favorites (telegram_id, product_id) values (v_user.telegram_id, p_id);
  return true;
end;
$$;

create or replace function public.my_favorites()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id, 'title', p.title, 'price', p.price, 'category', p.category, 'brand', p.brand,
      'model', p.model, 'condition', p.condition, 'city', p.city, 'negotiable', p.negotiable,
      'exchange', p.exchange, 'published_at', p.published_at, 'seller_verified', false,
      'is_featured', false,
      'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1),
      'available', exists (select 1 from public.listings_public v where v.id = p.id),
      'status', case when exists (select 1 from public.listings_public v where v.id = p.id) then 'active'
                     when p.status = 'sold' then 'sold' else 'unavailable' end
    ) order by f.created_at desc), '[]'::jsonb)
  from public.favorites f
  join public.products p on p.id = f.product_id
  where f.telegram_id = public.current_tg_id();
$$;

-- ─── Contact seller (A3.9) ───────────────────────────────────────────
create or replace function public.request_contact(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  s public.platform_settings := public.get_settings();
  v_seller public.profiles;
  v_title text;
  v_recent boolean;
begin
  if not v_user.phone_verified then
    perform public.app_error('phone_not_verified');
  end if;
  select title into v_title from public.listings_public where id = p_id;
  if v_title is null then
    perform public.app_error('listing_not_active');
  end if;
  select pr.* into v_seller
  from public.products p join public.profiles pr on pr.telegram_id = p.seller_id
  where p.id = p_id;
  if v_seller.telegram_id = v_user.telegram_id then
    perform public.app_error('own_listing');
  end if;

  v_recent := exists (select 1 from public.leads
                      where product_id = p_id and buyer_id = v_user.telegram_id
                        and created_at > now() - interval '24 hours');
  if not v_recent then
    if (select count(*) from public.leads
        where buyer_id = v_user.telegram_id and created_at > now() - interval '24 hours') >= s.contact_daily_limit then
      perform public.app_error('rate_limited');
    end if;
    insert into public.leads (product_id, buyer_id, seller_id)
    values (p_id, v_user.telegram_id, v_seller.telegram_id);
    if not v_seller.bot_blocked then
      perform public.enqueue_notification(v_seller.telegram_id, 'new_lead', jsonb_build_object(
        'product_id', p_id, 'title', v_title,
        'buyer_name', v_user.first_name, 'buyer_username', v_user.username));
    end if;
  end if;

  return jsonb_build_object(
    'username', nullif(v_seller.username, ''),
    'telegram_url', case when v_seller.username <> '' then 'https://t.me/' || v_seller.username end,
    -- Sellers without a public @username are reached by phone (they verified it to sell).
    'phone', case when v_seller.username = '' and v_seller.phone_verified then v_seller.phone end,
    'seller_name', v_seller.first_name
  );
end;
$$;

-- ─── Reports & reviews ───────────────────────────────────────────────
create or replace function public.submit_report(
  p_target_type text, p_target_id text, p_reason text, p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  v_id uuid;
  v_target text := p_target_id;
begin
  if p_target_type not in ('product', 'user') then
    perform public.app_error('invalid_input', 'target_type');
  end if;
  if p_reason not in ('scam', 'prohibited', 'wrong_info', 'duplicate', 'offensive', 'already_sold', 'other') then
    perform public.app_error('invalid_input', 'reason');
  end if;
  if p_target_type = 'product' then
    if not exists (select 1 from public.products
                   where id::text = p_target_id and seller_id <> v_user.telegram_id) then
      perform public.app_error('not_found');
    end if;
  else
    -- Users are reported by their public id; store the internal key.
    select telegram_id into v_target from public.profiles where public_id::text = p_target_id;
    if v_target is null or v_target = v_user.telegram_id then
      perform public.app_error('not_found');
    end if;
  end if;
  if (select count(*) from public.reports
      where reporter_id = v_user.telegram_id and created_at > now() - interval '24 hours') >= 10 then
    perform public.app_error('rate_limited');
  end if;

  select id into v_id from public.reports
  where reporter_id = v_user.telegram_id and target_type = p_target_type and target_id = v_target
    and status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, note)
  values (v_user.telegram_id, p_target_type, v_target, p_reason, left(coalesce(p_note, ''), 500))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_review(p_product_id uuid, p_rating int, p_comment text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  p public.products;
  v_id uuid;
begin
  select * into p from public.products where id = p_product_id;
  if not found or p.status <> 'sold' then
    perform public.app_error('not_reviewable');
  end if;
  if p.seller_id = v_user.telegram_id
     or not exists (select 1 from public.leads where product_id = p.id and buyer_id = v_user.telegram_id) then
    perform public.app_error('not_reviewable');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    perform public.app_error('invalid_input', 'rating');
  end if;
  insert into public.reviews (seller_id, reviewer_id, product_id, rating, comment)
  values (p.seller_id, v_user.telegram_id, p.id, p_rating, left(btrim(coalesce(p_comment, '')), 500))
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    perform public.app_error('already_reviewed');
    return null;
end;
$$;

-- ─── Seller profile (/seller/:public_id) ─────────────────────────────
create or replace function public.get_seller(p_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.profiles;
begin
  select * into s from public.profiles where public_id = p_public_id and not is_banned;
  if not found then
    perform public.app_error('not_found');
  end if;
  return jsonb_build_object(
    'public_id', s.public_id, 'name', s.first_name, 'verified', s.is_verified_seller,
    'member_since', s.created_at, 'city', s.city,
    'rating', public.seller_rating(s.telegram_id),
    'sold_count', (select count(*) from public.products where seller_id = s.telegram_id and status = 'sold'),
    'listings', coalesce((select jsonb_agg(public.card_json(v) order by v.published_at desc)
                          from public.listings_public v where v._seller_key = s.telegram_id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
                          'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
                          'reviewer_name', u.first_name) order by r.created_at desc)
                        from (select * from public.reviews where seller_id = s.telegram_id
                              order by created_at desc limit 20) r
                        join public.profiles u on u.telegram_id = r.reviewer_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.price_hint(p_category text, p_brand text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'median', public.price_median(p_category, p_brand),
    'low', round(public.price_median(p_category, p_brand) * 0.25, 0),
    'high', round(public.price_median(p_category, p_brand) * 4, 0)
  );
$$;

-- ─── Settings & account ──────────────────────────────────────────────
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'listing_fee_etb', listing_fee_etb, 'free_listings_quota', free_listings_quota,
    'listing_duration_days', listing_duration_days, 'max_active_listings', max_active_listings,
    'boost_price_etb', boost_price_etb, 'boost_days', boost_days,
    'payment_sla_minutes', payment_sla_minutes, 'contact_daily_limit', contact_daily_limit,
    'telebirr_number', telebirr_number, 'telebirr_name', telebirr_name,
    'support_username', support_username, 'bot_username', bot_username,
    'mini_app_short_name', mini_app_short_name
  )
  from public.platform_settings where id = 1;
$$;

create or replace function public.get_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
  s public.platform_settings := public.get_settings();
begin
  return jsonb_build_object(
    'telegram_id', v.telegram_id, 'public_id', v.public_id, 'username', v.username,
    'first_name', v.first_name, 'last_name', v.last_name, 'photo_url', v.photo_url,
    'phone_verified', v.phone_verified,
    'phone_masked', case when v.phone <> '' then '•••• ' || right(v.phone, 4) end,
    'city', v.city, 'role', v.role, 'is_banned', v.is_banned, 'ban_reason', v.ban_reason,
    'is_verified_seller', v.is_verified_seller, 'language', v.language,
    'free_listings_left', greatest(s.free_listings_quota - v.listings_free_used, 0),
    'open_listings', public.count_open_listings(v.telegram_id),
    'created_at', v.created_at
  );
end;
$$;

create or replace function public.update_my_profile(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
begin
  update public.profiles
  set city = case when p_input ? 'city' then btrim(coalesce(p_input ->> 'city', '')) else city end,
      language = case when p_input ? 'language' then p_input ->> 'language' else language end
  where telegram_id = v.telegram_id;
  return public.get_me();
exception
  when check_violation then
    perform public.app_error('invalid_input', sqlerrm);
    return null;
end;
$$;

-- All of the caller's listings with counters and payment state (Mine tab).
create or replace function public.my_listings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'price', p.price, 'category', p.category, 'brand', p.brand,
    'model', p.model, 'condition', p.condition, 'city', p.city, 'status', p.status,
    'reject_reason', p.reject_reason, 'reject_note', p.reject_note, 'flags', p.flags,
    'is_free', p.is_free, 'renew_count', p.renew_count,
    'published_at', p.published_at, 'expires_at', p.expires_at, 'updated_at', p.updated_at,
    'is_featured', p.boosted_until is not null and p.boosted_until > now(),
    'boosted_until', p.boosted_until,
    'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1),
    'views', p.views,
    'favorites_count', (select count(*) from public.favorites where product_id = p.id),
    'leads_count', (select count(*) from public.leads where product_id = p.id),
    'open_payment', (select jsonb_build_object('id', id, 'kind', kind, 'status', status, 'amount_etb', amount_etb)
                     from public.payments where product_id = p.id and status in ('pending', 'submitted')
                     order by created_at desc limit 1)
  ) order by p.updated_at desc), '[]'::jsonb)
  from public.products p
  where p.seller_id = public.current_tg_id();
$$;

-- Draft/owner view used by the sell wizard and edit screen.
create or replace function public.get_my_listing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user(true);
  p public.products;
begin
  select * into p from public.products where id = p_id and seller_id = v.telegram_id;
  if not found then
    perform public.app_error('not_found');
  end if;
  return jsonb_build_object(
    'id', p.id, 'title', p.title, 'description', p.description, 'price', p.price,
    'category', p.category, 'brand', p.brand, 'model', p.model, 'condition', p.condition,
    'city', p.city, 'specs', p.specs, 'negotiable', p.negotiable, 'exchange', p.exchange,
    'status', p.status, 'reject_reason', p.reject_reason, 'reject_note', p.reject_note,
    'published_at', p.published_at, 'is_free', p.is_free, 'period_paid', p.period_paid,
    'images', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'hash', hash) order by position)
                        from public.product_images where product_id = p.id), '[]'::jsonb),
    'missing', to_jsonb(public.listing_missing_fields(p))
  );
end;
$$;

grant execute on function
  public.search_listings(text, text, text[], text, text, numeric, numeric, jsonb, text, boolean, int, int),
  public.home_feed(text),
  public.get_listing(uuid),
  public.get_seller(uuid),
  public.get_public_settings(),
  public.price_hint(text, text)
  to anon, authenticated;

grant execute on function
  public.register_view(uuid),
  public.toggle_favorite(uuid),
  public.my_favorites(),
  public.request_contact(uuid),
  public.submit_report(text, text, text, text),
  public.submit_review(uuid, int, text),
  public.get_me(),
  public.update_my_profile(jsonb),
  public.my_listings(),
  public.get_my_listing(uuid)
  to authenticated;
