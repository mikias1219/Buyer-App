-- Buyer flows: search, detail, favorites, views, contact (A3.9), reports, reviews, seller profile.

set role service_role;
select public.upsert_telegram_profile('3001', 'shop_three', 'Genet', '', '', 'en');
select public.upsert_telegram_profile('3002', 'buyer_unverified', 'Hana', '', '', 'en');
select public.set_verified_phone('3001', '251933000001');
reset role;

-- Five live listings for 3001 (approve via moderator).
select tap.make_draft('3001', 'MacBook Air M1 8/256', 45000, 'laptop', 'Apple') as m1 \gset
select tap.make_draft('3001', 'MacBook Pro M2 16GB', 95000, 'laptop', 'Apple') as m2 \gset
select tap.make_draft('3001', 'ThinkPad T480', 18000, 'laptop', 'Lenovo') as m3 \gset
select tap.login('3001');
set role authenticated;
select public.update_listing(:'m3', '{"specs": {"ram": "16GB", "storage": "512GB", "evil key!": "x", "cpu": {"nested": 1}}}');
select public.submit_listing(:'m1');
select public.submit_listing(:'m2');
reset role;
-- Third listing over quota: pay path, then confirm.
select tap.login('3001');
set role authenticated;
select public.submit_listing(:'m3') ->> 'payment_id' as m3_pay \gset
select public.submit_payment_reference(:'m3_pay', 'THINKPAD01');
reset role;
select tap.login('9002');
set role authenticated;
select public.moderate_listing(:'m1', true);
select public.moderate_listing(:'m2', true);
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_confirm_payment(:'m3_pay');
reset role;

select tap.eq((select specs from public.products where id = :'m3'), '{"ram": "16GB", "storage": "512GB"}'::jsonb,
              'specs sanitized: unsafe keys and nested values dropped');

-- ─── Search ──────────────────────────────────────────────────────────
select tap.logout();
set role anon;
select tap.eq((public.search_listings(p_query => 'macbook') ->> 'total')::int, 2, 'text search matches title words');
select tap.eq((public.search_listings(p_query => 'apple air') ->> 'total')::int, 1, 'multi-word search is AND across title/brand');
select tap.eq((public.search_listings(p_query => '100%_') ->> 'total')::int, 0, 'LIKE wildcards in queries are escaped');
select tap.eq((public.search_listings(p_category => 'laptop', p_brand => 'apple') ->> 'total')::int, 2, 'brand filter is case-insensitive');
select tap.eq((public.search_listings(p_category => 'laptop', p_max_price => 20000) ->> 'total')::int, 1, 'max price filter');
select tap.eq((public.search_listings(p_category => 'laptop', p_min_price => 40000, p_max_price => 50000) ->> 'total')::int, 1,
              'price range filter');
select tap.eq((public.search_listings(p_specs => '{"ram": "16GB"}') ->> 'total')::int, 1, 'spec filter');
select tap.eq((public.search_listings(p_category => 'laptop', p_sort => 'price_asc') -> 'items' -> 0 ->> 'title'),
              'ThinkPad T480', 'sort by price ascending');
select tap.eq((public.search_listings(p_category => 'laptop', p_sort => 'price_desc') -> 'items' -> 0 ->> 'title'),
              'MacBook Pro M2 16GB', 'sort by price descending');
select tap.eq(jsonb_array_length(public.search_listings(p_category => 'laptop', p_limit => 2) -> 'items'), 2, 'page size respected');
select tap.eq((public.search_listings(p_category => 'laptop', p_limit => 2) ->> 'next_offset')::int, 2, 'next page offset');
select tap.eq(jsonb_array_length(public.search_listings(p_category => 'laptop', p_limit => 2, p_offset => 2) -> 'items'), 1,
              'second page has the remainder');
select tap.ok(public.search_listings(p_category => 'laptop', p_limit => 2, p_offset => 2) -> 'next_offset' = 'null'::jsonb,
              'no next page at the end');
select tap.eq(jsonb_array_length(public.search_listings(p_limit => 5000) -> 'items') <= 50, true, 'page size is capped at 50');
select tap.ok(jsonb_array_length(public.home_feed('Addis Ababa') -> 'near_you') >= 3, 'home feed: near you by city');
select tap.ok(jsonb_array_length(public.home_feed() -> 'under_20k') >= 1, 'home feed: under 20,000 rail');
select tap.ok((public.home_feed() -> 'category_counts' ->> 'laptop')::int >= 3, 'home feed: category counts');
select tap.ok((public.price_hint('laptop') ->> 'median') is null, 'price hint needs at least 5 samples');
reset role;

-- ─── Detail, views, favorites ────────────────────────────────────────
select tap.login('1002');
set role authenticated;
select public.register_view(:'m1');
select public.register_view(:'m1');
reset role;
select tap.eq((select views from public.products where id = :'m1'), 1, 'one view per viewer per day');
select tap.login('3001');
set role authenticated;
select public.register_view(:'m1');
select tap.ok(public.get_listing(:'m1') ->> 'is_owner' = 'true', 'owner flag in detail');
select tap.ok(public.get_listing(:'m1') ? 'manage', 'owner gets management block');
reset role;
select tap.eq((select views from public.products where id = :'m1'), 1, 'owner views are not counted');

