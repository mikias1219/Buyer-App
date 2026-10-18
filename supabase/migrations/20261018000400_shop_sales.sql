-- 0400 (shop) · Sales: record, void, return, history (SPEC A3.2, 4–8, A4 Sale).

create or replace function public.profile_name(p_tg_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), nullif(u.username, ''), u.telegram_id)
  from public.profiles u where u.telegram_id = p_tg_id;
$$;

-- Full sale; cost/profit only when p_owner.
create or replace function public.sale_json(p_id uuid, p_owner boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id, 'receipt_no', s.receipt_no, 'sold_at', s.sold_at,
    'cashier_id', s.cashier_id, 'cashier_name', public.profile_name(s.cashier_id),
    'payment_method', s.payment_method, 'subtotal', s.subtotal, 'discount', s.discount,
    'total', s.total, 'status', s.status, 'note', s.note,
    'void_reason', s.void_reason, 'voided_at', s.voided_at,
    'refunded', coalesce((select sum(r.refund_amount) from public.sale_returns r where r.sale_id = s.id), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'product_id', i.product_id, 'product_name', p.name, 'unit', p.unit,
        'qty', i.qty, 'unit_price', i.unit_price, 'discount', i.discount, 'line_total', i.line_total,
        'returned_qty', i.returned_qty
      ) || case when p_owner then jsonb_build_object(
        'unit_cost', round(i.unit_cost, 2),
        'line_profit', round(i.line_total - i.qty * i.unit_cost, 2)
      ) else '{}'::jsonb end order by i.id)
      from public.sale_items i join public.products p on p.id = i.product_id
      where i.sale_id = s.id
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reason', r.reason, 'refund_amount', r.refund_amount, 'created_at', r.created_at,
        'items', (select jsonb_agg(jsonb_build_object('sale_item_id', ri.sale_item_id, 'qty', ri.qty))
                  from public.sale_return_items ri where ri.return_id = r.id)
      ) order by r.created_at)
      from public.sale_returns r where r.sale_id = s.id
    ), '[]'::jsonb)
  ) || case when p_owner then jsonb_build_object(
    'total_cost', s.total_cost,
    'profit', s.total - s.total_cost
  ) else '{}'::jsonb end
  from public.sales s where s.id = p_id;
$$;

