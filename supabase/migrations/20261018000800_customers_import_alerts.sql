-- 0800 (shop) · Phase 6: customers & credit (ዱቤ), CSV product import, low-stock alerts,
-- daily summary and bot read helpers (SPEC A3.6, A5.3, A5.12).

alter table public.shop_settings add column if not exists daily_summary_last_sent date;

-- ─── customers ───────────────────────────────────────────────────────
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  phone       text not null default '' check (phone ~ '^(\+?[0-9]{9,15})?$'),
  note        text not null default '' check (char_length(note) <= 300),
  archived    boolean not null default false,
  created_by  text references public.profiles (telegram_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists customers_phone_uq on public.customers (phone) where phone <> '';
create index if not exists customers_name_idx on public.customers (lower(name));

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

create table if not exists public.customer_payments (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id),
  amount       numeric(14, 2) not null check (amount > 0),
  method       text not null check (method in ('cash', 'telebirr', 'bank')),
  note         text not null default '' check (char_length(note) <= 300),
  created_by   text references public.profiles (telegram_id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists customer_payments_customer_idx on public.customer_payments (customer_id, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_customer_fk') then
    alter table public.sales add constraint sales_customer_fk foreign key (customer_id) references public.customers (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_credit_needs_customer') then
    alter table public.sales add constraint sales_credit_needs_customer
      check (payment_method <> 'credit' or customer_id is not null);
  end if;
end $$;
create index if not exists sales_customer_idx on public.sales (customer_id) where customer_id is not null;

alter table public.customers enable row level security;
alter table public.customer_payments enable row level security;
revoke all on public.customers, public.customer_payments from anon, authenticated;
revoke update, delete on public.customer_payments from service_role;

-- Outstanding credit: completed credit sales (net of refunds) minus payments received.
create or replace function public.customer_balance(p_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sum(s.total - coalesce((select sum(r.refund_amount) from public.sale_returns r where r.sale_id = s.id), 0))
    from public.sales s
    where s.customer_id = p_customer_id and s.payment_method = 'credit' and s.status = 'completed'
  ), 0) - coalesce((select sum(amount) from public.customer_payments where customer_id = p_customer_id), 0);
$$;

create or replace function public.total_receivables()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.customer_balance(id)), 0) from public.customers;
$$;

create or replace function public.customer_json(c public.customers)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'note', c.note,
                            'archived', c.archived, 'balance', public.customer_balance(c.id),
                            'created_at', c.created_at);
$$;

-- Members (cashiers pick customers at the till). p_q matches name or phone.
create or replace function public.list_customers(p_q text default null, p_owing_only boolean default false,
                                                 p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public.require_member();
  if v_q is not null then
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  return (
    with base as (
      select c, public.customer_balance(c.id) as balance
      from public.customers c
      where not c.archived
        and (v_q is null or lower(c.name) like '%' || lower(v_q) || '%' or c.phone like '%' || v_q || '%')
    ), filtered as (
      select * from base where not coalesce(p_owing_only, false) or balance > 0
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'total_owed', (select coalesce(sum(balance), 0) from filtered where balance > 0),
      'items', coalesce((select jsonb_agg(public.customer_json(x.c) order by x.balance desc, lower((x.c).name))
                         from (select * from filtered order by balance desc, lower((c).name)
                               limit least(greatest(coalesce(p_limit, 50), 1), 200)
                               offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb)
    )
  );
end;
$$;

-- Customer with credit history (owner) or basic card (staff).
create or replace function public.get_customer(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  c public.customers;
begin
  select * into c from public.customers where id = p_id;
  if not found then perform public.app_error('not_found'); end if;
  if v_me.role <> 'owner' then return public.customer_json(c); end if;
  return public.customer_json(c) || jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'receipt_no', s.receipt_no, 'sold_at', s.sold_at, 'total', s.total,
        'refunded', coalesce((select sum(r.refund_amount) from public.sale_returns r where r.sale_id = s.id), 0),
        'status', s.status
      ) order by s.sold_at desc)
      from (select * from public.sales where customer_id = p_id and payment_method = 'credit'
            order by sold_at desc limit 100) s
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', cp.id, 'amount', cp.amount, 'method', cp.method, 'note', cp.note,
                                          'created_at', cp.created_at,
                                          'created_by_name', public.profile_name(cp.created_by))
             order by cp.created_at desc)
      from (select * from public.customer_payments where customer_id = p_id order by created_at desc limit 100) cp
    ), '[]'::jsonb)
  );
