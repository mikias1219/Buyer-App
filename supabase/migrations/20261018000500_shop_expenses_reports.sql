-- 0500 (shop) · Expenses and owner reports (SPEC A3.10–12, A6 Dashboard, A8 Reports).
--
-- Every report reads one event stream (report_events): completed sale lines on their sale date
-- (+ revenue, + cost) and returned lines on their return date (− revenue, − cost). Voided sales
-- and their returns are excluded. Revenue per line includes its share of the sale discount, so
-- line sums equal sale totals. Category filters use the product's current category.

-- ─── Expenses ────────────────────────────────────────────────────────
create or replace function public.expense_json(e public.expenses)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', e.id, 'spent_on', e.spent_on, 'category', e.category,
                            'amount', e.amount, 'note', e.note,
                            'created_by_name', public.profile_name(e.created_by),
                            'created_at', e.created_at, 'updated_at', e.updated_at);
$$;

create or replace function public.expense_apply_input(e public.expenses, p_input jsonb)
returns public.expenses
language plpgsql
stable
as $$
begin
  if p_input ? 'spent_on' then
    begin
      e.spent_on := (p_input ->> 'spent_on')::date;
    exception when others then
      perform public.app_error('invalid_input', 'spent_on');
    end;
  end if;
  if e.spent_on is null or e.spent_on > current_date + 1 or e.spent_on < date '2000-01-01' then
    perform public.app_error('invalid_input', 'spent_on');
  end if;
  if p_input ? 'category' then e.category := p_input ->> 'category'; end if;
  if e.category is null or e.category not in ('rent', 'salary', 'transport', 'utilities', 'supplies', 'tax', 'other') then
    perform public.app_error('invalid_input', 'category');
  end if;
  if p_input ? 'amount' then e.amount := public.jnum(p_input, 'amount'); end if;
  if e.amount is null or e.amount <= 0 or e.amount > 1e11 or e.amount <> round(e.amount, 2) then
    perform public.app_error('invalid_input', 'amount');
  end if;
  if p_input ? 'note' then e.note := left(btrim(coalesce(p_input ->> 'note', '')), 300); end if;
  e.note := coalesce(e.note, '');
  return e;
end;
$$;

