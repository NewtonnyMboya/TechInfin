-- Starter schema: review and deploy through Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'buyer' check (role in ('buyer','seller','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  title text not null,
  description text not null default '',
  category text not null,
  platform text not null default 'Web',
  price_kes numeric(12,2) not null check (price_kes >= 0),
  cover_url text,
  delivery_mode text not null default 'file' check (delivery_mode in ('file','license','subscription')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  total_kes numeric(12,2) not null check (total_kes >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  payment_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  unit_price_kes numeric(12,2) not null check (unit_price_kes >= 0)
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Production policies must be added after defining verified role escalation,
-- seller ownership, order ownership and admin claims. Do not expose unreviewed tables.
