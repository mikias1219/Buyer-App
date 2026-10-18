-- Customers & credit, CSV import, low-stock alerts, daily summary, bot helpers (Phase 6).
-- Identity via tap.login; grants are covered in 10_security.sql.

-- ─── Customers & credit ──────────────────────────────────────────────
select tap.login('1001');   -- staff can add a customer at the till
select public.upsert_customer('{"name": "Almaz", "phone": "0911223344"}') ->> 'id' as cust \gset
select tap.eq((select phone from public.customers where id = :'cust'), '+251911223344', 'local phone normalized');
select tap.throws($$select public.upsert_customer('{"name": "Copy", "phone": "+251911223344"}')$$, 'duplicate_phone', 'phone is unique');
select tap.throws(format($$select public.upsert_customer('{"id": "%s", "name": "Renamed"}')$$, :'cust'), 'not_authorized',
                  'staff cannot edit customers');

-- Credit sale: phone 1 × 9000 (stock 2 → 1).
select public.record_sale(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', tap.id('phone'), 'qty', 1)),
                          'credit', 0, 'pay next week', :'cust') ->> 'id' as credit_sale \gset
select tap.eq((select customer_id::text from public.sales where id = :'credit_sale'), :'cust', 'credit sale linked to customer');
select tap.eq(public.customer_balance(:'cust'), 9000.00::numeric, 'balance = credit sales');
select tap.throws(format($$select public.record_sale(gen_random_uuid(), %L::jsonb, 'credit', 0, '', gen_random_uuid())$$,
  jsonb_build_array(jsonb_build_object('product_id', tap.id('case'), 'qty', 1))), 'not_found', 'unknown customer rejected');

select public.record_customer_payment(:'cust', 4000, 'telebirr', 'first part');
select tap.eq(public.customer_balance(:'cust'), 5000.00::numeric, 'payment reduces the balance');
select tap.throws(format($$select public.record_customer_payment(%L, 6000, 'cash')$$, :'cust'), 'exceeds_balance',
                  'cannot pay more than owed');
select tap.throws(format($$select public.record_customer_payment(%L, 10, 'credit')$$, :'cust'), 'invalid_input',
                  'payment method must be money');
select tap.eq((public.list_customers('alm') -> 'items' -> 0 ->> 'balance')::numeric, 5000.00, 'customer search shows balance');
select tap.ok(not (public.get_customer(:'cust') ? 'payments'), 'staff get no credit history');

select tap.login('9001');
select tap.eq(jsonb_array_length(public.get_customer(:'cust') -> 'payments'), 1, 'owner sees payment history');
select tap.eq((public.list_customers(null, true) ->> 'total_owed')::numeric, 5000.00, 'owing-only list and total');
-- Return on a credit sale reduces what is owed.
select id as credit_item from public.sale_items where sale_id = :'credit_sale' \gset
select public.return_sale_items(:'credit_sale', jsonb_build_array(jsonb_build_object('sale_item_id', :'credit_item', 'qty', 1)), 'changed mind');
select tap.eq(public.customer_balance(:'cust'), -4000.00::numeric, 'refund on credit reduces the balance (store credit)');
select tap.eq((public.dashboard_summary() ->> 'receivables')::numeric, -4000.00, 'dashboard shows receivables');
select public.upsert_customer(jsonb_build_object('id', :'cust', 'name', 'Almaz K.', 'phone', '+251911223344'));
select tap.eq((select name from public.customers where id = :'cust'), 'Almaz K.', 'owner edits customers');

