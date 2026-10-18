-- Catalog and stock ledger (SPEC A3.1, 3, 9, 13–15).
-- RPC role checks use the signed-in identity (tap.login); grants are covered in 10_security.sql,
-- so these suites stay superuser to inspect tables directly.
select tap.login('9001');

select tap.eq((public.get_product(tap.id('charger')) ->> 'stock_qty')::numeric, 10::numeric, 'opening stock recorded');
select tap.eq((select count(*)::int from public.stock_movements where product_id = tap.id('charger') and type = 'opening'), 1,
              'opening stock is a ledger row');
select tap.eq(public.get_product(tap.id('charger')) ->> 'margin_pct', '33.3', 'owner sees margin %');

-- Weighted average cost: 10 @ 100 + 10 @ 130 → 115
select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', 10, 'unit_cost', 130)),
                      'Supplier A', 'weekly order');
select tap.eq((select avg_cost from public.products where id = tap.id('charger')), 115.0000::numeric(14,4), 'WAC after restock');
select tap.eq((select stock_qty from public.products where id = tap.id('charger')), 20.000::numeric(12,3), 'restock adds stock');
select tap.eq((select supplier from public.stock_movements where product_id = tap.id('charger') and type = 'purchase'),
              'Supplier A', 'supplier stored on the movement');

-- Whole-number units
select tap.throws($$select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', 1.5)))$$,
                  'invalid_quantity', 'pieces cannot be fractional');
select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('wire'), 'qty', 0.25, 'unit_cost', 25)));
select tap.eq((select stock_qty from public.products where id = tap.id('wire')), 100.750::numeric(12,3), 'metres allow decimals');
select tap.throws($$select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', 1),
                                                            jsonb_build_object('product_id', tap.id('charger'), 'qty', 2)))$$,
                  'invalid_input', 'duplicate lines in one restock are rejected');
select tap.throws($$select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', -1)))$$,
                  'invalid_input', 'negative restock is rejected');

-- Stock count and loss
select public.adjust_stock(tap.id('charger'), 'set', 18, 'monthly count');
select tap.eq((select qty_delta from public.stock_movements where product_id = tap.id('charger') and type = 'adjustment'),
              -2.000::numeric(12,3), 'count correction writes the difference');
select tap.throws($$select public.adjust_stock(tap.id('charger'), 'set', 18, 'again')$$, 'no_change', 'no-op count is rejected');
select public.adjust_stock(tap.id('charger'), 'loss', 1, 'dropped');
select tap.eq((select unit_cost from public.stock_movements where product_id = tap.id('charger') and type = 'damage'),
              115.0000::numeric(14,4), 'loss valued at average cost');
select tap.throws($$select public.adjust_stock(tap.id('charger'), 'loss', 100, 'x')$$, 'insufficient_stock',
                  'cannot lose more than on hand');
select tap.throws($$select public.adjust_stock(tap.id('charger'), 'loss', 1, '  ')$$, 'invalid_input', 'reason is required');
select tap.eq((select avg_cost from public.products where id = tap.id('charger')), 115.0000::numeric(14,4),
              'adjustments do not change the average cost');
select tap.eq(jsonb_array_length(public.product_movements(tap.id('charger'))), 4, 'movement history lists every change');

-- Restock from zero takes the new cost
select (public.create_product('{"name":"Earbuds","sell_price":500,"cost_price":300}') ->> 'id') as p_ear \gset
select public.restock(jsonb_build_array(jsonb_build_object('product_id', :'p_ear', 'qty', 4, 'unit_cost', 320)));
select tap.eq((select avg_cost from public.products where id = :'p_ear'), 320.0000::numeric(14,4),
              'restock from empty stock uses the new unit cost');

-- Identity and validation
select tap.throws($$select public.create_product('{"name":"Dup","sell_price":1,"sku":"chg-20"}')$$, 'duplicate_sku',
                  'SKU is unique (case-insensitive)');
select tap.throws($$select public.create_product('{"name":"","sell_price":1}')$$, 'invalid_input', 'name is required');
select tap.throws($$select public.create_product('{"name":"X","sell_price":-1}')$$, 'invalid_input', 'price cannot be negative');
select tap.throws($$select public.create_product('{"name":"X","sell_price":"abc"}')$$, 'invalid_input', 'price must be a number');
select tap.throws($$select public.update_product(tap.id('wire'), '{"unit":"piece"}')$$, 'invalid_quantity',
                  'unit cannot become whole-number while stock is fractional');
select public.update_product(tap.id('charger'), '{"sell_price": 160, "stock_qty": 999}');
select tap.eq((select (sell_price, stock_qty)::text from public.products where id = tap.id('charger')), '(160.00,17.000)',
              'update changes price but never stock');
select tap.ok(exists (select 1 from public.audit_log where action = 'product.update' and target_id = tap.id('charger')::text),
              'price change is audited');

-- Delete vs archive
select tap.throws(format('select public.delete_product(%L)', :'p_ear'), 'has_history', 'products with history cannot be deleted');
select (public.create_product('{"name":"Typo product","sell_price":1}') ->> 'id') as p_typo \gset
select public.delete_product(:'p_typo');
select tap.ok(not exists (select 1 from public.products where id = :'p_typo'), 'product without history can be deleted');
select public.set_product_status(:'p_ear', 'archived');
select tap.eq((public.list_products('{"q":"earbuds"}') ->> 'total')::int, 0, 'archived products are hidden by default');
select tap.eq((public.list_products('{"q":"earbuds","status":"archived"}') ->> 'total')::int, 1, 'owner can list archived');

-- Filters and sort
select tap.eq((public.list_products('{"q":"chg"}') -> 'items' -> 0 ->> 'name'), 'Charger 20W', 'search by SKU prefix');
select tap.eq((public.list_products('{"q":"spark"}') ->> 'total')::int, 1, 'search by name');
select tap.eq((public.list_products(jsonb_build_object('category_id', tap.id('cat_acc'))) ->> 'total')::int, 2, 'filter by category');
select tap.eq((public.list_products('{"sort":"stock_asc"}') -> 'items' -> 0 ->> 'name'), 'Tecno Spark 20', 'sort by stock');
select tap.eq((public.list_products('{}', 2, 0) -> 'items') -> 1 ->> 'name',
              (public.list_products('{}', 1, 1) -> 'items') -> 0 ->> 'name', 'paging is stable');
select tap.eq(public.find_product_by_code('CHG-20') ->> 'name', 'Charger 20W', 'lookup by code');
reset role;

-- Low stock (staff can see it)
select tap.login('1001');
select tap.ok(exists (select 1 from jsonb_array_elements(public.low_stock()) i where i ->> 'name' = 'Tecno Spark 20'),
              'phone (3 left, reorder 5) is low stock');
select tap.throws(format('select public.get_product(%L)', :'p_ear'), 'not_found', 'staff cannot open archived products');
reset role;

select tap.ok(tap.ledger_ok(), 'ledger invariant holds after stock operations');
