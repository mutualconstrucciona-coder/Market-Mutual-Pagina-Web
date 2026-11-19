-- Market Mutual: initial central persistence. No anonymous table access.
create table if not exists public.market_catalog_state (
  id integer primary key default 1 check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  products jsonb not null default '[]'::jsonb check (jsonb_typeof(products) = 'array'),
  families jsonb not null default '[]'::jsonb check (jsonb_typeof(families) = 'array'),
  flyers jsonb not null default '[]'::jsonb check (jsonb_typeof(flyers) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table if not exists public.market_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.market_catalog_audit (
  id bigint generated always as identity primary key,
  revision bigint not null,
  actor uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.market_catalog_state enable row level security;
alter table public.market_admin_users enable row level security;
alter table public.market_catalog_audit enable row level security;
revoke all on public.market_catalog_state, public.market_admin_users, public.market_catalog_audit from anon, authenticated;
-- No permissive client policies: updates must go through authenticated Next.js server endpoints.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('market-product-images', 'market-product-images', true, 5242880, array['image/webp','image/jpeg','image/png']),
 ('market-flyers', 'market-flyers', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
-- Public object reads; uploads/replacements/deletes require an authenticated server-side workflow.
create policy "market_public_images_read" on storage.objects for select to anon, authenticated
using (bucket_id in ('market-product-images', 'market-flyers'));
