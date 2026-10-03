-- TechMarket ET — products table
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  price numeric(12, 2) not null check (price > 0),
  category text not null check (
    category in ('Laptop', 'Phone', 'Tablet', 'Accessory', 'Other')
  ),
  condition text not null check (
    condition in ('New', 'Like New', 'Good', 'Fair')
  ),
  image_url text not null,
  seller_id text not null,
  seller_username text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists products_created_at_idx
  on public.products (created_at desc);

create index if not exists products_category_idx
  on public.products (category);

create index if not exists products_seller_id_idx
  on public.products (seller_id);

-- Row Level Security: public read, authenticated insert (adjust later as needed)
alter table public.products enable row level security;

create policy "Public can read products"
  on public.products
  for select
  to anon, authenticated
  using (true);

create policy "Anyone can insert products"
  on public.products
  for insert
  to anon, authenticated
  with check (true);

-- Optional: seed a couple of rows after the table exists
-- insert into public.products (title, description, price, category, condition, image_url, seller_id, seller_username)
-- values
--   ('MacBook Air M1 8/256', 'Good condition, charger included.', 45000, 'Laptop', 'Good', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=70', '1001', 'abebe_tech');