-- ─── CSV import ──────────────────────────────────────────────────────
select public.import_products('[
  {"name": "Sugar", "category": "Groceries", "unit": "kg", "sell_price": 95, "cost_price": 80, "opening_stock": 25.5},
  {"name": "Soap", "category": "groceries", "sku": "SOAP-1", "sell_price": 45, "cost_price": 30, "opening_stock": 40},
  {"name": "", "sell_price": 10},
  {"name": "Dup", "sku": "soap-1", "sell_price": 1},
  {"name": "Bad unit", "unit": "barrel", "sell_price": 1}
]', true) as dry \gset
select tap.eq((:'dry'::jsonb ->> 'saved')::boolean, false, 'dry run never saves');
select tap.eq(jsonb_array_length(:'dry'::jsonb -> 'errors'), 3, 'dry run reports every bad row');
select tap.eq((:'dry'::jsonb -> 'errors' -> 1 ->> 'code'), 'duplicate_sku', 'duplicates inside the file are caught');
select tap.eq((:'dry'::jsonb -> 'errors' -> 0 ->> 'row')::int, 3, 'errors carry the row number');
select tap.ok(not exists (select 1 from public.products where name in ('Sugar', 'Soap'))
              and not exists (select 1 from public.categories where name = 'Groceries'), 'dry run leaves no trace');
select tap.eq((public.import_products('[{"name": "Sugar", "sell_price": 95}, {"name": "", "sell_price": 1}]', false) ->> 'saved')::boolean,
              false, 'a file with errors is not saved');
select tap.ok(not exists (select 1 from public.products where name = 'Sugar'), 'partial imports never happen');
select public.import_products('[
  {"name": "Sugar", "category": "Groceries", "unit": "kg", "sell_price": 95, "cost_price": 80, "opening_stock": 25.5},
  {"name": "Soap", "category": "groceries", "sku": "SOAP-1", "sell_price": 45, "cost_price": 30, "opening_stock": 40}
]', false) as imp \gset
select tap.eq((:'imp'::jsonb ->> 'saved')::boolean, true, 'clean file is saved');
select tap.eq((:'imp'::jsonb ->> 'new_categories')::int, 1, 'categories matched case-insensitively and created once');
select tap.eq((select stock_qty from public.products where name = 'Sugar'), 25.500::numeric(12,3), 'opening stock imported');
select tap.throws($$select public.import_products('[]')$$, 'invalid_input', 'empty import rejected');
select tap.login('1001');
select tap.throws($$select public.import_products('[{"name":"X","sell_price":1}]')$$, 'not_authorized', 'staff cannot import');

-- ─── Low-stock alerts ────────────────────────────────────────────────
select tap.login('9001');
select public.update_settings('{"low_stock_alerts": true}');
delete from public.notifications_outbox;
-- Soap: 40 in stock, reorder 5 (default) → selling 35 crosses the level once.
select public.record_sale(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id',
  (select id from public.products where name = 'Soap'), 'qty', 30)), 'cash');
select tap.eq((select count(*)::int from public.notifications_outbox where kind = 'low_stock'), 0, 'no alert above the level');
select public.record_sale(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id',
  (select id from public.products where name = 'Soap'), 'qty', 5)), 'cash');
select tap.eq((select count(*)::int from public.notifications_outbox where kind = 'low_stock'), 1, 'alert when crossing the level');
select public.record_sale(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id',
  (select id from public.products where name = 'Soap'), 'qty', 1)), 'cash');
select tap.eq((select count(*)::int from public.notifications_outbox where kind = 'low_stock'), 1, 'no repeat while already low');
select tap.eq((select payload ->> 'name' from public.notifications_outbox where kind = 'low_stock'), 'Soap', 'alert names the product');

-- ─── Daily summary + bot helpers ─────────────────────────────────────
select public.update_settings('{"daily_summary_enabled": true, "daily_summary_time": "00:00"}');
reset role;
select tap.logout();
set role service_role;
select tap.eq(public.queue_daily_summary(), true, 'summary queued after its time');
select tap.eq(public.queue_daily_summary(), false, 'only once per day');
select tap.ok((public.bot_today('9001') ->> 'sales_count')::int >= 1, 'bot /today works for owners');
select tap.eq(public.bot_today('1001'), null, 'bot /today is owner-only');
select tap.ok(jsonb_array_length(public.bot_low_stock('1001')) >= 1, 'bot /lowstock works for staff');
select tap.eq(public.bot_low_stock('1002'), null, 'bot /lowstock needs access');
reset role;
select tap.eq((select count(*)::int from public.notifications_outbox where kind = 'daily_summary'), 1, 'summary goes to the owner');

select tap.ok(tap.ledger_ok(), 'ledger invariant holds after imports and credit sales');
