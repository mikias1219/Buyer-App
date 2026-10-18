-- Production-like marketplace data, loaded after the 20261004… migrations and before the shop reset.
insert into public.profiles (telegram_id, username, first_name, role, phone, phone_verified, city)
values ('7001', 'admin_a', 'Admin', 'admin', '+251911000001', true, 'Addis Ababa'),
       ('7002', 'mod_b', 'Mod', 'moderator', '', false, ''),
       ('7003', 'seller_c', 'Seller', 'user', '', false, 'Adama');
insert into public.products (id, seller_id, title, price, status)
values ('11111111-1111-4111-8111-111111111111', '7003', 'Old listing', 1000, 'draft');
insert into public.payments (telegram_id, product_id, kind, amount_etb)
values ('7003', '11111111-1111-4111-8111-111111111111', 'listing', 100);
insert into public.notifications_outbox (chat_id, kind, payload) values ('7003', 'listing_approved', '{}');
insert into public.audit_log (actor_id, action, target_type, target_id) values ('7001', 'listing.approve', 'product', 'x');

-- Supabase installs its own objects in `public`, e.g. an event trigger that enables RLS on new
-- tables. The reset must leave them alone.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
as $$ begin end; $$;
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