create or replace function public.create_expense(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles := public.require_owner();
  e public.expenses;
begin
  e := public.expense_apply_input(e, coalesce(p_input, '{}'::jsonb));
  insert into public.expenses (spent_on, category, amount, note, created_by)
  values (e.spent_on, e.category, e.amount, e.note, v_me.telegram_id)
  returning * into e;
  perform public.write_audit('expense.create', 'expense', e.id::text, null, to_jsonb(e));
  return public.expense_json(e);
end;
$$;

create or replace function public.update_expense(p_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.expenses;
  e public.expenses;
begin
  perform public.require_owner();
  select * into v_before from public.expenses where id = p_id for update;
  if not found then perform public.app_error('not_found'); end if;
  e := public.expense_apply_input(v_before, coalesce(p_input, '{}'::jsonb));
  update public.expenses set spent_on = e.spent_on, category = e.category, amount = e.amount, note = e.note
  where id = p_id returning * into e;
  perform public.write_audit('expense.update', 'expense', p_id::text, to_jsonb(v_before), to_jsonb(e));
  return public.expense_json(e);
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.expenses;
begin
  perform public.require_owner();
  delete from public.expenses where id = p_id returning * into e;
  if not found then perform public.app_error('not_found'); end if;
  perform public.write_audit('expense.delete', 'expense', p_id::text, to_jsonb(e), null);
end;
$$;

-- ─── Report scope ────────────────────────────────────────────────────
do $$
begin
  if to_regtype('public.report_scope') is null then
    create type public.report_scope as (
      from_date   date,
      to_date     date,
      from_ts     timestamptz,
      to_ts       timestamptz,
      categories  uuid[],
      products    uuid[],
      methods     text[],
      cashiers    text[]
    );
  end if;
end $$;

-- filters: { from?, to? (local dates, inclusive; default today), category_ids?, product_ids?,
--            payment_methods?, cashier_ids? }
create or replace function public.parse_report_filters(p jsonb)
returns public.report_scope
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p, '{}'::jsonb);
  v_tz text := public.shop_tz();
  v_today date := (now() at time zone public.shop_tz())::date;
  sc public.report_scope;
begin
  begin
    sc.from_date := coalesce(nullif(f ->> 'from', '')::date, v_today);
    sc.to_date := coalesce(nullif(f ->> 'to', '')::date, sc.from_date);
    select array_agg(x::uuid) into sc.categories from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x;
    select array_agg(x::uuid) into sc.products from jsonb_array_elements_text(coalesce(f -> 'product_ids', '[]')) x;
    select array_agg(x) into sc.methods from jsonb_array_elements_text(coalesce(f -> 'payment_methods', '[]')) x;
    select array_agg(x) into sc.cashiers from jsonb_array_elements_text(coalesce(f -> 'cashier_ids', '[]')) x;
  exception when others then
    perform public.app_error('invalid_input', 'filters');
  end;
  if sc.to_date < sc.from_date or sc.to_date - sc.from_date > 3660 then
    perform public.app_error('invalid_input', 'range');
  end if;
  sc.from_ts := sc.from_date::timestamp at time zone v_tz;
  sc.to_ts := (sc.to_date + 1)::timestamp at time zone v_tz;
  return sc;
end;
$$;

-- Same-length window immediately before sc (for deltas).
create or replace function public.previous_scope(sc public.report_scope)
returns public.report_scope
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len int := sc.to_date - sc.from_date + 1;
  v public.report_scope := sc;
begin
  v.to_date := sc.from_date - 1;
  v.from_date := sc.from_date - v_len;
  v.from_ts := v.from_date::timestamp at time zone public.shop_tz();
  v.to_ts := sc.from_ts;
  return v;
end;
$$;

create or replace function public.report_events(sc public.report_scope)
returns table (
  event_at timestamptz, kind text, sale_id uuid, product_id uuid, category_id uuid,
  payment_method text, cashier_id text, qty numeric, revenue numeric, cost numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.sold_at, 'sale', s.id, i.product_id, p.category_id, s.payment_method, s.cashier_id,
         i.qty,
         case when s.subtotal > 0 then i.line_total * s.total / s.subtotal else 0 end,
         i.qty * i.unit_cost
  from public.sales s
  join public.sale_items i on i.sale_id = s.id
  join public.products p on p.id = i.product_id
  where s.status = 'completed' and s.sold_at >= sc.from_ts and s.sold_at < sc.to_ts
    and (sc.categories is null or p.category_id = any (sc.categories))
    and (sc.products is null or i.product_id = any (sc.products))
    and (sc.methods is null or s.payment_method = any (sc.methods))
    and (sc.cashiers is null or s.cashier_id = any (sc.cashiers))
  union all
  select r.created_at, 'return', s.id, i.product_id, p.category_id, s.payment_method, s.cashier_id,
         -ri.qty, -ri.refund, -ri.cost
  from public.sale_returns r
  join public.sales s on s.id = r.sale_id
  join public.sale_return_items ri on ri.return_id = r.id
  join public.sale_items i on i.id = ri.sale_item_id
  join public.products p on p.id = i.product_id
  where s.status = 'completed' and r.created_at >= sc.from_ts and r.created_at < sc.to_ts
    and (sc.categories is null or p.category_id = any (sc.categories))
    and (sc.products is null or i.product_id = any (sc.products))
    and (sc.methods is null or s.payment_method = any (sc.methods))
    and (sc.cashiers is null or s.cashier_id = any (sc.cashiers));
$$;

-- Profit definitions (A3.11). Expenses are shop-wide (date range only); stock loss follows the
-- product/category filters.
create or replace function public.report_kpis(sc public.report_scope)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cost), 0) as cogs,
      coalesce(sum(qty), 0) as items_sold,
      count(distinct sale_id) filter (where kind = 'sale') as sales_count,
      coalesce(sum(revenue) filter (where kind = 'sale'), 0) as sales_revenue,
      coalesce(-sum(revenue) filter (where kind = 'return'), 0) as returns_amount
    from public.report_events(sc)
  ), mv as (
    select
      coalesce(sum(-m.qty_delta * m.unit_cost) filter (where m.type = 'damage'), 0) as stock_loss,
      coalesce(sum(m.qty_delta * m.unit_cost) filter (where m.type = 'adjustment'), 0) as adjustments_value
    from public.stock_movements m
    join public.products p on p.id = m.product_id
    where m.type in ('damage', 'adjustment') and m.created_at >= sc.from_ts and m.created_at < sc.to_ts
      and (sc.categories is null or p.category_id = any (sc.categories))
      and (sc.products is null or m.product_id = any (sc.products))
  ), ex as (
    select coalesce(sum(amount), 0) as expenses
    from public.expenses where spent_on between sc.from_date and sc.to_date
  )
  select jsonb_build_object(
    'revenue', round(ev.revenue, 2),
    'cogs', round(ev.cogs, 2),
    'gross_profit', round(ev.revenue, 2) - round(ev.cogs, 2),
    'margin_pct', case when ev.revenue > 0 then round((ev.revenue - ev.cogs) / ev.revenue * 100, 1) end,
    'expenses', ex.expenses,
    'stock_loss', round(mv.stock_loss, 2),
    'adjustments_value', round(mv.adjustments_value, 2),
    'net_profit', round(ev.revenue, 2) - round(ev.cogs, 2) - ex.expenses - round(mv.stock_loss, 2),
    'items_sold', ev.items_sold,
    'sales_count', ev.sales_count,
    'avg_sale', case when ev.sales_count > 0 then round(ev.sales_revenue / ev.sales_count, 2) end,
    'returns_amount', round(ev.returns_amount, 2)
  )
  from ev, mv, ex;
