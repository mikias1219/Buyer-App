-- Sales (SPEC A3.2, 4–8, A4 Sale). Identity via tap.login; grants are covered in 10_security.sql.
-- Stock at start: charger 17 @ avg 115 (price 160), case 10 @ 80 (200), phone 3 @ 7500 (9000).

select gen_random_uuid() as ref1 \gset
select tap.login('9001');
select public.record_sale(:'ref1', jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 2, 'discount', 10),
  jsonb_build_object('product_id', tap.id('case'), 'qty', 1)), 'cash', 20, 'first sale') ->> 'id' as sale1 \gset

select tap.eq((select (subtotal, discount, total, total_cost)::text from public.sales where id = :'sale1'),
              '(510.00,20.00,490.00,310.00)', 'totals: line discount, sale discount, cost snapshot');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 15.000::numeric(12,3), 'sale reduces stock');
select tap.eq((select unit_cost from public.sale_items where sale_id = :'sale1' and product_id = tap.id('charger')),
              115.0000::numeric(14,4), 'unit cost frozen at sale time');

-- Idempotency
select tap.eq(public.record_sale(:'ref1', jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 2)), 'cash') ->> 'id', :'sale1',
  'retrying with the same client_ref returns the original sale');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 15.000::numeric(12,3),
              'retry does not sell twice');

-- Later price changes never touch past sales
select public.update_product(tap.id('charger'), '{"sell_price": 170}');
select tap.eq((select unit_price from public.sale_items where sale_id = :'sale1' and product_id = tap.id('charger')),
              160.00::numeric(14,2), 'price snapshot survives price change');

-- Overselling is impossible and atomic
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('phone'), 'qty', 4)), 'cash')$$, 'insufficient_stock', 'cannot sell more than in stock');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 1),
  jsonb_build_object('product_id', tap.id('phone'), 'qty', 5)), 'cash')$$, 'insufficient_stock', 'one bad line fails the sale');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 15.000::numeric(12,3),
              'failed sale leaves stock untouched');
select tap.eq((select count(*)::int from public.sales), 1, 'failed sales leave no rows');

-- Input rules
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 1)), 'credit')$$, 'customer_required', 'credit needs a customer');
select tap.throws($$select public.record_sale(gen_random_uuid(), '[]', 'cash')$$, 'invalid_input', 'empty cart rejected');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 1, 'discount', 500)), 'cash')$$, 'invalid_input',
  'line discount cannot exceed the line');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 1)), 'cash', 1000)$$, 'invalid_input',
  'sale discount cannot exceed the subtotal');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('charger'), 'qty', 0.5)), 'cash')$$, 'invalid_quantity', 'pieces sold whole');
select tap.throws(format($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', %L, 'qty', 1)), 'cash')$$,
  (select id from public.products where name = 'Earbuds')), 'product_unavailable', 'archived products cannot be sold');

-- Owner may sell below cost
select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('case'), 'qty', 1)), 'telebirr', 150) ->> 'id' as sale3 \gset
select tap.eq((select total from public.sales where id = :'sale3'), 50.00::numeric(14,2), 'owner sale below cost allowed');

-- ─── Staff ───────────────────────────────────────────────────────────
select tap.login('1001');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('phone'), 'qty', 1, 'discount', 2000)), 'cash')$$, 'below_cost',
  'staff cannot discount a line below cost');
select tap.throws($$select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('case'), 'qty', 1)), 'cash', 150)$$, 'below_cost',
  'staff cannot discount a sale below cost');
select public.record_sale(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('product_id', tap.id('phone'), 'qty', 1)), 'cash') as staff_sale \gset
select tap.ok(not (:'staff_sale'::jsonb ? 'profit') and not (:'staff_sale'::jsonb -> 'items' -> 0 ? 'unit_cost'),
              'staff receipt has no cost or profit');
select (:'staff_sale'::jsonb ->> 'id') as sale2 \gset
select tap.throws(format('select public.record_sale(%L, %L::jsonb, %L)', :'ref1',
  jsonb_build_array(jsonb_build_object('product_id', tap.id('case'), 'qty', 1)), 'cash'), 'conflict',
  'another cashier cannot replay someone else''s client_ref');
