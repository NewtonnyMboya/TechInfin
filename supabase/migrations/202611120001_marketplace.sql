-- TechInfin marketplace foundation. Apply with: supabase db push
create extension if not exists pgcrypto;

create type public.account_role as enum ('buyer','seller','admin');
create type public.seller_status as enum ('pending','approved','rejected','suspended');
create type public.product_status as enum ('draft','pending_review','published','rejected','archived');
create type public.order_status as enum ('pending_payment','paid','cancelled','refunded');
create type public.payment_status as enum ('initiated','pending','paid','failed','cancelled','reversed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  role public.account_role not null default 'buyer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  store_name text not null,
  legal_name text,
  contact_email text,
  status public.seller_status not null default 'pending',
  mpesa_paybill_or_till text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 3 and 120),
  slug text not null unique,
  category text not null,
  description text not null,
  price_kes integer not null check (price_kes between 1 and 10000000),
  version text,
  compatibility text,
  delivery_type text not null default 'download' check (delivery_type in ('download','license')),
  storage_path text,
  file_sha256 text,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  currency text not null default 'KES' check (currency = 'KES'),
  amount_kes integer not null check (amount_kes > 0),
  status public.order_status not null default 'pending_payment',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  seller_id uuid not null references public.profiles(id),
  product_name text not null,
  unit_price_kes integer not null check (unit_price_kes > 0),
  quantity integer not null check (quantity between 1 and 20),
  unique(order_id, product_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  buyer_id uuid not null references public.profiles(id),
  provider text not null default 'mpesa',
  status public.payment_status not null default 'initiated',
  amount_kes integer not null check (amount_kes > 0),
  phone_number text not null,
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  result_code text,
  result_description text,
  raw_callback jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.download_events (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  product_id uuid not null references public.products(id),
  order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now()
);

create index products_public_idx on public.products(status, category, created_at desc);
create index orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index payments_checkout_idx on public.payments(checkout_request_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''), new.phone)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

alter table public.profiles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.download_events enable row level security;

create policy "profiles read self or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "seller profile read self or admin" on public.seller_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "seller application create self" on public.seller_profiles for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "seller profile update self pending" on public.seller_profiles for update to authenticated using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid() and status = 'pending');
create policy "published products public read" on public.products for select using (status = 'published' or seller_id = auth.uid() or public.is_admin());
create policy "seller creates draft" on public.products for insert to authenticated with check (seller_id = auth.uid() and status in ('draft','pending_review') and exists(select 1 from public.seller_profiles s where s.user_id = auth.uid() and s.status = 'approved'));
create policy "seller updates own nonpublished" on public.products for update to authenticated using (seller_id = auth.uid() and status in ('draft','rejected')) with check (seller_id = auth.uid() and status in ('draft','pending_review'));
create policy "orders buyer read" on public.orders for select to authenticated using (buyer_id = auth.uid() or public.is_admin());
create policy "order items buyer or seller read" on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()) or seller_id = auth.uid() or public.is_admin());
create policy "payments buyer read" on public.payments for select to authenticated using (buyer_id = auth.uid() or public.is_admin());
create policy "downloads buyer read" on public.download_events for select to authenticated using (buyer_id = auth.uid() or public.is_admin());

-- No client insert/update policy for orders/payments/download_events: trusted Edge Functions
-- use the service role after validating the authenticated user and the payment provider.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('software-private','software-private',false,524288000,
  array['application/zip','application/x-zip-compressed','application/octet-stream','application/pdf','application/vnd.android.package-archive'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "approved seller upload own folder" on storage.objects for insert to authenticated
with check (bucket_id='software-private' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.seller_profiles s where s.user_id=auth.uid() and s.status='approved'));
create policy "seller list own files" on storage.objects for select to authenticated
using (bucket_id='software-private' and (storage.foldername(name))[1]=auth.uid()::text);
-- Buyers never receive direct bucket read access. A trusted Edge Function checks paid order
-- entitlement and returns a short-lived signed URL.

-- Admin-only moderation and seller approval. Admin role is assigned out-of-band.
create policy "admin manages seller applications" on public.seller_profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admin moderates products" on public.products for update to authenticated
using (public.is_admin()) with check (public.is_admin());
