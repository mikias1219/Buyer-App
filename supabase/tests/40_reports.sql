-- Expenses and reports (SPEC A3.10–12). Today's events after 30_sales.sql:
--   sale2 phone 1 × 9000 (cost 7500, cash, staff), sale3 case total 50 (cost 80, telebirr, owner),
--   sale1 voided (excluded with its returns), charger damage 1 @ 115, charger count −2 @ 115.
select tap.login('9001');
select (now() at time zone 'Africa/Addis_Ababa')::date as today \gset
select jsonb_build_object('from', :'today', 'to', :'today') as f_today \gset

-- Wire 10.5 m × 40.50 = 425.25 (cost 262.50), then 0.5 m back = 20.25 (cost 12.50)
select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('wire'), 'qty', 10.5)), 'cash') ->> 'id' as sale4 \gset
select id as item_wire from public.sale_items where sale_id = :'sale4' \gset
select public.return_sale_items(:'sale4', jsonb_build_array(jsonb_build_object('sale_item_id', :'item_wire', 'qty', 0.5)), 'too long');
select tap.eq((select refund_amount from public.sale_returns where sale_id = :'sale4'), 20.25::numeric(14,2), 'partial metre return');

-- Expenses
select public.create_expense(jsonb_build_object('spent_on', :'today', 'category', 'rent', 'amount', 300, 'note', 'October'));
select public.create_expense('{"spent_on": "2026-01-05", "category": "supplies", "amount": 50}') ->> 'id' as exp_old \gset
select tap.throws($$select public.create_expense('{"spent_on":"2026-01-05","category":"food","amount":5}')$$, 'invalid_input', 'unknown expense category');
select tap.throws($$select public.create_expense('{"spent_on":"2026-01-05","category":"rent","amount":0}')$$, 'invalid_input', 'expense amount must be positive');
select public.update_expense(:'exp_old', '{"amount": 55}');
select tap.eq((public.list_expenses('{"from":"2026-01-01","to":"2026-01-31"}') ->> 'total_amount')::numeric, 55::numeric, 'expense edit');
select tap.eq((public.list_expenses(:'f_today') -> 'by_category' -> 0 ->> 'category'), 'rent', 'expense totals by category');
select public.delete_expense(:'exp_old');
select tap.eq((public.list_expenses('{"from":"2026-01-01","to":"2026-01-31"}') ->> 'total_count')::int, 0, 'expense delete');

-- ─── KPIs ────────────────────────────────────────────────────────────
select public.dashboard_summary(:'f_today') as d \gset
select tap.eq((:'d'::jsonb -> 'current' ->> 'revenue')::numeric, 9455.00, 'revenue = sales − returns, voids excluded');
select tap.eq((:'d'::jsonb -> 'current' ->> 'cogs')::numeric, 7830.00, 'cost of goods sold');
select tap.eq((:'d'::jsonb -> 'current' ->> 'gross_profit')::numeric, 1625.00, 'gross profit');
select tap.eq((:'d'::jsonb -> 'current' ->> 'margin_pct')::numeric, 17.2, 'gross margin %');
select tap.eq((:'d'::jsonb -> 'current' ->> 'expenses')::numeric, 300::numeric, 'expenses in period');
select tap.eq((:'d'::jsonb -> 'current' ->> 'stock_loss')::numeric, 115.00, 'stock loss from damage');
select tap.eq((:'d'::jsonb -> 'current' ->> 'adjustments_value')::numeric, -230.00, 'count corrections reported separately');
select tap.eq((:'d'::jsonb -> 'current' ->> 'net_profit')::numeric, 1210.00, 'net = gross − expenses − stock loss');
select tap.eq((:'d'::jsonb -> 'current' ->> 'items_sold')::numeric, 12::numeric, 'items sold net of returns');
select tap.eq((:'d'::jsonb -> 'current' ->> 'sales_count')::int, 3, 'number of sales');
select tap.eq((:'d'::jsonb -> 'current' ->> 'avg_sale')::numeric, 3158.42, 'average sale');
select tap.eq((:'d'::jsonb -> 'current' ->> 'returns_amount')::numeric, 20.25, 'returns amount');
select tap.eq((:'d'::jsonb -> 'previous' ->> 'revenue')::numeric, 0::numeric, 'previous period comparison');
select tap.eq((:'d'::jsonb ->> 'scoped')::boolean, false, 'unfiltered summary is not scoped');

-- Stock valuation (active products): charger 17@115/170, case 9@80/200, phone 2@7500/9000, wire 90.75@25/40.50
select tap.eq((:'d'::jsonb -> 'stock' ->> 'value_cost')::numeric, 19943.75, 'stock value at cost');
select tap.eq((:'d'::jsonb -> 'stock' ->> 'value_retail')::numeric, 26365.38, 'stock value at retail');
select tap.eq((:'d'::jsonb -> 'stock' ->> 'low_count')::int, 1, 'low stock count');
select tap.eq((:'d'::jsonb -> 'stock' ->> 'out_count')::int, 0, 'out of stock count');

