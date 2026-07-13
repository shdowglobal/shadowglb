-- ShadowGLB backend foundation (additive / data preserving)
--
-- This first phase leaves the existing store table's browser policies intact,
-- so the current production frontend keeps working during preview validation.
-- Apply the separate 202607130002 lockdown only after the new production
-- frontend is live. See ../ROLLOUT.md for the safe order.

begin;

create extension if not exists pgcrypto;

create table if not exists public.shadowgbl_store (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shadowgbl_store
  add column if not exists updated_at timestamptz;

update public.shadowgbl_store
set updated_at = now()
where updated_at is null;

alter table public.shadowgbl_store
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.shadowgbl_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_event_id text unique,
  product_id text not null,
  product_name text not null,
  buyer_email text,
  amount_total bigint not null check (amount_total >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status text not null default 'paid',
  delivery_link text,
  delivery_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shadowgbl_orders add column if not exists stripe_payment_intent_id text;
alter table public.shadowgbl_orders add column if not exists stripe_event_id text;
alter table public.shadowgbl_orders add column if not exists product_id text;
alter table public.shadowgbl_orders add column if not exists product_name text;
alter table public.shadowgbl_orders add column if not exists buyer_email text;
alter table public.shadowgbl_orders add column if not exists amount_total bigint;
alter table public.shadowgbl_orders add column if not exists currency text;
alter table public.shadowgbl_orders add column if not exists status text default 'paid';
alter table public.shadowgbl_orders add column if not exists delivery_link text;
alter table public.shadowgbl_orders add column if not exists delivery_email_sent_at timestamptz;
alter table public.shadowgbl_orders add column if not exists created_at timestamptz default now();
alter table public.shadowgbl_orders add column if not exists updated_at timestamptz default now();

create unique index if not exists shadowgbl_orders_stripe_session_idx
  on public.shadowgbl_orders (stripe_session_id);
create unique index if not exists shadowgbl_orders_stripe_event_idx
  on public.shadowgbl_orders (stripe_event_id)
  where stripe_event_id is not null;
create index if not exists shadowgbl_orders_created_at_idx
  on public.shadowgbl_orders (created_at desc);
create index if not exists shadowgbl_orders_buyer_email_idx
  on public.shadowgbl_orders (lower(buyer_email));

-- Public storefront media only. Do not store paid delivery files here: objects
-- in this bucket are intentionally readable by anyone with their URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shadowglb-media',
  'shadowglb-media',
  true,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Orders are new and private from the start. This does not change access to
-- the existing store table used by the currently-live frontend.
alter table public.shadowgbl_orders enable row level security;
revoke all on table public.shadowgbl_orders from public, anon, authenticated;
grant select, insert, update, delete on table public.shadowgbl_orders to service_role;

commit;
