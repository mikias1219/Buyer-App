-- 0200 (shop) · Shop schema, access helpers, RLS and grants (SPEC A3, A8, A9).
--
-- Clients never read or write tables directly: RLS is enabled with no policies and table
-- privileges are revoked. Everything goes through SECURITY DEFINER RPCs that re-check the
-- caller's role from public.profiles.

-- ─── shop_settings (single row) ──────────────────────────────────────
create table if not exists public.shop_settings (
  id                         int primary key default 1 check (id = 1),
  shop_name                  text not null default '' check (char_length(shop_name) <= 80),
  currency                   text not null default 'ETB' check (currency ~ '^[A-Z]{3}$'),
  timezone                   text not null default 'Africa/Addis_Ababa' check (char_length(timezone) <= 64),
  default_reorder_level      numeric(12, 3) not null default 5 check (default_reorder_level >= 0),
  allow_negative_stock       boolean not null default false,
  staff_can_restock          boolean not null default false,
  staff_can_sell_below_cost  boolean not null default false,
  slow_mover_days            int not null default 30 check (slow_mover_days between 1 and 365),
  daily_summary_enabled      boolean not null default false,
  daily_summary_time         time not null default '21:00',
  low_stock_alerts           boolean not null default false,
  receipt_footer             text not null default '' check (char_length(receipt_footer) <= 200),
  updated_at                 timestamptz not null default now(),
  updated_by                 text
);
insert into public.shop_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists shop_settings_touch on public.shop_settings;
create trigger shop_settings_touch before update on public.shop_settings
  for each row execute function public.touch_updated_at();

-- ─── categories ──────────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists categories_name_uq on public.categories (lower(btrim(name)));

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ─── products ────────────────────────────────────────────────────────
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  category_id    uuid references public.categories (id) on delete set null,
  sku            text check (sku ~ '^[A-Za-z0-9._/-]{1,40}$'),
  barcode        text check (barcode ~ '^[A-Za-z0-9-]{4,48}$'),
  unit           text not null default 'piece'
                 check (unit in ('piece', 'pack', 'box', 'kg', 'g', 'litre', 'metre')),
  sell_price     numeric(14, 2) not null check (sell_price >= 0),
  avg_cost       numeric(14, 4) not null default 0 check (avg_cost >= 0),
  stock_qty      numeric(12, 3) not null default 0,
  reorder_level  numeric(12, 3) not null default 0 check (reorder_level >= 0),
  image_path     text not null default ''
                 check (image_path = '' or image_path ~ '^products/[A-Za-z0-9]{20}\.(webp|jpe?g|png)$'),
  notes          text not null default '' check (char_length(notes) <= 500),
  status         text not null default 'active' check (status in ('active', 'archived')),
  created_by     text references public.profiles (telegram_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists products_sku_uq on public.products (lower(sku)) where sku is not null;
create unique index if not exists products_barcode_uq on public.products (barcode) where barcode is not null;
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_name_trgm on public.products using gin (lower(name) extensions.gin_trgm_ops);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ─── sales ───────────────────────────────────────────────────────────
create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  receipt_no      bigint generated always as identity unique,
  client_ref      uuid not null unique,
  sold_at         timestamptz not null default now(),
  cashier_id      text not null references public.profiles (telegram_id),
  customer_id     uuid,   -- FK added with customers (Phase 6)
  payment_method  text not null check (payment_method in ('cash', 'telebirr', 'bank', 'credit')),
  subtotal        numeric(14, 2) not null check (subtotal >= 0),
  discount        numeric(14, 2) not null default 0 check (discount >= 0 and discount <= subtotal),
  total           numeric(14, 2) not null check (total = subtotal - discount),
  total_cost      numeric(14, 2) not null check (total_cost >= 0),
  status          text not null default 'completed' check (status in ('completed', 'voided')),
  void_reason     text not null default '' check (char_length(void_reason) <= 300),
  voided_by       text references public.profiles (telegram_id),
  voided_at       timestamptz,
  note            text not null default '' check (char_length(note) <= 300),
  check ((status = 'voided') = (voided_at is not null))
);
create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists sales_cashier_idx on public.sales (cashier_id, sold_at);
create index if not exists sales_status_idx on public.sales (status, sold_at);

create table if not exists public.sale_items (
  id            bigint generated always as identity primary key,
  sale_id       uuid not null references public.sales (id),
  product_id    uuid not null references public.products (id),
  qty           numeric(12, 3) not null check (qty > 0),
  unit_price    numeric(14, 2) not null check (unit_price >= 0),
  unit_cost     numeric(14, 4) not null check (unit_cost >= 0),
  discount      numeric(14, 2) not null default 0 check (discount >= 0),
  line_total    numeric(14, 2) not null check (line_total >= 0 and line_total = round(qty * unit_price, 2) - discount),
  returned_qty  numeric(12, 3) not null default 0 check (returned_qty >= 0 and returned_qty <= qty),
  unique (sale_id, product_id)
);
create index if not exists sale_items_product_idx on public.sale_items (product_id);

