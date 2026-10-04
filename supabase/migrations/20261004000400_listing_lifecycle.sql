-- 0400 · Listing lifecycle RPCs (SPEC A3 + A4).
--
-- State machine (seller-driven parts):
--   draft|rejected --submit--> in_review (period already covered: free quota / paid)
--                         \--> pending_payment (fee due) --reference--> payment_submitted
--   active <--> paused ; active|paused --> sold ; expired --renew--> in_review | pending_payment
--   active|paused --substantive edit--> in_review
-- Staff-driven parts live in 0500 (payments) and 0700 (moderation).

-- ─── Internal helpers ────────────────────────────────────────────────
create or replace function public.get_settings()
returns public.platform_settings
language sql
stable
security definer
set search_path = public
as $$
  select * from public.platform_settings where id = 1;
$$;

create or replace function public.sanitize_specs(p_specs jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := '{}';
  v_key text;
  v_val jsonb;
  v_count int := 0;
begin
  if p_specs is null or jsonb_typeof(p_specs) <> 'object' then
    return '{}';
  end if;
  for v_key, v_val in select key, value from jsonb_each(p_specs) loop
    continue when v_key !~ '^[a-z][a-z0-9_]{0,31}$';
    continue when jsonb_typeof(v_val) not in ('string', 'number', 'boolean');
    continue when jsonb_typeof(v_val) = 'string' and (char_length(v_val #>> '{}') > 60 or btrim(v_val #>> '{}') = '');
    v_out := v_out || jsonb_build_object(v_key, v_val);
    v_count := v_count + 1;
    exit when v_count >= 20;
  end loop;
  return v_out;
end;
$$;

-- Apply only the keys present in `p_input` to a listing row (no DB write).
create or replace function public.listing_apply_input(p public.products, p_input jsonb)
returns public.products
language plpgsql
set search_path = public
as $$
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform public.app_error('invalid_input');
  end if;
  if p_input ? 'title' then p.title := btrim(coalesce(p_input ->> 'title', '')); end if;
  if p_input ? 'description' then p.description := btrim(coalesce(p_input ->> 'description', '')); end if;
  if p_input ? 'price' then
    p.price := case when coalesce(p_input ->> 'price', '') = '' then null
                    else round((p_input ->> 'price')::numeric, 2) end;
  end if;
  if p_input ? 'category' then p.category := nullif(p_input ->> 'category', ''); end if;
  if p_input ? 'brand' then p.brand := btrim(coalesce(p_input ->> 'brand', '')); end if;
  if p_input ? 'model' then p.model := btrim(coalesce(p_input ->> 'model', '')); end if;
  if p_input ? 'condition' then p.condition := nullif(p_input ->> 'condition', ''); end if;
  if p_input ? 'city' then p.city := btrim(coalesce(p_input ->> 'city', '')); end if;
  if p_input ? 'specs' then p.specs := public.sanitize_specs(p_input -> 'specs'); end if;
  if p_input ? 'negotiable' then p.negotiable := coalesce((p_input ->> 'negotiable')::boolean, false); end if;
  if p_input ? 'exchange' then p.exchange := coalesce((p_input ->> 'exchange')::boolean, false); end if;
  return p;
exception
  when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch then
    perform public.app_error('invalid_input');
    return p;
end;
$$;

-- Which required fields are still missing before a listing can be submitted.
create or replace function public.listing_missing_fields(p public.products)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when char_length(p.title) < 3 then 'title' end,
    case when char_length(p.description) < 10 then 'description' end,
    case when p.price is null then 'price' end,
    case when p.category is null then 'category' end,
    case when p.condition is null then 'condition' end,
    case when p.city = '' then 'city' end,
    case when not exists (select 1 from public.product_images i where i.product_id = p.id) then 'photos' end
  ], null);
$$;

create or replace function public.contains_banned_word(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_settings s, unnest(s.banned_words) w
    where s.id = 1 and btrim(w) <> '' and position(lower(btrim(w)) in lower(p_text)) > 0
  );
$$;

-- Median active price for the same category (+ brand when given); null if < 5 samples.
create or replace function public.price_median(p_category text, p_brand text, p_exclude uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) >= 5
              then percentile_cont(0.5) within group (order by price)::numeric end
  from public.products
  where status = 'active'
    and category = p_category
    and (coalesce(p_brand, '') = '' or lower(brand) = lower(p_brand))
    and (p_exclude is null or id <> p_exclude);
$$;

-- Moderation flags: price sanity (A3.7) and duplicate photos across sellers (A3.8).
create or replace function public.listing_compute_flags(p_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.products;
  v_median numeric;
  v_flags text[] := '{}';
begin
  select * into p from public.products where id = p_id;
  if p.price is not null and p.category is not null then
    v_median := public.price_median(p.category, p.brand, p.id);
    if v_median is not null and p.price < v_median * 0.25 then
      v_flags := v_flags || 'price_low'::text;
    elsif v_median is not null and p.price > v_median * 4 then
      v_flags := v_flags || 'price_high'::text;
    end if;
  end if;
  if exists (
    select 1
    from public.product_images mine
    join public.product_images other on other.hash = mine.hash and other.product_id <> mine.product_id
    join public.products op on op.id = other.product_id
    where mine.product_id = p.id
      and mine.hash <> ''
      and op.seller_id <> p.seller_id
      and op.status in ('active', 'paused', 'in_review', 'payment_submitted')
  ) then
    v_flags := v_flags || 'duplicate_image'::text;
  end if;
  return v_flags;
end;
$$;

create or replace function public.count_open_listings(p_seller text, p_exclude uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.products
  where seller_id = p_seller
    and status in ('pending_payment', 'payment_submitted', 'in_review', 'active', 'paused')
    and (p_exclude is null or id <> p_exclude);
$$;

-- Reuse the open pending payment for this purpose, or create one.
create or replace function public.ensure_open_payment(p_product public.products, p_kind text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.payments
  where product_id = p_product.id and kind = p_kind and status = 'pending';
  if v_id is not null then
    update public.payments set amount_etb = p_amount where id = v_id;
    return v_id;
  end if;
  if exists (select 1 from public.payments
             where product_id = p_product.id and kind = p_kind and status = 'submitted') then
    perform public.app_error('payment_already_submitted');
  end if;
  insert into public.payments (telegram_id, product_id, kind, amount_etb)
  values (p_product.seller_id, p_product.id, p_kind, p_amount)
  returning id into v_id;
  return v_id;
end;
$$;

-- Move a listing live: keeps the remaining period when re-approved after an edit.
create or replace function public.listing_go_live(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.platform_settings := public.get_settings();
  p public.products;
begin
  update public.products
  set status = 'active',
      published_at = case when expires_at > now() and published_at is not null then published_at else now() end,
      expires_at = case when expires_at > now() then expires_at
                        else now() + make_interval(days => s.listing_duration_days) end,
      reminder_sent_at = null,
      reject_reason = null,
      reject_note = ''
  where id = p_id
  returning * into p;

  perform public.enqueue_notification(p.seller_id, 'listing_live',
    jsonb_build_object('product_id', p.id, 'title', p.title));

  if s.channel_autopost and s.channel_id <> '' and p.channel_posted_at is null
     and not ('duplicate_image' = any (p.flags)) then
    perform public.enqueue_notification(s.channel_id, 'channel_post', jsonb_build_object('product_id', p.id));
    update public.products set channel_posted_at = now() where id = p.id;
  end if;
end;
$$;

create or replace function public.lock_own_listing(p_id uuid, p_seller text)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products;
begin
  select * into p from public.products where id = p_id for update;
  if not found or p.seller_id <> p_seller then
    perform public.app_error('not_found');
  end if;
  return p;
end;
$$;

-- ─── Seller RPCs ─────────────────────────────────────────────────────
create or replace function public.create_listing(p_input jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  p public.products;
begin
  if (select count(*) from public.products
      where seller_id = v_user.telegram_id and created_at > now() - interval '24 hours') >= 30 then
    perform public.app_error('rate_limited');
  end if;
  p.seller_id := v_user.telegram_id;
  p.city := v_user.city;
  p := public.listing_apply_input(p, coalesce(p_input, '{}'));
  insert into public.products (seller_id, title, description, price, category, brand, model,
                               condition, city, specs, negotiable, exchange)
  values (p.seller_id, coalesce(p.title, ''), coalesce(p.description, ''), p.price, p.category,
          coalesce(p.brand, ''), coalesce(p.model, ''), p.condition, coalesce(p.city, ''),
          coalesce(p.specs, '{}'), coalesce(p.negotiable, false), coalesce(p.exchange, false))
  returning id into p.id;
  return p.id;
exception
  when check_violation then
    perform public.app_error('invalid_input', sqlerrm);
    return null;
end;
$$;

create or replace function public.update_listing(p_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  p_old public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  p public.products;
  v_substantive boolean;
begin
  if p_old.status not in ('draft', 'rejected', 'pending_payment', 'active', 'paused', 'expired') then
    perform public.app_error('listing_locked');
  end if;
  p := public.listing_apply_input(p_old, p_input);
  v_substantive := (p.title, p.description, p.category, p.brand, p.model, p.condition, p.specs)
    is distinct from (p_old.title, p_old.description, p_old.category, p_old.brand, p_old.model,
                      p_old.condition, p_old.specs);

  if p_old.status in ('active', 'paused') and (p.title is distinct from p_old.title or p.description is distinct from p_old.description)
     and public.contains_banned_word(p.title || ' ' || p.description) then
    perform public.app_error('banned_words');
  end if;
  if p_old.status in ('active', 'paused') and p.price is null then
    perform public.app_error('invalid_input', 'price');
  end if;

  update public.products
  set title = p.title, description = p.description, price = p.price, category = p.category,
      brand = p.brand, model = p.model, condition = p.condition, city = p.city, specs = p.specs,
      negotiable = p.negotiable, exchange = p.exchange,
      status = case when p_old.status in ('active', 'paused') and v_substantive then 'in_review' else status end,
      flags = case when p_old.status in ('active', 'paused') and v_substantive
                   then public.listing_compute_flags(id) else flags end
  where id = p_id;

  if p_old.status = 'active' and p.price < p_old.price then
    insert into public.notifications_outbox (chat_id, kind, payload)
    select f.telegram_id, 'price_drop',
           jsonb_build_object('product_id', p_id, 'title', p.title, 'old_price', p_old.price, 'new_price', p.price)
    from public.favorites f
    join public.profiles u on u.telegram_id = f.telegram_id
    where f.product_id = p_id and not u.bot_blocked and not u.is_banned;
  end if;

  return jsonb_build_object(
    'status', (select status from public.products where id = p_id),
    'needs_review', p_old.status in ('active', 'paused') and v_substantive
  );
exception
  when check_violation then
    perform public.app_error('invalid_input', sqlerrm);
    return null;
end;
$$;

-- Replace the ordered photo set. p_images: [{ "path": "...", "hash": "<sha256 hex>" }, ...]
create or replace function public.set_listing_images(p_id uuid, p_images jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  v_prefix text := v_user.telegram_id || '/' || p_id::text || '/';
  v_item jsonb;
  v_pos int := 0;
  v_before text[];
  v_after text[];
begin
  if p.status not in ('draft', 'rejected', 'pending_payment', 'active', 'paused', 'expired') then
    perform public.app_error('listing_locked');
  end if;
  if p_images is null or jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 8 then
    perform public.app_error('invalid_input', 'images');
  end if;
  if p.status in ('active', 'paused') and jsonb_array_length(p_images) = 0 then
    perform public.app_error('invalid_input', 'images');
  end if;

  select coalesce(array_agg(path order by position), '{}') into v_before
  from public.product_images where product_id = p_id;

  delete from public.product_images where product_id = p_id;
  for v_item in select value from jsonb_array_elements(p_images) loop
    if left(coalesce(v_item ->> 'path', ''), char_length(v_prefix)) <> v_prefix then
      perform public.app_error('invalid_input', 'image_path');
    end if;
    insert into public.product_images (product_id, path, position, hash)
    values (p_id, v_item ->> 'path', v_pos, lower(coalesce(v_item ->> 'hash', '')));
    v_pos := v_pos + 1;
  end loop;

  select coalesce(array_agg(path order by position), '{}') into v_after
  from public.product_images where product_id = p_id;

  if p.status in ('active', 'paused') and v_after is distinct from v_before then
    update public.products
    set status = 'in_review', flags = public.listing_compute_flags(p_id)
    where id = p_id;
  end if;

  return jsonb_build_object('count', v_pos,
                            'status', (select status from public.products where id = p_id));
exception
  when check_violation or unique_violation then
    perform public.app_error('invalid_input', sqlerrm);
    return null;
end;
$$;

-- Submit a draft (or a rejected listing after fixing it).
-- Decides free (quota) vs paid; returns { status, payment_id?, amount_etb?, is_free }.
create or replace function public.submit_listing(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  s public.platform_settings := public.get_settings();
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  v_missing text[];
  v_free boolean := false;
  v_payment uuid;
  v_kind text;
begin
  if not v_user.phone_verified then
    perform public.app_error('phone_not_verified');
  end if;
  if p.status not in ('draft', 'rejected') then
    perform public.app_error('illegal_transition', p.status || ' -> submit');
  end if;
  v_missing := public.listing_missing_fields(p);
  if cardinality(v_missing) > 0 then
    perform public.app_error('listing_incomplete', array_to_string(v_missing, ','));
  end if;
  if public.contains_banned_word(p.title || ' ' || p.description || ' ' || p.brand || ' ' || p.model) then
    perform public.app_error('banned_words');
  end if;
  if public.count_open_listings(v_user.telegram_id, p.id) >= s.max_active_listings then
    perform public.app_error('max_active_listings', s.max_active_listings::text);
  end if;

  if not p.period_paid then
    if s.listing_fee_etb = 0 then
      v_free := true;
    elsif p.published_at is null and not p.is_free and v_user.listings_free_used < s.free_listings_quota then
      v_free := true;
      update public.profiles set listings_free_used = listings_free_used + 1
      where telegram_id = v_user.telegram_id;
    end if;
  end if;

  update public.products
  set flags = public.listing_compute_flags(p.id),
      reject_reason = null,
      reject_note = '',
      is_free = is_free or v_free,
      period_paid = period_paid or v_free,
      status = case when period_paid or v_free then 'in_review' else 'pending_payment' end
  where id = p.id
  returning * into p;

  if p.status = 'pending_payment' then
    v_kind := case when p.published_at is null then 'listing' else 'renew' end;
    v_payment := public.ensure_open_payment(p, v_kind, s.listing_fee_etb);
  end if;

  return jsonb_build_object(
    'status', p.status,
    'is_free', v_free,
    'payment_id', v_payment,
    'amount_etb', case when v_payment is not null then s.listing_fee_etb end
  );
end;
$$;

-- Owner-allowed status changes: pause, resume, mark sold.
create or replace function public.set_listing_status(p_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user(true);
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
begin
  if p_status = 'paused' and p.status = 'active' then
    update public.products set status = 'paused' where id = p_id;
  elsif p_status = 'active' and p.status = 'paused' then
    if v_user.is_banned then
      perform public.app_error('banned');
    end if;
    if p.expires_at is not null and p.expires_at <= now() then
      update public.products set status = 'expired' where id = p_id;
      return 'expired';
    end if;
    update public.products set status = 'active' where id = p_id;
  elsif p_status = 'sold' and p.status in ('active', 'paused') then
    update public.products set status = 'sold', sold_at = now(), boosted_until = null where id = p_id;
    -- Ask recent contacts to rate the seller (A3.6).
    insert into public.notifications_outbox (chat_id, kind, payload)
    select distinct l.buyer_id, 'review_request', jsonb_build_object('product_id', p_id, 'title', p.title)
    from public.leads l
    join public.profiles u on u.telegram_id = l.buyer_id
    where l.product_id = p_id and l.created_at > now() - interval '60 days'
      and not u.bot_blocked and not u.is_banned;
  else
    perform public.app_error('illegal_transition', p.status || ' -> ' || coalesce(p_status, 'null'));
  end if;
  return p_status;
end;
$$;

-- Expired → renew. First renewal is free (back through review), later ones pay the fee.
create or replace function public.renew_listing(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  s public.platform_settings := public.get_settings();
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  v_free boolean;
  v_payment uuid;
begin
  if p.status <> 'expired' then
    perform public.app_error('illegal_transition', p.status || ' -> renew');
  end if;
  if public.count_open_listings(v_user.telegram_id, p.id) >= s.max_active_listings then
    perform public.app_error('max_active_listings', s.max_active_listings::text);
  end if;
  v_free := p.renew_count = 0 or s.listing_fee_etb = 0;

  update public.products
  set renew_count = renew_count + 1,
      is_free = v_free,
      period_paid = v_free,
      expires_at = null,
      reminder_sent_at = null,
      flags = public.listing_compute_flags(id),
      status = case when v_free then 'in_review' else 'pending_payment' end
  where id = p_id
  returning * into p;

  if not v_free then
    v_payment := public.ensure_open_payment(p, 'renew', s.listing_fee_etb);
  end if;
  return jsonb_build_object('status', p.status, 'is_free', v_free, 'payment_id', v_payment,
                            'amount_etb', case when v_payment is not null then s.listing_fee_etb end);
end;
$$;

-- Only never-published, unpaid listings can be deleted.
create or replace function public.delete_listing(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user(true);
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  v_paths text[];
begin
  if p.status not in ('draft', 'rejected', 'pending_payment') or p.published_at is not null then
    perform public.app_error('listing_locked');
  end if;
  if exists (select 1 from public.payments where product_id = p_id and status <> 'pending') then
    perform public.app_error('listing_locked');
  end if;
  if p.is_free then
    -- Give the free slot back: the listing never went live.
    update public.profiles set listings_free_used = greatest(listings_free_used - 1, 0)
    where telegram_id = v_user.telegram_id;
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from public.product_images where product_id = p_id;
  delete from public.products where id = p_id;
  return jsonb_build_object('deleted', true, 'paths', to_jsonb(v_paths));
end;
$$;

-- Boost an active listing (A3.5): creates/reuses an open boost payment.
create or replace function public.create_boost_payment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  s public.platform_settings := public.get_settings();
  p public.products := public.lock_own_listing(p_id, v_user.telegram_id);
  v_payment uuid;
begin
  if p.status <> 'active' then
    perform public.app_error('listing_not_active');
  end if;
  if s.boost_price_etb <= 0 then
    perform public.app_error('boost_unavailable');
  end if;
  v_payment := public.ensure_open_payment(p, 'boost', s.boost_price_etb);
  return jsonb_build_object('payment_id', v_payment, 'amount_etb', s.boost_price_etb);
end;
$$;

grant execute on function
  public.create_listing(jsonb),
  public.update_listing(uuid, jsonb),
  public.set_listing_images(uuid, jsonb),
  public.submit_listing(uuid),
  public.set_listing_status(uuid, text),
  public.renew_listing(uuid),
  public.delete_listing(uuid),
  public.create_boost_payment(uuid)
  to authenticated;