select tap.login('1002');
set role authenticated;
select tap.eq(public.toggle_favorite(:'m1'), true, 'favorite on');
select tap.eq((public.get_listing(:'m1') ->> 'is_favorite')::boolean, true, 'detail reflects favorite');
select tap.eq(jsonb_array_length(public.my_favorites()), 2, 'favorites list (includes earlier saved item)');
select tap.eq(public.toggle_favorite(:'m1'), false, 'favorite off');
select tap.throws(format('select public.toggle_favorite(%L)', (select id from public.products where status = 'draft' limit 1)),
                  'listing_not_active', 'cannot favorite a non-live listing');
reset role;

-- ─── Contact seller (A3.9) ───────────────────────────────────────────
select tap.login('3002');
set role authenticated;
select tap.throws(format('select public.request_contact(%L)', :'m1'), 'phone_not_verified', 'contact requires verified phone');
reset role;
select tap.login('1002');
set role authenticated;
select tap.eq(public.request_contact(:'m1') ->> 'telegram_url', 'https://t.me/shop_three', 'contact returns seller link');
select tap.eq(public.request_contact(:'m1') ->> 'telegram_url', 'https://t.me/shop_three', 'repeat contact for same listing ok');
reset role;
select tap.eq((select count(*)::int from public.leads where product_id = :'m1' and buyer_id = '1002'), 1,
              'repeat contact within 24h logs a single lead');
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '3001' and kind = 'new_lead'),
              'seller notified of new lead');
select tap.login('3001');
set role authenticated;
select tap.throws(format('select public.request_contact(%L)', :'m1'), 'own_listing', 'cannot contact yourself');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"contact_daily_limit": 1}');
reset role;
select tap.login('1002');
set role authenticated;
select tap.throws(format('select public.request_contact(%L)', :'m2'), 'rate_limited', 'daily contact limit enforced');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"contact_daily_limit": 20}');
reset role;
-- Seller without @username is reached by verified phone.
select id as chala_live from public.products where seller_id = '1003' and status = 'payment_submitted' limit 1 \gset
select tap.login('9001');
set role authenticated;
select public.admin_confirm_payment((select id from public.payments where product_id = :'chala_live' and status = 'submitted'));
reset role;
select tap.login('1002');
set role authenticated;
select tap.eq(public.request_contact(:'chala_live') ->> 'phone', '+251911000003', 'no-username seller reachable by phone');
select tap.ok(public.request_contact(:'chala_live') -> 'telegram_url' = 'null'::jsonb, 'no t.me link without username');
reset role;

-- ─── Reports ─────────────────────────────────────────────────────────
select tap.login('1002');
set role authenticated;
select public.submit_report('product', :'m2', 'scam', 'Price too good') as r1 \gset
select tap.eq(public.submit_report('product', :'m2', 'scam'), :'r1'::uuid, 'duplicate open report returns the same report');
select tap.throws($$select public.submit_report('product', 'nope', 'scam')$$, 'not_found', 'unknown target rejected');
select tap.throws(format($$select public.submit_report('product', %L, 'whatever')$$, :'m2'), 'invalid_input', 'unknown reason rejected');
reset role;
select tap.login('3001');
set role authenticated;
select tap.throws(format($$select public.submit_report('product', %L, 'scam')$$, :'m2'), 'not_found', 'cannot report own listing');
reset role;

-- ─── Reviews ─────────────────────────────────────────────────────────
select tap.login('1002');
set role authenticated;
select tap.throws(format('select public.submit_review(%L, 5)', :'m1'), 'not_reviewable', 'cannot review before sale');
reset role;
select tap.login('3001');
set role authenticated;
select public.set_listing_status(:'m1', 'sold');
reset role;
select tap.login('1002');
set role authenticated;
select tap.eq((public.get_listing(:'m1') ->> 'can_review')::boolean, true, 'buyer with a lead can review sold listing');
select public.submit_review(:'m1', 4, 'Honest seller');
select tap.throws(format('select public.submit_review(%L, 5)', :'m1'), 'already_reviewed', 'one review per buyer per listing');
reset role;
select tap.login('3002');
set role authenticated;
select tap.throws(format('select public.submit_review(%L, 1)', :'m1'), 'not_reviewable', 'only buyers who made contact can review');
reset role;

select tap.logout();
select public_id as shop_pid from public.profiles where telegram_id = '3001' \gset
set role anon;
select tap.eq((public.get_seller(:'shop_pid') -> 'rating' ->> 'rating')::numeric, 4.0, 'seller rating aggregated');
select tap.eq((public.get_seller(:'shop_pid') ->> 'sold_count')::int, 1, 'seller sold count');
select tap.ok(public.get_seller(:'shop_pid')::text not like '%shop_three%', 'seller profile hides @username');
select tap.eq((public.get_listing(:'m1') ->> 'status'), 'sold', 'sold listing still viewable (marked sold)');
reset role;