-- p_items: [{ product_id, qty, discount? }]  Prices always come from the product (A3.4).
-- Idempotent on p_client_ref (A3.7).
create or replace function public.record_sale(
  p_client_ref uuid, p_items jsonb, p_payment_method text,
  p_discount numeric default 0, p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v_owner boolean := v_me.role = 'owner';
  s public.shop_settings;
  v_ids uuid[];
  v_item jsonb;
  p public.products;
  v_qty numeric;
  v_line_disc numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_cost numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_sale_id uuid := gen_random_uuid();
  v_existing public.sales;
begin
  select * into s from public.shop_settings where id = 1;
  if p_client_ref is null then perform public.app_error('invalid_input', 'client_ref'); end if;
  if p_payment_method not in ('cash', 'telebirr', 'bank', 'credit') then
    perform public.app_error('invalid_input', 'payment_method');
  end if;
  if p_payment_method = 'credit' then
    perform public.app_error('customer_required');   -- credit sales arrive with customers (Phase 6)
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform public.app_error('invalid_input', 'items');
  end if;
  select array_agg(public.juuid(e, 'product_id')) into v_ids from jsonb_array_elements(p_items) e;
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    perform public.app_error('invalid_input', 'product_id');
  end if;
  if v_discount < 0 or v_discount <> round(v_discount, 2) then
    perform public.app_error('invalid_input', 'discount');
  end if;

  -- Lock products in id order (no deadlocks; two cashiers cannot sell the last unit twice).
  perform 1 from public.products where id = any (v_ids) order by id for update;

  -- A retry of a sale that already committed returns the original.
  select * into v_existing from public.sales where client_ref = p_client_ref;
  if found then
    if v_existing.cashier_id <> v_me.telegram_id then perform public.app_error('conflict'); end if;
    return public.sale_json(v_existing.id, v_owner);
  end if;

  insert into public.sales (id, client_ref, cashier_id, payment_method, subtotal, discount, total, total_cost, note)
  values (v_sale_id, p_client_ref, v_me.telegram_id, p_payment_method, 0, 0, 0, 0,
          left(btrim(coalesce(p_note, '')), 300));

  for v_item in select e from jsonb_array_elements(p_items) e order by public.juuid(e, 'product_id') loop
    select * into p from public.products where id = public.juuid(v_item, 'product_id');
    if not found or p.status <> 'active' then
      perform public.app_error('product_unavailable', public.juuid(v_item, 'product_id')::text);
    end if;
    v_qty := public.check_qty(p.unit, public.jnum(v_item, 'qty'));
    if v_qty <= 0 or v_qty > 1e8 then perform public.app_error('invalid_input', 'qty'); end if;
    if p.stock_qty < v_qty and not s.allow_negative_stock then
      perform public.app_error('insufficient_stock', p.id::text);
    end if;
    v_line_disc := coalesce(public.jnum(v_item, 'discount'), 0);
    if v_line_disc < 0 or v_line_disc <> round(v_line_disc, 2) or v_line_disc > round(v_qty * p.sell_price, 2) then
      perform public.app_error('invalid_input', 'discount');
    end if;
    v_line := round(v_qty * p.sell_price, 2) - v_line_disc;
    if not v_owner and not s.staff_can_sell_below_cost and v_line < round(v_qty * p.avg_cost, 2) then
      perform public.app_error('below_cost', p.id::text);
    end if;

    insert into public.sale_items (sale_id, product_id, qty, unit_price, unit_cost, discount, line_total)
    values (v_sale_id, p.id, v_qty, p.sell_price, p.avg_cost, v_line_disc, v_line);
    perform public.apply_movement(p, 'sale', -v_qty, p.avg_cost, v_sale_id);
    v_subtotal := v_subtotal + v_line;
    v_cost := v_cost + v_qty * p.avg_cost;
  end loop;

  if v_discount > v_subtotal then perform public.app_error('invalid_input', 'discount'); end if;
  if not v_owner and not s.staff_can_sell_below_cost and v_subtotal - v_discount < round(v_cost, 2) then
    perform public.app_error('below_cost');
  end if;
  update public.sales
  set subtotal = v_subtotal, discount = v_discount, total = v_subtotal - v_discount, total_cost = round(v_cost, 2)
  where id = v_sale_id;

  return public.sale_json(v_sale_id, v_owner);
end;
$$;

-- Owner: cancel a whole sale. Unreturned quantities go back to stock; the sale leaves all reports.
create or replace function public.void_sale(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  v public.sales;
  i record;
  p public.products;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) not between 1 and 300 then perform public.app_error('invalid_input', 'reason'); end if;
  select * into v from public.sales where id = p_id for update;
  if not found then perform public.app_error('not_found'); end if;
  if v.status <> 'completed' then perform public.app_error('invalid_transition'); end if;

  perform 1 from public.products where id in (select product_id from public.sale_items where sale_id = p_id)
  order by id for update;
  for i in select * from public.sale_items where sale_id = p_id and qty > returned_qty order by product_id loop
    select * into p from public.products where id = i.product_id;
    perform public.apply_movement(p, 'void', i.qty - i.returned_qty, i.unit_cost, p_id, null, '', v_reason);
  end loop;

  update public.sales
  set status = 'voided', void_reason = v_reason, voided_by = v_me.telegram_id, voided_at = now()
  where id = p_id;
  perform public.write_audit('sale.void', 'sale', p_id::text,
                             jsonb_build_object('status', 'completed', 'total', v.total),
                             jsonb_build_object('status', 'voided', 'reason', v_reason));
  return public.sale_json(p_id, true);
end;
$$;

-- Owner: partial return. p_items: [{ sale_item_id, qty }].
-- Refund per line = its share of the sale total after the sale-level discount (A3.8).
create or replace function public.return_sale_items(p_sale_id uuid, p_items jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  v public.sales;
  v_item jsonb;
  i public.sale_items;
  p public.products;
  v_qty numeric;
  v_refund numeric;
  v_cost numeric;
  v_return_id uuid := gen_random_uuid();
  v_total_refund numeric := 0;
  v_total_cost numeric := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_item_ids bigint[];
begin
  if char_length(v_reason) not between 1 and 300 then perform public.app_error('invalid_input', 'reason'); end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform public.app_error('invalid_input', 'items');
  end if;
  select * into v from public.sales where id = p_sale_id for update;
  if not found then perform public.app_error('not_found'); end if;
  if v.status <> 'completed' then perform public.app_error('invalid_transition'); end if;

  select array_agg((e ->> 'sale_item_id')::bigint) into v_item_ids from jsonb_array_elements(p_items) e;
  if array_position(v_item_ids, null) is not null
     or (select count(distinct x) from unnest(v_item_ids) x) <> cardinality(v_item_ids) then
    perform public.app_error('invalid_input', 'sale_item_id');
  end if;

  perform 1 from public.products
  where id in (select product_id from public.sale_items where id = any (v_item_ids))
  order by id for update;

  insert into public.sale_returns (id, sale_id, reason, refund_amount, cost_amount, created_by)
  values (v_return_id, p_sale_id, v_reason, 0, 0, v_me.telegram_id);

  for v_item in select e from jsonb_array_elements(p_items) e order by (e ->> 'sale_item_id')::bigint loop
    select * into i from public.sale_items
    where id = (v_item ->> 'sale_item_id')::bigint and sale_id = p_sale_id for update;
    if not found then perform public.app_error('not_found', 'sale_item_id'); end if;
    select * into p from public.products where id = i.product_id;
    v_qty := public.check_qty(p.unit, public.jnum(v_item, 'qty'));
    if v_qty <= 0 then perform public.app_error('invalid_input', 'qty'); end if;
    if v_qty > i.qty - i.returned_qty then perform public.app_error('return_exceeds_sold', i.id::text); end if;

    if v_qty = i.qty - i.returned_qty then
      -- Last units of the line: refund exactly what is left so rounding never leaks cents.
      select round(case when v.subtotal > 0 then i.line_total * v.total / v.subtotal else 0 end, 2)
               - coalesce(sum(ri.refund), 0),
             round(i.qty * i.unit_cost, 2) - coalesce(sum(ri.cost), 0)
      into v_refund, v_cost
      from public.sale_return_items ri where ri.sale_item_id = i.id;
    else
      v_refund := case when v.subtotal > 0
                       then round(i.line_total * v.total / v.subtotal * v_qty / i.qty, 2) else 0 end;
      v_cost := round(v_qty * i.unit_cost, 2);
    end if;
    insert into public.sale_return_items (return_id, sale_item_id, qty, refund, cost)
    values (v_return_id, i.id, v_qty, v_refund, v_cost);
    update public.sale_items set returned_qty = returned_qty + v_qty where id = i.id;
    perform public.apply_movement(p, 'return', v_qty, i.unit_cost, p_sale_id, v_return_id, '', v_reason);
    v_total_refund := v_total_refund + v_refund;
    v_total_cost := v_total_cost + v_cost;
  end loop;

  update public.sale_returns set refund_amount = v_total_refund, cost_amount = v_total_cost
  where id = v_return_id;
  perform public.write_audit('sale.return', 'sale', p_sale_id::text, null,
                             jsonb_build_object('return_id', v_return_id, 'items', p_items,
                                                'refund', v_total_refund, 'reason', v_reason));
  return public.sale_json(p_sale_id, true);
end;
$$;

-- Owner: any sale. Staff: only their own sales from today (shop time zone).
create or replace function public.get_sale(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v public.sales;
begin
  select * into v from public.sales where id = p_id;
  if not found
     or (v_me.role <> 'owner' and (v.cashier_id <> v_me.telegram_id
         or (v.sold_at at time zone public.shop_tz())::date <> (now() at time zone public.shop_tz())::date)) then
    perform public.app_error('not_found');
  end if;
  return public.sale_json(p_id, v_me.role = 'owner');
end;
$$;

-- p_filters: { from?, to? (local dates, inclusive), payment_methods?, cashier_ids?, product_ids?,
--              status? ('completed'|'voided'|'all'), q? (receipt number) }
-- Staff are pinned to their own sales for today.
create or replace function public.list_sales(p_filters jsonb default '{}', p_limit int default 30, p_offset int default 0)
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
  v_tz text := public.shop_tz();
  v_today date := (now() at time zone public.shop_tz())::date;
  v_from date;
  v_to date;
  v_methods text[];
  v_cashiers text[];
  v_products uuid[];
  v_status text := coalesce(nullif(f ->> 'status', ''), 'all');
  v_receipt bigint;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  begin
    v_from := nullif(f ->> 'from', '')::date;
    v_to := nullif(f ->> 'to', '')::date;
    v_receipt := nullif(regexp_replace(coalesce(f ->> 'q', ''), '[^0-9]', '', 'g'), '')::bigint;
    select array_agg(x) into v_methods from jsonb_array_elements_text(coalesce(f -> 'payment_methods', '[]')) x;
    select array_agg(x) into v_cashiers from jsonb_array_elements_text(coalesce(f -> 'cashier_ids', '[]')) x;
    select array_agg(x::uuid) into v_products from jsonb_array_elements_text(coalesce(f -> 'product_ids', '[]')) x;
  exception when others then
    perform public.app_error('invalid_input', 'filters');
  end;
  if not v_owner then
    v_from := v_today;
    v_to := v_today;
    v_cashiers := array[v_me.telegram_id];
  end if;

  with filtered as (
    select s.* from public.sales s
    where (v_from is null or s.sold_at >= (v_from::timestamp at time zone v_tz))
      and (v_to is null or s.sold_at < ((v_to + 1)::timestamp at time zone v_tz))
      and (v_methods is null or s.payment_method = any (v_methods))
      and (v_cashiers is null or s.cashier_id = any (v_cashiers))
      and (v_status = 'all' or s.status = v_status)
      and (v_receipt is null or s.receipt_no = v_receipt)
      and (v_products is null or exists (select 1 from public.sale_items i
                                         where i.sale_id = s.id and i.product_id = any (v_products)))
  ), page as (
    select * from filtered order by sold_at desc, receipt_no desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'total_amount', (select coalesce(sum(total), 0) from filtered where status = 'completed'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'receipt_no', pg.receipt_no, 'sold_at', pg.sold_at,
        'cashier_name', public.profile_name(pg.cashier_id), 'payment_method', pg.payment_method,
        'total', pg.total, 'status', pg.status,
        'item_count', (select count(*) from public.sale_items i where i.sale_id = pg.id),
        'has_returns', exists (select 1 from public.sale_returns r where r.sale_id = pg.id)
      ) || case when v_owner then jsonb_build_object('profit', pg.total - pg.total_cost) else '{}'::jsonb end
      order by pg.sold_at desc, pg.receipt_no desc) from page pg), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function
  public.record_sale(uuid, jsonb, text, numeric, text),
  public.void_sale(uuid, text),
  public.return_sale_items(uuid, jsonb, text),
  public.get_sale(uuid),
  public.list_sales(jsonb, int, int)
to authenticated;
