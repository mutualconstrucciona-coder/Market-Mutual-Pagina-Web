-- Market Mutual: auditable and reversible Posberry stock/price imports.
create table if not exists public.market_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stock', 'price')),
  file_name text not null check (length(file_name) between 1 and 180),
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  file_size integer not null check (file_size between 1 and 5242880),
  sheet_name text not null check (length(sheet_name) between 1 and 180),
  actor uuid not null references auth.users(id),
  actor_email text not null,
  base_revision bigint not null check (base_revision >= 0),
  applied_revision bigint not null check (applied_revision > base_revision),
  status text not null default 'applied' check (status in ('applied', 'reverted')),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id),
  reverted_revision bigint,
  unique (kind, file_hash),
  unique (applied_revision)
);

create index if not exists market_catalog_imports_created_at_idx
  on public.market_catalog_imports (created_at desc);
create index if not exists market_catalog_imports_actor_idx
  on public.market_catalog_imports (actor);
create index if not exists market_catalog_audit_actor_idx
  on public.market_catalog_audit (actor);
create index if not exists market_catalog_state_updated_by_idx
  on public.market_catalog_state (updated_by);

alter table public.market_catalog_imports enable row level security;
revoke all on table public.market_catalog_imports from anon, authenticated;
grant select, insert, update on table public.market_catalog_imports to service_role;

create or replace function public.market_apply_catalog_import(
  p_expected_revision bigint,
  p_products jsonb,
  p_actor uuid,
  p_actor_email text,
  p_kind text,
  p_file_name text,
  p_file_hash text,
  p_file_size integer,
  p_sheet_name text,
  p_stats jsonb,
  p_changes jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision bigint;
  v_import_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.market_admin_users where user_id = p_actor) then
    raise exception 'market_import_unauthorized' using errcode = 'P0001';
  end if;
  if p_kind not in ('stock', 'price')
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_typeof(p_stats) <> 'object'
    or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) = 0
    or p_file_hash !~ '^[a-f0-9]{64}$'
    or p_file_size not between 1 and 5242880
    or length(p_file_name) not between 1 and 180
    or length(p_sheet_name) not between 1 and 180
    or length(p_actor_email) not between 3 and 320 then
    raise exception 'market_import_invalid' using errcode = 'P0001';
  end if;

  update public.market_catalog_state
     set revision = revision + 1,
         products = p_products,
         updated_at = now(),
         updated_by = p_actor
   where id = 1 and revision = p_expected_revision
   returning revision into v_revision;
  if v_revision is null then
    raise exception 'market_revision_conflict' using errcode = 'P0001';
  end if;

  insert into public.market_catalog_imports (
    id, kind, file_name, file_hash, file_size, sheet_name, actor, actor_email,
    base_revision, applied_revision, stats, changes
  ) values (
    v_import_id, p_kind, p_file_name, p_file_hash, p_file_size, p_sheet_name,
    p_actor, lower(p_actor_email), p_expected_revision, v_revision, p_stats, p_changes
  );

  insert into public.market_catalog_audit (revision, actor, action, details)
  values (
    v_revision,
    p_actor,
    'import:' || p_kind,
    jsonb_build_object(
      'import_id', v_import_id,
      'file_name', p_file_name,
      'file_hash', p_file_hash,
      'modified', jsonb_array_length(p_changes)
    )
  );
  return v_revision;
exception
  when unique_violation then
    raise exception 'market_duplicate_import' using errcode = 'P0001';
end
$$;

create or replace function public.market_revert_catalog_import(
  p_import_id uuid,
  p_expected_revision bigint,
  p_products jsonb,
  p_actor uuid
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision bigint;
  v_import public.market_catalog_imports%rowtype;
begin
  if not exists (select 1 from public.market_admin_users where user_id = p_actor) then
    raise exception 'market_import_unauthorized' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'market_import_invalid' using errcode = 'P0001';
  end if;

  select * into v_import
    from public.market_catalog_imports
   where id = p_import_id
   for update;
  if not found then
    raise exception 'market_import_not_found' using errcode = 'P0001';
  end if;
  if v_import.status <> 'applied' then
    raise exception 'market_import_already_reverted' using errcode = 'P0001';
  end if;

  update public.market_catalog_state
     set revision = revision + 1,
         products = p_products,
         updated_at = now(),
         updated_by = p_actor
   where id = 1 and revision = p_expected_revision
   returning revision into v_revision;
  if v_revision is null then
    raise exception 'market_revision_conflict' using errcode = 'P0001';
  end if;

  update public.market_catalog_imports
     set status = 'reverted',
         reverted_at = now(),
         reverted_by = p_actor,
         reverted_revision = v_revision
   where id = p_import_id;

  insert into public.market_catalog_audit (revision, actor, action, details)
  values (
    v_revision,
    p_actor,
    'import:revert',
    jsonb_build_object('import_id', p_import_id, 'applied_revision', v_import.applied_revision)
  );
  return v_revision;
end
$$;

revoke all on function public.market_apply_catalog_import(bigint,jsonb,uuid,text,text,text,text,integer,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.market_revert_catalog_import(uuid,bigint,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.market_apply_catalog_import(bigint,jsonb,uuid,text,text,text,text,integer,text,jsonb,jsonb)
  to service_role;
grant execute on function public.market_revert_catalog_import(uuid,bigint,jsonb,uuid)
  to service_role;
