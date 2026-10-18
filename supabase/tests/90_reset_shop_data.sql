-- scripts/sql/reset_shop_data.sql: wipes business data, keeps team and settings, shop still works after.
-- Runs last: it empties everything the earlier suites created.
reset role;
select count(*) as profiles_before from public.profiles \gset
select shop_name as shop_before from public.shop_settings where id = 1 \gset
select tap.ok((select count(*) from public.sales) > 0 and (select count(*) from public.products) > 0, 'there is data to remove');

\ir ../../scripts/sql/reset_shop_data.sql

select tap.eq((select count(*)::int from public.products), 0, 'products removed');
select tap.eq((select count(*)::int from public.categories), 0, 'categories removed');
select tap.eq((select count(*)::int from public.sales) + (select count(*)::int from public.sale_items), 0, 'sales removed');
select tap.eq((select count(*)::int from public.stock_movements), 0, 'stock history removed');
select tap.eq((select count(*)::int from public.expenses), 0, 'expenses removed');
select tap.eq((select count(*)::int from public.customers) + (select count(*)::int from public.customer_payments), 0, 'customers removed');
select tap.eq((select count(*)::int from public.notifications_outbox where sent_at is null and kind in ('low_stock', 'daily_summary')), 0,
              'pending stock / summary messages dropped');
select tap.eq((select count(*) from public.profiles), :profiles_before::bigint, 'team kept');
select tap.eq((select shop_name from public.shop_settings where id = 1), :'shop_before', 'settings kept');

-- The shop works again from scratch, and receipts restart at 1.
select tap.login('9001');
select public.create_product('{"name": "Fresh start", "sell_price": 10, "cost_price": 6, "opening_stock": 5}') ->> 'id' as pid \gset
select public.record_sale(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', :'pid', 'qty', 2)), 'cash', 0, '', null)
       ->> 'receipt_no' as receipt \gset
select tap.eq(:'receipt'::int, 1, 'receipt numbers restart at 1');
reset role;
select tap.eq((select stock_qty from public.products where id = :'pid'), 3::numeric, 'stock ledger works after reset');
select tap.ok(tap.ledger_ok(), 'ledger invariant holds after reset');
