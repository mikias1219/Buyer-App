-- 0300 (shop) · Categories, products and the stock ledger (SPEC A3.1–3, 9, 13–15, A8).

-- ─── JSON shapes (cost fields only for owners) ──────────────────────
create or replace function public.stock_status(p public.products)
returns text
language sql
immutable
as $$
  select case when p.stock_qty <= 0 then 'out'
              when p.stock_qty <= p.reorder_level then 'low'
              else 'ok' end;
$$;

create or replace function public.product_json(p public.products, p_owner boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'category_id', p.category_id,
    'category_name', (select c.name from public.categories c where c.id = p.category_id),
    'sku', p.sku, 'barcode', p.barcode, 'unit', p.unit,
    'sell_price', p.sell_price, 'stock_qty', p.stock_qty, 'reorder_level', p.reorder_level,
    'stock_status', public.stock_status(p), 'image_path', p.image_path, 'notes', p.notes,
    'status', p.status, 'created_at', p.created_at, 'updated_at', p.updated_at
  ) || case when p_owner then jsonb_build_object(
    'avg_cost', round(p.avg_cost, 2),
    'margin', round(p.sell_price - p.avg_cost, 2),
    'margin_pct', case when p.sell_price > 0
                       then round((p.sell_price - p.avg_cost) / p.sell_price * 100, 1) end,
    'stock_value_cost', round(greatest(p.stock_qty, 0) * p.avg_cost, 2),
    'stock_value_retail', round(greatest(p.stock_qty, 0) * p.sell_price, 2)
  ) else '{}'::jsonb end;
$$;

create or replace function public.category_json(c public.categories)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'sort', c.sort, 'archived', c.archived,
    'product_count', (select count(*) from public.products p
                      where p.category_id = c.id and p.status = 'active')
  );
$$;

