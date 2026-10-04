-- Representative MVP-era rows (inserted into the OLD public tables, before migrations run).
update public.platform_settings
set listing_fee_etb = 120, telebirr_number = '0911111111', telebirr_name = 'Test Business',
    support_username = '@helpdesk', admin_telegram_ids = array['5001']
where id = 1;

insert into public.profiles (telegram_id, username, first_name, phone, city) values
  ('5001', 'owner', 'Owner', '', 'Addis Ababa'),
  ('5002', 'seller_legacy', 'Lemlem', '0912 345 678', 'Adama'),
  ('0', 'guest_dev', 'Guest', '', '');

insert into public.products (id, title, description, price, category, condition, image_url, seller_id,
                             seller_username, status, brand, city, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'iPhone 13', 'Good phone', 32000, 'Phone', 'Like New',
   'data:image/jpeg;base64,/9j/4AAQSkZJRg==', '5002', 'seller_legacy', 'active', 'Apple', 'Adama', now() - interval '3 days'),
  ('22222222-2222-4222-8222-222222222222', 'HP Laptop', 'Unpaid', 25000, 'Laptop', 'Good',
   'data:image/jpeg;base64,/9j/4AAQ', '5002', 'seller_legacy', 'pending_payment', 'HP', 'Adama', now() - interval '2 days'),
  ('33333333-3333-4333-8333-333333333333', 'Galaxy Tab', 'Waiting', 15000, 'Tablet', 'Fair',
   'data:image/jpeg;base64,/9j/4AAQ', '5002', 'seller_legacy', 'payment_submitted', 'Samsung', 'Adama', now() - interval '1 day'),
  ('44444444-4444-4444-8444-444444444444', 'Old hidden', 'Refunded one', 9000, 'Other', 'Fair',
   'https://example.com/a.jpg', '5002', 'seller_legacy', 'hidden', '', '', now() - interval '9 days'),
  ('55555555-5555-4555-8555-555555555555', 'Sold watch', 'Gone', 5000, 'Other', 'New',
   'https://example.com/b.jpg', '5002', 'seller_legacy', 'sold', '', '', now() - interval '8 days'),
  ('66666666-6666-4666-8666-666666666666', 'Guest item', 'From browser preview', 100, 'Other', 'New',
   'https://example.com/c.jpg', '0', 'guest_dev', 'active', '', '', now()),
  ('77777777-7777-4777-8777-777777777777', 'USB-C charger', 'Original', 1500, 'Accessory', 'Like New',
   'https://example.com/d.jpg', '5003', 'no_profile_seller', 'active', 'Anker', 'Hawassa', now());

insert into public.payments (id, telegram_id, product_id, amount_etb, reference, status, created_at, updated_at) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '5002', '11111111-1111-4111-8111-111111111111', 100, 'x', 'confirmed',
   now() - interval '3 days', now() - interval '3 days'),
  ('aaaaaaa2-0000-4000-8000-000000000002', '5002', '22222222-2222-4222-8222-222222222222', 100, '', 'pending',
   now() - interval '2 days', now() - interval '2 days'),
  ('aaaaaaa3-0000-4000-8000-000000000003', '5002', '33333333-3333-4333-8333-333333333333', 100, 'ckk 111aaa', 'submitted',
   now() - interval '1 day', now() - interval '1 day'),
  ('aaaaaaa4-0000-4000-8000-000000000004', '5002', '44444444-4444-4444-8444-444444444444', 100, 'CKK111AAA', 'refunded',
   now() - interval '12 hours', now() - interval '12 hours');