$$;

create or replace function public.stock_totals(p_categories uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'product_count', count(*),
    'units', coalesce(sum(greatest(stock_qty, 0)), 0),
    'value_cost', round(coalesce(sum(greatest(stock_qty, 0) * avg_cost), 0), 2),
    'value_retail', round(coalesce(sum(greatest(stock_qty, 0) * sell_price), 0), 2),
    'potential_profit', round(coalesce(sum(greatest(stock_qty, 0) * (sell_price - avg_cost)), 0), 2),
    'low_count', count(*) filter (where stock_qty > 0 and stock_qty <= reorder_level),
    'out_count', count(*) filter (where stock_qty <= 0)
  )
  from public.products
  where status = 'active' and (p_categories is null or category_id = any (p_categories));
$$;

-- ─── Report RPCs (owner) ─────────────────────────────────────────────
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
    'stock', public.stock_totals(sc.categories)
  );
end;
$$;

-- p_bucket: 'day' | 'week' | 'month' | null (auto: ≤62 days → day, ≤370 → week, else month).
create or replace function public.sales_trend(p_filters jsonb default '{}', p_bucket text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
  v_bucket text := p_bucket;
  v_tz text := public.shop_tz();
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  if v_bucket is null then
    v_bucket := case when sc.to_date - sc.from_date <= 61 then 'day'
                     when sc.to_date - sc.from_date <= 369 then 'week' else 'month' end;
  end if;
  if v_bucket not in ('day', 'week', 'month') then perform public.app_error('invalid_input', 'bucket'); end if;

  return jsonb_build_object('bucket', v_bucket, 'points', coalesce((
    with ev as (
      select date_trunc(v_bucket, e.event_at at time zone v_tz)::date as b, e.*
      from public.report_events(sc) e
    ), series as (
      select generate_series(date_trunc(v_bucket, sc.from_date::timestamp),
                             sc.to_date::timestamp, ('1 ' || v_bucket)::interval)::date as b
    ), agg as (
      select s.b,
             round(coalesce(sum(ev.revenue), 0), 2) as revenue,
             round(coalesce(sum(ev.revenue), 0), 2) - round(coalesce(sum(ev.cost), 0), 2) as profit,
             coalesce(sum(ev.qty), 0) as items,
             count(distinct ev.sale_id) filter (where ev.kind = 'sale') as sales
      from series s left join ev on ev.b = s.b
      group by s.b
    )
    select jsonb_agg(jsonb_build_object('bucket', b, 'revenue', revenue, 'profit', profit,
                                        'items', items, 'sales', sales) order by b)
    from agg
  ), '[]'::jsonb));
end;
$$;

-- p_sort: 'qty' | 'revenue' | 'profit'
create or replace function public.product_performance(p_filters jsonb default '{}', p_sort text default 'qty', p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  perform public.require_owner();
  if coalesce(p_sort, 'qty') not in ('qty', 'revenue', 'profit') then
    perform public.app_error('invalid_input', 'sort');
  end if;
  sc := public.parse_report_filters(p_filters);
  return coalesce((
    with agg as (
      select e.product_id, sum(e.qty) as qty, sum(e.revenue) as revenue, sum(e.cost) as cost,
             count(distinct e.sale_id) filter (where e.kind = 'sale') as sales
      from public.report_events(sc) e
      group by e.product_id
    ), ranked as (
      select a.*, p.name, p.unit, p.stock_qty, c.name as category_name
      from agg a join public.products p on p.id = a.product_id
      left join public.categories c on c.id = p.category_id
      order by case coalesce(p_sort, 'qty') when 'qty' then a.qty
                                            when 'revenue' then a.revenue
                                            else a.revenue - a.cost end desc, lower(p.name)
      limit least(greatest(coalesce(p_limit, 10), 1), 500)
    )
    select jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'name', name, 'unit', unit, 'category_name', category_name,
      'qty', qty, 'revenue', round(revenue, 2), 'cost', round(cost, 2),
      'profit', round(revenue, 2) - round(cost, 2),
      'margin_pct', case when revenue > 0 then round((revenue - cost) / revenue * 100, 1) end,
      'sales', sales, 'stock_qty', stock_qty
    ))
    from ranked
  ), '[]'::jsonb);