select tap.throws(format('select public.get_sale(%L)', :'sale1'), 'not_found', 'staff cannot open other cashiers'' sales');
select tap.eq(public.get_sale(:'sale2') ->> 'receipt_no', (:'staff_sale'::jsonb ->> 'receipt_no'), 'staff can open own sale');
select tap.eq((public.list_sales('{"from":"2000-01-01"}') ->> 'total_count')::int, 1, 'staff list only their own sales today');
select tap.throws(format($$select public.void_sale(%L, 'x')$$, :'sale2'), 'not_authorized', 'staff cannot void');
select tap.throws(format($$select public.return_sale_items(%L, '[]', 'x')$$, :'sale2'), 'not_authorized', 'staff cannot take returns');

-- ─── Returns (owner) ─────────────────────────────────────────────────
select tap.login('9001');
select tap.eq((public.list_sales() ->> 'total_count')::int, 3, 'owner sees all sales');
select tap.eq((public.list_sales('{"payment_methods":["telebirr"]}') ->> 'total_count')::int, 1, 'filter sales by method');
select tap.ok((public.list_sales() -> 'items' -> 0) ? 'profit', 'owner sale list includes profit');
select id as item_charger from public.sale_items where sale_id = :'sale1' and product_id = tap.id('charger') \gset

-- 1 of 2 chargers back: 310 × (490/510) × 1/2 = 148.92
select public.return_sale_items(:'sale1', jsonb_build_array(jsonb_build_object('sale_item_id', :'item_charger', 'qty', 1)), 'faulty');
select tap.eq((select refund_amount from public.sale_returns where sale_id = :'sale1'), 148.92::numeric(14,2),
              'refund includes the line''s share of the sale discount');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 16.000::numeric(12,3), 'return restocks');
select tap.throws(format($$select public.return_sale_items(%L, %L::jsonb, 'x')$$, :'sale1',
  jsonb_build_array(jsonb_build_object('sale_item_id', :'item_charger', 'qty', 2))), 'return_exceeds_sold',
  'cannot return more than sold');
select tap.throws(format($$select public.return_sale_items(%L, %L::jsonb, ' ')$$, :'sale1',
  jsonb_build_array(jsonb_build_object('sale_item_id', :'item_charger', 'qty', 1))), 'invalid_input', 'return reason required');
select public.return_sale_items(:'sale1', jsonb_build_array(jsonb_build_object('sale_item_id', :'item_charger', 'qty', 1)), 'faulty');
select tap.eq((select sum(refund) from public.sale_return_items where sale_item_id = :'item_charger'), 297.84::numeric,
              'full return of a line refunds exactly its net value');

-- ─── Void ────────────────────────────────────────────────────────────
select public.void_sale(:'sale1', 'entered by mistake');
select tap.eq((select stock_qty from public.products where id = tap.id('case')), 9.000::numeric(12,3),
              'void restores only unreturned quantities');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 17.000::numeric(12,3),
              'void does not double-restock returned units');
select tap.throws(format($$select public.void_sale(%L, 'again')$$, :'sale1'), 'invalid_transition', 'cannot void twice');
select tap.throws(format($$select public.return_sale_items(%L, %L::jsonb, 'x')$$, :'sale1',
  jsonb_build_array(jsonb_build_object('sale_item_id', :'item_charger', 'qty', 1))), 'invalid_transition',
  'cannot return on a voided sale');
select tap.throws(format($$select public.void_sale(%L, '')$$, :'sale3'), 'invalid_input', 'void reason required');
select tap.ok(exists (select 1 from public.audit_log where action = 'sale.void' and target_id = :'sale1'), 'void is audited');

reset role;
select tap.ok(tap.ledger_ok(), 'ledger invariant holds after sales, returns and voids');
select tap.ok(not exists (
  select 1 from public.sale_items i where i.returned_qty <> coalesce(
    (select sum(ri.qty) from public.sale_return_items ri where ri.sale_item_id = i.id), 0)),
  'returned_qty matches return lines');
insert into tap.ids values ('sale2', :'sale2'), ('sale3', :'sale3');
