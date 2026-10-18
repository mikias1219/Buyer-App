-- After the shop migrations ran on top of marketplace data.
select tap.eq((select role from public.profiles where telegram_id = '7001'), 'owner', 'admin became owner');
select tap.eq((select role from public.profiles where telegram_id = '7002'), 'staff', 'moderator became staff');
select tap.eq((select role from public.profiles where telegram_id = '7003'), 'user', 'user stays user');
select tap.ok(not exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone'),
              'marketplace profile columns dropped');
select tap.ok(to_regclass('public.payments') is null and to_regclass('public.listings_public') is null,
              'marketplace tables dropped');
select tap.ok(exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'products' and column_name = 'stock_qty'),
              'products is the shop table');
select tap.ok(to_regprocedure('public.request_contact(uuid)') is null, 'marketplace RPCs dropped');
select tap.eq((select count(*)::int from public.audit_log), 1, 'audit history kept');
select tap.eq((select count(*)::int from public.notifications_outbox where sent_at is null), 0,
              'pending marketplace notifications cleared');
select tap.login('7001');
select tap.eq(public.get_me() ->> 'role', 'owner', 'mapped owner can sign in');
select tap.eq((public.list_products() ->> 'total')::int, 0, 'shop starts empty');
