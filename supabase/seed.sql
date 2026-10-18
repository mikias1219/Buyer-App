-- Seed (local dev / tests only): shop settings row and a few starter categories.
-- No personal data. Set the shop name and options from Settings after deploy.
insert into public.shop_settings (id) values (1) on conflict (id) do nothing;
insert into public.categories (name, sort) values
  ('Phones', 10), ('Accessories', 20), ('Electronics', 30), ('Other', 90)
on conflict do nothing;