end;
$$;

create or replace function public.category_breakdown(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'category_id', a.category_id, 'name', c.name, 'qty', a.qty,
      'revenue', round(a.revenue, 2), 'profit', round(a.revenue, 2) - round(a.cost, 2)
    ) order by a.revenue desc)
    from (
      select e.category_id, sum(e.qty) as qty, sum(e.revenue) as revenue, sum(e.cost) as cost
      from public.report_events(sc) e group by e.category_id
    ) a
    left join public.categories c on c.id = a.category_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.payment_breakdown(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'payment_method', payment_method, 'revenue', round(revenue, 2), 'sales', sales
    ) order by revenue desc)
    from (
      select e.payment_method, sum(e.revenue) as revenue,
             count(distinct e.sale_id) filter (where e.kind = 'sale') as sales
      from public.report_events(sc) e group by e.payment_method
    ) a
  ), '[]'::jsonb);
end;
$$;

create or replace function public.cashier_breakdown(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cashier_id', cashier_id, 'name', public.profile_name(cashier_id),
      'revenue', round(revenue, 2), 'sales', sales
    ) order by revenue desc)
    from (
      select e.cashier_id, sum(e.revenue) as revenue,
             count(distinct e.sale_id) filter (where e.kind = 'sale') as sales
      from public.report_events(sc) e group by e.cashier_id
    ) a
  ), '[]'::jsonb);
end;
$$;