-- Internal: write one ledger row and move the cached stock in the same transaction.
-- The caller must already hold the product row lock.
create or replace function public.apply_movement(
  p_product public.products, p_type text, p_delta numeric, p_unit_cost numeric,
  p_sale_id uuid default null, p_return_id uuid default null,
  p_supplier text default '', p_reason text default ''
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after numeric := p_product.stock_qty + p_delta;
begin
  insert into public.stock_movements
    (product_id, type, qty_delta, unit_cost, stock_after, sale_id, sale_return_id, supplier, reason, actor_id)
  values
    (p_product.id, p_type, p_delta, coalesce(p_unit_cost, 0), v_after, p_sale_id, p_return_id,
     left(coalesce(p_supplier, ''), 120), left(coalesce(p_reason, ''), 300), public.current_tg_id());
  update public.products set stock_qty = v_after where id = p_product.id;
  return v_after;
end;
$$;

-- ─── Categories ──────────────────────────────────────────────────────
create or replace function public.list_categories(p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_member();
  return coalesce((
    select jsonb_agg(public.category_json(c) order by c.sort, lower(c.name))
    from public.categories c
    where p_include_archived or not c.archived
  ), '[]'::jsonb);
end;
$$;

-- p_input: { id?, name, sort? }
create or replace function public.upsert_category(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := public.juuid(p_input, 'id');
  v_name text := btrim(coalesce(p_input ->> 'name', ''));
  v_sort int := coalesce(public.jnum(p_input, 'sort'), 0)::int;
  v public.categories;
  v_before public.categories;
begin
  perform public.require_owner();
  if char_length(v_name) not between 1 and 60 then
    perform public.app_error('invalid_input', 'name');
  end if;
  begin
    if v_id is null then
      insert into public.categories (name, sort) values (v_name, v_sort) returning * into v;
    else
      select * into v_before from public.categories where id = v_id for update;
      if not found then perform public.app_error('not_found'); end if;
      update public.categories set name = v_name, sort = v_sort where id = v_id returning * into v;
    end if;
  exception when unique_violation then
    perform public.app_error('duplicate_category');
  end;
  perform public.write_audit(case when v_id is null then 'category.create' else 'category.update' end,
                             'category', v.id::text, to_jsonb(v_before), to_jsonb(v));
  return public.category_json(v);
end;
$$;

create or replace function public.set_category_archived(p_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.categories;
begin
  perform public.require_owner();
  update public.categories set archived = coalesce(p_archived, false) where id = p_id returning * into v;
  if not found then perform public.app_error('not_found'); end if;
  perform public.write_audit('category.archive', 'category', p_id::text, null,
                             jsonb_build_object('archived', v.archived));
  return public.category_json(v);
end;
$$;

-- ─── Products ────────────────────────────────────────────────────────
-- Applies the editable fields present in p_input onto p (validation in one place).
create or replace function public.product_apply_input(p public.products, p_input jsonb)
returns public.products
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cat uuid;
begin
  if p_input ? 'name' then
    p.name := btrim(coalesce(p_input ->> 'name', ''));
    if char_length(p.name) not between 1 and 120 then perform public.app_error('invalid_input', 'name'); end if;
  end if;
  if p_input ? 'category_id' then
    v_cat := public.juuid(p_input, 'category_id');
    if v_cat is not null and not exists (select 1 from public.categories where id = v_cat) then
      perform public.app_error('invalid_input', 'category_id');
    end if;
    p.category_id := v_cat;
  end if;
  if p_input ? 'sku' then
    p.sku := nullif(btrim(coalesce(p_input ->> 'sku', '')), '');
    if p.sku !~ '^[A-Za-z0-9._/-]{1,40}$' then perform public.app_error('invalid_input', 'sku'); end if;
  end if;
  if p_input ? 'barcode' then
    p.barcode := nullif(btrim(coalesce(p_input ->> 'barcode', '')), '');
    if p.barcode !~ '^[A-Za-z0-9-]{4,48}$' then perform public.app_error('invalid_input', 'barcode'); end if;
  end if;
  if p_input ? 'unit' then
    p.unit := coalesce(p_input ->> 'unit', '');
    if p.unit not in ('piece', 'pack', 'box', 'kg', 'g', 'litre', 'metre') then
      perform public.app_error('invalid_input', 'unit');
    end if;
    perform public.check_qty(p.unit, p.stock_qty, 'unit');
  end if;
  if p_input ? 'sell_price' then
    p.sell_price := public.jnum(p_input, 'sell_price');
    if p.sell_price is null or p.sell_price < 0 or p.sell_price > 1e11 or p.sell_price <> round(p.sell_price, 2) then
      perform public.app_error('invalid_input', 'sell_price');
    end if;
  end if;
  if p_input ? 'cost_price' then
    p.avg_cost := public.jnum(p_input, 'cost_price');
    if p.avg_cost is null or p.avg_cost < 0 or p.avg_cost > 1e10 then
      perform public.app_error('invalid_input', 'cost_price');
    end if;
  end if;
  if p_input ? 'reorder_level' then
    p.reorder_level := public.jnum(p_input, 'reorder_level');
    if p.reorder_level is null or p.reorder_level < 0 or p.reorder_level > 1e8 then
      perform public.app_error('invalid_input', 'reorder_level');
    end if;
  end if;
  if p_input ? 'image_path' then
    p.image_path := coalesce(p_input ->> 'image_path', '');
    if p.image_path <> '' and p.image_path !~ '^products/[A-Za-z0-9]{20}\.(webp|jpe?g|png)$' then
      perform public.app_error('invalid_input', 'image_path');
    end if;
  end if;
  if p_input ? 'notes' then
    p.notes := left(btrim(coalesce(p_input ->> 'notes', '')), 500);
  end if;
  return p;
end;
$$;

create or replace function public.raise_product_unique(p_constraint text)
returns void
language plpgsql
as $$
begin
  if p_constraint = 'products_barcode_uq' then
    perform public.app_error('duplicate_barcode');
  end if;
  perform public.app_error('duplicate_sku');
end;
$$;

-- p_input: { name, category_id?, sku?, barcode?, unit?, sell_price, cost_price?, reorder_level?,
--            image_path?, notes?, opening_stock? }
create or replace function public.create_product(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  v public.products;
  v_opening numeric := coalesce(public.jnum(p_input, 'opening_stock'), 0);
  v_constraint text;
begin
  if not (p_input ? 'name') or not (p_input ? 'sell_price') then
    perform public.app_error('invalid_input', case when p_input ? 'name' then 'sell_price' else 'name' end);
  end if;
  v.id := gen_random_uuid();
  v.unit := 'piece';
  v.stock_qty := 0;
  v.avg_cost := 0;
  v.reorder_level := (select default_reorder_level from public.shop_settings where id = 1);
  v.image_path := '';
  v.notes := '';
  v := public.product_apply_input(v, p_input);
  if v_opening < 0 or v_opening > 1e8 then perform public.app_error('invalid_input', 'opening_stock'); end if;
  perform public.check_qty(v.unit, v_opening, 'opening_stock');

  begin
    insert into public.products (id, name, category_id, sku, barcode, unit, sell_price, avg_cost,
                                 stock_qty, reorder_level, image_path, notes, created_by)
    values (v.id, v.name, v.category_id, v.sku, v.barcode, v.unit, v.sell_price, v.avg_cost,
            0, v.reorder_level, v.image_path, v.notes, v_me.telegram_id)
    returning * into v;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform public.raise_product_unique(v_constraint);
  end;

  if v_opening > 0 then
    perform public.apply_movement(v, 'opening', v_opening, v.avg_cost);
    select * into v from public.products where id = v.id;
  end if;
  perform public.write_audit('product.create', 'product', v.id::text, null, to_jsonb(v));
  return public.product_json(v, true);
end;
$$;

-- Stock is never edited here: use restock / adjust_stock.
create or replace function public.update_product(p_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.products;
  v public.products;
  v_constraint text;
begin
  perform public.require_owner();
  select * into v_before from public.products where id = p_id for update;
  if not found then perform public.app_error('not_found'); end if;
  v := public.product_apply_input(v_before, coalesce(p_input, '{}'::jsonb) - 'opening_stock' - 'stock_qty');
  begin
    update public.products
    set name = v.name, category_id = v.category_id, sku = v.sku, barcode = v.barcode, unit = v.unit,
        sell_price = v.sell_price, avg_cost = v.avg_cost, reorder_level = v.reorder_level,
        image_path = v.image_path, notes = v.notes
    where id = p_id
    returning * into v;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform public.raise_product_unique(v_constraint);
  end;
  perform public.write_audit('product.update', 'product', p_id::text, to_jsonb(v_before), to_jsonb(v));
  return public.product_json(v, true);
end;
$$;

create or replace function public.set_product_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.products;
  v_old text;
begin
  perform public.require_owner();
  if p_status not in ('active', 'archived') then perform public.app_error('invalid_input', 'status'); end if;
  select status into v_old from public.products where id = p_id for update;
  if not found then perform public.app_error('not_found'); end if;
  update public.products set status = p_status where id = p_id returning * into v;
  perform public.write_audit('product.status', 'product', p_id::text,
                             jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
  return public.product_json(v, true);
end;
$$;

-- Only products without any ledger history can be deleted (otherwise archive).
create or replace function public.delete_product(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.products;
begin
  perform public.require_owner();
  select * into v from public.products where id = p_id for update;
  if not found then perform public.app_error('not_found'); end if;
  if exists (select 1 from public.stock_movements where product_id = p_id)
     or exists (select 1 from public.sale_items where product_id = p_id) then
    perform public.app_error('has_history');
  end if;
  delete from public.products where id = p_id;
  perform public.write_audit('product.delete', 'product', p_id::text, to_jsonb(v), null);
end;
$$;

-- p_filters: { q?, category_id?, stock? ('ok'|'low'|'out'), status? ('active'|'archived'|'all'),
--              sort? ('name'|'stock_asc'|'stock_desc'|'best_selling'|'margin'|'newest') }
-- best_selling = quantity sold in the last 30 days (net of returns).
create or replace function public.list_products(p_filters jsonb default '{}', p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v_owner boolean := v_me.role = 'owner';
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_q text := nullif(btrim(coalesce(f ->> 'q', '')), '');
  v_cat uuid := public.juuid(f, 'category_id');
  v_stock text := nullif(f ->> 'stock', '');
  v_status text := coalesce(nullif(f ->> 'status', ''), 'active');
  v_sort text := coalesce(nullif(f ->> 'sort', ''), 'name');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not v_owner then
    v_status := 'active';
    if v_sort = 'margin' then v_sort := 'name'; end if;
  end if;
  if v_q is not null then
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  with base as (
    select p as prod, coalesce(s.sold, 0) as sold_30d
    from public.products p
    left join lateral (
      select sum(si.qty - si.returned_qty) as sold
      from public.sale_items si join public.sales sa on sa.id = si.sale_id
      where si.product_id = p.id and sa.status = 'completed' and sa.sold_at >= now() - interval '30 days'
    ) s on v_sort = 'best_selling'
    where (v_status = 'all' or p.status = v_status)
      and (v_cat is null or p.category_id = v_cat)
      and (v_q is null or lower(p.name) like '%' || lower(v_q) || '%'
           or lower(coalesce(p.sku, '')) like lower(v_q) || '%'
           or coalesce(p.barcode, '') = btrim(f ->> 'q'))
      and (v_stock is null or public.stock_status(p) = v_stock)
  ), page as (
    select base.*, row_number() over (order by
      case when v_sort = 'stock_asc' then (prod).stock_qty end asc,
      case when v_sort = 'stock_desc' then (prod).stock_qty end desc,
      case when v_sort = 'best_selling' then sold_30d end desc,
      case when v_sort = 'margin' then (prod).sell_price - (prod).avg_cost end desc,
      case when v_sort = 'newest' then (prod).created_at end desc,
      lower((prod).name), (prod).id) as ord
    from base
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(
      public.product_json(page.prod, v_owner)
      || case when v_sort = 'best_selling' then jsonb_build_object('sold_30d', page.sold_30d) else '{}'::jsonb end
      order by page.ord
    ), '[]'::jsonb)
  )
  into v_result
  from page
  where page.ord > v_offset and page.ord <= v_offset + v_limit;
  return v_result;
end;
$$;

create or replace function public.get_product(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v public.products;
begin
  select * into v from public.products where id = p_id;
  if not found or (v_me.role <> 'owner' and v.status <> 'active') then
    perform public.app_error('not_found');
  end if;
  return public.product_json(v, v_me.role = 'owner');
end;
$$;

-- Lookup at the counter (exact barcode or SKU).
create or replace function public.find_product_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v public.products;
begin
  select * into v from public.products
  where status = 'active' and (barcode = btrim(p_code) or lower(sku) = lower(btrim(p_code)))
  limit 1;
  if not found then return null; end if;
  return public.product_json(v, v_me.role = 'owner');
end;
$$;

-- ─── Stock ───────────────────────────────────────────────────────────
-- p_items: [{ product_id, qty, unit_cost? }]  (staff may only restock if settings allow;
-- a missing unit_cost keeps the current average cost).
create or replace function public.restock(p_items jsonb, p_supplier text default '', p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v_owner boolean := v_me.role = 'owner';
  v_item jsonb;
  v_ids uuid[];
  v_qty numeric;
  v_cost numeric;
  p public.products;
  v_out jsonb := '[]'::jsonb;
begin
  if not v_owner and not (select staff_can_restock from public.shop_settings where id = 1) then
    perform public.app_error('not_authorized');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform public.app_error('invalid_input', 'items');
  end if;
  select array_agg(public.juuid(e, 'product_id')) into v_ids from jsonb_array_elements(p_items) e;
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    perform public.app_error('invalid_input', 'product_id');
  end if;
  -- Lock in id order so concurrent writers never deadlock.
  perform 1 from public.products where id = any (v_ids) order by id for update;

  for v_item in select e from jsonb_array_elements(p_items) e order by public.juuid(e, 'product_id') loop
    select * into p from public.products where id = public.juuid(v_item, 'product_id');
    if not found then perform public.app_error('not_found', 'product_id'); end if;
    v_qty := public.check_qty(p.unit, public.jnum(v_item, 'qty'));
    if v_qty <= 0 or v_qty > 1e8 then perform public.app_error('invalid_input', 'qty'); end if;
    v_cost := case when v_owner then coalesce(public.jnum(v_item, 'unit_cost'), p.avg_cost) else p.avg_cost end;
    if v_cost < 0 or v_cost > 1e10 then perform public.app_error('invalid_input', 'unit_cost'); end if;

    -- Weighted average cost (A3.3).
    update public.products
    set avg_cost = case when p.stock_qty <= 0 then v_cost
                        else round((p.stock_qty * p.avg_cost + v_qty * v_cost) / (p.stock_qty + v_qty), 4) end
    where id = p.id
    returning * into p;
    perform public.apply_movement(p, 'purchase', v_qty, v_cost, null, null, p_supplier, p_note);
    select * into p from public.products where id = p.id;
    v_out := v_out || public.product_json(p, v_owner);
  end loop;
  perform public.write_audit('stock.restock', 'stock', 'batch', null,
                             jsonb_build_object('items', p_items, 'supplier', p_supplier));
  return v_out;
end;
$$;

-- p_mode 'set': counted quantity → adjustment movement for the difference.
-- p_mode 'loss': damaged / lost / expired quantity → damage movement (valued at avg cost).
create or replace function public.adjust_stock(p_product_id uuid, p_mode text, p_qty numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products;
  v_delta numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_owner();
  if char_length(v_reason) not between 1 and 300 then perform public.app_error('invalid_input', 'reason'); end if;
  if p_mode not in ('set', 'loss') then perform public.app_error('invalid_input', 'mode'); end if;
  select * into p from public.products where id = p_product_id for update;
  if not found then perform public.app_error('not_found'); end if;
  perform public.check_qty(p.unit, p_qty);
  if p_qty < 0 or p_qty > 1e8 then perform public.app_error('invalid_input', 'qty'); end if;

  if p_mode = 'set' then
    v_delta := p_qty - p.stock_qty;
    if v_delta = 0 then perform public.app_error('no_change'); end if;
    perform public.apply_movement(p, 'adjustment', v_delta, p.avg_cost, null, null, '', v_reason);
  else
    if p_qty <= 0 then perform public.app_error('invalid_input', 'qty'); end if;
    if p.stock_qty - p_qty < 0 and not (select allow_negative_stock from public.shop_settings where id = 1) then
      perform public.app_error('insufficient_stock', p.id::text);
    end if;
    perform public.apply_movement(p, 'damage', -p_qty, p.avg_cost, null, null, '', v_reason);
  end if;
  select * into p from public.products where id = p_product_id;
  perform public.write_audit('stock.adjust', 'product', p.id::text, null,
                             jsonb_build_object('mode', p_mode, 'qty', p_qty, 'reason', v_reason,
                                                'stock_after', p.stock_qty));
  return public.product_json(p, true);
end;
$$;

-- Owner: paged ledger for one product (newest first). p_before = last seen movement id.
create or replace function public.product_movements(p_product_id uuid, p_before bigint default null, p_limit int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.type, 'qty_delta', m.qty_delta, 'unit_cost', round(m.unit_cost, 2),
      'stock_after', m.stock_after, 'sale_id', m.sale_id,
      'receipt_no', (select receipt_no from public.sales s where s.id = m.sale_id),
      'supplier', m.supplier, 'reason', m.reason, 'created_at', m.created_at,
      'actor_name', (select nullif(btrim(u.first_name || ' ' || u.last_name), '') from public.profiles u
                     where u.telegram_id = m.actor_id)
    ) order by m.id desc)
    from (
      select * from public.stock_movements
      where product_id = p_product_id and (p_before is null or id < p_before)
      order by id desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Members: products at or below their reorder level (no cost fields).
create or replace function public.low_stock(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_member();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'unit', p.unit, 'stock_qty', p.stock_qty,
      'reorder_level', p.reorder_level, 'stock_status', public.stock_status(p)
    ) order by p.stock_qty - p.reorder_level, lower(p.name))
    from (
      select * from public.products
      where status = 'active' and stock_qty <= reorder_level
      order by stock_qty - reorder_level, lower(name)
      limit least(greatest(coalesce(p_limit, 20), 1), 200)
    ) p
  ), '[]'::jsonb);
end;
$$;

grant execute on function
  public.list_categories(boolean),
  public.upsert_category(jsonb),
  public.set_category_archived(uuid, boolean),
  public.create_product(jsonb),
  public.update_product(uuid, jsonb),
  public.set_product_status(uuid, text),
  public.delete_product(uuid),
  public.list_products(jsonb, int, int),
  public.get_product(uuid),
  public.find_product_by_code(text),
  public.restock(jsonb, text, text),
  public.adjust_stock(uuid, text, numeric, text),
  public.product_movements(uuid, bigint, int),
  public.low_stock(int)
to authenticated;