-- Filters
select public.dashboard_summary(:'f_today'::jsonb || jsonb_build_object('category_ids', jsonb_build_array(tap.id('cat_phones')))) as dp \gset
select tap.eq((:'dp'::jsonb -> 'current' ->> 'revenue')::numeric, 9000.00, 'category filter');
select tap.eq((:'dp'::jsonb -> 'current' ->> 'stock_loss')::numeric, 0.00, 'stock loss follows the category filter');
select tap.eq((:'dp'::jsonb ->> 'scoped')::boolean, true, 'filtered summary is scoped');
select tap.eq((public.dashboard_summary(:'f_today'::jsonb || '{"payment_methods":["telebirr"]}') -> 'current' ->> 'revenue')::numeric,
              50.00, 'payment method filter');
select tap.eq((public.dashboard_summary(:'f_today'::jsonb || '{"cashier_ids":["1001"]}') -> 'current' ->> 'sales_count')::int,
              1, 'cashier filter');
select tap.eq((public.dashboard_summary(:'f_today'::jsonb || jsonb_build_object('product_ids', jsonb_build_array(tap.id('wire')))) -> 'current' ->> 'revenue')::numeric,
              405.00, 'product filter nets returns');
select tap.throws($$select public.dashboard_summary('{"from":"2026-02-01","to":"2026-01-01"}')$$, 'invalid_input', 'reversed range rejected');
select tap.throws($$select public.dashboard_summary('{"category_ids":["nope"]}')$$, 'invalid_input', 'bad filter ids rejected');

-- Breakdowns and rankings
select tap.eq(public.product_performance(:'f_today', 'revenue') -> 0 ->> 'name', 'Tecno Spark 20', 'top product by revenue');
select tap.eq(public.product_performance(:'f_today', 'qty') -> 0 ->> 'name', 'Copper wire', 'top product by quantity');
select tap.eq((public.product_performance(:'f_today', 'profit') -> 0 ->> 'profit')::numeric, 1500.00, 'top product by profit');
select tap.eq((select (e ->> 'revenue')::numeric from jsonb_array_elements(public.payment_breakdown(:'f_today')) e
               where e ->> 'payment_method' = 'cash'), 9405.00, 'cash revenue');
select tap.eq((select (e ->> 'revenue')::numeric from jsonb_array_elements(public.category_breakdown(:'f_today')) e
               where e ->> 'name' = 'Accessories'), 50.00, 'category breakdown');
select tap.eq((select (e ->> 'revenue')::numeric from jsonb_array_elements(public.cashier_breakdown(:'f_today')) e
               where e ->> 'cashier_id' = '1001'), 9000.00, 'cashier breakdown');
select tap.eq((select sum((p ->> 'revenue')::numeric) from jsonb_array_elements(
                 public.sales_trend(jsonb_build_object('from', (:'today'::date - 2), 'to', :'today')) -> 'points') p),
              9455.00, 'trend points add up to the period revenue');
select tap.eq(jsonb_array_length(public.sales_trend(jsonb_build_object('from', (:'today'::date - 2), 'to', :'today')) -> 'points'),
              3, 'trend has a point per day, including empty days');
select tap.eq(public.sales_trend('{"from":"2025-01-01","to":"2025-12-31"}') ->> 'bucket', 'week', 'a year is bucketed by week');
select tap.eq(jsonb_array_length(public.export_sales_lines(:'f_today')), 4, 'export has one row per sale/return line');
select tap.eq(public.slow_movers() -> 0 ->> 'name', 'Charger 20W', 'in-stock product without completed sales is a slow mover');
select tap.eq((public.stock_summary() -> 'totals' ->> 'value_cost')::numeric, 19943.75, 'stock summary totals');

-- ─── Time zone: 21:30 UTC on Jan 1 is 00:30 on Jan 2 in Addis Ababa ──
select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 1)), 'cash') ->> 'id' as sale_tz \gset
update public.sales set sold_at = '2026-01-01 21:30:00+00' where id = :'sale_tz';
select tap.eq((public.dashboard_summary('{"from":"2026-01-02","to":"2026-01-02"}') -> 'current' ->> 'sales_count')::int, 1,
              'sale counted on the local (Addis) date');
select tap.eq((public.dashboard_summary('{"from":"2026-01-01","to":"2026-01-01"}') -> 'current' ->> 'sales_count')::int, 0,
              'not on the UTC date');
select tap.eq((public.list_sales('{"from":"2026-01-02","to":"2026-01-02"}') ->> 'total_count')::int, 1, 'sales history uses local dates');

reset role;
select tap.ok(tap.ledger_ok(), 'ledger invariant holds at the end');