create table if not exists public.sale_returns (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales (id),
  reason         text not null check (char_length(btrim(reason)) between 1 and 300),
  refund_amount  numeric(14, 2) not null check (refund_amount >= 0),
  cost_amount    numeric(14, 2) not null check (cost_amount >= 0),
  created_by     text not null references public.profiles (telegram_id),
  created_at     timestamptz not null default now()
);
create index if not exists sale_returns_sale_idx on public.sale_returns (sale_id);
create index if not exists sale_returns_created_idx on public.sale_returns (created_at);

create table if not exists public.sale_return_items (
  return_id     uuid not null references public.sale_returns (id),
  sale_item_id  bigint not null references public.sale_items (id),
  qty           numeric(12, 3) not null check (qty > 0),
  refund        numeric(14, 2) not null check (refund >= 0),
  cost          numeric(14, 2) not null check (cost >= 0),
  primary key (return_id, sale_item_id)
);

-- ─── stock_movements (append-only ledger) ────────────────────────────
create table if not exists public.stock_movements (
  id              bigint generated always as identity primary key,
  product_id      uuid not null references public.products (id),
  type            text not null
                  check (type in ('opening', 'purchase', 'sale', 'return', 'void', 'adjustment', 'damage')),
  qty_delta       numeric(12, 3) not null check (qty_delta <> 0),
  unit_cost       numeric(14, 4) not null default 0 check (unit_cost >= 0),
  stock_after     numeric(12, 3) not null,
  sale_id         uuid references public.sales (id),
  sale_return_id  uuid references public.sale_returns (id),
  supplier        text not null default '' check (char_length(supplier) <= 120),
  reason          text not null default '' check (char_length(reason) <= 300),
  actor_id        text references public.profiles (telegram_id) on delete set null,
  created_at      timestamptz not null default now(),
  check (
    (type in ('opening', 'purchase', 'return', 'void') and qty_delta > 0)
    or (type in ('sale', 'damage') and qty_delta < 0)
    or type = 'adjustment'
  )
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc, id desc);
create index if not exists stock_movements_type_idx on public.stock_movements (type, created_at);

-- ─── expenses ────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null,
  category    text not null
              check (category in ('rent', 'salary', 'transport', 'utilities', 'supplies', 'tax', 'other')),
  amount      numeric(14, 2) not null check (amount > 0),
  note        text not null default '' check (char_length(note) <= 300),
  created_by  text references public.profiles (telegram_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on public.expenses (spent_on);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ─── Access helpers (roles always come from the database) ───────────
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where telegram_id = public.current_tg_id() and role = 'owner' and not is_banned
  );
$$;

create or replace function public.require_member()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user();
begin
  if v.role not in ('staff', 'owner') then
    perform public.app_error('no_access');
  end if;
  return v;
end;
$$;

create or replace function public.require_owner()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles := public.require_user();
begin
  if v.role = 'user' then
    perform public.app_error('no_access');
  end if;
  if v.role <> 'owner' then
    perform public.app_error('not_authorized');
  end if;
  return v;
end;
$$;

create or replace function public.notify_owners(p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications_outbox (chat_id, kind, payload)
  select telegram_id, p_kind, coalesce(p_payload, '{}')
  from public.profiles
  where role = 'owner' and not is_banned and not bot_blocked;
$$;

-- ─── Small input helpers (bad input → stable 'invalid_input' error) ─
create or replace function public.jnum(p jsonb, p_key text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p is null or not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then
    return null;
  end if;
  return (p ->> p_key)::numeric;
exception when others then
  perform public.app_error('invalid_input', p_key);
end;
$$;

create or replace function public.juuid(p jsonb, p_key text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p is null or coalesce(p ->> p_key, '') = '' then
    return null;
  end if;
  return (p ->> p_key)::uuid;
exception when others then
  perform public.app_error('invalid_input', p_key);
end;
$$;

-- Whole-number units reject fractional quantities.
create or replace function public.check_qty(p_unit text, p_qty numeric, p_field text default 'qty')
returns numeric
language plpgsql
immutable
as $$
begin
  if p_qty is null or p_qty <> round(p_qty, 3) then
    perform public.app_error('invalid_input', p_field);
  end if;
  if p_unit in ('piece', 'pack', 'box') and p_qty <> trunc(p_qty) then
    perform public.app_error('invalid_quantity', p_field);
  end if;
  return p_qty;
end;
$$;

create or replace function public.shop_tz()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from public.shop_settings where id = 1), 'Africa/Addis_Ababa');
$$;

-- ─── Row level security: enabled everywhere, no client policies ─────
alter table public.shop_settings      enable row level security;
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.sale_returns       enable row level security;
alter table public.sale_return_items  enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.expenses           enable row level security;
alter table public.notifications_outbox enable row level security;
alter table public.audit_log          enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Append-only ledger tables: not even service_role edits history by accident.
revoke update, delete on public.stock_movements, public.sale_items, public.sale_return_items,
  public.audit_log from service_role;