-- Active products in stock with no completed sale in the last p_days (default from settings).
create or replace function public.slow_movers(p_days int default null, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int;
begin
  perform public.require_owner();
  v_days := least(greatest(coalesce(p_days, (select slow_mover_days from public.shop_settings where id = 1)), 1), 3650);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', id, 'name', name, 'unit', unit, 'stock_qty', stock_qty,
      'stock_value_cost', round(stock_qty * avg_cost, 2), 'last_sold_at', last_sold_at
    ) order by last_sold_at nulls first, stock_qty * avg_cost desc)
    from (
      select p.*, ls.last_sold_at
      from public.products p
      left join lateral (
        select max(s.sold_at) as last_sold_at
        from public.sale_items i join public.sales s on s.id = i.sale_id
        where i.product_id = p.id and s.status = 'completed'
      ) ls on true
      where p.status = 'active' and p.stock_qty > 0
        and (ls.last_sold_at is null or ls.last_sold_at < now() - make_interval(days => v_days))
      order by ls.last_sold_at nulls first, p.stock_qty * p.avg_cost desc
      limit least(greatest(coalesce(p_limit, 20), 1), 500)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Current stock valuation, overall and per category. p_filters: { category_ids? }
create or replace function public.stock_summary(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
begin
  perform public.require_owner();
  sc := public.parse_report_filters(coalesce(p_filters, '{}'::jsonb) - 'from' - 'to');
  return jsonb_build_object(
    'totals', public.stock_totals(sc.categories),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', g.category_id, 'name', g.name, 'product_count', g.product_count,
        'units', g.units, 'value_cost', round(g.value_cost, 2), 'value_retail', round(g.value_retail, 2)
      ) order by g.value_cost desc)
      from (
        select p.category_id, c.name, count(*) as product_count,
               sum(greatest(p.stock_qty, 0)) as units,
               sum(greatest(p.stock_qty, 0) * p.avg_cost) as value_cost,
               sum(greatest(p.stock_qty, 0) * p.sell_price) as value_retail
        from public.products p left join public.categories c on c.id = p.category_id
        where p.status = 'active' and (sc.categories is null or p.category_id = any (sc.categories))
        group by p.category_id, c.name
      ) g
    ), '[]'::jsonb)
  );
end;
$$;

-- CSV source: one row per sale line / returned line (max 20 000 rows).
create or replace function public.export_sales_lines(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
  v_tz text := public.shop_tz();
begin
  perform public.require_owner();
  sc := public.parse_report_filters(p_filters);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', to_char(e.event_at at time zone v_tz, 'YYYY-MM-DD HH24:MI'),
      'kind', e.kind, 'receipt_no', s.receipt_no, 'product', p.name, 'category', c.name,
      'qty', e.qty, 'revenue', round(e.revenue, 2), 'cost', round(e.cost, 2),
      'profit', round(e.revenue, 2) - round(e.cost, 2),
      'payment_method', e.payment_method, 'cashier', public.profile_name(e.cashier_id)
    ) order by e.event_at, s.receipt_no)
    from (select * from public.report_events(sc) order by event_at limit 20000) e
    join public.sales s on s.id = e.sale_id
    join public.products p on p.id = e.product_id
    left join public.categories c on c.id = e.category_id
  ), '[]'::jsonb);
end;
$$;

-- p_filters: { from?, to?, categories? (expense categories) }
create or replace function public.list_expenses(p_filters jsonb default '{}', p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sc public.report_scope;
  v_cats text[];
begin
  perform public.require_owner();
  sc := public.parse_report_filters(coalesce(p_filters, '{}'::jsonb) - 'categories');
  begin
    select array_agg(x) into v_cats from jsonb_array_elements_text(coalesce(p_filters -> 'categories', '[]')) x;
  exception when others then
    perform public.app_error('invalid_input', 'categories');
  end;
  return (
    with filtered as (
      select * from public.expenses e
      where e.spent_on between sc.from_date and sc.to_date
        and (v_cats is null or e.category = any (v_cats))
    )
    select jsonb_build_object(
      'total_amount', (select coalesce(sum(amount), 0) from filtered),
      'total_count', (select count(*) from filtered),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amount)
                                                order by amount desc)
                               from (select category, sum(amount) as amount from filtered group by category) t),
                              '[]'::jsonb),
      'items', coalesce((select jsonb_agg(public.expense_json(x) order by x.spent_on desc, x.created_at desc)
                         from (select * from filtered order by spent_on desc, created_at desc
                               limit least(greatest(coalesce(p_limit, 50), 1), 200)
                               offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function
  public.create_expense(jsonb),
  public.update_expense(uuid, jsonb),
  public.delete_expense(uuid),
  public.list_expenses(jsonb, int, int),
  public.dashboard_summary(jsonb),
  public.sales_trend(jsonb, text),
  public.product_performance(jsonb, text, int),
  public.category_breakdown(jsonb),
  public.payment_breakdown(jsonb),
  public.cashier_breakdown(jsonb),
  public.slow_movers(int, int),
  public.stock_summary(jsonb),
  public.export_sales_lines(jsonb)
to authenticated;