end;
$$;

-- p_input: { id?, name, phone?, note? }. Members create (at the till); only owners edit.
create or replace function public.upsert_customer(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  v_id uuid := public.juuid(p_input, 'id');
  v_name text := btrim(coalesce(p_input ->> 'name', ''));
  v_phone text := regexp_replace(coalesce(p_input ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_note text := left(btrim(coalesce(p_input ->> 'note', '')), 300);
  c public.customers;
  v_before public.customers;
begin
  if char_length(v_name) not between 1 and 80 then perform public.app_error('invalid_input', 'name'); end if;
  if v_phone ~ '^0[79][0-9]{8}$' then v_phone := '+251' || substr(v_phone, 2); end if;
  if v_phone !~ '^(\+?[0-9]{9,15})?$' then perform public.app_error('invalid_input', 'phone'); end if;
  begin
    if v_id is null then
      insert into public.customers (name, phone, note, created_by)
      values (v_name, v_phone, v_note, v_me.telegram_id) returning * into c;
    else
      if v_me.role <> 'owner' then perform public.app_error('not_authorized'); end if;
      select * into v_before from public.customers where id = v_id for update;
      if not found then perform public.app_error('not_found'); end if;
      update public.customers set name = v_name, phone = v_phone, note = v_note where id = v_id returning * into c;
    end if;
  exception when unique_violation then
    perform public.app_error('duplicate_phone');
  end;
  perform public.write_audit(case when v_id is null then 'customer.create' else 'customer.update' end,
                             'customer', c.id::text, to_jsonb(v_before), to_jsonb(c));
  return public.customer_json(c);
end;
$$;

create or replace function public.set_customer_archived(p_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.customers;
begin
  perform public.require_owner();
  update public.customers set archived = coalesce(p_archived, false) where id = p_id returning * into c;
  if not found then perform public.app_error('not_found'); end if;
  perform public.write_audit('customer.archive', 'customer', p_id::text, null, jsonb_build_object('archived', c.archived));
  return public.customer_json(c);
end;
$$;

-- Debt repayment (members may take it at the till). Cannot exceed what is owed.
create or replace function public.record_customer_payment(p_customer_id uuid, p_amount numeric, p_method text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_member();
  c public.customers;
  v_id uuid;
begin
  select * into c from public.customers where id = p_customer_id for update;
  if not found then perform public.app_error('not_found'); end if;
  if p_method not in ('cash', 'telebirr', 'bank') then perform public.app_error('invalid_input', 'method'); end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    perform public.app_error('invalid_input', 'amount');
  end if;
  if p_amount > public.customer_balance(p_customer_id) then perform public.app_error('exceeds_balance'); end if;
  insert into public.customer_payments (customer_id, amount, method, note, created_by)
  values (p_customer_id, p_amount, p_method, left(btrim(coalesce(p_note, '')), 300), v_me.telegram_id)
  returning id into v_id;
  perform public.write_audit('customer.payment', 'customer', p_customer_id::text, null,
                             jsonb_build_object('payment_id', v_id, 'amount', p_amount, 'method', p_method));
  return public.customer_json(c);
end;
$$;

-- ─── Sales with customers ────────────────────────────────────────────
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
    'customer_id', s.customer_id,
    'customer_name', (select c.name from public.customers c where c.id = s.customer_id),
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

-- Same rules as 0400 plus an optional customer (required for credit).
drop function if exists public.record_sale(uuid, jsonb, text, numeric, text);
create or replace function public.record_sale(
  p_client_ref uuid, p_items jsonb, p_payment_method text,
  p_discount numeric default 0, p_note text default '', p_customer_id uuid default null
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
  if p_payment_method = 'credit' and p_customer_id is null then
    perform public.app_error('customer_required');
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and not archived) then
    perform public.app_error('not_found', 'customer_id');
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

  perform 1 from public.products where id = any (v_ids) order by id for update;

  select * into v_existing from public.sales where client_ref = p_client_ref;
  if found then
    if v_existing.cashier_id <> v_me.telegram_id then perform public.app_error('conflict'); end if;
    return public.sale_json(v_existing.id, v_owner);
  end if;

  insert into public.sales (id, client_ref, cashier_id, customer_id, payment_method, subtotal, discount, total, total_cost, note)
  values (v_sale_id, p_client_ref, v_me.telegram_id, p_customer_id, p_payment_method, 0, 0, 0, 0,
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

-- ─── Low-stock alert on the ledger write ─────────────────────────────
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
  -- Crossing the reorder level (not every sale while already low) sends one alert.
  if p_delta < 0 and p_product.stock_qty > p_product.reorder_level and v_after <= p_product.reorder_level
     and (select low_stock_alerts from public.shop_settings where id = 1) then
    perform public.notify_owners('low_stock', jsonb_build_object(
      'product_id', p_product.id, 'name', p_product.name, 'unit', p_product.unit,
      'stock_qty', v_after, 'reorder_level', p_product.reorder_level));
  end if;
  return v_after;
end;
$$;

-- ─── Dashboard: add outstanding credit ───────────────────────────────
create or replace function public.dashboard_summary(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
  pv public.report_scope;
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  pv := public.previous_scope(sc);
  return jsonb_build_object(
    'range', jsonb_build_object('from', sc.from_date, 'to', sc.to_date,
                                'previous_from', pv.from_date, 'previous_to', pv.to_date),
    'scoped', sc.categories is not null or sc.products is not null
              or sc.methods is not null or sc.cashiers is not null,
    'current', public.report_kpis(sc),
    'previous', public.report_kpis(pv),
    'stock', public.stock_totals(sc.categories),
    'receivables', public.total_receivables()
  );
end;
$$;

-- ─── CSV import (owner) ──────────────────────────────────────────────
-- p_rows: [{ name, category?, sku?, barcode?, unit?, sell_price, cost_price?, opening_stock?, reorder_level? }]
-- Unknown categories are created. All rows are applied in one transaction: if any row fails (or
-- p_dry_run), nothing is saved and the per-row errors are returned.
create or replace function public.import_products(p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_i int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_created int := 0;
  v_new_categories int := 0;
  v_cat_name text;
  v_cat_id uuid;
  v_input jsonb;
  v_msg text;
  v_detail text;
  v_saved boolean := false;
begin
  perform public.require_owner();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    perform public.app_error('invalid_input', 'rows');
  end if;

  begin
    for v_row in select e from jsonb_array_elements(p_rows) e loop
      v_i := v_i + 1;
      begin
        if jsonb_typeof(v_row) <> 'object' then perform public.app_error('invalid_input', 'row'); end if;
        v_cat_id := null;
        v_cat_name := nullif(btrim(coalesce(v_row ->> 'category', '')), '');
        if v_cat_name is not null then
          select id into v_cat_id from public.categories where lower(btrim(name)) = lower(v_cat_name);
          if v_cat_id is null then
            if char_length(v_cat_name) > 60 then perform public.app_error('invalid_input', 'category'); end if;
            insert into public.categories (name) values (v_cat_name) returning id into v_cat_id;
            v_new_categories := v_new_categories + 1;
          end if;
        end if;
        v_input := (v_row - 'category') || jsonb_build_object('category_id', v_cat_id);
        if not (v_input ? 'unit') or coalesce(v_input ->> 'unit', '') = '' then
          v_input := v_input || '{"unit":"piece"}';
        end if;
        perform public.create_product(jsonb_strip_nulls(v_input));
        v_created := v_created + 1;
      exception when others then
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        v_errors := v_errors || jsonb_build_object(
          'row', v_i,
          'code', case when v_msg ~ '^[a-z_]{1,40}$' then v_msg else 'invalid_input' end,
          'detail', coalesce(v_detail, ''));
      end;
    end loop;

    if p_dry_run or jsonb_array_length(v_errors) > 0 then
      raise exception using message = 'import_rollback', errcode = 'P0001';
    end if;
    v_saved := true;
  exception when raise_exception then
    if sqlerrm <> 'import_rollback' then raise; end if;
  end;

  if v_saved then
    perform public.write_audit('product.import', 'product', 'batch', null,
                               jsonb_build_object('created', v_created, 'new_categories', v_new_categories));
  end if;
  return jsonb_build_object('saved', v_saved, 'valid', v_created, 'new_categories', v_new_categories,
                            'errors', v_errors, 'total', v_i);
end;
$$;

-- ─── Bot helpers (service_role; the bot passes the verified Telegram id) ───
create or replace function public.bot_today(p_telegram_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  if public.member_role(p_telegram_id) is distinct from 'owner' then return null; end if;
  sc := public.parse_report_filters('{}');
  return public.report_kpis(sc) || jsonb_build_object(
    'date', sc.from_date, 'shop_name', (select shop_name from public.shop_settings where id = 1),
    'low_count', (select count(*) from public.products where status = 'active' and stock_qty <= reorder_level),
    'receivables', public.total_receivables());
end;
$$;

create or replace function public.bot_low_stock(p_telegram_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.member_role(p_telegram_id) not in ('owner', 'staff') or public.member_role(p_telegram_id) is null then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', p.name, 'unit', p.unit, 'stock_qty', p.stock_qty,
                                        'reorder_level', p.reorder_level) order by p.stock_qty - p.reorder_level)
    from (select * from public.products where status = 'active' and stock_qty <= reorder_level
          order by stock_qty - reorder_level limit 20) p
  ), '[]'::jsonb);
end;
$$;

-- Called by the `notify` worker every run: queues today's summary to owners once, after
-- daily_summary_time (shop time zone). Returns true when queued.
create or replace function public.queue_daily_summary()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.shop_settings;
  v_local timestamp;
  sc public.report_scope;
begin
  select * into s from public.shop_settings where id = 1 for update;
  v_local := now() at time zone s.timezone;
  if not s.daily_summary_enabled or v_local::time < s.daily_summary_time
     or s.daily_summary_last_sent is not distinct from v_local::date then
    return false;
  end if;
  sc := public.parse_report_filters('{}');
  perform public.notify_owners('daily_summary', public.report_kpis(sc) || jsonb_build_object(
    'date', sc.from_date, 'shop_name', s.shop_name,
    'low_count', (select count(*) from public.products where status = 'active' and stock_qty <= reorder_level),
    'receivables', public.total_receivables()));
  update public.shop_settings set daily_summary_last_sent = v_local::date where id = 1;
  return true;
end;
$$;

-- ─── Function permissions (see 0700) ─────────────────────────────────
create or replace function public.lock_function_grants()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text[] := array[
    'get_me()', 'update_my_profile(jsonb)', 'get_settings()', 'update_settings(jsonb)',
    'list_team()', 'set_member_role(uuid,text)',
    'list_categories(boolean)', 'upsert_category(jsonb)', 'set_category_archived(uuid,boolean)',
    'create_product(jsonb)', 'update_product(uuid,jsonb)', 'set_product_status(uuid,text)',
    'delete_product(uuid)', 'list_products(jsonb,integer,integer)', 'get_product(uuid)',
    'find_product_by_code(text)', 'restock(jsonb,text,text)', 'adjust_stock(uuid,text,numeric,text)',
    'product_movements(uuid,bigint,integer)', 'low_stock(integer)',
    'record_sale(uuid,jsonb,text,numeric,text,uuid)', 'void_sale(uuid,text)',
    'return_sale_items(uuid,jsonb,text)', 'get_sale(uuid)', 'list_sales(jsonb,integer,integer)',
    'create_expense(jsonb)', 'update_expense(uuid,jsonb)', 'delete_expense(uuid)',
    'list_expenses(jsonb,integer,integer)', 'dashboard_summary(jsonb)', 'sales_trend(jsonb,text)',
    'product_performance(jsonb,text,integer)', 'category_breakdown(jsonb)',
    'payment_breakdown(jsonb)', 'cashier_breakdown(jsonb)', 'slow_movers(integer,integer)',
    'stock_summary(jsonb)', 'export_sales_lines(jsonb)',
    'list_customers(text,boolean,integer,integer)', 'get_customer(uuid)', 'upsert_customer(jsonb)',
    'set_customer_archived(uuid,boolean)', 'record_customer_payment(uuid,numeric,text,text)',
    'import_products(jsonb,boolean)'
  ];
  v_service text[] := array[
    'upsert_telegram_profile(text,text,text,text,text,text)', 'bootstrap_owner(text)',
    'can_manage_products(text)', 'claim_outbox(integer)',
    'complete_outbox(bigint,boolean,text,boolean)', 'member_role(text)',
    'bot_today(text)', 'bot_low_stock(text)', 'queue_daily_summary()'
  ];
  f record;
  s text;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.prorettype <> 'event_trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;

  foreach s in array v_client loop
    execute format('grant execute on function public.%s to authenticated', s);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach s in array v_service loop
      execute format('grant execute on function public.%s to service_role', s);
    end loop;
  end if;
end;
$$;

select public.lock_function_grants();
