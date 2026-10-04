-- Assertions after: legacy schema → migrations 0100..0900 → migrate_legacy.sql (run twice).
select tap.ok(to_regclass('legacy.products') is not null and to_regclass('public.products') is not null,
              'legacy tables moved aside, v1 tables created');
select tap.eq((select count(*)::int from pg_policies where schemaname = 'legacy'), 0, 'legacy open policies dropped');
select tap.eq((select count(*)::int from public.profiles), 3, 'profiles migrated; browser guest skipped; missing seller created');
select tap.eq((select role from public.profiles where telegram_id = '5001'), 'admin', 'legacy admin_telegram_ids → admin role');
select tap.eq((select phone || ':' || phone_verified from public.profiles where telegram_id = '5002'), '+251912345678:false',
              'legacy phone normalized but not verified');
select tap.eq((select count(*)::int from public.products), 6, 'products migrated (guest listing skipped)');
select tap.eq((select status from public.products where id = '44444444-4444-4444-8444-444444444444'), 'removed', 'hidden → removed');
select tap.ok((select status = 'active' and expires_at > now() + interval '29 days' and period_paid
               from public.products where id = '11111111-1111-4111-8111-111111111111'), 'active → active with a fresh period');
select tap.eq((select category || '/' || condition from public.products where id = '77777777-7777-4777-8777-777777777777'),
              'accessory/like_new', 'categories and conditions mapped');
select tap.eq((select reference || ':' || status from public.payments where id = 'aaaaaaa3-0000-4000-8000-000000000003'),
              'CKK111AAA:submitted', 'reference normalized');
select tap.eq((select reference || ':' || status from public.payments where id = 'aaaaaaa4-0000-4000-8000-000000000004'),
              'CKK111AAA-D1:refunded', 'duplicate reference suffixed instead of failing');
select tap.ok((select reference like 'LEGACY-%' and admin_note like '%legacy ref: x%'
               from public.payments where id = 'aaaaaaa1-0000-4000-8000-000000000001'), 'invalid reference replaced, original kept');
select tap.eq((select status from public.payments where id = 'aaaaaaa2-0000-4000-8000-000000000002'), 'pending', 'pending stays pending');
select tap.eq((select telebirr_number || '|' || telebirr_name || '|' || support_username || '|' || listing_fee_etb::int
               from public.platform_settings), '0911111111|Test Business|helpdesk|120', 'settings carried over');
select tap.eq((select count(*)::int from public.listings_public), 2, 'migrated active listings are public');

set role anon;
select tap.throws('select * from legacy.products', '42501', 'anon has no access to the legacy schema');
reset role;

-- Image-move helpers: service-only, batch returns the listings still missing photos.
set role service_role;
select tap.eq((select count(*)::int from public.legacy_image_batch(50)), 6, 'all migrated listings queued for image move');
select public.legacy_image_attach('11111111-1111-4111-8111-111111111111', '5002/11111111-1111-4111-8111-111111111111/legacy.jpg');
select public.legacy_image_attach('77777777-7777-4777-8777-777777777777', '', 'download 404');
select tap.eq((select count(*)::int from public.legacy_image_batch(50)), 4, 'attached and skipped listings leave the queue');
reset role;
set role authenticated;
select tap.throws('select * from public.legacy_image_batch(1)', '42501', 'clients cannot read legacy images');
reset role;
