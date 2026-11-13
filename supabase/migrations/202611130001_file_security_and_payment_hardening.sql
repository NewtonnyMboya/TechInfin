-- TechInfin file verification and payment concurrency hardening.
-- Apply once in Supabase SQL Editor or with supabase db push.

alter table public.products
  add column if not exists scan_status text not null default 'pending'
    check (scan_status in ('pending','scanning','clean','infected','error','unsupported')),
  add column if not exists file_sha256 text,
  add column if not exists file_size_bytes bigint,
  add column if not exists detected_mime text,
  add column if not exists scan_provider text,
  add column if not exists scanned_at timestamptz;

create index if not exists products_scan_review_idx
  on public.products(status, scan_status, created_at desc);

create or replace function public.protect_product_scan_metadata()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if (new.scan_status is distinct from old.scan_status
      or new.file_sha256 is distinct from old.file_sha256
      or new.file_size_bytes is distinct from old.file_size_bytes
      or new.detected_mime is distinct from old.detected_mime
      or new.scan_provider is distinct from old.scan_provider
      or new.scanned_at is distinct from old.scanned_at)
     and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'File verification metadata can only be set by the trusted scanner';
  end if;
  if new.status = 'published' and old.status is distinct from 'published'
     and (new.scan_status <> 'clean' or new.file_sha256 is null
          or new.file_size_bytes is null or new.scanned_at is null
          or new.storage_path is null) then
    raise exception 'Product cannot be published before file verification and malware scanning';
  end if;
  return new;
end; $$;

drop trigger if exists protect_product_scan_metadata on public.products;
create trigger protect_product_scan_metadata
before update on public.products
for each row execute function public.protect_product_scan_metadata();

create unique index if not exists payments_one_active_attempt_per_order
  on public.payments(order_id)
  where status in ('initiated','pending');
